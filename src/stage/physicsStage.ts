import Matter from 'matter-js';
import decomp from 'poly-decomp';
import { BALL, PHYSICS, SHOT, SURFACES, type SurfaceKind } from '../core/config';
import type { StageSpec, TerrainSpec, Vec2 } from '../core/types';

const { Bodies, Body, Common, Composite, Engine, Sleeping, Vertices } = Matter;

// Register the concave-polygon decomposer once (needed by Bodies.fromVertices).
Common.setDecomp(decomp);

/** Physics only *produces actions*; game math (damage, placement) lives in
 *  pure reducers (rules/). Consumers quantize anything that enters run state. */
export interface StageEvents {
  onRest?: () => void;
  /** Ball struck a target; impulse is the ball's speed at impact. */
  onHit?: (targetId: string, impulse: number) => void;
  /** Ball came to near-rest inside a sensor region (cup, hazard pocket). */
  onSensor?: (sensorId: string) => void;
  /** Ball escaped the sides or fell below the stage. */
  onOutOfBounds?: () => void;
  onBounce?: (speed: number, surface: SurfaceKind) => void;
}

export interface Stage {
  /** Advance simulation by a wall-clock frame; runs 0..n fixed 16ms steps. */
  frame(frameMs: number): void;
  /** Advance exactly one fixed step (headless tests / solvers). */
  stepOnce(): void;
  /** Apply a slingshot shot. `drag` is the vector from press point to the
   *  current pointer, in logical px (shot fires opposite the drag). */
  applyShot(drag: Vec2): void;
  /** Compute the aim vector (direction + power-scaled length) for a drag,
   *  without shooting — used for the preview arrow. */
  aimVector(drag: Vec2): { dir: Vec2; power: number };
  resetBall(pos: Vec2): void;
  ballPos(): Vec2;
  ballVelocity(): Vec2;
  isBallSleeping(): boolean;
  destroy(): void;
}

/** matter-js 0.20's Body.setStatic force-overwrites static bodies to
 *  friction 1 / restitution 0, silently discarding the material passed in
 *  options. Re-apply the surface values to the body and all its parts so
 *  SURFACES actually takes effect (pairs read them off the parent). */
function applySurface(body: Matter.Body, surface: { restitution: number; friction: number }): void {
  for (const part of body.parts) {
    part.friction = surface.friction;
    part.restitution = surface.restitution;
  }
}

function terrainToBody(spec: TerrainSpec): Matter.Body {
  const surface = SURFACES[spec.kind];
  const opts: Matter.IBodyDefinition = {
    isStatic: true,
    restitution: surface.restitution,
    friction: surface.friction,
    label: spec.kind,
  };
  const body = Bodies.fromVertices(0, 0, [spec.verts as Matter.Vector[]], opts);
  applySurface(body, surface);
  // fromVertices re-centers vertices around the center of mass; translate so
  // the body's bounds line up with the source polygon's bounds.
  const src = Vertices.create(spec.verts as Matter.Vector[], body);
  const sb = boundsOf(src.map((v) => ({ x: v.x, y: v.y })));
  Body.setPosition(body, {
    x: body.position.x + (sb.minX - body.bounds.min.x),
    y: body.position.y + (sb.minY - body.bounds.min.y),
  });
  return body;
}

/** Winding-agnostic point-in-polygon (ray cast) — Matter's Vertices.contains
 *  silently fails on counter-clockwise polygons. */
export function pointInPolygon(p: Vec2, verts: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i];
    const b = verts[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function boundsOf(verts: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}

export function createStage(spec: StageSpec, events: StageEvents = {}): Stage {
  const engine = Engine.create();
  const world = engine.world;
  const { width, height } = spec.bounds;
  if (spec.gravity !== undefined) engine.gravity.y = spec.gravity;

  // Only a ceiling — the sides and bottom are open. Leaving the sides or
  // falling below the stage is out of bounds. (Side walls also caused the
  // ball to friction-glue to them and creep down for a minute in ink-links,
  // which felt broken.)
  const wallOpts: Matter.IChamferableBodyDefinition = {
    isStatic: true,
    restitution: SURFACES.wall.restitution,
    friction: SURFACES.wall.friction,
    label: 'wall',
  };
  const wallThickness = 200;
  const ceiling = Bodies.rectangle(width / 2, -wallThickness / 2, width * 2, wallThickness, wallOpts);
  applySurface(ceiling, SURFACES.wall);
  Composite.add(world, ceiling);

  const groundBodies: Matter.Body[] = [];
  for (const t of spec.terrain) {
    const body = terrainToBody(t);
    groundBodies.push(body);
    Composite.add(world, body);
  }

  const targetsById = new Map<Matter.Body, string>();
  for (const t of spec.targets ?? []) {
    const body = Bodies.circle(t.pos.x, t.pos.y, t.radius, {
      isStatic: true,
      restitution: SURFACES.normal.restitution,
      friction: SURFACES.normal.friction,
      label: `target:${t.id}`,
    });
    applySurface(body, SURFACES.normal);
    targetsById.set(body, t.id);
    Composite.add(world, body);
  }

  const ball = Bodies.circle(spec.ball.x, spec.ball.y, BALL.radius, {
    restitution: BALL.restitution,
    friction: BALL.friction,
    density: BALL.density,
    label: 'ball',
  });
  Body.setInertia(ball, Infinity); // no spin — ref
  Body.setMass(ball, BALL.mass); // ref magic constant
  Composite.add(world, ball);

  const outY = height - height / 30; // ref: ink-links spike-zone line

  // Live = moving (or about to): rest detection is armed. Starts true so a
  // spawned ball falls onto its platform and then settles/sleeps.
  let ballLive = true;
  // A vertical shot has ~zero velocity at its apex for a step — requiring N
  // consecutive slow steps stops the ball from "resting" in mid-air.
  let slowSteps = 0;
  let accumulator = 0;

  Matter.Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const other =
        pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
      if (!other) continue;
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      const targetId = targetsById.get(other);
      if (targetId !== undefined) {
        events.onHit?.(targetId, speed);
      } else {
        events.onBounce?.(speed, (other.label as SurfaceKind) ?? 'normal');
      }
    }
  });

  /** Is there terrain under the ball? (AABB check against a thin box just
   *  below the ball's underside.) */
  function isSupported(): boolean {
    const r = BALL.radius;
    const region = {
      min: { x: ball.position.x - r * 0.7, y: ball.position.y + r - 4 },
      max: { x: ball.position.x + r * 0.7, y: ball.position.y + r + 8 },
    };
    return Matter.Query.region(groundBodies, region as Matter.Bounds).length > 0;
  }

  function afterStep(): void {
    const { x, y } = ball.position;
    const vx2 = ball.velocity.x ** 2;
    const vy2 = ball.velocity.y ** 2;

    // Sensor (generalized ink-links cup sink): near-stopped inside the
    // region, below the lip when the sensor has one.
    if (vx2 < PHYSICS.sensorV2 && vy2 < PHYSICS.sensorV2) {
      for (const s of spec.sensors ?? []) {
        if ((s.topY === undefined || y >= s.topY) && pointInPolygon(ball.position, s.verts)) {
          events.onSensor?.(s.id);
          return;
        }
      }
    }

    // Out of bounds: fell below the stage or escaped the sides.
    if (y > outY || x < 0 || x > width) {
      events.onOutOfBounds?.();
      return;
    }

    // Rest: refills shots (handled by the owning scene) and sleeps the ball
    // so it can't micro-drift down slopes (ref trick). Needs several
    // consecutive slow steps (a shot's apex is slow for ~1 step) AND ground
    // support beneath (a ball crushed against a wall reads ~zero velocity
    // but must fall).
    if (
      ballLive &&
      vx2 < PHYSICS.restVx2 &&
      vy2 < PHYSICS.restVy2 &&
      isSupported()
    ) {
      slowSteps += 1;
      if (slowSteps >= PHYSICS.restSteps) {
        ballLive = false;
        slowSteps = 0;
        Sleeping.set(ball, true);
        events.onRest?.();
      }
    } else {
      slowSteps = 0;
    }
  }

  return {
    frame(frameMs) {
      accumulator += Math.min(frameMs, PHYSICS.maxFrameMs);
      while (accumulator >= PHYSICS.stepMs) {
        Engine.update(engine, PHYSICS.stepMs);
        accumulator -= PHYSICS.stepMs;
        afterStep();
      }
    },
    stepOnce() {
      Engine.update(engine, PHYSICS.stepMs);
      afterStep();
    },
    aimVector(drag) {
      const dist = Math.hypot(drag.x, drag.y);
      if (dist < 1e-6) return { dir: { x: 0, y: 0 }, power: 0 };
      const clamped = Math.min(Math.max(dist, SHOT.minDragPx), SHOT.maxDragPx);
      const power = clamped / SHOT.maxDragPx;
      // Fire opposite the drag (slingshot).
      return { dir: { x: -drag.x / dist, y: -drag.y / dist }, power };
    },
    applyShot(drag) {
      const { dir, power } = this.aimVector(drag);
      if (power === 0) return;
      Sleeping.set(ball, false);
      ballLive = true;
      Body.applyForce(ball, ball.position, {
        x: dir.x * SHOT.forceScale * power,
        y: dir.y * SHOT.forceScale * power,
      });
    },
    resetBall(pos) {
      Body.setPosition(ball, { x: pos.x, y: pos.y });
      Body.setVelocity(ball, { x: 0, y: 0 });
      Sleeping.set(ball, false);
      ballLive = true; // fall to the platform, then rest & sleep
    },
    ballPos: () => ({ x: ball.position.x, y: ball.position.y }),
    ballVelocity: () => ({ x: ball.velocity.x, y: ball.velocity.y }),
    isBallSleeping: () => ball.isSleeping,
    destroy() {
      Matter.Events.off(engine, 'collisionStart');
      Engine.clear(engine);
    },
  };
}
