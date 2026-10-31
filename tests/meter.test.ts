import { describe, expect, it } from 'vitest';
import { METER } from '../src/core/config';
import { clubDef } from '../src/data/clubs';
import { accuracyFor, meterConfigFor, meterNeedle, meterReplay, meterStart, meterTap, meterTick, sweepPosition } from '../src/shot/meter';
import { NO_SPIN } from '../src/shot/types';

/** Swing-meter goldens + invariants: a swing is a pure function of its two
 *  tap times. */
describe('swing meter', () => {
  const fair = meterConfigFor(clubDef('iron'), 'fairway', 0, NO_SPIN);

  it('the sweep is a triangle wave in [0,1] with period 2·sweepMs', () => {
    expect(sweepPosition(fair, 0)).toBe(0);
    expect(sweepPosition(fair, fair.sweepMs)).toBe(1);
    expect(sweepPosition(fair, 2 * fair.sweepMs)).toBeCloseTo(0);
    expect(sweepPosition(fair, 0.5 * fair.sweepMs)).toBeCloseTo(0.5);
    for (let t = 0; t < 5000; t += 37) {
      const p = sweepPosition(fair, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('tap at the top is full power; tapping on the line is a pure strike', () => {
    const r = meterReplay(fair, fair.sweepMs, fair.sweepMs + fair.sweepMs);
    expect(r.power).toBeCloseTo(1);
    expect(r.accuracy).toBeCloseTo(0);
  });

  it('early is a push, late a pull, both clamped to ±1', () => {
    const t1 = 0.8 * fair.sweepMs;
    const onLine = t1 + 0.8 * fair.sweepMs;
    const early = meterReplay(fair, t1, onLine - 0.5 * fair.sweetHalfWidth * fair.sweepMs);
    const late = meterReplay(fair, t1, onLine + 0.5 * fair.sweetHalfWidth * fair.sweepMs);
    const wayEarly = meterReplay(fair, t1, onLine - 0.4 * fair.sweepMs);
    expect(early.accuracy).toBeCloseTo(0.5);
    expect(late.accuracy).toBeCloseTo(-0.5);
    expect(wayEarly.accuracy).toBe(1);
  });

  it('rough speeds the sweep and narrows the band; draw/fade narrows it too', () => {
    const rough = meterConfigFor(clubDef('iron'), 'rough', 0, NO_SPIN);
    expect(rough.sweepMs).toBeLessThan(fair.sweepMs);
    expect(rough.sweetHalfWidth).toBeLessThan(fair.sweetHalfWidth);
    const shaped = meterConfigFor(clubDef('iron'), 'fairway', 0, { roll: 0, curve: 1 });
    expect(shaped.sweetHalfWidth).toBeLessThan(fair.sweetHalfWidth);
  });

  it('side-slope shifts the line: tapping at zero on a slope is an error', () => {
    const sloped = meterConfigFor(clubDef('iron'), 'fairway', 1, NO_SPIN);
    expect(sloped.sweetCenter).toBeCloseTo(METER.slopeShiftPerLevel);
    expect(accuracyFor(sloped, 0)).toBeLessThan(0);
    expect(accuracyFor(sloped, sloped.sweetCenter)).toBe(0);
  });

  it('a needle left to run past the line resolves as a full pull', () => {
    let s = meterStart(0);
    s = meterTap(fair, s, fair.sweepMs);
    const t = fair.sweepMs + fair.sweepMs + (METER.overshoot + 0.01) * fair.sweepMs;
    expect(meterNeedle(fair, s, t)).toBeLessThan(-METER.overshoot);
    const done = meterTick(fair, s, t);
    expect(done.phase).toBe('done');
    if (done.phase === 'done') expect(done.result.accuracy).toBe(-1);
  });

  it('a frantic double tap still has some power', () => {
    expect(meterReplay(fair, 1, 2).power).toBe(METER.minPower);
  });

  it('golden table of tap pairs per lie', () => {
    const rows: Record<string, { power: number; accuracy: number }> = {};
    for (const lie of ['tee', 'fairway', 'rough', 'sand'] as const) {
      const cfg = meterConfigFor(clubDef('wedge'), lie, 0, NO_SPIN);
      const r = meterReplay(cfg, 700, 1500);
      rows[lie] = { power: Math.round(r.power * 1000) / 1000, accuracy: Math.round(r.accuracy * 1000) / 1000 };
    }
    expect(rows).toMatchSnapshot();
  });
});
