'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'theme';

/*
 * Dark-mode toggle. The theme is applied before paint by the inline script in
 * app/layout.js (which uses the same localStorage key), so the DOM attribute is
 * the source of truth — useSyncExternalStore subscribes to it instead of
 * mirroring it into component state.
 */
function subscribe(onStoreChange) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/* Matches the server render so hydration stays clean. */
function getServerSnapshot() {
  return 'light';
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* private mode — the theme just won't persist */
    }
  }, [theme]);

  return (
    <button className="theme-toggle" id="theme-toggle" type="button" onClick={toggle} aria-label="Toggle dark mode">
      <svg className="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 22c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.9 8.1-9.8.5-.1.9.1 1.1.5.2.4.1.9-.2 1.2-1.3 1.4-2 3.2-2 5.1 0 4.1 3.4 7.5 7.5 7.5 1.9 0 3.7-.7 5.1-2 .3-.3.8-.4 1.2-.2.4.2.6.6.5 1.1-.9 4.7-5 8.1-9.8 8.1-.2.5-.3.5-.5.5z"/></svg>
      <svg className="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.5c-3 0-5.5-2.5-5.5-5.5S9 6.5 12 6.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5zM12 2c.6 0 1 .4 1 1v1.5c0 .6-.4 1-1 1s-1-.4-1-1V3c0-.6.4-1 1-1zm0 16.5c.6 0 1 .4 1 1V21c0 .6-.4 1-1 1s-1-.4-1-1v-1.5c0-.6.4-1 1-1zM3 11h1.5c.6 0 1 .4 1 1s-.4 1-1 1H3c-.6 0-1-.4-1-1s.4-1 1-1zm16.5 0H21c.6 0 1 .4 1 1s-.4 1-1 1h-1.5c-.6 0-1-.4-1-1s.4-1 1-1zM5.6 4.2l1.1 1.1c.4.4.4 1 0 1.4-.4.4-1 .4-1.4 0L4.2 5.6c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0zm12.7 12.7l1.1 1.1c.4.4.4 1 0 1.4-.4.4-1 .4-1.4 0l-1.1-1.1c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0zM4.2 18.4l1.1-1.1c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-1.1 1.1c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4zM16.9 5.6l1.1-1.1c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-1.1 1.1c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4z"/></svg>
    </button>
  );
}
