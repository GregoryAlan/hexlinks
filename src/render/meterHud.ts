import { COLORS, METER } from '../core/config';
import type { SceneView } from '../scenes/sceneManager';
import { meterNeedle, type MeterConfig, type MeterState } from '../shot/meter';

/** Canvas-drawn swing meter (screen space, drawn after the camera
 *  transform so it is frame-synced with the needle — no DOM drift). The
 *  track spans needle −overshoot…1; the zero line sits at the left end of
 *  the live range, the pure band around it (shifted by side-slope), the
 *  target-power tick where the tapped hex needs the needle. */
export function drawMeter(
  g: CanvasRenderingContext2D,
  view: SceneView,
  cfg: MeterConfig,
  s: MeterState,
  now: number,
  targetPower: number,
  clubName: string,
): void {
  const w = Math.min(300, view.width - 44);
  const h = 18;
  const x0 = (view.width - w) / 2;
  const y0 = view.height - 170;
  const lo = -METER.overshoot;
  const toX = (v: number) => x0 + ((v - lo) / (1 - lo)) * w;
  const needle = meterNeedle(cfg, s, now);

  g.save();
  g.font = '13px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // Track.
  g.fillStyle = COLORS.paper;
  g.strokeStyle = COLORS.ink;
  g.lineWidth = 2;
  g.fillRect(x0, y0, w, h);
  // Overshoot zone (left of the zero line) in muted paper.
  g.fillStyle = 'rgba(43,40,34,0.08)';
  g.fillRect(x0, y0, toX(0) - x0, h);
  // Pure band.
  g.fillStyle = COLORS.accent;
  g.globalAlpha = 0.55;
  g.fillRect(toX(cfg.sweetCenter - cfg.sweetHalfWidth), y0, toX(cfg.sweetCenter + cfg.sweetHalfWidth) - toX(cfg.sweetCenter - cfg.sweetHalfWidth), h);
  g.globalAlpha = 1;
  g.strokeRect(x0, y0, w, h);
  // Zero / pure line.
  g.beginPath();
  g.moveTo(toX(cfg.sweetCenter), y0 - 5);
  g.lineTo(toX(cfg.sweetCenter), y0 + h + 5);
  g.stroke();
  // Target power tick (dashed).
  g.setLineDash([3, 3]);
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(toX(targetPower), y0 - 8);
  g.lineTo(toX(targetPower), y0 + h + 8);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = COLORS.ink;
  g.fillText(`${Math.round(targetPower * 100)}%`, toX(targetPower), y0 - 11);
  // Power mark once chosen.
  if (s.phase !== 'power') {
    const px = toX(s.phase === 'accuracy' ? s.power : s.result.power);
    g.fillStyle = COLORS.ink;
    g.beginPath();
    g.moveTo(px - 5, y0 + h + 2);
    g.lineTo(px + 5, y0 + h + 2);
    g.lineTo(px, y0 + h - 4);
    g.closePath();
    g.fill();
  }
  // Needle.
  const nx = toX(Math.max(lo, Math.min(1, needle)));
  g.strokeStyle = s.phase === 'done' ? COLORS.accent : COLORS.ink;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(nx, y0 - 4);
  g.lineTo(nx, y0 + h + 4);
  g.stroke();
  // Caption.
  g.fillStyle = COLORS.ink;
  g.font = '14px "Fredericka the Great", Georgia, serif';
  let caption: string;
  if (s.phase === 'power') caption = `${clubName} — tap for power`;
  else if (s.phase === 'accuracy') caption = 'tap on the line';
  else {
    const a = s.result.accuracy;
    const word = Math.abs(a) < 0.25 ? 'Pure.' : Math.abs(a) < 0.6 ? (a > 0 ? 'A touch pushed.' : 'A touch pulled.') : a > 0 ? 'Pushed.' : 'Pulled.';
    caption = `${Math.round(s.result.power * 100)}% — ${word}`;
  }
  g.fillText(caption, view.width / 2, y0 + h + 24);
  g.restore();
}
