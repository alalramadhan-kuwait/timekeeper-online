import Phaser from 'phaser';
import type { Room, WorldModel } from '../model';
import { WorldScene, type SceneHooks } from './WorldScene';

export interface WorldGame {
  setModel: (m: WorldModel) => void;
  focus: (r: Room) => void;
  setInsets: (top: number, bottom: number) => void;
  zoomBy: (f: number) => void;
  clearSelection: () => void;
  reveal: (top: number, right: number, bottom: number) => void;
  destroy: () => void;
}

/* Boots the scene into `parent`. The canvas is drawn at the device's pixel
   density (capped at 2) and shown at CSS size, so the art stays sharp on a phone
   without costing a 3x canvas. */
export function createGame(parent: HTMLElement, model: WorldModel, hooks: SceneHooks): WorldGame {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const size = () => ({ w: Math.max(1, parent.clientWidth), h: Math.max(1, parent.clientHeight) });
  const { w, h } = size();

  let scene: WorldScene | null = null;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: w * dpr,
    height: h * dpr,
    backgroundColor: '#dfca93',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: { antialias: true, powerPreference: 'low-power' },
    fps: { target: 60, min: 30 },
    banner: false,
    input: { activePointers: 3 },
    scene: [],
  });
  game.scene.add('world', WorldScene, true, { model, hooks, reducedMotion, dpr });
  game.events.once(Phaser.Core.Events.READY, () => { scene = game.scene.getScene('world') as WorldScene; });

  const ro = new ResizeObserver(() => {
    const s = size();
    game.scale.resize(s.w * dpr, s.h * dpr);
  });
  ro.observe(parent);

  const withScene = (f: (s: WorldScene) => void) => {
    const s = scene ?? (game.scene.getScene('world') as WorldScene | null);
    if (s && s.sys.isActive()) f(s);
  };

  return {
    setModel: (m) => withScene((s) => s.setModel(m)),
    focus: (r) => withScene((s) => s.focus(r)),
    setInsets: (t, b) => withScene((s) => s.setInsets(t, b)),
    zoomBy: (f) => withScene((s) => s.zoomBy(f)),
    clearSelection: () => withScene((s) => s.clearSelection()),
    reveal: (t, r, b) => withScene((s) => s.reveal(t, r, b)),
    destroy: () => { ro.disconnect(); game.destroy(true); },
  };
}
