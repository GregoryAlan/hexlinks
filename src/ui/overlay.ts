import type { OverlayHost } from '../scenes/sceneManager';

/** DOM overlay helper (ink-links innerHTML style). ALL overlay/menu DOM goes
 *  through here — isolated so a canvas-UI fallback stays contained (PLAN.md
 *  risk #4). One overlay at a time. */
export function createOverlayHost(rootId = 'overlay-root', hudId = 'hud'): OverlayHost {
  const root = () => document.getElementById(rootId)!;
  return {
    show(html, wire) {
      const r = root();
      r.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'overlay';
      div.innerHTML = html;
      r.appendChild(div);
      wire?.(div);
    },
    clear() {
      root().innerHTML = '';
    },
    hud(html) {
      const h = document.getElementById(hudId);
      if (h) h.innerHTML = html;
    },
  };
}
