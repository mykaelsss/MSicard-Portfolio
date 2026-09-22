import Section from "./Section";
import ProjectDossier from "./ProjectDossier";
import { normalizeProject, type SiteContent } from "../lib/content";
import styles from "./Projects.module.css";

interface Props {
  content: SiteContent;
}

/**
 * One card per project: what it is in a sentence, what it is made of, and the
 * three ways on from there. The write-up itself lives in the dossier, so a
 * reader passing through gets the whole section in a glance and a reader who
 * stops gets all of it.
 */
export default function Projects({ content }: Props) {
  const projects = content.projects.map(normalizeProject);

  return (
    <Section
      id="builds"
      title="Things built"
      kicker="Shipped and running in the open"
    >
      <div className={styles.list}>
        {projects.map((project) => (
          <article key={project.id} className={styles.project}>
            <header className={styles.head}>
              <div className={styles.titleGroup}>
                <h3 className={`display ${styles.name}`} data-reveal="lines">
                  {project.name}
                </h3>
                <p className={`mark ${styles.tagline}`} data-reveal="up">
                  {project.tagline}
                </p>
              </div>
              <span className={`num ${styles.year}`} aria-hidden="true">
                {project.year}
              </span>
            </header>

            <p className={`prose ${styles.summary}`} data-reveal="lines">
              {project.summary}
            </p>

            <ul className={styles.stack} data-reveal="stagger">
              {project.stack.map((tech) => (
                <li key={tech}>{tech}</li>
              ))}
            </ul>

            <div className={styles.actions} data-reveal="up">
              <ProjectDossier project={project} />
              {project.links.site && (
                <a
                  className={styles.cta}
                  href={project.links.site}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Live site</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {project.links.github && (
                <a
                  className={styles.cta}
                  href={project.links.github}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Source</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
