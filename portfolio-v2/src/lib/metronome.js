/*
 * Pure metronome domain logic — no DOM, no React, no browser APIs.
 *
 * Kept separate from the component so the rules that matter musically
 * (tempo range, conventional markings, meter choices) can be unit tested
 * under plain Node: see test/metronome.test.mjs.
 */

export const MIN_BPM = 30;
export const MAX_BPM = 280;
export const DEFAULT_BPM = 60;
export const DEFAULT_BEATS = 4;

/* Scheduler tuning (Web Audio lookahead pattern). */
export const LOOKAHEAD_S = 0.12; // how far ahead of the audio clock clicks are queued
export const TIMER_MS = 25;      // how often the scheduler wakes up

export const METERS = [2, 3, 4, 6];
export const PRESETS = [60, 80, 100, 120, 140];

/* Tap tempo. */
export const TAP_TIMEOUT_MS = 2200;
export const TAP_MAX_SAMPLES = 6;

/* localStorage keys — shared with the previous static build so a visitor's
 * saved tempo carries over. */
export const STORE_BPM = 'lowork.bpm';
export const STORE_SETTINGS = 'lowork.settings';
export const STORE_VOICE = 'lowork.voice';

/*
 * Click voices.
 *
 * Each click is synthesised from an envelope plus either a pair of sine
 * partials (a struck body) or a burst of filtered noise (a struck surface),
 * or both. Sine pairs use inharmonic ratios — a real percussion body rings
 * with partials that are not integer multiples — which is why they read as a
 * block being hit rather than as a beep being played.
 *
 * `ratio` raises the downbeat above the other beats so the start of the bar is
 * audible; `filter` shapes the noise burst in Hz.
 */
export const DEFAULT_VOICE = 'wood';

export const CLICK_VOICES = [
  {
    id: 'wood',
    label: 'Wood',
    description: 'Warm wooden block — the closest to a real metronome',
    noise: { level: -16, attack: 0.001, decay: 0.018, filter: { type: 'bandpass', frequency: 1900, q: 1.1 } },
    partials: [
      { frequency: 700, ratio: 1.3, level: -13, attack: 0.001, decay: 0.055 },
      { frequency: 1960, ratio: 1.18, level: -19, attack: 0.001, decay: 0.03 },
    ],
  },
  {
    id: 'clave',
    label: 'Clave',
    description: 'Hard bright stick click that cuts through a guitar',
    noise: { level: -15, attack: 0.001, decay: 0.012, filter: { type: 'bandpass', frequency: 2600, q: 1.5 } },
    partials: [
      { frequency: 2140, ratio: 1.25, level: -7, attack: 0.001, decay: 0.035 },
    ],
  },
  {
    id: 'tick',
    label: 'Tick',
    description: 'Soft filtered tick for quiet practice',
    noise: { level: -5, attack: 0.002, decay: 0.022, filter: { type: 'highpass', frequency: 3200, q: 0.7 } },
  },
  {
    id: 'beep',
    label: 'Beep',
    description: 'Clean electronic tone, no noise',
    partials: [
      { frequency: 1000, ratio: 1.5, level: -8, attack: 0.002, decay: 0.06 },
    ],
  },
  {
    id: 'snare',
    label: 'Rim',
    description: 'Short rimshot — noise plus a metallic tone',
    noise: { level: -13, attack: 0.001, decay: 0.045, filter: { type: 'bandpass', frequency: 2000, q: 0.9 } },
    partials: [
      { frequency: 430, ratio: 1.35, level: -15, attack: 0.001, decay: 0.03 },
    ],
  },
];

export function isVoiceId(value) {
  return CLICK_VOICES.some((voice) => voice.id === value);
}

export function voiceById(value) {
  return CLICK_VOICES.find((voice) => voice.id === value) || null;
}

/** Decibels to a linear gain multiplier, relative to 1. */
export function gainFromDb(db) {
  return 10 ** (Number(db) / 20);
}

/** Read a stored click voice; null when nothing usable is stored. */
export function loadStoredVoice(storage = globalThis.localStorage) {
  try {
    const saved = storage.getItem(STORE_VOICE);
    return isVoiceId(saved) ? saved : null;
  } catch (e) {
    return null;
  }
}

/* Conventional tempo markings, as [lower bound, upper bound, name]. */
export const MARKINGS = [
  [0, 39, 'Grave'],
  [40, 44, 'Largo'],
  [45, 54, 'Larghetto'],
  [55, 65, 'Adagio'],
  [66, 75, 'Andante'],
  [76, 107, 'Moderato'],
  [108, 167, 'Allegro'],
  [168, 199, 'Presto'],
  [200, 500, 'Prestissimo'],
];

/** Descriptive name for a tempo, e.g. 60 -> "Adagio". */
export function markingFor(value) {
  const bpm = Number(value);
  if (!Number.isFinite(bpm)) return MARKINGS[0][2];
  for (let i = 0; i < MARKINGS.length; i += 1) {
    const [from, to, name] = MARKINGS[i];
    if (bpm >= from && bpm <= to) return name;
  }
  return bpm < 40 ? 'Grave' : 'Prestissimo';
}

/** Round and clamp a tempo into the supported range; null when not a number. */
export function clampBpm(value) {
  // Number(null), Number('') and Number('   ') are all 0, which would silently
  // become MIN_BPM — an empty value must be treated as "no tempo" instead.
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return null;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, next));
}

/** Seconds per beat at a given tempo. */
export function beatDuration(bpm) {
  return 60 / Number(bpm);
}

/** Which beat of the bar a moment falls on (1-based). */
export function beatAtElapsed(elapsedSeconds, bpm, beatsPerBar) {
  const duration = beatDuration(bpm);
  if (!(duration > 0) || !(beatsPerBar > 0)) return 1;
  if (elapsedSeconds <= 0) return 1;
  return (Math.floor(elapsedSeconds / duration) % beatsPerBar) + 1;
}

/** Average tempo implied by a series of tap timestamps (ms); null if too few. */
export function bpmFromTaps(tapTimes) {
  if (!Array.isArray(tapTimes) || tapTimes.length < 2) return null;
  const total = tapTimes[tapTimes.length - 1] - tapTimes[0];
  const average = total / (tapTimes.length - 1);
  if (!(average > 0)) return null;
  return clampBpm(60000 / average);
}

/**
 * Read a stored tempo. Returns null when nothing usable is stored, so the
 * caller can decide whether to fall back to the default.
 */
export function loadStoredBpm(storage = globalThis.localStorage) {
  try {
    return clampBpm(storage.getItem(STORE_BPM));
  } catch (e) {
    return null;
  }
}

/** Read a stored meter; null when nothing usable is stored. */
export function loadStoredBeats(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(STORE_SETTINGS) || 'null');
    return saved && METERS.indexOf(saved.beats) !== -1 ? saved.beats : null;
  } catch (e) {
    return null;
  }
}
