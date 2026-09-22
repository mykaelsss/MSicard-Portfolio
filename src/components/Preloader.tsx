import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";
import styles from "./Preloader.module.css";

interface Props {
  name: string;
  role: string;
  /** Fired once the curtain has cleared and the hero may animate in. */
  onComplete: () => void;
}

const MIN_DURATION = 1.5;

export default function Preloader({ name, role, onComplete }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onComplete();
    };

    if (prefersReducedMotion()) {
      gsap.set(rootRef.current, { autoAlpha: 0 });
      finish();
      return;
    }

    const counter = { value: 0 };
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: finish });

      tl.from(`.${styles.meta} > *`, {
        yPercent: 110,
        duration: 0.8,
        stagger: 0.08,
        ease: "power3.out",
      })
        .to(
          counter,
          {
            value: 100,
            duration: MIN_DURATION,
            ease: "power2.inOut",
            onUpdate: () => {
              if (countRef.current) {
                countRef.current.textContent = String(
                  Math.round(counter.value),
                ).padStart(3, "0");
              }
            },
          },
          0,
        )
        .to(
          lineRef.current,
          { scaleX: 1, duration: MIN_DURATION, ease: "power2.inOut" },
          0,
        )
        .to(`.${styles.meta} > *`, {
          yPercent: -110,
          duration: 0.55,
          stagger: 0.05,
          ease: "power3.in",
        })
        .to(lineRef.current, { opacity: 0, duration: 0.3 }, "<")
        /* The curtain lifts rather than fades, so the hero feels revealed
           from behind it instead of cross-dissolved. */
        .to(
          rootRef.current,
          {
            yPercent: -100,
            duration: 1.05,
            ease: "expo.inOut",
          },
          "-=0.15",
        )
        .set(rootRef.current, { autoAlpha: 0 });
    }, rootRef);

    return () => ctx.revert();
  }, [onComplete]);

  return (
    <div ref={rootRef} className={styles.root} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className={styles.meta}>
        <span className={styles.name}>{name}</span>
        <span className={`mark ${styles.role}`}>{role}</span>
      </div>
      <span ref={countRef} className={`num ${styles.count}`} aria-hidden="true">
        000
      </span>
      <span className={styles.lineTrack} aria-hidden="true">
        <span ref={lineRef} className={styles.line} />
      </span>
    </div>
  );
}
