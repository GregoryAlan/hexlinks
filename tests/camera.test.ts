import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/core/config';
import { Camera } from '../src/render/camera';

const view = { width: 390, height: 780 };

describe('camera', () => {
  it('world↔screen roundtrips at any zoom', () => {
    const c = new Camera({ x: 123, y: -45 }, 0.8);
    for (const p of [
      { x: 0, y: 0 },
      { x: 500, y: 900 },
      { x: -300, y: 20 },
    ]) {
      const s = c.worldToScreen(p, view);
      const w = c.screenToWorld(s, view);
      expect(w.x).toBeCloseTo(p.x, 9);
      expect(w.y).toBeCloseTo(p.y, 9);
    }
  });

  it('zoomAt keeps the anchored world point fixed and clamps', () => {
    const c = new Camera({ x: 100, y: 100 }, 1);
    const anchor = { x: 50, y: 700 };
    const before = c.screenToWorld(anchor, view);
    c.zoomAt(1.1, anchor, view);
    const after = c.screenToWorld(anchor, view);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    c.zoomAt(100, anchor, view);
    expect(c.zoom).toBe(CAMERA.maxZoom);
    c.zoomAt(0.0001, anchor, view);
    expect(c.zoom).toBe(CAMERA.minZoom);
  });

  it('clampTo keeps the view over the padded bounds, centring small maps', () => {
    const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 3000 };
    const c = new Camera({ x: -5000, y: 9000 }, 1);
    c.clampTo(bounds, view);
    expect(c.center.x).toBe(-CAMERA.padPx + view.width / 2);
    expect(c.center.y).toBe(3000 + CAMERA.padPx - view.height / 2);
    const small = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    c.clampTo(small, view);
    expect(c.center).toEqual({ x: 50, y: 50 });
  });

  it('follow converges', () => {
    const c = new Camera({ x: 0, y: 0 }, 1);
    c.follow({ x: 100, y: 50 });
    for (let i = 0; i < 200; i++) c.update(16);
    expect(c.center).toEqual({ x: 100, y: 50 });
  });
});
