/*
 * Language switching.
 *
 * The site is a static export, so there is no server to negotiate a locale and no
 * /zh/... routes: the choice is client-side, stored in localStorage and mirrored
 * onto <html data-lang> by a boot script in app/layout.js. Components read it
 * through useSyncExternalStore (see LanguageToggle), the same way the theme is
 * handled, which keeps the prerendered HTML and the first client render
 * identical.
 */

export const STORAGE_KEY = 'lang';
export const LANGS = ['en', 'zh'];
export const DEFAULT_LANG = 'en';

export function isLang(value) {
  return LANGS.indexOf(value) !== -1;
}

/** Read the current language from the document, falling back to the default. */
export function readLang() {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  const attr = document.documentElement.getAttribute('data-lang');
  return isLang(attr) ? attr : DEFAULT_LANG;
}

/** Switch language and remember it. */
export function writeLang(lang) {
  if (!isLang(lang)) return;
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    /* private mode — the choice just will not persist */
  }
}

/** The other language, for a two-way toggle. */
export function otherLang(lang) {
  return lang === 'zh' ? 'en' : 'zh';
}

/* ------------------------------------------------------------------ *
 * UI strings
 * ------------------------------------------------------------------ */

export const LANGUAGE_LABELS = { en: 'EN', zh: '中文' };
export const LANGUAGE_NAMES = { en: 'English', zh: '中文' };

export const STRINGS = {
  en: {
    nav: {
      about: 'About',
      news: 'News',
      education: 'Education',
      publications: 'Publications',
      experience: 'Experience',
      contact: 'Contact',
      outOfWork: 'Out Of Work',
      switchLanguage: 'Switch to Chinese',
    },
    metronome: {
      tabsLabel: 'Out Of Work pages',
      metronomeTab: 'Metronome',
      title: 'Metronome',
      intro: 'My practice click for guitar — set the tempo, choose the feel, and go.',
      tempo: 'Tempo',
      bpmUnit: 'BPM',
      marking: 'Marking',
      feelUnit: '/4 feel',
      statusPlaying: 'Playing',
      statusStopped: 'Stopped',
      beatsPerMinute: 'Beats per minute',
      tempoSliderLabel: 'Tempo in beats per minute',
      tempoValueLabel: 'Tempo value',
      tapTempo: 'Tap tempo',
      tapAgain: 'Tap again…',
      clickSound: 'Click sound',
      tapHint: 'tapping a name plays it.',
      timeSignature: 'Time signature',
      meterHint: 'The first beat of every bar is accented — that is your downbeat. 6/8 counts six eighth notes.',
      start: 'Start',
      stop: 'Stop',
      volume: 'Volume',
      volumeSliderLabel: 'Output volume',
      volumeHint: 'Clicks only — your guitar is not affected.',
      shortcutsStartStop: 'start / stop',
      shortcutsTap: 'tap tempo',
      shortcutsTempoOne: 'tempo ±1',
      shortcutsTempoFive: 'tempo ±5',
      shortcutsMeter: 'time signature',
      audioUnsupported: 'Audio not supported in this browser',
    },
  },
  zh: {
    nav: {
      about: '关于',
      news: '动态',
      education: '教育',
      publications: '论文',
      experience: '经历',
      contact: '联系',
      outOfWork: '业余玩物',
      switchLanguage: '切换到英文',
    },
    metronome: {
      tabsLabel: '业余玩物页面',
      metronomeTab: '节拍器',
      title: '节拍器',
      intro: '练吉他用的节拍器 —— 定好速度，选好拍子，开始。',
      tempo: '速度',
      bpmUnit: '拍/分',
      marking: '术语',
      feelUnit: '/4 拍',
      statusPlaying: '播放中',
      statusStopped: '已停止',
      beatsPerMinute: '每分钟拍数',
      tempoSliderLabel: '速度（每分钟拍数）',
      tempoValueLabel: '速度数值',
      tapTempo: '点击测速',
      tapAgain: '继续点…',
      clickSound: '节拍音色',
      tapHint: '点名字即可试听。',
      timeSignature: '拍号',
      meterHint: '每小节的第一拍是重音 —— 也就是强拍。6/8 是六个八分音符。',
      start: '开始',
      stop: '停止',
      volume: '音量',
      volumeSliderLabel: '输出音量',
      volumeHint: '只调节拍器音量，不影响吉他。',
      shortcutsStartStop: '开始 / 停止',
      shortcutsTap: '点击测速',
      shortcutsTempoOne: '速度 ±1',
      shortcutsTempoFive: '速度 ±5',
      shortcutsMeter: '拍号',
      audioUnsupported: '你的浏览器不支持音频播放',
    },
  },
};

/** Strings for a language, falling back to the default if it is unknown. */
export function stringsFor(lang) {
  return STRINGS[isLang(lang) ? lang : DEFAULT_LANG];
}

/** Display name for an Italian tempo marking in the given language. */
export function markingLabel(lang, marking) {
  const table = MARKING_NAMES[lang];
  return table && table[marking] ? table[marking] : null;
}

/**
 * Standard Italian tempo markings, with the Chinese names commonly used for
 * them in music teaching. Both languages show the Italian, because that is what
 * is printed on sheet music — Chinese readers get the translation alongside it.
 */
export const MARKING_NAMES = {
  zh: {
    Grave: '极慢板',
    Largo: '广板',
    Larghetto: '小广板',
    Adagio: '慢板',
    Andante: '行板',
    Moderato: '中板',
    Allegro: '快板',
    Presto: '急板',
    Prestissimo: '最急板',
  },
};
