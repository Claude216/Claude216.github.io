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
  DEFAULT_BPM,
  MARKINGS,
  MAX_BPM,
  METERS,
  MIN_BPM,
  beatAtElapsed,
  beatDuration,
  bpmFromTaps,
  clampBpm,
  gainFromDb,
  isVoiceId,
  loadStoredVoice,
  voiceById,
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
