'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import styles from './Navbar.module.css';

const SECTIONS = [
  { href: '#about', label: 'About' },
  { href: '#news', label: 'News' },
  { href: '#education', label: 'Education' },
  { href: '#publications', label: 'Publications' },
  { href: '#experience', label: 'Experience' },
  { href: '#contact', label: 'Contact' },
];

export default function Navbar({ active = null, transparent = false }) {
  const [scrolled, setScrolled] = useState(false);

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
              {section.label}
            </Link>
          ))}
          <Link
            href="/out-of-work"
            className={`${styles.navLink} ${styles.navExternal} ${active === 'out-of-work' ? styles.active : ''}`}
          >
            Out Of Work
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}
