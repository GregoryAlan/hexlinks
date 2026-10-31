import { CLUBS, LIE, START_BAG } from '../core/config';
import type { TerrainKind } from '../hex/map';
import type { ClubDef, ClubId, ShotShape } from '../shot/types';

/** Club definitions as typed objects over the config table. */
export const CLUB_IDS = Object.keys(CLUBS) as ClubId[];

export function clubDef(id: ClubId): ClubDef {
  const c = CLUBS[id];
  return { id, ...c };
}

export function startBag(): ClubId[] {
  return [...START_BAG];
}

/** Clubs the lie forbids (deep rough bans the driver, sand the putter…). */
export function clubAllowed(id: ClubId, lie: TerrainKind): boolean {
  return !(LIE[lie].bannedClubs as readonly string[]).includes(id);
}

export function shapeAllowed(id: ClubId, shape: ShotShape): boolean {
  return (CLUBS[id].shapes as readonly string[]).includes(shape);
}

/** Ground shots roll from the first hex; no flight. */
export function isGroundShot(id: ClubId, shape: ShotShape): boolean {
  return CLUBS[id].loft === 0 || shape === 'bumpRun';
}
