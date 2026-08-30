import { COLORS, GAME_NAME } from '../core/config';
import type {
  Scene,
  SceneContext,
  SceneResult,
  SceneView,
} from './sceneManager';

/** P0 stub — title card + "New Run" button. Becomes the Groundskeeper's shed
 *  (Tee Box / Gear Locker / Workbench) in P6. */
export class HomeBaseScene implements Scene {
  readonly opaque = true;
  private ctx!: SceneContext;

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.showMenu();
  }

  private showMenu(): void {
    this.ctx.overlay.show(
      `<h1>${GAME_NAME}</h1>
       <p class="muted">A golf course, gone politely to seed.</p>
       <button data-action="new-run">New Run</button>`,
      (root) => {
        root
          .querySelector('[data-action="new-run"]')!
          .addEventListener('click', () => {
            this.ctx.overlay.clear();
            // P1 replaces this with the real overworld request.
            this.ctx.push({ kind: 'overworld', hole: null, run: null });
          });
      },
    );
  }

  resume(_result?: SceneResult): void {
    this.showMenu();
  }

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
