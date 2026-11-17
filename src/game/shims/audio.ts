export type MusicMode = 'title' | 'hub' | 'combat' | 'boss' | 'summary' | 'stop';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.8;
let muted = false;
let mode: MusicMode | null = null;
let timer = 0;
let step = 0;

const PATTERNS: Record<Exclude<MusicMode, 'stop'>, { bpm: number; notes: number[] }> = {
  title: { bpm: 96, notes: [220, 0, 277, 0, 330, 277, 247, 220] },
  hub: { bpm: 110, notes: [196, 0, 247, 294, 0, 247, 220, 196] },
  combat: { bpm: 136, notes: [110, 110, 165, 110, 147, 110, 196, 220] },
  boss: { bpm: 156, notes: [98, 98, 147, 0, 98, 130, 196, 98] },
  summary: { bpm: 76, notes: [220, 0, 196, 0, 165, 0, 147, 0] },
};

function ensure(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}

function unlock(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') void ctx.resume();
}

function applyGain(): void {
  if (!master) return;
  master.gain.value = muted ? 0 : volume;
}

function tone(
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType,
  slide?: number,
): void {
  if (muted || freq <= 0) return;
  const context = ensure();
  if (!context) return;
  const now = context.currentTime;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide && slide > 0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  if (master) amp.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noise(duration: number, gain: number, hp = 700): void {
  if (muted) return;
  const context = ensure();
  if (!context) return;
  const samples = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, samples, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const amp = context.createGain();
  amp.gain.value = gain;
  source.connect(filter);
  filter.connect(amp);
  if (master) amp.connect(master);
  source.start();
}

export function setVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
  applyGain();
}

export function setMuted(value: boolean): void {
  muted = value;
  applyGain();
}

export function bootAudio(scene: Phaser.Scene): void {
  const kick = () => {
    unlock();
  };
  scene.input.on('pointerdown', kick);
  scene.input.keyboard?.on('keydown', kick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off('pointerdown', kick);
    scene.input.keyboard?.off('keydown', kick);
  });
}

export function sfx(name: string): void {
  switch (name) {
    case 'shoot':
      tone(760, 0.05, 0.06, 'square', 240);
      break;
    case 'shotgun':
      noise(0.12, 0.12, 400);
      tone(140, 0.1, 0.07, 'sawtooth', 50);
      break;
    case 'laser':
      tone(980, 0.07, 0.045, 'square', 640);
      break;
    case 'dash':
      tone(240, 0.1, 0.06, 'square', 880);
      break;
    case 'hurt':
      tone(180, 0.16, 0.09, 'sawtooth', 60);
      noise(0.08, 0.06, 200);
      break;
    case 'hit':
      tone(520, 0.04, 0.05, 'square', 180);
      break;
    case 'kill':
      tone(180, 0.09, 0.06, 'square', 70);
      break;
    case 'pickup':
      tone(523, 0.06, 0.05, 'square');
      tone(784, 0.08, 0.05, 'square');
      break;
    case 'heal':
      tone(392, 0.06, 0.05, 'triangle');
      tone(523, 0.08, 0.05, 'triangle');
      tone(659, 0.1, 0.04, 'triangle');
      break;
    case 'explode':
      noise(0.18, 0.1, 180);
      tone(90, 0.18, 0.08, 'sawtooth', 40);
      break;
    case 'ui':
      tone(660, 0.04, 0.04, 'square');
      break;
    case 'deny':
      tone(140, 0.08, 0.05, 'square');
      break;
    case 'door':
      tone(300, 0.06, 0.04, 'square', 520);
      break;
    case 'portal':
      tone(440, 0.12, 0.05, 'triangle', 880);
      break;
    case 'clear':
      tone(523, 0.08, 0.05, 'square');
      tone(784, 0.12, 0.05, 'square');
      break;
    case 'heartbeat':
      tone(70, 0.08, 0.04, 'sine');
      break;
    case 'zip':
      tone(360, 0.05, 0.03, 'square', 160);
      break;
    default:
      tone(440, 0.04, 0.03, 'square');
  }
}

export function music(next: MusicMode): void {
  if (next === mode) return;
  mode = next;
  window.clearInterval(timer);
  step = 0;
  if (next === 'stop') return;
  const pattern = PATTERNS[next];
  const ms = 60000 / pattern.bpm / 2;
  timer = window.setInterval(() => {
    if (muted || mode !== next) return;
    const note = pattern.notes[step % pattern.notes.length] ?? 0;
    step += 1;
    if (note > 0) tone(note, 0.11, next === 'boss' ? 0.045 : 0.03, 'square');
    if (step % 2 === 0) noise(0.02, 0.015, 1800);
  }, ms);
}
