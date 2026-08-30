import { COLORS, STAGE, WORLD } from './core/config';
import { HomeBaseScene } from './scenes/homeBase';
import { PlaceholderScene } from './scenes/placeholder';
import {
  SceneManager,
  type SceneRequest,
  type SceneView,
} from './scenes/sceneManager';
import { createOverlayHost } from './ui/overlay';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

// P0 logical viewport: the ink-links square, letterboxed. P1's camera and the
// pre-P3 stage-aspect decision replace this.
const view: SceneView = { width: STAGE.width, height: STAGE.height };
let scale = 1; // backing px per logical px

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, WORLD.maxDpr);
  const px = Math.round(rect.width * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  scale = px / view.width;
}
window.addEventListener('resize', resize);
resize();

function toLogical(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * view.width,
    y: ((clientY - rect.top) / rect.height) * view.height,
  };
}

// ---- scenes ----------------------------------------------------------------
function makeScene(req: SceneRequest) {
  switch (req.kind) {
    case 'homeBase':
      return new HomeBaseScene();
    default:
      return new PlaceholderScene(req.kind);
  }
}

const manager = new SceneManager(makeScene, createOverlayHost());
manager.push({ kind: 'homeBase' });

// ---- input (P0: raw pointer → top scene; input/pointer.ts lands in P1) -----
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  manager.handlePointer({ type: 'down', pos: toLogical(e.clientX, e.clientY) });
});
canvas.addEventListener('pointermove', (e) => {
  manager.handlePointer({ type: 'move', pos: toLogical(e.clientX, e.clientY) });
});
canvas.addEventListener('pointerup', (e) => {
  manager.handlePointer({ type: 'up', pos: toLogical(e.clientX, e.clientY) });
});
canvas.addEventListener('pointercancel', (e) => {
  manager.handlePointer({ type: 'cancel', pos: toLogical(e.clientX, e.clientY) });
});

// ---- main loop (single rAF; scenes own any fixed-step accumulation) --------
let last = performance.now();

function loop(now: number): void {
  const dt = now - last;
  last = now;

  manager.step(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.scale(scale, scale);
  manager.render(g, view, 1);
  g.restore();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
