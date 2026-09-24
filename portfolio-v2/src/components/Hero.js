'use client';

import { useEffect, useState } from 'react';
import styles from './Hero.module.css';
import profileData from '@/data/profile.json';

const ICONS = {
  mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  github:
    'M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z',
  linkedin:
    'M20.4 3H3.6C3.3 3 3 3.3 3 3.6v16.8c0 .3.3.6.6.6h16.8c.3 0 .6-.3.6-.6V3.6c0-.3-.3-.6-.6-.6zM8.3 18.4H5.7V9.7h2.7v8.7zM7 8.5c-.9 0-1.6-.7-1.6-1.6S6.1 5.4 7 5.4s1.6.7 1.6 1.6S7.9 8.5 7 8.5zm11.4 9.9h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3H10V9.7h2.6v1.2c.4-.7 1.2-1.4 2.5-1.4 2.7 0 3.2 1.8 3.2 4.1v4.8z',
  chevron: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4z',
};

function Tagline({ text }) {
  // Start with the full text so it is present in the prerendered HTML (and to
  // screen readers). The effect only schedules the typewriter; reduced motion
  // completes it on the first tick instead of typing.
  const [shown, setShown] = useState(text);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let index = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const id = window.setInterval(() => {
      index = reduced ? text.length : index + 1;
      setShown(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(id);
        setDone(true);
      }
    }, 45);

    return () => window.clearInterval(id);
  }, [text]);

  return (
    <p className={styles.tagline}>
      <span>{shown}</span>
      {!done && <span className={styles.cursor}>&nbsp;</span>}
    </p>
  );
}

export default function Hero() {
  return (
    <>
      <header className={styles.hero} id="home">
        <h1>{profileData.name}</h1>
        <Tagline text={profileData.tagline} />

        <div className={styles.heroIcons}>
          <a href={`mailto:${profileData.email.academic}`} aria-label="Email" title="Email">
            <svg viewBox="0 0 24 24"><path d={ICONS.mail} /></svg>
          </a>
          <a href={profileData.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
            <svg viewBox="0 0 24 24"><path d={ICONS.github} /></svg>
          </a>
          <a href={profileData.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">
            <svg viewBox="0 0 24 24"><path d={ICONS.linkedin} /></svg>
          </a>
          <a href={profileData.cv} className={styles.cvBadge} aria-label="Curriculum Vitae" title="Curriculum Vitae" download>
            CV
          </a>
        </div>

        <a href="#about" className={styles.scrollHint} aria-label="Scroll down">
          <svg viewBox="0 0 24 24"><path d={ICONS.chevron} /></svg>
        </a>
      </header>

      <section id="about" className="section">
        <div className="container">
          <h2 className="section-title">About Me</h2>
          <hr className="section-rule" />
          <div className={styles.aboutContainer}>
            <div className={styles.profilePic}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/lunxiaoli.jpg" alt="Portrait of Lunxiao (Claude) Li" />
            </div>
            <div className={styles.aboutContent}>
              <h3>{profileData.name}</h3>
              <p><strong>{profileData.title}</strong></p>
              {profileData.about.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
              <p>
                {profileData.keywords.map((keyword) => (
                  <span className="keyword-tag" key={keyword}>{keyword}</span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="news" className="section section-alt">
        <div className="container">
          <h2 className="section-title">News</h2>
          <hr className="section-rule" />
          <ul className={styles.newsList}>
            {profileData.news.map((item) => (
              <li key={item.date + item.content}>
                <span className={styles.newsDate}>{item.date}</span>
                <span>{item.content}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
