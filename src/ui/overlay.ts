import type { OverlayHost } from '../scenes/sceneManager';

/** DOM overlay helper (ink-links innerHTML style). ALL overlay/menu DOM goes
 *  through here — isolated so a canvas-UI fallback stays contained (PLAN.md
 *  risk #4). One overlay at a time. */
export function createOverlayHost(rootId = 'overlay-root', hudId = 'hud'): OverlayHost {
  const root = () => document.getElementById(rootId)!;
  const drop = (cls: string) => root().querySelectorAll(`.${cls}`).forEach((n) => n.remove());
  return {
    show(html, wire) {
      drop('overlay');
      const div = document.createElement('div');
      div.className = 'overlay';
      div.innerHTML = html;
      root().appendChild(div);
      wire?.(div);
    },
    clear() {
      drop('overlay');
    },
    panel(html, wire) {
      drop('panel');
      if (!html) return;
      const div = document.createElement('div');
      div.className = 'panel';
      div.innerHTML = html;
      root().appendChild(div);
      wire?.(div);
    },
    hud(html) {
      const h = document.getElementById(hudId);
      if (h) h.innerHTML = html;
    },
  };
}
