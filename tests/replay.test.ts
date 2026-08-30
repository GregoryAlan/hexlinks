import { describe, expect, it } from 'vitest';
import { STAGE } from '../src/core/config';
import type { StageSpec } from '../src/core/types';
import { createStage } from '../src/stage/physicsStage';

/** Golden replay: scripted shots through the real physics stage, asserting
 *  trajectory checkpoints. This is the only automated guard for "an innocent
 *  refactor changed physics outcomes" (and the guard that the ink-links →
 *  hexlinks port didn't change physics) — regenerate the snapshot
 *  deliberately when physics changes are intentional. */

function testSpec(): StageSpec {
  const floorY = 1800;
  return {
    bounds: { width: STAGE.width, height: STAGE.height },
    ball: { x: 400, y: floorY - 120 },
    terrain: [
      {
        id: 'floor',
        kind: 'normal',
        verts: [
          { x: 100, y: floorY },
          { x: 2100, y: floorY },
          { x: 2100, y: floorY + 100 },
          { x: 100, y: floorY + 100 },
        ],
      },
      {
        id: 'sand-ledge',
        kind: 'sand',
        verts: [
          { x: 1400, y: floorY - 220 },
          { x: 1900, y: floorY - 220 },
          { x: 1900, y: floorY - 140 },
          { x: 1400, y: floorY - 140 },
        ],
      },
    ],
    targets: [{ id: 'dummy', pos: { x: 1150, y: floorY - 60 }, radius: 60 }],
  };
}

describe('golden replay', () => {
  it('scripted shots on the fixture stage reproduce exact positions', () => {
    const events: string[] = [];
    const stage = createStage(testSpec(), {
      onRest: () => events.push('rest'),
      onHit: (id) => events.push(`hit:${id}`),
      onSensor: (id) => events.push(`sensor:${id}`),
      onOutOfBounds: () => events.push('oob'),
    });

    // Settle the spawned ball onto the floor.
    for (let i = 0; i < 300; i++) stage.stepOnce();

    const checkpoints: Array<{ x: number; y: number; sleeping: boolean }> = [];
    const shots = [
      { x: -260, y: 180 }, // medium shot up-right, over the target onto the sand ledge
      { x: 150, y: 220 }, // pop up-left, back to the floor
      { x: -90, y: 60 }, // soft nudge right, into the dummy target
    ];
    for (const drag of shots) {
      stage.applyShot(drag);
      for (let i = 0; i < 700; i++) stage.stepOnce();
      const p = stage.ballPos();
      checkpoints.push({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        sleeping: stage.isBallSleeping(),
      });
    }

    expect({ checkpoints, events }).toMatchSnapshot();
    stage.destroy();
  });

  it('a ball shot off the side goes out of bounds', () => {
    const events: string[] = [];
    const stage = createStage(testSpec(), {
      onOutOfBounds: () => events.push('oob'),
    });
    for (let i = 0; i < 300; i++) stage.stepOnce();
    stage.applyShot({ x: 400, y: 120 }); // full power left
    for (let i = 0; i < 700 && events.length === 0; i++) stage.stepOnce();
    expect(events).toContain('oob');
    stage.destroy();
  });
});
