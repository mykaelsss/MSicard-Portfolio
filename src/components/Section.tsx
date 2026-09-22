import type { ReactNode } from "react";
import styles from "./Section.module.css";

interface Props {
  id: string;
  title: string;
  kicker?: string;
  children: ReactNode;
  /** Lets the summit section sit on the cleared vista instead of on ink. */
  bare?: boolean;
}

export default function Section({
  id,
  title,
  kicker,
  children,
  bare = false,
}: Props) {
  return (
    <section id={id} className={`${styles.section} ${bare ? styles.bare : ""}`}>
      <div className="shell">
        <header className={styles.head}>
          <div className={styles.index} aria-hidden="true">
            <span className={styles.indexRule} />
          </div>
          <div className={styles.headText}>
            <h2 className={`display ${styles.title}`} data-reveal="lines">
              {title}
            </h2>
            {kicker && (
              <p className={`mark ${styles.kicker}`} data-reveal="up">
                {kicker}
              </p>
            )}
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}
