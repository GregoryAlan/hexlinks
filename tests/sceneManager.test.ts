import { describe, expect, it } from 'vitest';
import {
  SceneManager,
  type OverlayHost,
  type Scene,
  type SceneContext,
  type SceneRequest,
  type SceneResult,
  type SceneView,
} from '../src/scenes/sceneManager';

/** Headless scene-flow tests with a stub context — no DOM, no canvas. */

const stubOverlay: OverlayHost = { show() {}, clear() {} };
const view: SceneView = { width: 100, height: 100 };

class SpyScene implements Scene {
  log: string[] = [];
  ctx!: SceneContext;
  constructor(
    public name: string,
    public opaque = true,
    private shared?: string[],
  ) {}
  private note(s: string) {
    this.log.push(s);
    this.shared?.push(`${this.name}:${s}`);
  }
  enter(ctx: SceneContext) {
    this.ctx = ctx;
    this.note('enter');
  }
  resume(result?: SceneResult) {
    this.note(`resume:${result ? result.kind : 'none'}`);
  }
  step(dtMs: number) {
    this.note(`step:${dtMs}`);
  }
  render(_g: CanvasRenderingContext2D, _v: SceneView, _a: number) {
    this.note('render');
  }
  handlePointer() {
    this.note('pointer');
  }
  exit() {
    this.note('exit');
  }
}

function makeManager(scenes: Map<string, SpyScene>, shared?: string[]) {
  const factory = (req: SceneRequest): Scene => {
    const s = scenes.get(req.kind) ?? new SpyScene(req.kind, true, shared);
    scenes.set(req.kind, s);
    return s;
  };
  return new SceneManager(factory, stubOverlay);
}

// render() takes a CanvasRenderingContext2D but SpyScene never touches it.
const g = {} as CanvasRenderingContext2D;

describe('SceneManager', () => {
  it('defers push to the tick boundary and steps only the top scene', () => {
    const scenes = new Map<string, SpyScene>();
    const mgr = makeManager(scenes);
    mgr.push({ kind: 'homeBase' });
    expect(mgr.depth).toBe(0); // not applied yet
    mgr.step(16);
    expect(mgr.depth).toBe(1);
    const home = scenes.get('homeBase')!;
    expect(home.log).toEqual(['enter', 'step:16']);

    home.ctx.push({ kind: 'dialogue', script: null });
    mgr.step(16);
    expect(mgr.depth).toBe(2);
    // The push applied at the boundary, so dialogue (not homeBase) got the step.
    expect(home.log).toEqual(['enter', 'step:16']);
    expect(scenes.get('dialogue')!.log).toEqual(['enter', 'step:16']);
  });

  it('pop returns the result to the newly exposed scene via resume', () => {
    const scenes = new Map<string, SpyScene>();
    const mgr = makeManager(scenes);
    mgr.push({ kind: 'homeBase' });
    mgr.step(16);
    const home = scenes.get('homeBase')!;
    home.ctx.push({ kind: 'minigame', game: 'bunkerBlast', spec: null });
    mgr.step(16);
    const mini = scenes.get('minigame')!;

    mini.ctx.pop({ kind: 'minigame', outcome: 'PERFECT' });
    mgr.step(16);
    expect(mgr.depth).toBe(1);
    expect(mini.log).toContain('exit');
    expect(home.log).toContain('resume:minigame');
  });

  it('a plain back-out pop still resumes the scene beneath', () => {
    const scenes = new Map<string, SpyScene>();
    const mgr = makeManager(scenes);
    mgr.push({ kind: 'homeBase' });
    mgr.step(16);
    const home = scenes.get('homeBase')!;
    home.ctx.push({ kind: 'overworld', hole: null, run: null });
    mgr.step(16);
    scenes.get('overworld')!.ctx.pop();
    mgr.step(16);
    expect(home.log).toContain('resume:none');
  });

  it('requests made during enter() land in the same boundary', () => {
    const order: string[] = [];
    const scenes = new Map<string, SpyScene>();
    // homeBase pushes a dialogue from inside enter().
    class PushyScene extends SpyScene {
      enter(ctx: SceneContext) {
        super.enter(ctx);
        ctx.push({ kind: 'dialogue', script: null });
      }
    }
    scenes.set('homeBase', new PushyScene('homeBase', true, order));
    const mgr = makeManager(scenes, order);
    mgr.push({ kind: 'homeBase' });
    mgr.step(16);
    expect(mgr.depth).toBe(2);
    // dialogue entered within the same tick, then only it was stepped.
    expect(order).toEqual(['homeBase:enter', 'dialogue:enter', 'dialogue:step:16']);
  });

  it('renders bottom-up, skipping scenes under the topmost opaque scene', () => {
    const order: string[] = [];
    const scenes = new Map<string, SpyScene>([
      ['homeBase', new SpyScene('homeBase', true, order)],
      ['overworld', new SpyScene('overworld', true, order)],
      ['dialogue', new SpyScene('dialogue', false, order)],
    ]);
    const mgr = makeManager(scenes, order);
    mgr.push({ kind: 'homeBase' });
    mgr.push({ kind: 'overworld', hole: null, run: null });
    mgr.push({ kind: 'dialogue', script: null });
    mgr.step(16);
    order.length = 0;
    mgr.render(g, view, 1);
    // homeBase is hidden under the opaque overworld; dialogue overlays it.
    expect(order).toEqual(['overworld:render', 'dialogue:render']);
  });

  it('routes pointer events to the top scene only', () => {
    const order: string[] = [];
    const scenes = new Map<string, SpyScene>([
      ['homeBase', new SpyScene('homeBase', true, order)],
      ['dialogue', new SpyScene('dialogue', false, order)],
    ]);
    const mgr = makeManager(scenes, order);
    mgr.push({ kind: 'homeBase' });
    mgr.push({ kind: 'dialogue', script: null });
    mgr.step(16);
    order.length = 0;
    mgr.handlePointer({ type: 'down', pos: { x: 1, y: 1 } });
    expect(order).toEqual(['dialogue:pointer']);
  });

  it('destroy exits every scene', () => {
    const scenes = new Map<string, SpyScene>();
    const mgr = makeManager(scenes);
    mgr.push({ kind: 'homeBase' });
    mgr.push({ kind: 'overworld', hole: null, run: null });
    mgr.step(16);
    mgr.destroy();
    expect(mgr.depth).toBe(0);
    expect(scenes.get('homeBase')!.log).toContain('exit');
    expect(scenes.get('overworld')!.log).toContain('exit');
  });
});
