import Image from 'next/image';
import styles from './Education.module.css';
import educationData from '@/data/education.json';

export default function Education() {
  return (
    <section id="education" className="section">
      <div className="container">
        <h2 className="section-title">Education</h2>
        <hr className="section-rule" />
        <div className={styles.timeline}>
          {educationData.map((edu, index) => (
            <div key={edu.id} className={`${styles.timelineItem} ${index % 2 === 0 ? styles.left : styles.right}`}>
              <div className={styles.timelineContent}>
                <div className={styles.timelineDate}>{edu.period}</div>
                <div className={styles.timelineBody}>
                  <p>
                    {edu.degree}<br />
                    {edu.school}
                  </p>
                  <a href={edu.website} target="_blank" rel="noopener noreferrer" className={styles.logoLink}>
                    <Image
                      src={edu.logo}
                      alt={`${edu.school} Logo`}
                      width={40}
                      height={40}
                      style={{ height: '40px', width: 'auto', borderRadius: '4px' }}
                    />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
