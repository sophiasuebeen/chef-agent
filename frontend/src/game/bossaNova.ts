/**
 * An original bossa nova loop, synthesized in the browser. No audio files and no licensed recording.
 * `barScore` is pure music; `createBossaPlayer` turns it into sound.
 */
export const BPM = 126;
const STEPS_PER_BAR = 8; // Eighth notes.
const STEP_SECONDS = 60 / BPM / 2;
export const BAR_SECONDS = STEP_SECONDS * STEPS_PER_BAR;

/** Midi notes: bass root, bass fifth, then a soft four-note guitar voicing. */
interface Chord { root: number; fifth: number; voicing: number[] }
const chord = (root: number, fifth: number, ...voicing: number[]): Chord => ({ root, fifth, voicing });
const Am9 = chord(45, 40, 55, 60, 64, 71);
const D13 = chord(38, 45, 54, 60, 64, 71);
const Gmaj9 = chord(43, 38, 54, 59, 62, 69);
const Cmaj9 = chord(36, 43, 52, 59, 62, 67);
const Fsm7b5 = chord(42, 36, 52, 57, 60, 64);
const B7b9 = chord(35, 42, 51, 57, 60, 66);
const Em9 = chord(40, 35, 55, 62, 66, 71);
const A13 = chord(45, 40, 55, 61, 66, 71);
const Dm9 = chord(38, 45, 53, 60, 64, 69);
const G13 = chord(43, 38, 53, 59, 64, 69);
const Bm7 = chord(47, 42, 54, 57, 62, 69);
const E7b9 = chord(40, 47, 56, 62, 65, 71);

export const PROGRESSION: Chord[] = [Am9, D13, Gmaj9, Cmaj9, Fsm7b5, B7b9, Em9, A13, Dm9, G13, Cmaj9, Am9, Bm7, E7b9, Am9, D13];

/** The bossa guitar rhythm over two bars, in eighth notes. */
export const CLAVE: readonly number[] = [0, 3, 6, 10, 13];

/** Melody per phrase as [step in a 16-bar phrase, chord tone index, octave up]. Sparse, to sit behind talk. */
const MELODY: readonly (readonly [bar: number, step: number, tone: number])[] = [
  [0, 2, 3], [0, 5, 2], [1, 0, 3], [1, 4, 1], [2, 3, 3], [3, 0, 2], [3, 5, 3],
  [4, 2, 2], [5, 0, 1], [5, 4, 3], [6, 3, 2], [7, 0, 3],
  [8, 2, 3], [8, 5, 2], [9, 3, 3], [10, 0, 2], [10, 5, 3], [11, 4, 1],
  [12, 2, 3], [13, 0, 2], [13, 5, 3], [14, 3, 2], [15, 0, 1],
];

export interface BarScore {
  guitar: { step: number; notes: number[]; velocity: number }[];
  bass: { step: number; note: number }[];
  shaker: { step: number; velocity: number }[];
  melody: { step: number; note: number }[];
}

/** Everything played in one bar. Depends only on the bar number, so the loop never drifts. */
export function barScore(bar: number): BarScore {
  const position = ((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length;
  const current = PROGRESSION[position]!;
  const claveOffset = position % 2 === 0 ? 0 : STEPS_PER_BAR;
  return {
    guitar: CLAVE.filter((step) => step >= claveOffset && step < claveOffset + STEPS_PER_BAR)
      .map((step) => ({ step: step - claveOffset, notes: current.voicing, velocity: step === claveOffset ? 0.8 : 0.62 })),
    bass: [{ step: 0, note: current.root }, { step: 3, note: current.fifth }, { step: 4, note: current.fifth }],
    shaker: Array.from({ length: STEPS_PER_BAR }, (_, step) => ({ step, velocity: step % 2 === 0 ? 0.55 : 0.35 })),
    melody: MELODY.filter(([melodyBar]) => melodyBar === position)
      .map(([, step, tone]) => ({ step, note: current.voicing[tone]! + 12 })),
  };
}

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Ctx = AudioContext | OfflineAudioContext;

function buildGraph(ctx: Ctx) {
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);
  const bus = ctx.createGain();
  bus.connect(master);
  // A short room reverb from decaying noise.
  const length = Math.floor(ctx.sampleRate * 1.5);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  bus.connect(reverb).connect(wet).connect(master);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
  return { master, bus, noise };
}

function pluck(ctx: Ctx, out: AudioNode, time: number, midi: number, gain: number, decay: number, brightness: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(brightness, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, brightness * 0.3), time + decay);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(gain, time + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  filter.connect(envelope).connect(out);
  const stop = time + decay + 0.05;
  for (const [type, ratio, detune] of [['triangle', 1, -3], ['sine', 2, 4]] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency(midi) * ratio;
    oscillator.detune.value = detune;
    oscillator.connect(filter);
    oscillator.start(time);
    oscillator.stop(stop);
  }
}

function shake(ctx: Ctx, out: AudioNode, noise: AudioBuffer, time: number, gain: number) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6500;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, time);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
  source.connect(filter).connect(envelope).connect(out);
  source.start(time);
  source.stop(time + 0.09);
}

/** Schedule one bar. Works on live and offline contexts, so it can be measured without speakers. */
export function scheduleBar(ctx: Ctx, out: AudioNode, noise: AudioBuffer, bar: number, start: number) {
  const score = barScore(bar);
  const at = (step: number) => start + step * STEP_SECONDS;
  for (const hit of score.guitar) {
    hit.notes.forEach((note, index) => pluck(ctx, out, at(hit.step) + index * 0.011, note, 0.085 * hit.velocity, 1.15, 2300));
  }
  for (const hit of score.bass) pluck(ctx, out, at(hit.step), hit.note, 0.26, 0.75, 650);
  for (const hit of score.shaker) shake(ctx, out, noise, at(hit.step), 0.028 * hit.velocity);
  for (const hit of score.melody) pluck(ctx, out, at(hit.step), hit.note, 0.075, 1.6, 3000);
}

export function renderGraph(ctx: Ctx, volume: number) {
  const graph = buildGraph(ctx);
  graph.master.gain.value = volume;
  return graph;
}

const LOOKAHEAD_SECONDS = 1.5; // Background tabs slow timers to about once a second.

export interface BossaPlayer {
  setVolume: (volume: number) => void;
  stop: () => void;
}

/** Call from a user gesture: browsers only allow sound to start after one. */
export function createBossaPlayer(volume = 0.5): BossaPlayer {
  const ctx = new AudioContext();
  void ctx.resume();
  const graph = renderGraph(ctx, volume);
  let bar = 0;
  let next = ctx.currentTime + 0.15;
  const schedule = () => {
    while (next < ctx.currentTime + LOOKAHEAD_SECONDS) {
      scheduleBar(ctx, graph.bus, graph.noise, bar, next);
      bar += 1;
      next += BAR_SECONDS;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 300);
  return {
    setVolume: (value) => graph.master.gain.setTargetAtTime(value, ctx.currentTime, 0.05),
    stop: () => { window.clearInterval(timer); void ctx.close(); },
  };
}
