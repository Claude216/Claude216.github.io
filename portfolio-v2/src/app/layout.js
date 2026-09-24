import './globals.css';

/*
 * Language boot. Uses the same storage key as src/lib/i18n.js, defaults to
 * English, and honours the browser on a first visit. Setting it before paint
 * means no flash of the wrong language and no hydration mismatch.
 */
const LANG_BOOT = `(function(){var L=['en','zh'],D='en';try{var s=localStorage.getItem('lang');var n=(navigator.language||'').toLowerCase().indexOf('zh')===0?'zh':D;var v=L.indexOf(s)!==-1?s:n;document.documentElement.setAttribute('data-lang',v);document.documentElement.setAttribute('lang',v==='zh'?'zh-CN':'en')}catch(e){document.documentElement.setAttribute('data-lang',D)}})();`;

export const metadata = {
  title: 'Lunxiao (Claude) Li',
  description: 'Lunxiao (Claude) Li — Ph.D. student in Computer Science at North Carolina State University, researching Large Language Models and their applications.',
};

/*
 * Runs before first paint: gives the navbar (and every themed component) the
 * right colours immediately, using the same localStorage key as the static
 * site's shared.js. Wrapped in try/catch so blocked storage can't break boot.
 */
const THEME_BOOT = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s||(d?'dark':'light'))}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
