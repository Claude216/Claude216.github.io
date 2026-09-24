import styles from './Contact.module.css';
import profileData from '@/data/profile.json';

const ICONS = {
  mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  github:
    'M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z',
  linkedin:
    'M20.4 3H3.6C3.3 3 3 3.3 3 3.6v16.8c0 .3.3.6.6.6h16.8c.3 0 .6-.3.6-.6V3.6c0-.3-.3-.6-.6-.6zM8.3 18.4H5.7V9.7h2.7v8.7zM7 8.5c-.9 0-1.6-.7-1.6-1.6S6.1 5.4 7 5.4s1.6.7 1.6 1.6S7.9 8.5 7 8.5zm11.4 9.9h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3H10V9.7h2.6v1.2c.4-.7 1.2-1.4 2.5-1.4 2.7 0 3.2 1.8 3.2 4.1v4.8z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
};

export default function Contact() {
  return (
    <section id="contact" className={`section section-alt ${styles.contactSection}`}>
      <div className="container">
        <h2 className="section-title">Get In Touch</h2>
        <hr className="section-rule" />
        <p className={styles.contactLead}>{profileData.contactLead}</p>
        <div className={styles.contactLinks}>
          <a href={`mailto:${profileData.email.academic}`}>
            <svg viewBox="0 0 24 24"><path d={ICONS.mail} /></svg>
            {profileData.email.academic} (academic)
          </a>
          <a href={`mailto:${profileData.email.personal}`}>
            <svg viewBox="0 0 24 24"><path d={ICONS.mail} /></svg>
            {profileData.email.personal} (personal)
          </a>
          <a href={profileData.linkedin} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24"><path d={ICONS.linkedin} /></svg>
            LinkedIn
          </a>
          <a href={profileData.github} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24"><path d={ICONS.github} /></svg>
            GitHub
          </a>
          <a href={profileData.cv} download>
            <svg viewBox="0 0 24 24"><path d={ICONS.download} /></svg>
            Download CV
          </a>
        </div>
      </div>
    </section>
  );
}
