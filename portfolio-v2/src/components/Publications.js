import styles from './Publications.module.css';
import publicationsData from '@/data/publications.json';

const LINK_LABELS = { pdf: 'PDF', doi: 'DOI', code: 'Code', slides: 'Slides' };

export default function Publications() {
  return (
    <section id="publications" className="section section-alt">
      <div className="container">
        <h2 className="section-title">Publications</h2>
        <hr className="section-rule" />
        {publicationsData.map((pub) => {
          const links = Object.entries(pub.links || {}).filter(([, href]) => href);

          // Placeholder entries (no authors/venue yet) render as a plain note,
          // matching the static site's "One paper incoming" card.
          if (!pub.authors && !pub.venue) {
            return (
              <div className={styles.publication} key={pub.id}>
                {pub.title}
              </div>
            );
          }

          return (
            <div className={styles.publication} key={pub.id}>
              {pub.year && <div className={styles.publicationYear}>{pub.year}</div>}
              <div className={styles.publicationTitle}>{pub.title}</div>
              {pub.authors && <div className={styles.publicationAuthors}>{pub.authors}</div>}
              {pub.venue && <div className={styles.publicationVenue}>{pub.venue}</div>}
              {links.length > 0 && (
                <div className={styles.publicationLinks}>
                  {links.map(([key, href]) => (
                    <a key={key} href={href}>{`[${LINK_LABELS[key] || key}]`}</a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
