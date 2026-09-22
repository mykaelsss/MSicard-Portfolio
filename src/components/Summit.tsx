import Section from "./Section";
import ContactForm from "./ContactForm";
import {
  RESUME_DOWNLOAD_URL,
  RESUME_VIEW_URL,
  type SiteContent,
} from "../lib/content";
import styles from "./Summit.module.css";

interface Props {
  content: SiteContent;
}

export default function Summit({ content }: Props) {
  const email = content.links.find((link) => link.id === "email");

  return (
    <Section id="summit" title={content.contact.heading} bare>
      <div className={styles.body}>
        <p className={styles.invitation} data-reveal="up">
          {content.contact.invitation}
        </p>

        <ContactForm email={email?.value} />

        {email && (
          <a className={styles.email} href={email.href} data-reveal="up">
            <span className={styles.emailText}>{email.value}</span>
            <span className={styles.emailRule} aria-hidden="true" />
          </a>
        )}

        <p className={`mark ${styles.note}`} data-reveal="up">
          {content.contact.note}
        </p>

        <div className={styles.actions} data-reveal="stagger">
          <a
            className={`${styles.action} ${styles.primary}`}
            href={RESUME_VIEW_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span>Read the resume</span>
          </a>
          <a className={styles.action} href={RESUME_DOWNLOAD_URL}>
            <span>Download the PDF</span>
          </a>
        </div>

        <ul className={styles.links} data-reveal="stagger">
          {content.links
            .filter((link) => link.id !== "email")
            .map((link) => (
              <li key={link.id}>
                <a
                  className={styles.link}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="mark">{link.label}</span>
                  <span className={styles.linkValue}>{link.value}</span>
                </a>
              </li>
            ))}
        </ul>
      </div>
    </Section>
  );
}
