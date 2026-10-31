import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureCallbacks } from '../src/input/gestures';

/** Headless gesture recognition: tap vs pan vs pinch vs wheel. */

function harness() {
  const log: string[] = [];
  const cb: GestureCallbacks = {
    onTap: (p) => log.push(`tap ${p.x},${p.y}`),
    onPan: (d) => log.push(`pan ${d.x},${d.y}`),
    onPinch: (_c, f) => log.push(`pinch ${f.toFixed(2)}`),
    onWheel: (_p, f) => log.push(`wheel ${f > 1 ? 'in' : 'out'}`),
    onPanEnd: () => log.push('panEnd'),
  };
  return { g: new GestureRecognizer(cb), log };
}

describe('gestures', () => {
  it('short still press is a tap', () => {
    const { g, log } = harness();
    g.handle({ type: 'down', pos: { x: 10, y: 10 }, id: 1 }, 0);
    g.handle({ type: 'move', pos: { x: 12, y: 11 }, id: 1 }, 50);
    g.handle({ type: 'up', pos: { x: 12, y: 11 }, id: 1 }, 120);
    expect(log).toEqual(['tap 12,11']);
  });

  it('long press is not a tap', () => {
    const { g, log } = harness();
    g.handle({ type: 'down', pos: { x: 10, y: 10 }, id: 1 }, 0);
    g.handle({ type: 'up', pos: { x: 10, y: 10 }, id: 1 }, 900);
    expect(log).toEqual([]);
  });

  it('drag past the slop pans by incremental deltas and never taps', () => {
    const { g, log } = harness();
    g.handle({ type: 'down', pos: { x: 0, y: 0 }, id: 1 }, 0);
    g.handle({ type: 'move', pos: { x: 3, y: 0 }, id: 1 }, 10); // inside slop
    g.handle({ type: 'move', pos: { x: 20, y: 0 }, id: 1 }, 20);
    g.handle({ type: 'move', pos: { x: 30, y: 5 }, id: 1 }, 30);
    g.handle({ type: 'up', pos: { x: 30, y: 5 }, id: 1 }, 40);
    expect(log).toEqual(['pan 20,0', 'pan 10,5', 'panEnd']);
  });

  it('two fingers pinch about the centroid and never tap', () => {
    const { g, log } = harness();
    g.handle({ type: 'down', pos: { x: 100, y: 100 }, id: 1 }, 0);
    g.handle({ type: 'down', pos: { x: 200, y: 100 }, id: 2 }, 5);
    g.handle({ type: 'move', pos: { x: 250, y: 100 }, id: 2 }, 10); // spread 100→150
    g.handle({ type: 'up', pos: { x: 250, y: 100 }, id: 2 }, 100);
    g.handle({ type: 'up', pos: { x: 100, y: 100 }, id: 1 }, 110);
    expect(log).toContain('pinch 1.50');
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
    expect(log[log.length - 1]).toBe('panEnd');
  });

  it('wheel zooms; negative delta zooms in', () => {
    const { g, log } = harness();
    g.handle({ type: 'wheel', pos: { x: 0, y: 0 }, delta: -100 }, 0);
    g.handle({ type: 'wheel', pos: { x: 0, y: 0 }, delta: 100 }, 0);
    expect(log).toEqual(['wheel in', 'wheel out']);
  });

  it('cancel resets without a tap', () => {
    const { g, log } = harness();
    g.handle({ type: 'down', pos: { x: 0, y: 0 }, id: 1 }, 0);
    g.handle({ type: 'cancel', pos: { x: 0, y: 0 }, id: 1 }, 10);
    expect(log).toEqual([]);
    expect(g.pointerCount).toBe(0);
  });
});

describe('captured drag', () => {
  function capHarness(capture: (p: { x: number; y: number }) => boolean) {
    const log: string[] = [];
    const g = new GestureRecognizer({
      shouldCapture: capture,
      onDragStart: (p) => log.push(`dragStart ${p.x},${p.y}`),
      onDrag: (p) => log.push(`drag ${p.x},${p.y}`),
      onDragEnd: (p) => log.push(`dragEnd ${p.x},${p.y}`),
      onTap: (p) => log.push(`tap ${p.x},${p.y}`),
      onPan: (d) => log.push(`pan ${d.x},${d.y}`),
      onPanEnd: () => log.push('panEnd'),
    });
    return { g, log };
  }

  it('a down on a capturable spot drags and never pans or taps', () => {
    const { g, log } = capHarness((p) => p.x < 50);
    g.handle({ type: 'down', pos: { x: 10, y: 10 }, id: 1 }, 0);
    g.handle({ type: 'move', pos: { x: 40, y: 10 }, id: 1 }, 10);
    g.handle({ type: 'move', pos: { x: 90, y: 30 }, id: 1 }, 20);
    g.handle({ type: 'up', pos: { x: 90, y: 30 }, id: 1 }, 30);
    expect(log).toEqual(['dragStart 10,10', 'drag 40,10', 'drag 90,30', 'dragEnd 90,30']);
    expect(g.pointerCount).toBe(0);
  });

  it('elsewhere the usual tap and pan still apply', () => {
    const { g, log } = capHarness((p) => p.x < 50);
    g.handle({ type: 'down', pos: { x: 100, y: 10 }, id: 1 }, 0);
    g.handle({ type: 'up', pos: { x: 100, y: 10 }, id: 1 }, 50);
    g.handle({ type: 'down', pos: { x: 100, y: 10 }, id: 1 }, 100);
    g.handle({ type: 'move', pos: { x: 130, y: 10 }, id: 1 }, 110);
    g.handle({ type: 'up', pos: { x: 130, y: 10 }, id: 1 }, 120);
    expect(log).toEqual(['tap 100,10', 'pan 30,0', 'panEnd']);
  });

  it('extra fingers during a captured drag are ignored; cancel ends it', () => {
    const { g, log } = capHarness(() => true);
    g.handle({ type: 'down', pos: { x: 0, y: 0 }, id: 1 }, 0);
    g.handle({ type: 'down', pos: { x: 50, y: 50 }, id: 2 }, 5);
    g.handle({ type: 'move', pos: { x: 60, y: 60 }, id: 2 }, 10);
    g.handle({ type: 'cancel', pos: { x: 5, y: 5 }, id: 1 }, 20);
    expect(log).toEqual(['dragStart 0,0', 'dragEnd 5,5']);
  });
});
