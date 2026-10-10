import Phaser from 'phaser';
import { ASSETS, ASSET, settleArt } from '../assets/manifest';
import {
  BOUNDS, CORRIDORS, FIXTURES, ROAD, ROOMS, blockedCells, roomOf, walkable,
  type BoxModel, type Room, type WorldModel,
} from '../model';
import { MALL, SECTIONS, WALK, toLocal, toWorld } from '../mall/layout';
import { cellAt, depthAt, findPath, iso } from './iso';
import { MallLayer } from './MallLayer';

export type Selection =
  | { type: 'brand'; brand: string }
  | { type: 'display'; slot: string }
  | { type: 'section'; index: number }
  | { type: 'shopper'; section: number }
  | { type: 'case'; id: string }
  | { type: 'po'; id: string }
  | { type: 'supplier'; key: string }
  | { type: 'person'; name: string }
  | { type: 'board' }
  | { type: 'issues' }
  | { type: 'delivery' }
  | { type: 'mohammed' }
  | { type: 'owner' };

export interface SceneHooks {
  onSelect: (s: Selection | null) => void;
  onReady: () => void;
  onSection?: (i: number | null) => void;   // a section sign was tapped
}

const LABEL_DEPTH = 1_000_000;
/* How much of the surroundings each area's zone takes in, in world units. */
const ZONE_MARGIN = { x: 128, y: 64 };

const FOCUS: Record<Room, { x0: number; y0: number; x1: number; y1: number }> = {
  floor: ROOMS.floor,
  dock: { ...ROOMS.dock, x1: ROAD.x1 },
  office: ROOMS.office,
};

/* A person who can stand, walk a path and wander. */
class Walker {
  shadow: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text | null = null;
  fx: number; fy: number;           // feet position in cells (fractional while walking)
  moving = false;
  private chain: Phaser.Tweens.TweenChain | null = null;

  constructor(private scene: WorldScene, public key: string, cell: [number, number], public speed = 260, labelText?: string) {
    this.fx = cell[0] + 0.5; this.fy = cell[1] + 0.5;
    this.shadow = scene.fit(scene.add.image(0, 0, 'shadow'), 'shadow');
    this.sprite = scene.fit(scene.add.sprite(0, 0, key), key);
    if (scene.textures.get(key).frameTotal > 2) this.sprite.play(`${key}-idle`, true);
    if (labelText) this.label = scene.label(0, 0, labelText, 'person');
    this.sync(0);
  }

  get cell(): [number, number] { return [Math.floor(this.fx), Math.floor(this.fy)]; }

  sync(time: number) {
    const p = iso(this.fx, this.fy);
    const bob = this.moving ? -Math.abs(Math.sin(time / 85)) * 6 : Math.sin(time / 600 + this.fx) * 1.2;
    this.shadow.setPosition(p.x, p.y).setDepth(depthAt(this.fx, this.fy) - 1);
    this.sprite.setPosition(p.x, p.y + bob).setDepth(depthAt(this.fx, this.fy, 8));
    this.label?.setPosition(p.x, p.y + 14);
  }

  walk(path: [number, number][], onDone?: () => void) {
    this.chain?.stop();
    if (!path.length) { onDone?.(); return; }
    this.moving = true;
    const sheet = this.scene.textures.get(this.key).frameTotal > 2;
    if (sheet) this.sprite.play(`${this.key}-walk`, true);
    this.chain = this.scene.tweens.chain({
      targets: this,
      tweens: path.map(([x, y]) => ({
        fx: x + 0.5, fy: y + 0.5, duration: this.speed, ease: 'Linear',
        onStart: () => {
          const dx = iso(x + 0.5, y + 0.5).x - iso(this.fx, this.fy).x;
          if (Math.abs(dx) > 1) this.sprite.setFlipX(dx < 0);
        },
      })),
      onComplete: () => {
        this.moving = false;
        if (sheet) this.sprite.play(`${this.key}-idle`, true);
        onDone?.();
      },
    });
  }

  setInteractive(sel: Selection) {
    this.sprite.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    this.scene.tag(this.sprite, sel, 0);
  }

  destroy() { this.chain?.stop(); this.shadow.destroy(); this.sprite.destroy(); this.label?.destroy(); }
}

export class WorldScene extends Phaser.Scene {
  private model!: WorldModel;
  private hooks!: SceneHooks;
  private reduced = false;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private walkers: Walker[] = [];
  private wanderers: { w: Walker; room: Room; home: [number, number]; area?: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  private owner!: Walker;
  private blocked = new Set<string>();
  private selectRing!: Phaser.GameObjects.Image;
  private clockHands!: Phaser.GameObjects.Graphics;
  private clockAt = { x: 0, y: 0 };
  private dragged = false;
  private pinch: { d: number; z: number } | null = null;
  private base = 1;               // camera zoom at which the 2x art shows at its natural size
  private targetRing!: Phaser.GameObjects.Image;
  private room: Room = 'floor';                          // the area chosen on the tabs; the camera stays in it
  private deliveryPending: (() => void) | null = null;   // the van arrives when the dock is in view
  private insets = { top: 0, bottom: 0 };                // CSS px covered by the page's bars
  private cover = { right: 0, bottom: 0 };               // CSS px covered by an open details panel
  private chosen: Phaser.GameObjects.Image | null = null;   // what the open panel is about
  private revealTo: { x: number; y: number } | null = null;
  private zoomTarget: number | null = null;              // where a running zoom is heading
  private mall!: MallLayer;
  private areaLabels: { t: Phaser.GameObjects.Text; room: Room | null }[] = [];   // the dock's and office's labels
  private labelRoom: Room | null = null;                 // the area labels being made now belong to
  private section: number | null = 0;                    // the mall section framed on the Floor tab (null: the whole mall)

  constructor() { super('world'); }

  get reducedMotion() { return this.reduced; }

  init(data: { model: WorldModel; hooks: SceneHooks; reducedMotion: boolean; dpr: number }) {
    this.model = data.model;
    this.hooks = data.hooks;
    this.reduced = data.reducedMotion;
    this.base = data.dpr / 2;
  }

  preload() {
    for (const a of ASSETS) {
      if (a.type === 'svg') this.load.svg(a.key, a.url, { width: a.width, height: a.height });
      else if (a.type === 'sheet' && a.frame) this.load.spritesheet(a.key, a.url, { frameWidth: a.frame.width, frameHeight: a.frame.height });
      else this.load.image(a.key, a.url);
    }
  }

  create() {
    // replacement pictures without hand-tuned placement follow the contract
    settleArt((key) => {
      const a = ASSET[key];
      if (a.frame) return [a.frame.width, a.frame.height];
      const img = this.textures.exists(key) ? (this.textures.get(key).getSourceImage() as HTMLImageElement) : null;
      return img ? [img.width, img.height] : null;
    });
    this.input.addPointer(1);
    this.makeSheetAnimations();
    this.cameras.main.setBackgroundColor('#dfca93');
    this.mall = new MallLayer(this);
    this.drawGround();
    this.drawRooms();
    this.selectRing = this.add.image(0, 0, 'select').setVisible(false).setDepth(LABEL_DEPTH - 2);
    this.targetRing = this.add.image(0, 0, 'ring').setVisible(false);
    this.build();
    this.setupCamera();
    this.setupInput();
    this.hooks.onReady();
  }

  update(time: number, delta: number) {
    for (const w of this.walkers) w.sync(time);
    this.keepInZone(delta);
    this.mall.lod(this.cameras.main.zoom / (this.base * 2));
  }

  /* ── public, called from the page ─────────────────────────────────── */

  setModel(model: WorldModel) {
    this.model = model;
    this.build();
  }

  setInsets(top: number, bottom: number) { this.insets = { top, bottom }; }

  focus(room: Room, animate = true) {
    if (room === 'floor') { this.room = room; this.focusSection(this.section, animate); return; }
    this.room = room;
    this.showAreaLabels();
    const cam = this.cameras.main;
    this.revealTo = null;
    const zn = this.zone(room);
    const px = this.base * 2;                       // canvas px per CSS px
    const top = this.insets.top * px, bottom = this.insets.bottom * px;
    const vw = cam.width, vh = Math.max(cam.height - top - bottom, cam.height * 0.4);
    // the room itself, without the zone's margin
    let z = Math.min(vw / (zn.w - 2 * ZONE_MARGIN.x + 80), vh / (zn.h - 2 * ZONE_MARGIN.y + 80));
    if (vw / vh < 0.8) z *= 1.8;    // portrait phone: fill the height, pan sideways for the rest
    z = Phaser.Math.Clamp(z, this.minZoom(), this.maxZoom());
    // centre the room in the part of the screen the bars leave free
    const cx = zn.x + zn.w / 2, cy = zn.y + zn.h / 2 - (top - bottom) / 2 / z;
    if (animate && !this.reduced) {
      cam.pan(cx, cy, 650, 'Sine.easeInOut', true);
      cam.zoomTo(z, 650, 'Sine.easeInOut', true);
    } else {
      cam.setZoom(z); cam.centerOn(cx, cy);
    }
    if (room === 'dock' && this.deliveryPending) { const arrive = this.deliveryPending; this.deliveryPending = null; arrive(); }
  }

  /* Frames one section of the mall (or the whole mall). On a phone held upright the section
     fills the height and the rest is a sideways pan away. */
  focusSection(i: number | null, animate = true) {
    this.room = 'floor';
    this.section = i;
    this.showAreaLabels();
    this.revealTo = null;
    const cam = this.cameras.main, px = this.base * 2;
    const top = this.insets.top * px, bottom = this.insets.bottom * px;
    const vw = cam.width, vh = Math.max(cam.height - top - bottom, cam.height * 0.4);
    const r = i === null ? this.zone('floor') : this.mall.sectionBounds(i);
    let z = Math.min(vw / r.w, vh / r.h);
    if (i !== null && vw / vh < 0.8) z = Math.max(z, Math.min(vh / r.h, (vw / r.w) * 2.2));
    z = Phaser.Math.Clamp(z, this.minZoom(), this.maxZoom());
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - (top - bottom) / 2 / z;
    this.zoomTarget = z;
    if (animate && !this.reduced) {
      cam.pan(cx, cy, 650, 'Sine.easeInOut', true);
      cam.zoomTo(z, 650, 'Sine.easeInOut', true);
    } else { cam.setZoom(z); cam.centerOn(cx, cy); }
  }

  /* Takes the camera to a brand and marks it, as if it had been tapped. */
  focusBrand(brand: string) {
    const t = this.mall.target(brand);
    if (!t) return;
    this.room = 'floor';
    this.showAreaLabels();
    const [lx] = toLocal(t.cell[0], t.cell[1]);
    this.section = lx < 12.5 ? 0 : lx < 25.5 ? 1 : 2;
    const cam = this.cameras.main, px = this.base * 2;
    const z = Phaser.Math.Clamp(Math.max(cam.zoom, (t.boutique ? 0.6 : 0.85) * px), this.minZoom(), this.maxZoom());
    const b = t.obj.getBounds();
    this.markChosen(t.obj as Phaser.GameObjects.Image, 0);
    this.zoomTarget = z;
    if (this.reduced) { cam.setZoom(z); cam.centerOn(b.centerX, b.centerY); }
    else { cam.pan(b.centerX, b.centerY, 600, 'Sine.easeInOut', true); cam.zoomTo(z, 600, 'Sine.easeInOut', true); }
    this.revealTo = { x: b.centerX, y: b.centerY };
  }

  zoomBy(f: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.minZoom(), this.maxZoom()));
  }

  clearSelection() { this.selectRing.setVisible(false); this.chosen = null; }

  /* A details panel now covers part of the screen (CSS px from the top, right
     and bottom edges): if what was tapped sits under it, bring it into the
     part still showing. */
  reveal(top: number, right: number, bottom: number) {
    this.cover = { right, bottom };
    const o = this.chosen;
    if (!o || !o.active) return;
    const cam = this.cameras.main, px = this.base * 2;
    // judged at the zoom the camera is heading to, if it is still zooming there
    const z = cam.zoomEffect.isRunning && this.zoomTarget ? this.zoomTarget : cam.zoom;
    const free = { x0: 0, y0: top * px, x1: cam.width - right * px, y1: cam.height - bottom * px };
    if (free.x1 - free.x0 < 80 || free.y1 - free.y0 < 80) return;
    const c = o.getBounds();
    // judged from where the camera is heading, if it is still moving there
    const mid = cam.panEffect.isRunning && this.revealTo ? this.revealTo : { x: cam.midPoint.x, y: cam.midPoint.y };
    const sx = (c.centerX - mid.x) * z + cam.width / 2, sy = (c.centerY - mid.y) * z + cam.height / 2;
    const m = 40 * px;
    if (sx > free.x0 + m && sx < free.x1 - m && sy > free.y0 + m && sy < free.y1 - m) return;
    const cx = c.centerX - ((free.x0 + free.x1) / 2 - cam.width / 2) / z;
    const cy = c.centerY - ((free.y0 + free.y1) / 2 - cam.height / 2) / z;
    this.revealTo = { x: cx, y: cy };
    if (this.reduced) cam.centerOn(cx, cy);
    else cam.pan(cx, cy, 450, 'Sine.easeInOut', true);
  }

  /* ── building the World ────────────────────────────────────────────── */

  label(x: number, y: number, text: string, kind: 'person' | 'case' | 'money' | 'review' | 'info' = 'info') {
    const style: Record<string, { bg: string; fg: string; size: number }> = {
      person: { bg: '#22304db3', fg: '#ffffff', size: 14 },
      case: { bg: '#fbf8f1f0', fg: '#22304d', size: 16 },
      money: { bg: '#ffffffee', fg: '#22304d', size: 18 },
      review: { bg: '#f59e0bf0', fg: '#2b2118', size: 18 },
      info: { bg: '#22304de6', fg: '#fbf3dc', size: 18 },
    };
    const s = style[kind];
    const t = this.add.text(x, y, text, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: `${s.size}px`, fontStyle: '600', color: s.fg, backgroundColor: s.bg,
      padding: { x: 8, y: 4 }, resolution: 2,
    }).setOrigin(0.5, 0).setDepth(LABEL_DEPTH);
    // fixed labels belong to the area they stand in, and show only while that area is chosen
    // (the office sits just below the mall, so their labels would otherwise cross)
    if (kind !== 'person') {
      const [cx, cy] = cellAt(x, y + 40);
      this.areaLabels.push({ t, room: this.labelRoom ?? roomOf(cx, cy) });
    }
    return t;
  }

  private showAreaLabels() {
    this.areaLabels = this.areaLabels.filter((a) => a.t.active);
    for (const a of this.areaLabels) a.t.setVisible(a.room === null || a.room === this.room);
    this.mall?.setShown(this.room === 'floor');
  }

  /* `ringDy` puts the selection ring under the object's footprint rather than its anchor. */
  tag(obj: Phaser.GameObjects.GameObject, sel: Selection, ringDy = -32) { obj.setData('sel', sel); obj.setData('ringDy', ringDy); }

  /* Size and anchor a picture as the asset list says, whatever resolution the
     artwork file has: placeholders and final art place the same way. */
  fit<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(o: T, key: string, extra = 1): T {
    const a = ASSET[key];
    const frameWidth = o.frame.width || a.drawWidth;
    o.setOrigin(a.origin[0], a.origin[1]).setScale((a.drawWidth / frameWidth) * extra);
    return o;
  }

  img(key: string, x: number, y: number, depth: number, dyn = true) {
    const o = this.fit(this.add.image(x, y, key), key).setDepth(depth);
    if (dyn) this.dyn.push(o);
    return o;
  }

  /* Something standing on the floor, footprint w x d starting at cell (x, y). */
  stand(key: string, x: number, y: number, w = 1, d = 1, lift = 0, bias = 0) {
    const p = iso(x + w, y + d);
    return this.img(key, p.x, p.y - lift, depthAt(x + w, y + d, bias));
  }

  private makeSheetAnimations() {
    for (const a of ASSETS) {
      if (a.type !== 'sheet' || !a.frame) continue;
      const tex = this.textures.get(a.key);
      const cols = Math.max(1, Math.floor(tex.source[0].width / a.frame.width));
      this.anims.create({ key: `${a.key}-idle`, frames: this.anims.generateFrameNumbers(a.key, { start: 0, end: cols - 1 }), frameRate: 4, repeat: -1 });
      this.anims.create({ key: `${a.key}-walk`, frames: this.anims.generateFrameNumbers(a.key, { start: cols, end: cols * 2 - 1 }), frameRate: 10, repeat: -1 });
    }
  }

  private drawGround() {
    const g = this.add.graphics().setDepth(-3e6);
    const c = [iso(BOUNDS.x0, BOUNDS.y0), iso(BOUNDS.x1, BOUNDS.y0), iso(BOUNDS.x1, BOUNDS.y1), iso(BOUNDS.x0, BOUNDS.y1)];
    g.fillStyle(0xead8a8, 1).fillPoints(c.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    // a little texture in the sand
    const rnd = new Phaser.Math.RandomDataGenerator(['tk-world']);
    g.fillStyle(0xd9c38c, 0.55);
    for (let i = 0; i < 260; i++) {
      const gx = rnd.realInRange(BOUNDS.x0, BOUNDS.x1), gy = rnd.realInRange(BOUNDS.y0, BOUNDS.y1);
      const p = iso(gx, gy);
      g.fillEllipse(p.x, p.y, rnd.between(10, 34), rnd.between(4, 10));
    }
    const ground = (key: string, x: number, y: number) => {
      const p = iso(x, y);
      this.fit(this.add.image(p.x, p.y, key), key).setDepth(-2e6 + (x + y));
    };
    for (let y = ROAD.y0; y < ROAD.y1; y++) {
      ground('tile-pavement', ROAD.x0 - 1, y);
      for (let x = ROAD.x0; x < ROAD.x1 - 1; x++) ground('tile-road', x, y);
      ground('tile-pavement', ROAD.x1 - 1, y);
    }
    for (const [x, y] of [[-3, -6], [10, -6], [-29, 9], [30, -4], [31, 12], [14, 20], [24, 18], [-3, 24], [31, 23], [18, -7]]) {
      const p = iso(x + 1, y + 1);
      this.fit(this.add.image(p.x, p.y, 'palm'), 'palm').setDepth(depthAt(x + 1, y + 1));
    }
  }

  private drawRooms() {
    const ground = (key: string, x: number, y: number) => {
      const p = iso(x, y);
      this.fit(this.add.image(p.x, p.y, key), key).setDepth(-1e6 + (x + y));
    };
    const R = ROOMS;
    this.mall.drawStatic();
    for (let x = R.dock.x0; x < R.dock.x1; x++) for (let y = R.dock.y0; y < R.dock.y1; y++)
      ground(x === R.dock.x1 - 1 ? 'tile-hazard' : 'tile-concrete', x, y);
    for (let x = R.office.x0; x < R.office.x1; x++) for (let y = R.office.y0; y < R.office.y1; y++)
      ground('tile-parquet', x, y);
    const [toDock] = CORRIDORS;
    for (let x = toDock.x0; x < toDock.x1; x++) for (let y = toDock.y0; y < toDock.y1; y++)
      ground(x === toDock.x0 ? 'tile-marble-a' : 'tile-concrete', x, y);

    // walls on the two far sides of each room, open at the doorways
    const wall = (room: string, side: 'l' | 'r', x: number, y: number) => {
      const p = iso(x, y);
      const key = `wall-${room}-${side}`;
      this.fit(this.add.image(p.x, p.y, key), key).setDepth(depthAt(x, y, -2));
    };
    for (let y = R.dock.y0; y < R.dock.y1; y++) if (y < toDock.y0 || y >= toDock.y1) wall('dock', 'l', R.dock.x0, y);
    for (let x = R.dock.x0; x < R.dock.x1; x++) wall('dock', 'r', x, R.dock.y0);
    for (let y = R.office.y0; y < R.office.y1; y++) wall('office', 'l', R.office.x0, y);
    for (let x = R.office.x0; x < R.office.x1; x++) wall('office', 'r', x, R.office.y0);

    const sign = (key: string, x: number, y: number) => {
      const p = iso(x, y);
      this.fit(this.add.image(p.x, p.y - 175, key), key).setDepth(depthAt(x, y, -1));
    };
    sign('sign-dock', 20.5, R.dock.y0);
    sign('sign-office', R.office.x0, 17);

    // the wall clock tells real Kuwait time, on the Grand Gallery's end wall
    const cp = iso(R.floor.x0, 5.5);
    this.clockAt = { x: cp.x - 32, y: cp.y - 100 };
    this.fit(this.add.image(this.clockAt.x, this.clockAt.y, 'wall-clock'), 'wall-clock', 0.9).setDepth(depthAt(R.floor.x0, 5, -1));
    this.clockHands = this.add.graphics().setDepth(depthAt(R.floor.x0, 5, -0.5));
    this.drawClock();

    // fixed furniture
    const fixed = (key: string, x: number, y: number, w = 1, d = 1) => {
      const p = iso(x + w, y + d);
      return this.fit(this.add.image(p.x, p.y, key), key).setDepth(depthAt(x + w, y + d));
    };
    fixed('desk', FIXTURES.desk.cell[0], FIXTURES.desk.cell[1], 2, 1);
    FIXTURES.staffDesks.forEach(([x, y]) => fixed('desk-small', x, y));
    FIXTURES.benches.forEach(([x, y]) => fixed('bench', x, y, 2, 1));
    FIXTURES.plants.forEach(([x, y]) => fixed('plant', x, y));
    for (const [x, y] of FIXTURES.pallets) fixed('pallet', x, y);
  }

  private drawClock() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }));
    const m = now.getMinutes(), h = (now.getHours() % 12) + m / 60;
    const { x, y } = this.clockAt;
    const g = this.clockHands.clear();
    const hand = (angle: number, len: number, w: number, color: number) => {
      g.lineStyle(w, color, 1).beginPath().moveTo(x, y)
        .lineTo(x + Math.sin(angle) * len, y - Math.cos(angle) * len).strokePath();
    };
    hand((h / 12) * Math.PI * 2, 14, 4, 0x2b2118);
    hand((m / 60) * Math.PI * 2, 21, 3, 0x2b2118);
    hand((now.getSeconds() / 60) * Math.PI * 2, 23, 1.5, 0xd6453d);
  }

  /* Everything that follows the data: rebuilt on every refresh. */
  private build() {
    // tweens and timers belong to the objects being replaced
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.drawClock() });
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    for (const w of this.walkers) w.destroy();
    this.walkers = [];
    this.wanderers = [];
    this.selectRing?.setVisible(false);
    this.deliveryPending = null;

    const m = this.model;
    this.mall.build(m.mall);
    this.blocked = new Set([...blockedCells(m), ...this.mall.blocked]);
    this.labelRoom = 'dock';
    m.boxes.forEach((b) => this.buildBox(b));
    if (m.hiddenBoxes > 0) {
      const p = iso(24, 10);
      this.dyn.push(this.label(p.x, p.y - 40, `+${m.hiddenBoxes} more POs`, 'info'));
    }
    this.labelRoom = 'office';
    this.buildOffice();
    this.labelRoom = null;
    this.buildPeople();
    this.labelRoom = 'dock';
    this.buildDelivery();
    this.labelRoom = null;
    this.showAreaLabels();
  }

  private buildBox(b: BoxModel) {
    const [x, y] = b.cell;
    const key = `box-${b.kind}`;
    let top: Phaser.GameObjects.Image | null = null;
    let lift = ASSET.pallet.surface;                       // boxes stand on the pallet, then on each other
    for (let i = 0; i < b.stack; i++) {
      const k = i === b.stack - 1 ? key : 'box-sealed';
      const o = this.stand(k, x, y, 1, 1, lift, 0.1 + i * 0.01);
      o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
      this.tag(o, { type: 'po', id: b.po.po_id });
      lift += ASSET[k].surface;
      top = o;
    }
    const c = iso(x + 0.5, y + 0.5);
    const lid = (top ? top.getBounds().top : c.y - lift) - 2;
    if (b.progress !== null) {
      const g = this.add.graphics().setDepth(LABEL_DEPTH - 3);
      const w = 70, p = Phaser.Math.Clamp(b.progress, 0, 1);
      g.fillStyle(0x22304d, 0.9).fillRoundedRect(c.x - w / 2 - 3, lid - 18, w + 6, 12, 5);
      g.fillStyle(0xf2c230, 1).fillRoundedRect(c.x - w / 2, lid - 15, Math.max(4, w * p), 6, 3);
      this.dyn.push(g);
    }
    if (b.alert) this.bobbing(this.img('alert', c.x + 30, lid - 4, LABEL_DEPTH - 1));
    if (top && !this.reduced && b.kind === 'wrapped') {
      this.tweens.add({ targets: top, alpha: { from: 1, to: 0.86 }, duration: 1400, yoyo: true, repeat: -1 });
    }
  }

  private buildOffice() {
    const m = this.model;
    // mission board with a card per open mission (up to 12)
    const b = FIXTURES.board;
    const p = iso(b.x, b.y);
    const board = this.img('mission-board', p.x, p.y - 18, depthAt(b.x, b.y, -1));
    board.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    this.tag(board, { type: 'board' });
    // artwork with its own printed notes says so in art.json, and gets no extra cards
    const cards = ASSET['mission-board'].cards ? Math.min(12, m.board.open + m.board.changed) : 0;
    for (let i = 0; i < cards; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      const t = 0.12 + col * 0.14;
      const cx = p.x + 192 * t, cy = p.y - 18 - 70 + 96 * t + 26 + row * 30;
      const card = this.img('mission-card', cx, cy, depthAt(b.x, b.y, -0.5));
      if (i >= m.board.open) card.setTint(0xffc46b);
    }
    // above the board, clear of its own lettering
    const bb = board.getBounds();
    this.dyn.push(this.label(bb.centerX, bb.top - 14, `${m.board.open + m.board.changed} missions open`, 'info'));

    // filing cabinet: the records to check
    const [fx, fy] = FIXTURES.files;
    const files = this.stand('file-cabinet', fx, fy);
    files.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    this.tag(files, { type: 'issues' });
    const fp = iso(fx + 0.5, fy + 0.5);
    const n = m.issues.unreliable + m.issues.check;
    if (n > 0) {
      this.img('flag', fp.x + 6, files.getBounds().top + 4, depthAt(fx + 1, fy + 1, 0.2));
      this.dyn.push(this.label(fp.x, fp.y + 30, `${n} records to check`, 'review'));
    }

    // supplier visitors waiting: one per supplier with a recorded unpaid balance
    for (const r of m.reps) {
      const w = new Walker(this, 'char-rep', r.cell, 400);
      w.setInteractive({ type: 'supplier', key: r.supplier.supplier_key });
      this.walkers.push(w);
      const c = iso(r.cell[0] + 0.5, r.cell[1] + 0.5);
      const kd = `${r.supplier.recorded_unpaid.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} KD`;
      this.dyn.push(this.label(c.x, c.y + 14, kd, r.mood === 'review' ? 'review' : 'money'));
      if (!this.reduced && r.mood !== 'calm') {
        // tapping a foot, faster when the balance is up for review
        this.tweens.add({
          targets: w.sprite, angle: { from: -2, to: 2 }, duration: r.mood === 'review' ? 140 : 320,
          yoyo: true, repeat: -1, repeatDelay: r.mood === 'review' ? 400 : 1600,
        });
      }
      if (r.mood === 'review') this.bobbing(this.img('alert', c.x + 22, w.sprite.getBounds().top + 4, LABEL_DEPTH - 1));
    }
    if (m.hiddenReps > 0) {
      const c = iso(9.5, 20);
      this.dyn.push(this.label(c.x, c.y + 10, `+${m.hiddenReps} more suppliers`, 'info'));
    }

    // Mohammed by the board, with today's top mission
    const mo = new Walker(this, 'char-mohammed', [8, 14], 300);
    mo.setInteractive({ type: 'mohammed' });
    this.walkers.push(mo);
    if (m.topMission) {
      const c = iso(8.5, 14.5);
      this.bobbing(this.img('alert', c.x + 4, mo.sprite.getBounds().top - 2, LABEL_DEPTH - 1));
    }
  }

  private buildPeople() {
    // staff: only those the attendance records show on duty now, in the look an owner chose
    for (const s of this.model.staff) {
      const first = s.person.name.split(' ')[0];
      const w = new Walker(this, s.key, s.home, 380, first);
      w.setInteractive({ type: 'person', name: s.person.name });
      this.walkers.push(w);
      this.wanderers.push({ w, room: s.room, home: s.home });
    }
    // shoppers are illustrative: how many walk each section follows its last 30 days' sales
    this.model.mall.shoppers.forEach((n, i) => {
      const sec = SECTIONS[i];
      for (let k = 0; k < n; k++) {
        const home = toWorld(sec.x0 + 2 + ((k * 4) % 9), k % 2 ? WALK.y1 - 1 : WALK.y0);
        const w = new Walker(this, `char-shopper-${((i * 2 + k) % 6) + 1}`, home, 520);
        w.setInteractive({ type: 'shopper', section: i });
        this.walkers.push(w);
        const [x0] = toWorld(sec.x0, 0), [x1] = toWorld(sec.x1, 0);
        this.wanderers.push({ w, room: 'floor', home, area: { x0, y0: MALL.y0, x1, y1: MALL.y0 + MALL.d } });
      }
    });
    // Mohammed in the mall, by the brand his biggest open mission is about
    const withMission = this.model.mall.spots.filter((sp) => sp.brand.missions.length)
      .sort((a, b) => Math.max(...b.brand.missions.map((m) => m.weight_kd ?? 0)) - Math.max(...a.brand.missions.map((m) => m.weight_kd ?? 0)));
    if (withMission.length) {
      const sp = withMission[0];
      const lx = sp.slot.kind === 'boutique' ? sp.slot.x + 3 : sp.cell[0];
      const ly = sp.slot.side === 's' ? WALK.y1 - 1 : WALK.y0;
      const mo = new Walker(this, 'char-mohammed', toWorld(lx, ly), 300);
      mo.setInteractive({ type: 'mohammed' });
      this.walkers.push(mo);
      const c = iso(...toWorld(lx + 0.5, ly + 0.5));
      this.bobbing(this.img('alert', c.x + 4, mo.sprite.getBounds().top - 2, LABEL_DEPTH - 1));
    }
    this.buildMallDelivery();
    // the owner: whoever is looking, in a dishdasha, ghutra and agal
    const prev = this.owner?.cell ?? toWorld(4, WALK.y0 + 1);
    this.owner = new Walker(this, 'char-owner', prev, 210, 'You');
    this.owner.setInteractive({ type: 'owner' });
    this.walkers.push(this.owner);
    if (!this.reduced) {
      this.time.addEvent({ delay: 1600, loop: true, callback: () => this.wander() });
    }
  }

  /* A delivery Lightspeed has logged in the last day or so: a courier pushes the trolley in
     from the loading dock to the brand it is for (or, if the PO has no brand, just inside). */
  private buildMallDelivery() {
    const d = this.model.delivery;
    if (!d.seen) return;
    const sp = d.brand ? this.model.mall.spots.find((x) => x.brand.brand === d.brand) : undefined;
    const tx = sp ? (sp.slot.kind === 'boutique' ? sp.slot.x + 3 : sp.cell[0]) : MALL.w - 3;
    const ty = sp && sp.slot.side === 's' ? WALK.y1 - 1 : WALK.y0 + 1;
    const start = toWorld(MALL.w - 1, WALK.y0 + 1), stop = toWorld(tx, ty);
    const courier = new Walker(this, 'char-driver-n', [start[0] + 1, start[1]], 480, 'Delivery');
    const trolley = new Walker(this, 'trolley', start, 480);
    for (const w of [courier, trolley]) { w.setInteractive({ type: 'delivery' }); this.walkers.push(w); }
    if (this.reduced) return;
    const go = () => {
      const there = findPath(trolley.cell, stop, (x, y) => this.open(x, y));
      if (!there) return;
      trolley.walk(there, () => this.time.delayedCall(2600, back));
      courier.walk([trolley.cell, ...there.slice(0, -1)]);
    };
    const back = () => {
      const home = findPath(trolley.cell, start, (x, y) => this.open(x, y));
      if (!home) return;
      trolley.walk(home, () => this.time.delayedCall(5000, go));
      courier.walk([trolley.cell, ...home.slice(0, -1)]);
    };
    this.time.delayedCall(1200, go);
  }

  private buildDelivery() {
    const v = FIXTURES.van;
    const d = this.model.delivery;
    const parked = iso(v.cell[0] + v.w, v.cell[1] + v.d);
    const van = this.img('van', parked.x, parked.y, depthAt(v.cell[0] + v.w, v.cell[1] + v.d));
    van.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    this.tag(van, { type: 'delivery' });
    if (d.seen) {
      const driver = new Walker(this, 'char-driver', [26, 4], 420);
      driver.setInteractive({ type: 'delivery' });
      this.walkers.push(driver);
      if (!this.reduced) {
        // the van pulls in, then the driver carries the delivery to the dock;
        // it waits until the dock is on screen, so it is seen arriving
        const start = iso(v.cell[0] + v.w, ROAD.y0 + 2);
        van.setPosition(start.x, start.y).setVisible(false);
        driver.sprite.setVisible(false); driver.shadow.setVisible(false);
        const arrive = () => { van.setVisible(true); this.tweens.add({
          targets: van, x: parked.x, y: parked.y, duration: 3600, ease: 'Cubic.easeOut',
          onUpdate: () => van.setDepth(depthAt(...cellAt(van.x, van.y).map((n) => n + 1) as [number, number])),
          onComplete: () => {
            van.setDepth(depthAt(v.cell[0] + v.w, v.cell[1] + v.d));
            driver.sprite.setVisible(true); driver.shadow.setVisible(true);
            const shuttle = () => {
              const there = findPath(driver.cell, [24, 4], (x, y) => this.open(x, y) || x >= 25);
              driver.walk(there ?? [], () => this.time.delayedCall(1800, () => {
                const back = findPath(driver.cell, [26, 4], (x, y) => this.open(x, y) || x >= 25);
                driver.walk(back ?? [], () => this.time.delayedCall(2600, shuttle));
              }));
            };
            shuttle();
          },
        }); };
        if (this.room === 'dock') arrive(); else this.deliveryPending = arrive;
      }
      const c = iso(26.5, 5);
      this.dyn.push(this.label(c.x, c.y + 30, `Delivery: ${d.poNumber ?? 'logged'}`, 'info'));
    }
    if (!this.reduced) this.time.addEvent({ delay: 14000, loop: true, callback: () => this.passingCar() });
  }

  /* A car going by on the road, now and then. */
  private passingCar() {
    const tints = [0xd6453d, 0x5f7ea8, 0x3f8f5a, 0xf2c230, 0x9aa0a6];
    const lane = Phaser.Math.Between(0, 1) ? ROAD.x0 + 1 : ROAD.x0;
    const a = iso(lane + 1, ROAD.y0), b = iso(lane + 1, ROAD.y1);
    const car = this.fit(this.add.image(a.x, a.y, 'van'), 'van', 0.8).setTint(Phaser.Utils.Array.GetRandom(tints));
    this.dyn.push(car);
    this.tweens.add({
      targets: car, x: b.x, y: b.y, duration: 9000,
      onUpdate: () => { const [cx, cy] = cellAt(car.x, car.y); car.setDepth(depthAt(cx + 1, cy + 1)); },
      onComplete: () => car.destroy(),
    });
  }

  bobbing(o: Phaser.GameObjects.Image) {
    if (!this.reduced) this.tweens.add({ targets: o, y: o.y - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return o;
  }

  private open(x: number, y: number) { return walkable(x, y) && !this.blocked.has(`${x},${y}`); }

  private wander() {
    const idle = this.wanderers.filter((p) => !p.w.moving);
    if (!idle.length) return;
    const p = Phaser.Utils.Array.GetRandom(idle);
    if (Math.random() < 0.35) return;
    const R = p.area ?? ROOMS[p.room];
    for (let tries = 0; tries < 8; tries++) {
      const tx = Phaser.Math.Clamp(p.home[0] + Phaser.Math.Between(-3, 3), R.x0, R.x1 - 1);
      const ty = Phaser.Math.Clamp(p.home[1] + Phaser.Math.Between(-3, 3), R.y0, R.y1 - 1);
      const path = findPath(p.w.cell, [tx, ty], (x, y) => this.open(x, y));
      if (path && path.length > 1 && path.length < 9) { p.w.walk(path); return; }
    }
  }

  /* ── camera and input ──────────────────────────────────────────────── */

  /* The part of the World the camera may show for an area: the room with its
     walls and signs, and a margin of the rooms and ground around it. */
  private zone(room: Room) {
    const r = FOCUS[room];
    const minX = iso(r.x0, r.y1).x, maxX = iso(r.x1, r.y0).x;
    const minY = iso(r.x0, r.y0).y - 150, maxY = iso(r.x1, r.y1).y + 20;
    return { x: minX - ZONE_MARGIN.x, y: minY - ZONE_MARGIN.y, w: maxX - minX + 2 * ZONE_MARGIN.x, h: maxY - minY + 2 * ZONE_MARGIN.y };
  }

  /* Zoomed out as far as it goes, the whole zone fits in the free part of the screen. */
  private minZoom() {
    const cam = this.cameras.main, zn = this.zone(this.room), px = this.base * 2;
    const vh = Math.max(cam.height - (this.insets.top + this.insets.bottom) * px, cam.height * 0.4);
    return Math.min(cam.width / zn.w, vh / zn.h);
  }

  private maxZoom() { return this.base * 2.4; }

  /* Keeps the view inside the chosen area's zone, every frame. The page's bars
     and an open panel may cover the zone's edges, so it may go that much
     further to bring them out from under them. Where the view is wider (or
     taller) than the zone, the zone sits in the middle. A view that has
     strayed (a panel just closed, a drag past the edge) eases back. */
  private keepInZone(delta: number) {
    const cam = this.cameras.main;
    // a move between areas, or to reveal something, ends inside the zone by itself
    if (cam.panEffect.isRunning || cam.zoomEffect.isRunning) return;
    const z = Phaser.Math.Clamp(cam.zoom, this.minZoom(), this.maxZoom());
    if (z !== cam.zoom) cam.setZoom(z);
    const zn = this.zone(this.room), px = (this.base * 2) / cam.zoom;      // world units per CSS px
    const x0 = zn.x, x1 = zn.x + zn.w + this.cover.right * px;
    const y0 = zn.y - this.insets.top * px, y1 = zn.y + zn.h + (this.insets.bottom + this.cover.bottom) * px;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const mx = cam.scrollX + cam.width / 2, my = cam.scrollY + cam.height / 2;
    const tx = vw >= x1 - x0 ? (x0 + x1) / 2 : Phaser.Math.Clamp(mx, x0 + vw / 2, x1 - vw / 2);
    const ty = vh >= y1 - y0 ? (y0 + y1) / 2 : Phaser.Math.Clamp(my, y0 + vh / 2, y1 - vh / 2);
    if (Math.abs(tx - mx) < 0.5 && Math.abs(ty - my) < 0.5) return;
    if (this.input.activePointer.isDown) cam.centerOn(tx, ty);   // hold the edge firmly under a finger
    else {
      const k = 1 - Math.pow(0.75, delta / 16.7);    // about a quarter of the way each 60 Hz frame, whatever the frame rate
      cam.centerOn(mx + (tx - mx) * k, my + (ty - my) * k);
    }
  }

  private setupCamera() {
    this.focus('floor', false);
  }

  private setupInput() {
    const cam = this.cameras.main;
    let start = { x: 0, y: 0, sx: 0, sy: 0 };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      start = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
      const [a, b] = [this.input.pointer1, this.input.pointer2];
      if (a.isDown && b.isDown) this.pinch = { d: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z: cam.zoom };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const [a, b] = [this.input.pointer1, this.input.pointer2];
      if (this.pinch && a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        cam.setZoom(Phaser.Math.Clamp(this.pinch.z * (d / this.pinch.d), this.minZoom(), this.base * 2.4));
        this.dragged = true;
        return;
      }
      if (!p.isDown) return;
      const dx = p.x - start.x, dy = p.y - start.y;
      if (!this.dragged && Math.hypot(dx, dy) < 8 * (this.base * 2)) return;
      this.dragged = true;
      cam.setScroll(start.sx - dx / cam.zoom, start.sy - dy / cam.zoom);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null;
      if (this.dragged) return;
      const hit = over.find((o) => o.getData('sel'));
      if (hit) { this.choose(hit); return; }
      this.walkOwnerTo(p.worldX, p.worldY);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy > 0 ? 0.9 : 1.1);
    });
  }

  private choose(o: Phaser.GameObjects.GameObject) {
    const sel = o.getData('sel') as Selection;
    if (sel.type === 'section') { this.hooks.onSection?.(sel.index); this.focusSection(sel.index); return; }
    this.markChosen(o as Phaser.GameObjects.Image, (o.getData('ringDy') as number) ?? -32);
    this.hooks.onSelect(sel);
  }

  private markChosen(img: Phaser.GameObjects.Image, dy: number) {
    this.chosen = img;
    this.selectRing.setVisible(true).setPosition(img.x, img.y + dy).setScale(dy === 0 ? 0.6 : 1);
    this.selectRing.setAlpha(1);
    if (!this.reduced) {
      this.tweens.killTweensOf(this.selectRing);
      this.tweens.add({ targets: this.selectRing, alpha: { from: 1, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  private walkOwnerTo(wx: number, wy: number) {
    const [x, y] = cellAt(wx, wy);
    if (!this.open(x, y)) return;
    const path = findPath(this.owner.cell, [x, y], (a, b) => this.open(a, b));
    if (!path) {
      // another area with no way through: step straight there
      this.owner.fx = x + 0.5; this.owner.fy = y + 0.5;
      this.hooks.onSelect(null);
      this.selectRing.setVisible(false);
      this.chosen = null;
      return;
    }
    const t = iso(x + 0.5, y + 0.5);
    this.targetRing.setVisible(true).setPosition(t.x, t.y).setDepth(depthAt(x + 0.5, y + 0.5, -2)).setAlpha(1);
    this.tweens.add({ targets: this.targetRing, alpha: 0, delay: Math.max(0, path.length * this.owner.speed - 200), duration: 400 });
    this.owner.walk(path);
    this.hooks.onSelect(null);
    this.selectRing.setVisible(false);
    this.chosen = null;
  }
}
