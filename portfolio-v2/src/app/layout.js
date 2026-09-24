import './globals.css';

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
      </head>
      <body>{children}</body>
    </html>
  );
}
