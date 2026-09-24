/*
 * Unit tests for language switching.
 *
 *   cd portfolio-v2 && npm test
 *
 * The risk with two dictionaries is silent drift — a string added to one and
 * forgotten in the other only shows up as English leaking into the Chinese
 * build, which no type checker catches because the tables are plain objects.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LANG,
  LANGS,
  LANGUAGE_LABELS,
  LANGUAGE_NAMES,
  STRINGS,
  isLang,
  markingLabel,
  otherLang,
  stringsFor,
} from '../src/lib/i18n.js';

test('both languages are declared and have labels', () => {
  assert.deepEqual(LANGS, ['en', 'zh']);
  assert.ok(LANGS.includes(DEFAULT_LANG));
  LANGS.forEach((lang) => {
    assert.ok(LANGUAGE_LABELS[lang], `${lang} needs a short toggle label`);
    assert.ok(LANGUAGE_NAMES[lang], `${lang} needs a full name`);
    assert.ok(STRINGS[lang], `${lang} needs a dictionary`);
  });
});

test('the dictionaries have identical shapes', () => {
  function paths(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object' ? paths(value, path) : [path];
    });
  }

  const en = paths(STRINGS.en).sort();
  const zh = paths(STRINGS.zh).sort();

  assert.deepEqual(
    zh.filter((k) => !en.includes(k)),
    [],
    'keys present in Chinese but missing from English',
  );
  assert.deepEqual(
    en.filter((k) => !zh.includes(k)),
    [],
    'keys present in English but missing from Chinese',
  );
});

test('no string is left empty or still English in the Chinese copy', () => {
  function entries(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object' ? entries(value, path) : [[path, value]];
    });
  }

  entries(STRINGS.zh).forEach(([path, value]) => {
    assert.equal(typeof value, 'string', `${path} should be a string`);
    assert.ok(value.trim().length > 0, `${path} is empty`);
    assert.ok(/[\u4e00-\u9fff]/.test(value), `${path} has no Chinese characters: "${value}"`);
  });
});

test('isLang accepts only the supported languages', () => {
  assert.equal(isLang('en'), true);
  assert.equal(isLang('zh'), true);
  assert.equal(isLang('fr'), false);
  assert.equal(isLang(''), false);
  assert.equal(isLang(null), false);
  assert.equal(isLang(undefined), false);
  assert.equal(isLang('EN'), false, 'lookup is exact — callers normalise first');
});

test('stringsFor falls back to the default for an unknown language', () => {
  assert.equal(stringsFor('zh'), STRINGS.zh);
  assert.equal(stringsFor('en'), STRINGS.en);
  assert.equal(stringsFor('fr'), STRINGS.en);
  assert.equal(stringsFor(null), STRINGS.en);
});

test('otherLang flips between the two', () => {
  assert.equal(otherLang('en'), 'zh');
  assert.equal(otherLang('zh'), 'en');
  assert.equal(otherLang('fr'), 'zh', 'anything unknown is treated as the default');
});

test('tempo markings translate and fall back to the Italian', () => {
  // The Italian marking is what is printed on sheet music, so it is always
  // shown; the Chinese name is added for readers who want it.
  assert.equal(markingLabel('zh', 'Adagio'), '慢板');
  assert.equal(markingLabel('zh', 'Andante'), '行板');
  assert.equal(markingLabel('en', 'Adagio'), null, 'English shows the Italian alone');
  assert.equal(markingLabel('zh', 'Allegretto'), null, 'an unlisted marking has no translation');
  assert.equal(markingLabel('zh', undefined), null);
});

test('every marking the metronome can produce has a Chinese name', () => {
  // Mirrors MARKINGS in src/lib/metronome.js: if a range is added there without a
  // translation, Chinese readers would silently get the Italian only.
  const used = [
    'Grave', 'Largo', 'Larghetto', 'Adagio', 'Andante',
    'Moderato', 'Allegro', 'Presto', 'Prestissimo',
  ];
  used.forEach((marking) => {
    assert.ok(markingLabel('zh', marking), `${marking} needs a Chinese name`);
  });
});
