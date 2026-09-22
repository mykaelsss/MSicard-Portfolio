import Section from "./Section";
import type { SiteContent } from "../lib/content";
import styles from "./Credentials.module.css";

interface Props {
  content: SiteContent;
}

export default function Credentials({ content }: Props) {
  return (
    <Section id="credentials" title="On the record">
      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={`mark ${styles.columnHead}`}>Education</h3>
          <ul className={styles.list} data-reveal="stagger">
            {content.education.map((entry) => (
              <li key={entry.id} className={styles.entry}>
                <p className={styles.primary}>{entry.credential}</p>
                <p className={styles.secondary}>
                  {entry.school}
                  {entry.location && (
                    <span className={styles.loc}>{entry.location}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.column}>
          <h3 className={`mark ${styles.columnHead}`}>Certifications</h3>
          <ul className={styles.list} data-reveal="stagger">
            {content.certifications.map((cert) => (
              <li key={cert.id} className={styles.entry}>
                <p className={styles.primary}>
                  {cert.name}
                  <span className={`num ${styles.code}`}>{cert.code}</span>
                </p>
                <p className={styles.secondary}>
                  {cert.issuer}
                  <span className={styles.loc}>{cert.date}</span>
                </p>
                {cert.verify && (
                  <a
                    className={styles.verify}
                    href={cert.verify}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify <span aria-hidden="true">↗</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
