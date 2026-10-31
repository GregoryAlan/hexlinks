import type { CLUBS, SHAPES } from '../core/config';
import type { Axial } from '../hex/coords';

/** Pure shot-model types (PLAN v2 §MICRO). No DOM, no matter. */

export type ClubId = keyof typeof CLUBS;
export type ShotShape = keyof typeof SHAPES;

export interface ClubDef {
  id: ClubId;
  name: string;
  maxCarry: number;
  loft: number;
  rollFactor: number;
  dispersion: number;
  sweetSpotWidth: number;
  shapes: readonly ShotShape[];
  price: number;
}

/** -1 back / 0 none / +1 top; -1 draw / 0 straight / +1 fade. */
export interface Spin {
  roll: -1 | 0 | 1;
  curve: -1 | 0 | 1;
}

export const NO_SPIN: Spin = { roll: 0, curve: 0 };

/** What the swing meter produces (step 2); the auto-swing in step 1b emits
 *  a perfect one. `power` is the fraction of the club's max carry;
 *  `accuracy` is the signed error in sweet-band widths, clamped to ±1. */
export interface SwingResult {
  power: number;
  accuracy: number;
}

/** Daily wind: drift direction × strength, in hexes per level of apex. */
export interface Wind {
  dx: number;
  dy: number;
}

export const NO_WIND: Wind = { dx: 0, dy: 0 };

export interface ShotInput {
  from: Axial;
  /** Sets direction (and, for the auto-swing, the intended carry). */
  target: Axial;
  club: ClubId;
  shape: ShotShape;
  spin: Spin;
  swing: SwingResult;
  wind: Wind;
}

/** Cosmetic flight sample: flat-world px + height in elevation levels. */
export interface FlightSample {
  x: number;
  y: number;
  h: number;
  hex: Axial;
}

export type ShotEvent = 'ridgeStrike' | 'canopyStrike' | 'splash' | 'oob' | 'holed' | 'rollStopUphill';

export type ShotTerminal = 'rest' | 'water' | 'oob' | 'holed';

export interface ShotOutcome {
  /** Where the ball first met the ground (flight) or started (ground shot). */
  landingHex: Axial;
  /** Where it stopped — may be water/oob; landing rules decide the lie. */
  restHex: Axial;
  flightSamples: FlightSample[];
  /** Hexes the ball actually passed through, launch → rest (flight ∪ roll). */
  path: Axial[];
  rollPath: Axial[];
  /** Flight ∪ roll hexes widened by BALLISTICS.clearRadius, on-map only. */
  clearedPath: Axial[];
  events: ShotEvent[];
  terminal: ShotTerminal;
}

/** The only part of an outcome that may enter RunState (quantized). */
export type ShotRecord = Pick<ShotOutcome, 'landingHex' | 'restHex' | 'path' | 'clearedPath' | 'terminal' | 'events'>;

export function toRecord(o: ShotOutcome): ShotRecord {
  return {
    landingHex: o.landingHex,
    restHex: o.restHex,
    path: o.path,
    clearedPath: o.clearedPath,
    terminal: o.terminal,
    events: o.events,
  };
}
