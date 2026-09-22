import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion, scrollToSection } from "../lib/motion";
import type { SiteContent } from "../lib/content";
import styles from "./Hero.module.css";

interface Props {
  content: SiteContent;
  ready: boolean;
  nextId: string;
}

export default function Hero({ content, ready, nextId }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const { firstName, lastName, role, tagline } = content.meta;

  useEffect(() => {
    if (!ready || !rootRef.current) return;

    if (prefersReducedMotion()) {
      gsap.set(rootRef.current.querySelectorAll("[data-hero]"), {
        opacity: 1,
        yPercent: 0,
      });
      gsap.set(rootRef.current.querySelectorAll(`.${styles.rule}`), {
        scaleX: 1,
      });
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.to(`.${styles.eyebrow}`, { opacity: 1, duration: 0.8 }, 0)
        .from(
          `.${styles.nameLine} span`,
          { yPercent: 112, duration: 1.15, stagger: 0.08 },
          0.05,
        )
        .from(`.${styles.rule}`, { scaleX: 0, duration: 1.2 }, 0.5)
        .to(`.${styles.tagline}`, { opacity: 1, duration: 1 }, 0.62)
        .from(`.${styles.tagline}`, { y: 18, duration: 1 }, 0.62)
        .to(`.${styles.scrollCue}`, { opacity: 1, duration: 0.8 }, 0.8);
    }, rootRef);

    return () => ctx.revert();
  }, [ready]);

  return (
    <section ref={rootRef} id="origin" className={styles.hero}>
      <div className={`shell ${styles.inner}`}>
        <p className={`mark ${styles.eyebrow}`} data-hero>
          {role}
        </p>

        <h1 className={`display ${styles.name}`}>
          <span className={styles.nameLine}>
            <span>{firstName}</span>
          </span>
          <span className={styles.nameLine}>
            <span>{lastName}</span>
          </span>
        </h1>

        <span className={styles.rule} aria-hidden="true">
          <span className={styles.ruleLine} />
          <span className={styles.lozenge} />
          <span className={styles.ruleLine} />
        </span>

        <p className={styles.tagline} data-hero>
          {tagline}
        </p>
      </div>

      <div className={`shell ${styles.foot}`}>
        <button
          type="button"
          className={styles.scrollCue}
          data-hero
          onClick={() => scrollToSection(nextId)}
        >
          <span className="mark">Scroll</span>
          <span className={styles.cueTrack} aria-hidden="true">
            <span className={styles.cueDot} />
          </span>
        </button>
      </div>
    </section>
  );
}
