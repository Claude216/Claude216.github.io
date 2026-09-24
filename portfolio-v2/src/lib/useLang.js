'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_LANG, readLang } from './i18n';

/*
 * Language as external state: app/layout.js stamps <html data-lang> before first
 * paint, this subscribes to it, and LanguageToggle is what changes it. Every
 * component that calls this hook re-renders together.
 */
function subscribe(onStoreChange) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-lang'],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return readLang();
}

/* Matches the prerendered markup, so hydration stays clean. */
function getServerSnapshot() {
  return DEFAULT_LANG;
}

export default function useLang() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
