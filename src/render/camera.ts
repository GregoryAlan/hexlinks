import { CAMERA } from '../core/config';
import type { Vec2 } from '../core/types';
import type { IsoBounds } from '../hex/map';
import type { SceneView } from '../scenes/sceneManager';

/** Overworld camera: iso-world center + zoom (screen CSS px per world px).
 *  Pure math — the scene applies it as a canvas transform, input inverts it
 *  for picking. */
export class Camera {
  center: Vec2;
  zoom: number;
  private target: Vec2 | null = null;

  constructor(center: Vec2, zoom = 1) {
    this.center = { ...center };
    this.zoom = clampZoom(zoom);
  }

  worldToScreen(p: Vec2, view: SceneView): Vec2 {
    return {
      x: (p.x - this.center.x) * this.zoom + view.width / 2,
      y: (p.y - this.center.y) * this.zoom + view.height / 2,
    };
  }

  screenToWorld(p: Vec2, view: SceneView): Vec2 {
    return {
      x: (p.x - view.width / 2) / this.zoom + this.center.x,
      y: (p.y - view.height / 2) / this.zoom + this.center.y,
    };
  }

  /** Pan by a screen-space delta (drag). Cancels any follow. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.target = null;
    this.center.x -= dxScreen / this.zoom;
    this.center.y -= dyScreen / this.zoom;
  }

  /** Zoom keeping the world point under `anchor` (screen) fixed. */
  zoomAt(factor: number, anchor: Vec2, view: SceneView): void {
    const before = this.screenToWorld(anchor, view);
    this.zoom = clampZoom(this.zoom * factor);
    const after = this.screenToWorld(anchor, view);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
  }

  /** Smoothly move toward a world point (e.g. the walking party). */
  follow(p: Vec2): void {
    this.target = { ...p };
  }

  snapTo(p: Vec2): void {
    this.target = null;
    this.center = { ...p };
  }

  update(dtMs: number): void {
    if (!this.target) return;
    const k = 1 - Math.exp((-CAMERA.followRate * dtMs) / 1000);
    this.center.x += (this.target.x - this.center.x) * k;
    this.center.y += (this.target.y - this.center.y) * k;
    if (Math.hypot(this.target.x - this.center.x, this.target.y - this.center.y) < 0.25) {
      this.center = { ...this.target };
      this.target = null;
    }
  }

  /** Keep the map from being panned out of view: the center may travel over
   *  the padded world bounds; when the map is smaller than the viewport it
   *  stays centered. */
  clampTo(bounds: IsoBounds, view: SceneView): void {
    const halfW = view.width / 2 / this.zoom;
    const halfH = view.height / 2 / this.zoom;
    const minX = bounds.minX - CAMERA.padPx + halfW;
    const maxX = bounds.maxX + CAMERA.padPx - halfW;
    const minY = bounds.minY - CAMERA.padPx + halfH;
    const maxY = bounds.maxY + CAMERA.padPx - halfH;
    this.center.x = minX > maxX ? (bounds.minX + bounds.maxX) / 2 : clamp(this.center.x, minX, maxX);
    this.center.y = minY > maxY ? (bounds.minY + bounds.maxY) / 2 : clamp(this.center.y, minY, maxY);
  }
}

function clampZoom(z: number): number {
  return clamp(z, CAMERA.minZoom, CAMERA.maxZoom);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
