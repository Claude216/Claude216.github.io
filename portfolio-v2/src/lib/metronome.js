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
export const LOOKAHEAD_S = 0.12;   // how far ahead of the audio clock clicks are queued
export const TIMER_MS = 25;        // how often the scheduler wakes up
export const INITIAL_DELAY_S = 0.15; // lead-in before the first click, so it is never cut off
export const GAIN_RAMP_S = 0.02;   // fade applied to volume changes, to avoid zipper noise

export const METERS = [2, 3, 4, 6];
export const PRESETS = [60, 80, 100, 120, 140];

/* Tap tempo. */
export const TAP_TIMEOUT_MS = 2200;
export const TAP_MAX_SAMPLES = 6;

/* Output volume, as a 0-100 position on the slider. */
export const DEFAULT_VOLUME = 80;
export const VOLUME_MAX = 100;

/* localStorage keys — shared with the previous static build so a visitor's
 * saved tempo carries over. */
export const STORE_BPM = 'lowork.bpm';
export const STORE_SETTINGS = 'lowork.settings';
export const STORE_VOICE = 'lowork.voice';
export const STORE_VOLUME = 'lowork.volume';

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

/*
 * Beat scheduling.
 *
 * The transport keeps one piece of state — when the last click was queued, and
 * which beat of the bar it was — and advances it one beat at a time. Nothing
 * derives a beat from elapsed time, because that silently assumes a constant
 * tempo and an unchanging meter; the metronome allows both to change while it
 * is running.
 */

/** Seconds between clicks at a given tempo. */
export function beatInterval(bpm) {
  return 60 / Number(bpm);
}

/**
 * Advance the transport by one beat.
 *
 * A bar is counted in beats, so a meter change can only take effect at a bar
 * line: if the counter has run past the new meter, this beat starts the new bar
 * as beat 1. That is what makes switching time signature mid-playback land the
 * downbeat where it should.
 */
export function nextBeatState(lastBeatAt, currentBeat, bpm, beatsPerBar) {
  let beat = Math.round(currentBeat);
  if (beat < 1 || beat > beatsPerBar) beat = 1;
  const duration = beatInterval(bpm);
  return {
    at: lastBeatAt + duration,
    beat,
    duration,
    // The meter this beat belongs to. A queued beat keeps it, because a meter
    // change only takes effect at the next bar line — resolving a beat against
    // the newly chosen meter would mislabel every beat still in flight.
    beatsPerBar,
    nextBeat: beat >= beatsPerBar ? 1 : beat + 1,
  };
}

/**
 * Which beat of the bar is sounding — or should be lit — at a moment in time.
 *
 * Returns null before the first click. While the transport is running only one
 * beat is ever queued ahead, so `ticks` is 0 for the live beat and 1 for the one
 * already queued; both are resolved exactly, which is why the flash flips on the
 * click rather than near it.
 */
export function beatAtListedTime(schedule, when) {
  if (!schedule || !(schedule.at >= 0)) return null;
  if (!(when >= schedule.at)) return null;
  const duration = schedule.duration;
  const beatsPerBar = schedule.beatsPerBar;
  if (!(duration > 0) || !(beatsPerBar > 0)) return schedule.beat;
  const ticks = Math.floor((when - schedule.at) / duration);
  if (ticks <= 0) return schedule.beat;
  return ((schedule.beat - 1 + ticks) % beatsPerBar) + 1;
}

/**
 * Slider position (0-100) to a linear gain.
 *
 * Cubed rather than linear: perceived loudness roughly follows a power law, so
 * a linear slider would feel like it did nothing until the last few percent.
 */
export function volumeCurve(position) {
  const clamped = Math.max(0, Math.min(VOLUME_MAX, Number(position)));
  if (!Number.isFinite(clamped)) return 0;
  return (clamped / VOLUME_MAX) ** 3;
}

/** Read a stored volume; null when nothing usable is stored. */
export function loadStoredVolume(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORE_VOLUME);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(VOLUME_MAX, Math.round(value)));
  } catch (e) {
    return null;
  }
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
