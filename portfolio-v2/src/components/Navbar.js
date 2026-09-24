'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import useLang from '@/lib/useLang';
import { stringsFor } from '@/lib/i18n';
import styles from './Navbar.module.css';

const SECTIONS = [
  { href: '#about', key: 'about' },
  { href: '#news', key: 'news' },
  { href: '#education', key: 'education' },
  { href: '#publications', key: 'publications' },
  { href: '#experience', key: 'experience' },
  { href: '#contact', key: 'contact' },
];

export default function Navbar({ active = null, transparent = false }) {
  const [scrolled, setScrolled] = useState(false);
  const t = stringsFor(useLang()).nav;

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
              key={section.href}
              href={section.href}
              data-section="true"
              className={`${styles.navLink} ${active === section.href.slice(1) ? styles.active : ''}`}
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
