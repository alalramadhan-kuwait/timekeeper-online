import Phaser from 'phaser';
import { ASSET } from '../assets/manifest';

/* Flat floor tiles, drawn as one object per picture instead of one per tile.

   The floors never change once drawn and nothing stands between two tiles, so the tiles
   of each picture go into a single SpriteGPULayer: built once, drawn in one call. The mall
   alone has 850 tiles; this turns them into about a dozen objects. Without WebGL (the canvas
   fallback) the tiles are ordinary images, as before. */

export class FloorBatch {
  private at = new Map<string, [number, number][]>();

  constructor(private scene: Phaser.Scene, private depth: number) {}

  /* A tile whose anchor stands at (x, y) on screen, in world units. */
  add(key: string, x: number, y: number) {
    let list = this.at.get(key);
    if (!list) this.at.set(key, (list = []));
    list.push([x, y]);
  }

  /* Draws everything added; returns how many objects that took. */
  draw(): number {
    const webgl = this.scene.game.renderer.type === Phaser.WEBGL;
    let made = 0;
    for (const [key, list] of this.at) {
      const a = ASSET[key];
      const frame = this.scene.textures.get(key).get();
      const scale = a.drawWidth / (frame.width || a.drawWidth);
      if (webgl) {
        const layer = this.scene.add.spriteGPULayer(key, list.length).setDepth(this.depth);
        const member = { x: 0, y: 0, scaleX: scale, scaleY: scale, originX: a.origin[0], originY: a.origin[1] };
        for (const [x, y] of list) { member.x = x; member.y = y; layer.addMember(member); }
        made++;
      } else {
        for (const [x, y] of list) {
          this.scene.add.image(x, y, key).setOrigin(a.origin[0], a.origin[1]).setScale(scale).setDepth(this.depth);
          made++;
        }
      }
    }
    this.at.clear();
    return made;
  }
}
