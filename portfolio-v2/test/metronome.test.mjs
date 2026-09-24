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
  DEFAULT_BEATS,
  DEFAULT_BPM,
  MARKINGS,
  MAX_BPM,
  METERS,
  MIN_BPM,
  beatAtElapsed,
  beatDuration,
  bpmFromTaps,
  clampBpm,
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
