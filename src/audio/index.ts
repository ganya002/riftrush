import type Phaser from 'phaser';

export type SfxName = 'shoot' | 'hit' | 'dash' | 'pickup' | 'hurt' | 'explode' | 'ui' | 'boss';
export type MusicMode = 'title' | 'hub' | 'combat' | 'boss';

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  noise: AudioBuffer;
}

interface StepNote {
  bass: number | null;
  arp: number | null;
  kick: boolean;
  snare: boolean;
  hat: boolean;
}

interface Pattern {
  bpm: number;
  bassWave: OscillatorType;
  arpWave: OscillatorType;
  bassGain: number;
  arpGain: number;
  bassSteps: number;
  arpSteps: number;
  notes: StepNote[];
}

let graph: Graph | null = null;
let volume = 0.8;
let muted = false;
let mode: MusicMode | null = null;
let token = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const hooked = new WeakSet<object>();

function audioCtor(): (new () => AudioContext) | null {
  const host = globalThis as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return host.AudioContext ?? host.webkitAudioContext ?? null;
}

function applyMaster(): void {
  if (!graph) return;
  graph.master.gain.setValueAtTime(muted ? 0 : volume, graph.ctx.currentTime);
}

function ensureGraph(): Graph | null {
  if (graph) return graph;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.gain.value = 0.9;
    music.gain.value = 0.45;
    master.connect(outputNode(ctx));
    sfx.connect(master);
    music.connect(master);
    const samples = Math.floor(ctx.sampleRate * 0.4);
    const noise = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    graph = { ctx, master, sfx, music, noise };
    applyMaster();
    return graph;
  } catch {
    return null;
  }
}

/** Optional compressor so stacked voices don't clip. Falls back to destination. */
function outputNode(ctx: AudioContext): AudioNode {
  if (typeof ctx.createDynamicsCompressor !== 'function') return ctx.destination;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  comp.connect(ctx.destination);
  return comp;
}

/**
 * Install a one-shot pointer listener that resumes the AudioContext.
 * A second call on the same scene does nothing.
 */
export function bootAudio(scene: Phaser.Scene): void {
  ensureGraph();
  if (!scene.input || hooked.has(scene)) return;
  hooked.add(scene);
  scene.input.once('pointerdown', () => {
    const g = ensureGraph();
    if (g && g.ctx.state === 'suspended') void g.ctx.resume();
  });
}

export function setVolume(n: number): void {
  volume = Math.min(1, Math.max(0, n));
  applyMaster();
}

export function setMuted(b: boolean): void {
  muted = b;
  applyMaster();
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function tone(
  when: number,
  freq: number,
  freqEnd: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  bus: GainNode,
): void {
  const g = graph;
  if (!g || gain <= 0 || dur <= 0) return;
  const osc = g.ctx.createOscillator();
  const amp = g.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), when);
  if (Math.abs(freqEnd - freq) > 1) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), when + dur);
  }
  const attack = Math.min(0.012, dur * 0.25);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(bus);
  osc.start(when);
  osc.stop(when + dur + 0.03);
}

function burst(when: number, dur: number, gain: number, bus: GainNode, highpass = 0): void {
  const g = graph;
  if (!g || gain <= 0) return;
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(gain, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  let node: AudioNode = src;
  if (highpass > 0 && typeof g.ctx.createBiquadFilter === 'function') {
    const filter = g.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(highpass, when);
    src.connect(filter);
    node = filter;
  }
  node.connect(amp);
  amp.connect(bus);
  src.start(when);
  src.stop(when + dur + 0.02);
}

function playSfx(name: SfxName): void {
  const g = ensureGraph();
  if (!g) return;
  const t = g.ctx.currentTime;
  const bus = g.sfx;
  switch (name) {
    case 'shoot':
      tone(t, 780, 210, 0.07, 'square', 0.16, bus);
      burst(t, 0.025, 0.05, bus, 1200);
      break;
    case 'hit':
      tone(t, 240, 70, 0.08, 'square', 0.26, bus);
      burst(t, 0.05, 0.12, bus);
      break;
    case 'dash':
      burst(t, 0.14, 0.16, bus, 500);
      tone(t, 280, 980, 0.12, 'sine', 0.07, bus);
      break;
    case 'pickup':
      tone(t, 880, 880, 0.06, 'square', 0.12, bus);
      tone(t + 0.055, 1320, 1320, 0.09, 'square', 0.12, bus);
      break;
    case 'hurt':
      tone(t, 430, 90, 0.2, 'sawtooth', 0.18, bus);
      tone(t, 190, 55, 0.2, 'square', 0.1, bus);
      break;
    case 'explode':
      burst(t, 0.32, 0.28, bus);
      tone(t, 130, 32, 0.36, 'sine', 0.32, bus);
      break;
    case 'ui':
      tone(t, 1560, 1560, 0.035, 'square', 0.1, bus);
      break;
    case 'boss':
      tone(t, 98, 46, 0.42, 'sawtooth', 0.22, bus);
      tone(t + 0.02, 155, 73, 0.36, 'square', 0.12, bus);
      burst(t, 0.18, 0.16, bus);
      break;
    default:
      break;
  }
}

export function sfx(name: SfxName): void {
  playSfx(name);
}

function emptyNotes(steps: number): StepNote[] {
  return Array.from({ length: steps }, () => ({
    bass: null,
    arp: null,
    kick: false,
    snare: false,
    hat: false,
  }));
}

/** Slow A-minor sine hymn. Whole-note bass, pentatonic eighths, no drums. */
function titlePattern(): Pattern {
  const notes = emptyNotes(64);
  const roots = [33, 29, 31, 28];
  const pent = [57, 60, 64, 67, 72, 67, 64, 60];
  for (let bar = 0; bar < 4; bar++) {
    notes[bar * 16].bass = roots[bar];
    notes[bar * 16 + 12].bass = roots[bar] + 12;
    for (let i = 0; i < 8; i++) notes[bar * 16 + i * 2].arp = pent[(i + bar * 2) % pent.length];
  }
  return {
    bpm: 72,
    bassWave: 'sine',
    arpWave: 'triangle',
    bassGain: 0.2,
    arpGain: 0.07,
    bassSteps: 10,
    arpSteps: 1.7,
    notes,
  };
}

/** Mid-tempo C-major bounce. Short triangle bass, offbeat square arp, light hats. */
function hubPattern(): Pattern {
  const notes = emptyNotes(64);
  const bars = [
    [36, 43, 40, 43],
    [41, 36, 43, 38],
    [43, 38, 36, 41],
    [36, 40, 43, 36],
  ];
  const arp = [64, 67, 72, 76, 74, 72, 67, 64];
  for (let bar = 0; bar < 4; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      const step = bar * 16 + beat * 4;
      notes[step].bass = bars[bar][beat];
      notes[step + 2].bass = bars[bar][beat] + (beat % 2 === 0 ? 12 : 0);
      notes[step + 2].arp = arp[(bar + beat) % arp.length];
      notes[step].hat = true;
      notes[step + 2].hat = true;
    }
  }
  return {
    bpm: 102,
    bassWave: 'triangle',
    arpWave: 'square',
    bassGain: 0.12,
    arpGain: 0.05,
    bassSteps: 1.4,
    arpSteps: 1,
    notes,
  };
}

/** Fast D-minor ostinato. Square bass on eighths, sixteenth arp, full kit. */
function combatPattern(): Pattern {
  const notes = emptyNotes(32);
  const bass = [38, 38, 33, 36, 38, 41, 36, 33];
  const arp = [62, 65, 69, 72, 69, 65, 67, 65];
  for (let i = 0; i < 32; i++) {
    if (i % 2 === 0) notes[i].bass = bass[(i / 2) % bass.length];
    notes[i].arp = arp[i % arp.length];
    notes[i].hat = i % 2 === 1;
    if (i % 8 === 0) notes[i].kick = true;
    if (i % 8 === 4) notes[i].snare = true;
  }
  return {
    bpm: 148,
    bassWave: 'square',
    arpWave: 'square',
    bassGain: 0.1,
    arpGain: 0.045,
    bassSteps: 1.1,
    arpSteps: 0.7,
    notes,
  };
}

/**
 * Slow E phrygian saw bass with chromatic steps.
 * Arp is a sparse tritone stab, not a running line. Kick on the downbeat only.
 */
function bossPattern(): Pattern {
  const notes = emptyNotes(32);
  const bass = [28, 27, 26, 25];
  const stabs = [64, 70, 67, 70];
  for (let bar = 0; bar < 2; bar++) {
    for (let i = 0; i < 4; i++) {
      notes[bar * 16 + i * 4].bass = bass[i] - bar;
    }
    notes[bar * 16 + 6].bass = 40;
    notes[bar * 16 + 2].arp = stabs[0];
    notes[bar * 16 + 6].arp = stabs[1];
    notes[bar * 16 + 11].arp = stabs[2];
    notes[bar * 16 + 14].arp = stabs[3];
    notes[bar * 16].kick = true;
    notes[bar * 16 + 10].snare = true;
    notes[bar * 16 + 10].hat = true;
  }
  return {
    bpm: 86,
    bassWave: 'sawtooth',
    arpWave: 'square',
    bassGain: 0.16,
    arpGain: 0.06,
    bassSteps: 3.2,
    arpSteps: 1.3,
    notes,
  };
}

const PATTERNS: Record<MusicMode, () => Pattern> = {
  title: titlePattern,
  hub: hubPattern,
  combat: combatPattern,
  boss: bossPattern,
};

function scheduleStep(pattern: Pattern, note: StepNote, when: number, stepDur: number): void {
  const g = graph;
  if (!g) return;
  if (note.bass !== null) {
    const slide = pattern.bassWave === 'sawtooth' ? midi(note.bass - 1) : midi(note.bass);
    tone(
      when,
      midi(note.bass),
      slide,
      stepDur * pattern.bassSteps,
      pattern.bassWave,
      pattern.bassGain,
      g.music,
    );
  }
  if (note.arp !== null) {
    tone(
      when,
      midi(note.arp),
      midi(note.arp),
      stepDur * pattern.arpSteps,
      pattern.arpWave,
      pattern.arpGain,
      g.music,
    );
  }
  if (note.kick) {
    tone(when, 150, 42, 0.12, 'sine', 0.22, g.music);
    burst(when, 0.03, 0.08, g.music);
  }
  if (note.snare) {
    burst(when, 0.1, 0.12, g.music);
    tone(when, 190, 140, 0.08, 'triangle', 0.05, g.music);
  }
  if (note.hat) burst(when, 0.03, 0.035, g.music, 4000);
}

function runLoop(current: MusicMode, id: number): void {
  const g = ensureGraph();
  if (!g || id !== token) return;
  const pattern = PATTERNS[current]();
  const stepDur = 60 / pattern.bpm / 4;
  let next = g.ctx.currentTime + 0.06;
  let step = 0;
  const tick = () => {
    if (id !== token) return;
    const live = ensureGraph();
    if (!live) return;
    if (next < live.ctx.currentTime) next = live.ctx.currentTime + 0.05;
    while (next < live.ctx.currentTime + 0.5) {
      scheduleStep(pattern, pattern.notes[step % pattern.notes.length], next, stepDur);
      step += 1;
      next += stepDur;
    }
    const handle = setTimeout(tick, 40);
    timer = handle;
    (handle as unknown as { unref?: () => void }).unref?.();
  };
  tick();
}

/** Start a looping pattern. A different mode replaces the one that is playing. */
export function music(next: MusicMode): void {
  if (!ensureGraph()) return;
  if (mode === next && token !== 0) return;
  mode = next;
  const id = ++token;
  if (timer) clearTimeout(timer);
  timer = null;
  runLoop(next, id);
}
