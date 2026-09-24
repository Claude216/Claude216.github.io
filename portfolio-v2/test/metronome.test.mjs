/*
 * Unit tests for the metronome's pure domain logic.
 *
 *   cd portfolio-v2 && npm test
 *
 * The Web Audio scheduling loop itself (lookahead timing, click synthesis,
 * visual sync) is exercised manually in a browser; everything here is the
 * logic that decides what that loop plays.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLICK_VOICES,
  DEFAULT_BEATS,
  DEFAULT_VOICE,
  DEFAULT_VOLUME,
  DEFAULT_BPM,
  MARKINGS,
  MAX_BPM,
  METERS,
  MIN_BPM,
  beatAtElapsed,
  beatDuration,
  INITIAL_DELAY_S,
  LOOKAHEAD_S,
  VOLUME_MAX,
  beatAtListedTime,
  beatInterval,
  bpmFromTaps,
  clampBpm,
  gainFromDb,
  isVoiceId,
  loadStoredVolume,
  loadStoredVoice,
  nextBeatState,
  voiceById,
  volumeCurve,
  loadStoredBeats,
  loadStoredBpm,
  markingFor,
} from '../src/lib/metronome.js';

test('defaults are 60 BPM in 4/4', () => {
  assert.equal(DEFAULT_BPM, 60);
  assert.equal(DEFAULT_BEATS, 4);
  assert.equal(markingFor(DEFAULT_BPM), 'Adagio');
});

test('clampBpm keeps tempo inside the supported range', () => {
  assert.equal(clampBpm(60), 60);
  assert.equal(clampBpm('144'), 144);
  assert.equal(clampBpm(59.6), 60, 'rounds to the nearest whole BPM');
  assert.equal(clampBpm(MIN_BPM - 1), MIN_BPM);
  assert.equal(clampBpm(MAX_BPM + 500), MAX_BPM);
});

test('clampBpm rejects values that are not numbers', () => {
  assert.equal(clampBpm('abc'), null);
  assert.equal(clampBpm(''), null);
  assert.equal(clampBpm('   '), null, 'whitespace is not a tempo');
  assert.equal(clampBpm(null), null, 'a missing stored value is not 0 BPM');
  assert.equal(clampBpm(undefined), null);
  assert.equal(clampBpm(NaN), null);
});

test('tempo markings follow the conventional ranges', () => {
  assert.equal(markingFor(30), 'Grave');
  assert.equal(markingFor(39), 'Grave');
  assert.equal(markingFor(40), 'Largo');
  assert.equal(markingFor(44), 'Largo');
  assert.equal(markingFor(45), 'Larghetto');
  assert.equal(markingFor(54), 'Larghetto');
  assert.equal(markingFor(55), 'Adagio');
  assert.equal(markingFor(60), 'Adagio', '60 BPM is Adagio, not Larghetto');
  assert.equal(markingFor(65), 'Adagio');
  assert.equal(markingFor(66), 'Andante');
  assert.equal(markingFor(75), 'Andante');
  assert.equal(markingFor(76), 'Moderato');
  assert.equal(markingFor(107), 'Moderato');
  assert.equal(markingFor(108), 'Allegro');
  assert.equal(markingFor(120), 'Allegro');
  assert.equal(markingFor(167), 'Allegro');
  assert.equal(markingFor(168), 'Presto');
  assert.equal(markingFor(199), 'Presto');
  assert.equal(markingFor(200), 'Prestissimo');
  assert.equal(markingFor(MAX_BPM), 'Prestissimo');
});

test('the marking table has no gaps or overlaps', () => {
  for (let i = 1; i < MARKINGS.length; i += 1) {
    assert.equal(
      MARKINGS[i][0],
      MARKINGS[i - 1][1] + 1,
      `range ${MARKINGS[i][2]} must start right after ${MARKINGS[i - 1][2]}`,
    );
  }
  assert.equal(MARKINGS[0][0], 0, 'the table starts at 0 BPM');
  assert.ok(MARKINGS[MARKINGS.length - 1][1] >= MAX_BPM, 'the table covers the maximum tempo');
});

test('beatDuration is seconds per beat', () => {
  assert.equal(beatDuration(60), 1);
  assert.equal(beatDuration(120), 0.5);
  assert.ok(Math.abs(beatDuration(100) - 0.6) < 1e-12);
});

test('beatAtElapsed walks the bar and wraps', () => {
  // 60 BPM, 4/4: one beat per second, accent on beat 1.
  assert.equal(beatAtElapsed(0, 60, 4), 1);
  assert.equal(beatAtElapsed(0.5, 60, 4), 1);
  assert.equal(beatAtElapsed(1, 60, 4), 2);
  assert.equal(beatAtElapsed(2.9, 60, 4), 3);
  assert.equal(beatAtElapsed(3, 60, 4), 4);
  assert.equal(beatAtElapsed(4, 60, 4), 1, 'wraps back to the downbeat');
  assert.equal(beatAtElapsed(9.5, 60, 4), 2);
});

test('beatAtElapsed respects the meter', () => {
  assert.equal(beatAtElapsed(2, 60, 3), 3);
  assert.equal(beatAtElapsed(3, 60, 3), 1);
  assert.equal(beatAtElapsed(5, 60, 6), 6);
  assert.equal(beatAtElapsed(6, 60, 6), 1);
});

test('beatAtElapsed is safe before playback starts', () => {
  assert.equal(beatAtElapsed(-1, 60, 4), 1, 'negative elapsed time clamps to the downbeat');
  assert.equal(beatAtElapsed(0, 0, 4), 1, 'a zero tempo cannot divide');
  assert.equal(beatAtElapsed(1, 60, 0), 1, 'a zero meter cannot divide');
});

test('bpmFromTaps averages the interval between taps', () => {
  assert.equal(bpmFromTaps([0, 500]), 120);
  assert.equal(bpmFromTaps([0, 500, 1000, 1500]), 120);
  assert.equal(bpmFromTaps([0, 1000]), 60);
  assert.equal(bpmFromTaps([0, 400, 800]), 150);
});

test('bpmFromTaps rejects unusable input and clamps wild values', () => {
  assert.equal(bpmFromTaps([]), null);
  assert.equal(bpmFromTaps([0]), null);
  assert.equal(bpmFromTaps(null), null);
  assert.equal(bpmFromTaps([0, 0]), null, 'zero interval has no tempo');
  assert.equal(bpmFromTaps([0, 10]), MAX_BPM, 'very fast taps clamp to the maximum');
  assert.equal(bpmFromTaps([0, 60000]), MIN_BPM, 'very slow taps clamp to the minimum');
});

test('meters offered by the UI are the supported ones', () => {
  assert.deepEqual(METERS, [2, 3, 4, 6]);
  assert.ok(METERS.includes(DEFAULT_BEATS));
});

test('stored tempo is read back and invalid values are rejected', () => {
  const storage = { getItem: (key) => (key === 'lowork.bpm' ? '132' : null) };
  assert.equal(loadStoredBpm(storage), 132);

  const junk = { getItem: () => 'not-a-number' };
  assert.equal(loadStoredBpm(junk), null);

  const outOfRange = { getItem: () => '9000' };
  assert.equal(loadStoredBpm(outOfRange), MAX_BPM);

  const missing = { getItem: () => null };
  assert.equal(loadStoredBpm(missing), null);
});

test('stored meter is read back and validated', () => {
  const storage = { getItem: () => JSON.stringify({ beats: 3 }) };
  assert.equal(loadStoredBeats(storage), 3);

  const unsupported = { getItem: () => JSON.stringify({ beats: 7 }) };
  assert.equal(loadStoredBeats(unsupported), null, 'unsupported meters fall back to the default');

  const corrupt = { getItem: () => '{not json' };
  assert.equal(loadStoredBeats(corrupt), null);
});

test('blocked storage degrades to null instead of throwing', () => {
  const hostile = {
    getItem() {
      throw new Error('storage is blocked in private mode');
    },
  };
  assert.equal(loadStoredBpm(hostile), null);
  assert.equal(loadStoredBeats(hostile), null);
});

test('every click voice is playable and distinct', () => {
  assert.ok(CLICK_VOICES.length >= 3, 'there should be a real choice of sounds');

  const ids = CLICK_VOICES.map((voice) => voice.id);
  assert.equal(new Set(ids).size, ids.length, 'voice ids must be unique');

  const labels = CLICK_VOICES.map((voice) => voice.label);
  assert.equal(new Set(labels).size, labels.length, 'voice labels must be unique');

  CLICK_VOICES.forEach((voice) => {
    assert.ok(voice.label, `${voice.id} needs a label`);
    assert.ok(voice.description, `${voice.id} needs a description for the hint line`);
    assert.ok(voice.noise || voice.partials, `${voice.id} must make a sound`);
  });
});

test('voice synthesis parameters are sane', () => {
  CLICK_VOICES.forEach((voice) => {
    if (voice.noise) {
      assert.ok(voice.noise.decay > 0, `${voice.id} noise decay must be positive`);
      assert.ok(voice.noise.attack > 0, `${voice.id} needs a non-zero attack ramp`);
      assert.ok(
        voice.noise.attack <= voice.noise.decay,
        `${voice.id} attack must not outlast the decay`,
      );
      assert.ok(voice.noise.filter.frequency > 0, `${voice.id} needs a filter frequency`);
      assert.ok(['lowpass', 'highpass', 'bandpass'].includes(voice.noise.filter.type));
    }

    (voice.partials || []).forEach((partial) => {
      assert.ok(partial.frequency > 0, `${voice.id} partial needs a frequency`);
      assert.ok(partial.ratio >= 1, `${voice.id} accent ratio should not lower the pitch`);
      assert.ok(partial.decay > 0, `${voice.id} partial decay must be positive`);
      assert.ok(partial.attack > 0, `${voice.id} partial needs a non-zero attack ramp`);
    });
  });
});

test('a metronome click is short enough not to smear into the next beat', () => {
  // At the fastest tempo a beat lasts 60/280 s ≈ 214 ms; a click ringing longer
  // than that would bleed across beats.
  const fastestBeatS = 60 / MAX_BPM;
  CLICK_VOICES.forEach((voice) => {
    const tails = [];
    if (voice.noise) tails.push(voice.noise.decay);
    (voice.partials || []).forEach((partial) => tails.push(partial.decay));
    assert.ok(
      Math.max(...tails) <= fastestBeatS,
      `${voice.id} rings for ${Math.max(...tails)}s, longer than the fastest beat`,
    );
  });
});

test('the default voice exists and is selectable', () => {
  assert.ok(isVoiceId(DEFAULT_VOICE));
  assert.equal(voiceById(DEFAULT_VOICE).id, DEFAULT_VOICE);
});

test('unknown voice ids are rejected rather than guessed', () => {
  assert.equal(isVoiceId('laser'), false);
  assert.equal(isVoiceId(''), false);
  assert.equal(isVoiceId(null), false);
  assert.equal(isVoiceId(undefined), false);
  assert.equal(voiceById('laser'), null);
});

test('gainFromDb converts decibels to a linear multiplier', () => {
  assert.equal(gainFromDb(0), 1);
  assert.ok(Math.abs(gainFromDb(-6) - 0.5011872336) < 1e-9);
  assert.ok(Math.abs(gainFromDb(-20) - 0.1) < 1e-12);
  assert.ok(gainFromDb(-40) < gainFromDb(-20), 'quieter means smaller');
  assert.ok(gainFromDb(-20) < gainFromDb(0));
});

test('stored voice is read back, unknown values rejected', () => {
  assert.equal(loadStoredVoice({ getItem: () => 'clave' }), 'clave');
  assert.equal(loadStoredVoice({ getItem: () => 'laser' }), null);
  assert.equal(loadStoredVoice({ getItem: () => null }), null);
  assert.equal(
    loadStoredVoice({
      getItem() {
        throw new Error('blocked');
      },
    }),
    null,
  );
});

test('the voices are balanced against each other', () => {
  /*
   * Every voice is synthesised from its own envelopes, so nothing structural
   * stops one from landing far louder than another — the first pass had "tick"
   * 15 dB under the rest. Approximate perceived loudness as peak x sqrt(decay)
   * (a noise burst integrates lower than a tonal partial) and keep the voices
   * inside a window, with "tick" allowed to sit lower because it is the
   * deliberately quiet option.
   */
  const NOISE_WEIGHT = 0.6;
  const QUIET_BY_DESIGN = { tick: 8 };

  function loudnessDb(voice) {
    let energy = 0;
    if (voice.noise) {
      energy += gainFromDb(voice.noise.level) * NOISE_WEIGHT * Math.sqrt(voice.noise.decay);
    }
    (voice.partials || []).forEach((partial) => {
      energy += gainFromDb(partial.level) * Math.sqrt(partial.decay);
    });
    return 20 * Math.log10(energy);
  }

  const measured = CLICK_VOICES.map((voice) => ({ id: voice.id, db: loudnessDb(voice) }));
  const loudest = Math.max(...measured.map((m) => m.db));

  measured.forEach(({ id, db }) => {
    const allowedBelow = QUIET_BY_DESIGN[id] || 6;
    assert.ok(
      db >= loudest - allowedBelow,
      `${id} is ${(loudest - db).toFixed(1)} dB below the loudest voice; allowed ${allowedBelow}`,
    );
    assert.ok(db <= loudest + 1, `${id} is louder than the reference voice`);
  });
});

test('no voice clips when its components overlap', () => {
  // Partial and noise envelopes all start near 0 and are summed at the master
  // gain, so their peaks add up. Stay under 1.0.
  CLICK_VOICES.forEach((voice) => {
    let peak = 0;
    if (voice.noise) peak += gainFromDb(voice.noise.level);
    (voice.partials || []).forEach((partial) => { peak += gainFromDb(partial.level); });
    assert.ok(peak < 1, `${voice.id} peaks at ${peak.toFixed(2)} and would clip`);
  });
});

test('the first click is scheduled beyond the scheduler lookahead', () => {
  /*
   * Regression: the transport used to light the downbeat the moment Start was
   * pressed while the first click was queued INITIAL_DELAY_S later, so the
   * opening beat was always seen before it was heard. The lead-in must also
   * clear the lookahead window, otherwise the first click can be scheduled
   * before the scheduler's next wake-up and never plays at all.
   */
  assert.ok(
    INITIAL_DELAY_S > LOOKAHEAD_S,
    `lead-in ${INITIAL_DELAY_S}s must exceed the lookahead ${LOOKAHEAD_S}s`,
  );
  assert.ok(INITIAL_DELAY_S <= 0.25, 'but stays short enough to feel responsive');
});

test('volume maps slider position to gain on a perceptual curve', () => {
  assert.equal(volumeCurve(0), 0, 'zero is silent');
  assert.equal(volumeCurve(VOLUME_MAX), 1, 'full is unity gain');

  // Cubed: half travel should be well below half gain.
  assert.ok(Math.abs(volumeCurve(50) - 0.125) < 1e-12);
  assert.ok(volumeCurve(50) < 0.5, 'a linear slider would feel dead at the low end');
});

test('volume is monotonic, clamped and safe for junk', () => {
  let previous = -1;
  for (let position = 0; position <= VOLUME_MAX; position += 5) {
    const gain = volumeCurve(position);
    assert.ok(gain >= previous, `volume must not drop at position ${position}`);
    previous = gain;
  }

  assert.equal(volumeCurve(-20), 0, 'below the range clamps to silence');
  assert.equal(volumeCurve(500), 1, 'above the range clamps to full');
  assert.equal(volumeCurve('abc'), 0);
  assert.equal(volumeCurve(null), 0);
  assert.equal(volumeCurve(undefined), 0);
});

test('the default volume is audible but not full blast', () => {
  assert.ok(DEFAULT_VOLUME > 0 && DEFAULT_VOLUME <= VOLUME_MAX);
  const gain = volumeCurve(DEFAULT_VOLUME);
  assert.ok(gain > 0.2 && gain < 0.9, `default gain ${gain} should leave headroom both ways`);
});

test('stored volume is read back, clamped and validated', () => {
  assert.equal(loadStoredVolume({ getItem: () => '40' }), 40);
  assert.equal(loadStoredVolume({ getItem: () => '0' }), 0, 'zero is a real setting, not "missing"');
  assert.equal(loadStoredVolume({ getItem: () => '900' }), VOLUME_MAX);
  assert.equal(loadStoredVolume({ getItem: () => '-10' }), 0);
  assert.equal(loadStoredVolume({ getItem: () => 'loud' }), null);
  assert.equal(loadStoredVolume({ getItem: () => null }), null);
  assert.equal(
    loadStoredVolume({
      getItem() {
        throw new Error('blocked');
      },
    }),
    null,
  );
});

/* ------------------------------------------------------------------ *
 * Beat scheduling: the transport advances one beat at a time, and the
 * visual reads back what it queued. These cover the settings changes a
 * player makes mid-practice.
 * ------------------------------------------------------------------ */

/*
 * Mirror of the component's scheduling loop: a bar in progress keeps the meter
 * it began under, and a fresh bar adopts whatever is selected when it starts.
 * `select(i)` is called before click i, standing in for the player changing the
 * picker mid-playback.
 */
function runClicks({ bpm, meter = 4, select, startAt = 0, clicks = 12 }) {
  const out = [];
  let lastAt = startAt;
  let beat = 1;
  let barMeter = null;
  let barStart = true;
  let selected = meter;

  for (let i = 0; i < clicks; i += 1) {
    if (select) selected = select(i, selected);
    if (barStart) barMeter = selected;

    const state = nextBeatState(lastAt, beat, bpm, barMeter);
    barStart = state.beat >= state.beatsPerBar;
    lastAt = state.at;
    beat = state.nextBeat;
    out.push(state);
  }
  return out;
}

test('the transport accents the first beat of every bar', () => {
  const clicks = runClicks({ bpm: 60, meter: 4 });
  assert.deepEqual(clicks.map((c) => c.beat), [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
  assert.deepEqual(
    clicks.map((c) => c.at),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test('click spacing follows the tempo, and changes take effect on the next beat', () => {
  const clicks = runClicks({ bpm: 60, meter: 4, clicks: 4 });
  assert.equal(clicks[1].at - clicks[0].at, 1);

  // Now at 120 BPM: 0.5 s per beat from the next click onward.
  let lastAt = clicks[3].at;
  let beat = clicks[3].nextBeat;
  const fast = [];
  for (let i = 0; i < 3; i += 1) {
    const state = nextBeatState(lastAt, beat, 120, 4);
    fast.push(state);
    lastAt = state.at;
    beat = state.nextBeat;
  }
  fast.forEach((state) => assert.ok(Math.abs(state.duration - 0.5) < 1e-12));
  assert.ok(Math.abs(fast[0].at - (clicks[3].at + 0.5)) < 1e-12);
});

test('the bar in progress finishes under the meter it began with', () => {
  // 4/4 for two beats, then the player picks 3/4: the 4/4 bar still gets its
  // beats 3 and 4, and 3/4 begins on the next bar line, accented.
  const clicks = runClicks({ bpm: 60, meter: 4, select: (i) => (i < 2 ? 4 : 3), clicks: 10 });
  assert.deepEqual(clicks.map((c) => c.beat).slice(0, 8), [1, 2, 3, 4, 1, 2, 3, 1]);
  assert.deepEqual(clicks.map((c) => c.beatsPerBar).slice(0, 8), [4, 4, 4, 4, 3, 3, 3, 3]);
});

test('widening the meter takes effect at the next bar line, not mid-bar', () => {
  const clicks = runClicks({ bpm: 60, meter: 4, select: (i) => (i < 2 ? 4 : 6), clicks: 12 });
  assert.deepEqual(
    clicks.map((c) => c.beat).slice(0, 11),
    [1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 1],
    'the 4/4 bar completes, then the 6/4 bar runs its full length',
  );
});

test('a slower meter change is applied without dropping or doubling a beat', () => {
  const clicks = runClicks({ bpm: 120, meter: 6, select: (i) => (i < 4 ? 6 : 2) });
  clicks.forEach((state, index) => {
    if (index > 0) {
      assert.ok(
        Math.abs(state.at - clicks[index - 1].at - beatInterval(120)) < 1e-12,
        'beats must stay evenly spaced across a meter change',
      );
    }
  });
  // The 6/4 bar runs its full six beats, so the 2/4 downbeat is the seventh click.
  assert.equal(clicks[6].beat, 1, '2/4 begins on a downbeat');
  assert.equal(clicks[6].beatsPerBar, 2);
});

test('the flashed beat matches what was queued, per click', () => {
  const clicks = runClicks({ bpm: 60, meter: 4, select: (i) => (i < 3 ? 4 : 3) });
  clicks.forEach((state) => {
    const schedule = state;
    // The instant the click sounds, and just before the next one:
    assert.equal(beatAtListedTime(schedule, state.at), state.beat);
    assert.equal(
      beatAtListedTime(schedule, state.at + state.duration * 0.99),
      state.beat,
      'the lit beat must hold until the next click',
    );
  });
});

test('the flashed beat flips onto the next click, not near it', () => {
  const schedule = { at: 2, beat: 2, duration: 0.5, beatsPerBar: 4 };
  assert.equal(beatAtListedTime(schedule, 2), 2);
  assert.equal(beatAtListedTime(schedule, 2.499), 2);
  assert.equal(beatAtListedTime(schedule, 2.5), 3, 'flips exactly on the click');
});

test('the flashed beat wraps within the current meter', () => {
  const schedule = { at: 0, beat: 3, duration: 1, beatsPerBar: 4 };
  assert.equal(beatAtListedTime(schedule, 0), 3);
  assert.equal(beatAtListedTime(schedule, 1), 4);
  assert.equal(beatAtListedTime(schedule, 2), 1);

  // A beat queued under 3/4 wraps after beat 3, and a beat still in flight when
  // the player switches keeps counting in the meter it was queued under.
  const threeFour = { at: 0, beat: 3, duration: 1, beatsPerBar: 3 };
  assert.equal(beatAtListedTime(threeFour, 1), 1, 'wraps after beat 3 in 3/4');
});

test('nothing is lit before the first click', () => {
  // The transport reports beat 0 until a click has been queued.
  assert.equal(beatAtListedTime({ at: -1, beat: 0, duration: 1, beatsPerBar: 4 }, 5), null);
  // And a click queued in the future is not lit yet.
  const schedule = { at: 10, beat: 1, duration: 1, beatsPerBar: 4 };
  assert.equal(beatAtListedTime(schedule, 9.99), null);
  assert.equal(beatAtListedTime(schedule, 10), 1);
});

test('beatAtListedTime tolerates a missing or degenerate schedule', () => {
  assert.equal(beatAtListedTime(null, 1), null);
  assert.equal(beatAtListedTime(undefined, 1), null);
  assert.equal(beatAtListedTime({ at: 0, beat: 2, duration: 0, beatsPerBar: 4 }, 5), 2);
});

test('a nonsensical stored beat counter is recovered rather than mis-accented', () => {
  // Guards against a stale counter surviving a meter change.
  assert.equal(nextBeatState(0, 9, 60, 4).beat, 1);
  assert.equal(nextBeatState(0, 0, 60, 4).beat, 1);
  assert.equal(nextBeatState(0, -3, 60, 4).beat, 1);
});

test('a mid-bar meter change does not cut the running bar short', () => {
  /*
   * Regression: the transport holds the *next* beat in its counter, so the
   * obvious "if the counter exceeds the new meter, restart the bar" rule fired
   * one beat early and truncated a bar that had already begun. Switching from
   * 4/4 to 2/4 after beat 2 must still play beats 3 and 4.
   */
  const clicks = runClicks({ bpm: 60, meter: 4, select: (i) => (i < 2 ? 4 : 2), clicks: 9 });

  assert.deepEqual(
    clicks.map((c) => c.beat).slice(0, 6),
    [1, 2, 3, 4, 1, 2],
    'the running 4/4 bar must finish before 2/4 begins',
  );
  assert.deepEqual(
    clicks.map((c) => c.beatsPerBar).slice(0, 6),
    [4, 4, 4, 4, 2, 2],
    'and the meter is reported per beat, so the dots can follow it',
  );
});

test('the new meter is accented as the next bar line', () => {
  const clicks = runClicks({ bpm: 60, meter: 4, select: (i) => (i < 2 ? 4 : 2), clicks: 8 });
  const downbeats = clicks.filter((c) => c.beat === 1).map((c) => c.at);
  assert.deepEqual(downbeats.slice(0, 3), [1, 5, 7], '2/4 bars are two beats long from bar 2');
});

test('every beat is flashed as the beat that sounds', () => {
  // The whole point of the fix: across a meter change, the lit dot, the beat
  // number and the accent all agree at the instant each click fires.
  const clicks = runClicks({ bpm: 100, meter: 4, select: (i) => (i < 3 ? 4 : 3), clicks: 10 });
  clicks.forEach((state, index) => {
    assert.equal(
      beatAtListedTime(state, state.at),
      state.beat,
      `click ${index + 1} flashed the wrong beat`,
    );
    assert.ok(state.beat >= 1 && state.beat <= state.beatsPerBar, 'beat must fit its meter');
  });
});

test('switching meter repeatedly stays musically consistent', () => {
  const meters = [4, 3, 6, 2];
  const clicks = runClicks({
    bpm: 120,
    meter: 4,
    select: (i) => meters[Math.floor(i / 3) % meters.length],
    clicks: 24,
  });

  clicks.forEach((state, index) => {
    if (index > 0) {
      assert.ok(
        Math.abs(state.at - clicks[index - 1].at - beatInterval(120)) < 1e-12,
        'beats stay evenly spaced no matter how often the meter changes',
      );
    }
    assert.ok(state.beat >= 1 && state.beat <= state.beatsPerBar);
  });
});
