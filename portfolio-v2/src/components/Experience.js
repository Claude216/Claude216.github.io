import styles from './Experience.module.css';
import experienceData from '@/data/experience.json';

export default function Experience() {
  return (
    <section id="experience" className="section">
      <div className="container">
        <h2 className="section-title">Experience</h2>
        <hr className="section-rule" />
        <div className={styles.experienceList}>
          {experienceData.map((exp) => (
            <div key={exp.id} className={styles.experienceItem}>
              <span className={styles.experienceTitle}>{exp.title}</span>
              <span className={styles.experienceOrg}>{exp.company}</span>
              <span className={styles.experiencePeriod}>{exp.period}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
