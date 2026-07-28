type GunSoundId = 'sprout-rifle' | 'bubble-shotgun' | 'star-smg' | 'sniper-rifle' | 'rocket-launcher';

type GunSound = {
  noiseDuration: number;
  noiseVolume: number;
  noiseFilter: number;
  thumpStart: number;
  thumpEnd: number;
  thumpDuration: number;
  thumpVolume: number;
  crackStart: number;
  crackEnd: number;
  crackDuration: number;
  crackVolume: number;
  tailDelay: number;
  tailFrequency: number;
  tailDuration: number;
  tailVolume: number;
};

const GUN_SOUNDS: Record<GunSoundId, GunSound> = {
  'sprout-rifle': {
    noiseDuration: 0.09,
    noiseVolume: 0.07,
    noiseFilter: 2400,
    thumpStart: 150,
    thumpEnd: 72,
    thumpDuration: 0.1,
    thumpVolume: 0.055,
    crackStart: 780,
    crackEnd: 210,
    crackDuration: 0.07,
    crackVolume: 0.04,
    tailDelay: 0.035,
    tailFrequency: 420,
    tailDuration: 0.07,
    tailVolume: 0.018,
  },
  'bubble-shotgun': {
    noiseDuration: 0.18,
    noiseVolume: 0.13,
    noiseFilter: 1200,
    thumpStart: 115,
    thumpEnd: 46,
    thumpDuration: 0.2,
    thumpVolume: 0.11,
    crackStart: 520,
    crackEnd: 120,
    crackDuration: 0.12,
    crackVolume: 0.065,
    tailDelay: 0.06,
    tailFrequency: 190,
    tailDuration: 0.16,
    tailVolume: 0.028,
  },
  'star-smg': {
    noiseDuration: 0.055,
    noiseVolume: 0.05,
    noiseFilter: 3200,
    thumpStart: 175,
    thumpEnd: 88,
    thumpDuration: 0.065,
    thumpVolume: 0.04,
    crackStart: 940,
    crackEnd: 310,
    crackDuration: 0.045,
    crackVolume: 0.032,
    tailDelay: 0.022,
    tailFrequency: 520,
    tailDuration: 0.045,
    tailVolume: 0.012,
  },
  'sniper-rifle': {
    noiseDuration: 0.24,
    noiseVolume: 0.16,
    noiseFilter: 1800,
    thumpStart: 88,
    thumpEnd: 34,
    thumpDuration: 0.26,
    thumpVolume: 0.16,
    crackStart: 1220,
    crackEnd: 180,
    crackDuration: 0.13,
    crackVolume: 0.105,
    tailDelay: 0.08,
    tailFrequency: 132,
    tailDuration: 0.34,
    tailVolume: 0.055,
  },
  'rocket-launcher': {
    noiseDuration: 0.28,
    noiseVolume: 0.17,
    noiseFilter: 720,
    thumpStart: 72,
    thumpEnd: 28,
    thumpDuration: 0.3,
    thumpVolume: 0.17,
    crackStart: 360,
    crackEnd: 82,
    crackDuration: 0.18,
    crackVolume: 0.085,
    tailDelay: 0.07,
    tailFrequency: 96,
    tailDuration: 0.38,
    tailVolume: 0.06,
  },
};

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

  shoot(weapon: GunSoundId): void {
    const sound = GUN_SOUNDS[weapon];
    this.gunshot(sound);
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

  private gunshot(sound: GunSound): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    this.playNoiseBurst(sound, now);
    this.playTone(sound.thumpStart, sound.thumpEnd, sound.thumpDuration, 'sine', sound.thumpVolume, now);
    this.playTone(sound.crackStart, sound.crackEnd, sound.crackDuration, 'square', sound.crackVolume, now);
    this.playTone(sound.tailFrequency, Math.max(24, sound.tailFrequency * 0.55), sound.tailDuration, 'sawtooth', sound.tailVolume, now + sound.tailDelay);
  }

  private playNoiseBurst(sound: GunSound, startTime: number): void {
    if (!this.context) return;
    const bufferSize = Math.max(1, Math.floor(this.context.sampleRate * sound.noiseDuration));
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const fade = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * fade * fade;
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(sound.noiseFilter, startTime);
    filter.Q.setValueAtTime(1.8, startTime);
    gain.gain.setValueAtTime(sound.noiseVolume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + sound.noiseDuration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start(startTime);
    source.stop(startTime + sound.noiseDuration + 0.02);
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
  ): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startTime + duration * 0.75);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
