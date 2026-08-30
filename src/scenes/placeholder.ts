import { COLORS } from '../core/config';
import type {
  Scene,
  SceneContext,
  SceneView,
} from './sceneManager';

/** Stand-in for scenes that don't exist yet — names what's coming and pops
 *  back. Every unbuilt SceneRequest kind routes here until its phase lands. */
export class PlaceholderScene implements Scene {
  readonly opaque = true;
  private ctx!: SceneContext;

  constructor(private label: string) {}

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    ctx.overlay.show(
      `<h1>${this.label}</h1>
       <p class="muted">Not built yet. The Groundskeeper appreciates your patience.</p>
       <button data-action="back">Back</button>`,
      (root) => {
        root
          .querySelector('[data-action="back"]')!
          .addEventListener('click', () => this.ctx.pop());
      },
    );
  }

  resume(): void {}

  step(_dtMs: number): void {}

  render(g: CanvasRenderingContext2D, view: SceneView, _alpha: number): void {
    g.fillStyle = COLORS.paper;
    g.fillRect(0, 0, view.width, view.height);
  }

  handlePointer(): void {}

  exit(): void {
    this.ctx.overlay.clear();
  }
}
