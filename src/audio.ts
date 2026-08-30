/** Tiny WebAudio synth — no assets. Context is created/resumed on the first
 *  user gesture (iOS Safari requirement). */

export class GameAudio {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** Call from a user-gesture handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number,
    durSec: number,
    opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {},
  ): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(freq + opts.slide, 30),
        t0 + durSec,
      );
    }
    g.gain.setValueAtTime(opts.gain ?? 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  }

  shot(power: number): void {
    this.tone(220 + power * 220, 0.12, { type: 'square', gain: 0.08, slide: -120 });
  }

  bounce(speed: number): void {
    if (speed < 3) return; // inaudibly soft contacts
    const s = Math.min(speed / 40, 1);
    this.tone(90 + s * 160, 0.08, { type: 'sine', gain: 0.05 + s * 0.1, slide: -40 });
  }

  sink(): void {
    // Little ascending arpeggio.
    this.tone(523, 0.12, { gain: 0.12 });
    this.tone(659, 0.12, { gain: 0.12, delay: 0.09 });
    this.tone(784, 0.2, { gain: 0.14, delay: 0.18 });
  }

  death(): void {
    this.tone(220, 0.35, { type: 'sawtooth', gain: 0.1, slide: -160 });
  }

  fanfare(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.25, { gain: 0.13, delay: i * 0.12 }));
  }
}
