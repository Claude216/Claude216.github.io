import styles from './Footer.module.css';

/* Matches the static site's footer: year on the left, last-updated on the right. */
const LAST_UPDATED = '07/02/2026';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>© {year} Lunxiao (Claude) Li</span>
        <span>Last updated: {LAST_UPDATED}</span>
      </div>
    </footer>
  );
}
