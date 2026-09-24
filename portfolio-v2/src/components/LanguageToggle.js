'use client';

import { useCallback } from 'react';
import useLang from '@/lib/useLang';
import { LANGUAGE_LABELS, otherLang, stringsFor, writeLang } from '@/lib/i18n';

export default function LanguageToggle() {
  const lang = useLang();
  const label = stringsFor(lang).nav.switchLanguage;

  const toggle = useCallback(() => {
    const next = otherLang(lang);
    writeLang(next);
    // Lets a screen reader announce the new language instead of reading Chinese
    // copy with English pronunciation rules.
    document.documentElement.setAttribute('lang', next === 'zh' ? 'zh-CN' : 'en');
  }, [lang]);

  return (
    <button type="button" className="lang-toggle" onClick={toggle} aria-label={label} title={label}>
      {LANGUAGE_LABELS[lang]}
    </button>
  );
}
