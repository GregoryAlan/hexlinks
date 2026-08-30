import type { Vec2 } from '../core/types';

/** Visual-only effects. Randomness here uses a local xorshift, NOT the seeded
 *  game RNG (course identity must never depend on vfx) and NOT Math.random
 *  (banned project-wide to make that separation auditable). */

let vfxState = 0x9e3779b9;
function vfxRand(): number {
  // xorshift32
  vfxState ^= vfxState << 13;
  vfxState ^= vfxState >>> 17;
  vfxState ^= vfxState << 5;
  return ((vfxState >>> 0) % 100000) / 100000;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number; // seconds remaining
  maxLife: number;
  size: number;
  color: string;
}

export function burst(
  particles: Particle[],
  at: Vec2,
  colors: string[],
  count = 24,
  speed = 14,
): void {
  for (let i = 0; i < count; i++) {
    const ang = vfxRand() * Math.PI * 2;
    const v = (0.3 + vfxRand() * 0.7) * speed;
    particles.push({
      pos: { x: at.x, y: at.y },
      vel: { x: Math.cos(ang) * v, y: Math.sin(ang) * v - speed * 0.5 },
      life: 0.6 + vfxRand() * 0.5,
      maxLife: 1.1,
      size: 6 + vfxRand() * 10,
      color: colors[Math.floor(vfxRand() * colors.length)],
    });
  }
}

export function updateParticles(particles: Particle[], dtSec: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dtSec;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;
    p.vel.y += 0.5;
    p.vel.x *= 0.98;
    p.vel.y *= 0.98;
  }
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export interface Shake {
  mag: number;
  offset: Vec2;
}

export function kickShake(shake: Shake, magnitude: number): void {
  shake.mag = Math.max(shake.mag, magnitude);
}

export function updateShake(shake: Shake, dtSec: number): void {
  if (shake.mag <= 0.1) {
    shake.mag = 0;
    shake.offset.x = 0;
    shake.offset.y = 0;
    return;
  }
  shake.offset.x = (vfxRand() * 2 - 1) * shake.mag;
  shake.offset.y = (vfxRand() * 2 - 1) * shake.mag;
  shake.mag *= Math.max(0, 1 - dtSec * 8);
}
