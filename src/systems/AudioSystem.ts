export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.unlocked = true;
  }

  pickup(index: number): void {
    this.blip(320 + index * 18, 740 + index * 12, 0.16, 'triangle', 0.08);
  }

  shoot(): void {
    this.blip(520, 260, 0.08, 'square', 0.035);
  }

  hit(): void {
    this.blip(180, 92, 0.18, 'sawtooth', 0.07);
  }

  private blip(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration * 0.7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
