import { LIE, METER, SPIN } from '../core/config';
import type { TerrainKind } from '../hex/map';
import type { ClubDef, Spin, SwingResult } from './types';

/** Pure 3-tap swing meter (PLAN v2 §MICRO). Driven by the scene clock — a
 *  pure function of tap timestamps, so a swing is replayable from
 *  `{powerT, accT}` and golden-testable. No DOM; `render/meterHud.ts`
 *  draws it. */

export interface MeterConfig {
  /** ms for one 0→1 sweep. */
  sweepMs: number;
  /** Needle value of the pure-strike line (0 on flat ground; side-slope
   *  shifts it, so the player must read the lie). */
  sweetCenter: number;
  /** Half-width of the band that counts as a pure strike. */
  sweetHalfWidth: number;
}

export type MeterState =
  | { phase: 'power'; t0: number }
  | { phase: 'accuracy'; t0: number; powerT: number; power: number }
  | { phase: 'done'; t0: number; powerT: number; accT: number; result: SwingResult };

export function meterConfigFor(club: ClubDef, lie: TerrainKind, sideSlope: number, spin: Spin): MeterConfig {
  const l = LIE[lie];
  return {
    sweepMs: METER.sweepMs / l.sweep,
    sweetCenter: sideSlope * METER.slopeShiftPerLevel,
    sweetHalfWidth: METER.sweetHalfWidth * club.sweetSpotWidth * l.sweet * (spin.curve !== 0 ? SPIN.curveSweetMult : 1),
  };
}

export function meterStart(now: number): MeterState {
  return { phase: 'power', t0: now };
}

/** Triangle wave 0→1→0 with period 2·sweepMs. */
export function sweepPosition(cfg: MeterConfig, elapsedMs: number): number {
  const u = Math.max(0, elapsedMs) / cfg.sweepMs;
  return 1 - Math.abs((u % 2) - 1);
}

/** Where the needle is now. Power phase: the sweep. Accuracy phase: running
 *  back down from the power mark at sweep speed (can go negative). */
export function meterNeedle(cfg: MeterConfig, s: MeterState, now: number): number {
  if (s.phase === 'power') return sweepPosition(cfg, now - s.t0);
  if (s.phase === 'accuracy') return s.power - (now - s.powerT) / cfg.sweepMs;
  return s.result.accuracy * cfg.sweetHalfWidth + cfg.sweetCenter;
}

export function accuracyFor(cfg: MeterConfig, needle: number): number {
  const a = (needle - cfg.sweetCenter) / cfg.sweetHalfWidth;
  return a < -1 ? -1 : a > 1 ? 1 : a;
}

export function meterTap(cfg: MeterConfig, s: MeterState, now: number): MeterState {
  if (s.phase === 'power') {
    const power = Math.max(METER.minPower, sweepPosition(cfg, now - s.t0));
    return { phase: 'accuracy', t0: s.t0, powerT: now, power };
  }
  if (s.phase === 'accuracy') {
    const accuracy = accuracyFor(cfg, meterNeedle(cfg, s, now));
    return { phase: 'done', t0: s.t0, powerT: s.powerT, accT: now, result: { power: s.power, accuracy } };
  }
  return s;
}

/** Time passing: a needle that runs well past the line resolves as a pull. */
export function meterTick(cfg: MeterConfig, s: MeterState, now: number): MeterState {
  if (s.phase === 'accuracy' && meterNeedle(cfg, s, now) < cfg.sweetCenter - METER.overshoot) {
    return { phase: 'done', t0: s.t0, powerT: s.powerT, accT: now, result: { power: s.power, accuracy: -1 } };
  }
  return s;
}

/** Replay a swing from its two tap offsets (ms after start). */
export function meterReplay(cfg: MeterConfig, powerT: number, accT: number): SwingResult {
  let s = meterStart(0);
  s = meterTap(cfg, s, powerT);
  s = meterTap(cfg, s, accT);
  return s.phase === 'done' ? s.result : { power: 0, accuracy: 0 };
}
