import { COLORS, WORLD } from './core/config';
import { DEBUG } from './core/debug';
import { stairStepMap } from './data/fixtures';
import { tutorialMap } from './data/tutorial';
import { HomeBaseScene } from './scenes/homeBase';
import { OverworldScene, type OverworldRequest } from './scenes/overworld';
import { PlaceholderScene } from './scenes/placeholder';
import { SceneManager, type SceneRequest, type SceneView } from './scenes/sceneManager';
import type { FaceStyle } from './render/hexRenderer';
import { createOverlayHost } from './ui/overlay';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

// Portrait logical viewport = the canvas's CSS size (the camera does the
// rest); the backing store is DPR-scaled with the ink-links cap. Side-view
// stages (P3) scale their fixed logical bounds to fit inside this.
const view: SceneView = { width: 390, height: 780 };
let dpr = 1;

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  dpr = Math.min(window.devicePixelRatio || 1, WORLD.maxDpr);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  view.width = rect.width;
  view.height = rect.height;
}
window.addEventListener('resize', resize);
resize();

function toLogical(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// ---- URL flags (debug + P1 art prototype) ----------------------------------
const params = new URLSearchParams(location.search);
const debug = (params.get('debug') ?? '').split(',');
DEBUG.drawOrder = debug.includes('order');
DEBUG.pathCost = debug.includes('cost');
const faceStyle = (params.get('style') as FaceStyle | null) ?? 'flat';
const proto = params.get('proto');
const fogOff = params.get('fog') === 'off';

// ---- scenes ----------------------------------------------------------------
function makeScene(req: SceneRequest) {
  switch (req.kind) {
    case 'homeBase':
      return new HomeBaseScene();
    case 'overworld':
      return new OverworldScene(req.hole as OverworldRequest);
    default:
      return new PlaceholderScene(req.kind);
  }
}

const manager = new SceneManager(makeScene, createOverlayHost());
if (proto === 'stair') {
  manager.push({ kind: 'overworld', hole: { map: stairStepMap(), faceStyle, fogOff, zoom: Number(params.get('zoom') ?? 1) }, run: null });
} else if (proto === 'hole') {
  manager.push({ kind: 'overworld', hole: { map: tutorialMap(), faceStyle, fogOff, zoom: Number(params.get('zoom') ?? 0.9) }, run: null });
} else {
  manager.push({ kind: 'homeBase' });
}

// ---- input (raw pointer → top scene; gestures are the scene's business) ---
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  manager.handlePointer({ type: 'down', pos: toLogical(e.clientX, e.clientY), id: e.pointerId });
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  manager.handlePointer({ type: 'move', pos: toLogical(e.clientX, e.clientY), id: e.pointerId });
});
canvas.addEventListener('pointerup', (e) => {
  manager.handlePointer({ type: 'up', pos: toLogical(e.clientX, e.clientY), id: e.pointerId });
});
canvas.addEventListener('pointercancel', (e) => {
  manager.handlePointer({ type: 'cancel', pos: toLogical(e.clientX, e.clientY), id: e.pointerId });
});
canvas.addEventListener(
  'wheel',
  (e) => {
    manager.handlePointer({ type: 'wheel', pos: toLogical(e.clientX, e.clientY), delta: e.deltaY });
    e.preventDefault();
  },
  { passive: false },
);

// ---- main loop (single rAF; scenes own any fixed-step accumulation) --------
let last = performance.now();

function loop(now: number): void {
  const dt = Math.min(now - last, 100);
  last = now;

  manager.step(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = COLORS.paper;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.scale(dpr, dpr);
  manager.render(g, view, 1);
  g.restore();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// E2E hook: lets the smoke script read scene state without poking DOM.
(window as unknown as { __hexlinks: unknown }).__hexlinks = { manager };
