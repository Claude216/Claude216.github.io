'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import useLang from '@/lib/useLang';
import { stringsFor } from '@/lib/i18n';
import styles from './Navbar.module.css';

const SECTIONS = [
  { hash: '#about', key: 'about' },
  { hash: '#news', key: 'news' },
  { hash: '#education', key: 'education' },
  { hash: '#publications', key: 'publications' },
  { hash: '#experience', key: 'experience' },
  { hash: '#contact', key: 'contact' },
];

const HOME = '/';

export default function Navbar({ active = null, transparent = false }) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const t = stringsFor(useLang()).nav;

  /*
   * The sections only exist on the home page, so anywhere else these links have
   * to point back at it. A bare "#about" on /out-of-work matched nothing and
   * silently did nothing when clicked.
   */
  const onHome = (pathname || HOME).replace(/\/$/, '') === '';
  const sectionHref = (hash) => (onHome ? hash : `${HOME}${hash}`);

  // Highlight the section currently in view, and (on the home page) turn the
  // transparent overlay bar into a solid bar once past the hero.
  useEffect(() => {
    const links = Array.from(document.querySelectorAll('a[data-section]'));
    const sections = Array.from(document.querySelectorAll('section[id]'));

    function onScroll() {
      let current = '';
      sections.forEach((section) => {
        if (window.scrollY >= section.offsetTop - 120) current = section.id;
      });
      links.forEach((link) => {
        link.classList.toggle(styles.active, link.getAttribute('href') === '#' + current);
      });

      if (transparent) setScrolled(window.scrollY > window.innerHeight - 80);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [transparent]);

  const navClass = [
    styles.navbar,
    transparent ? styles.navTransparent : '',
    transparent && scrolled ? styles.scrolled : '',
  ].filter(Boolean).join(' ');

  return (
    <nav className={navClass}>
      <div className={styles.navInner}>
        <div className={styles.navLinks}>
          {SECTIONS.map((section) => (
            <Link
              key={section.hash}
              href={sectionHref(section.hash)}
              data-section={onHome ? 'true' : undefined}
              className={`${styles.navLink} ${active === section.hash.slice(1) ? styles.active : ''}`}
            >
              {t[section.key]}
            </Link>
          ))}
          <Link
            href="/out-of-work"
            className={`${styles.navLink} ${styles.navExternal} ${active === 'out-of-work' ? styles.active : ''}`}
          >
            {t.outOfWork}
          </Link>
        </div>
        <div className={styles.navControls}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
