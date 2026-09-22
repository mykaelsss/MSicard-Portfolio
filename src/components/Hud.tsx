import { useEffect, useRef, useState, type RefObject } from "react";
import { scrollToSection, setMotionPref } from "../lib/motion";
import { useMotionPref } from "../hooks/useMotionPref";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Contents from "./Contents";
import LinkIcon from "./LinkIcon";
import type { ScrollState } from "../hooks/useScrollProgress";
import type { SiteContent } from "../lib/content";
import styles from "./Hud.module.css";

export interface SectionMark {
  id: string;
  label: string;
}

/** Trailhead to summit, in feet. Purely an instrument reading for the climb. */
const SUMMIT_FT = 14400;

/*
 * The width at which the section rail disappears, and so the width below
 * which the contents sheet is the only way between sections. Kept in step
 * with the `.rail` media query in Hud.module.css and the reserved lane in
 * global.css. The rail carries its labels rather than revealing them on
 * hover, so it needs a real column of its own; below this there is not room
 * for one beside the text.
 */
const NO_RAIL = "(max-width: 1100px)";

function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

interface Props {
  content: SiteContent;
  sections: SectionMark[];
  progress: RefObject<ScrollState>;
  ready: boolean;
}

export default function Hud({ content, sections, progress, ready }: Props) {
  const { location, status } = content.meta;
  const motion = useMotionPref();
  const noRail = useMediaQuery(NO_RAIL);
  const [clock, setClock] = useState("--:--:--");
  const elevationRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);

  /* Local time where he actually is, not where the visitor is. */
  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("en-US", {
          timeZone: location.timezone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [location.timezone]);

  /* Elevation and the progress bar update per frame, outside React. */
  useEffect(() => {
    let raf = 0;
    let lastShown = -1;
    const run = () => {
      raf = requestAnimationFrame(run);
      const p = progress.current.p;
      const feet = Math.round((p * SUMMIT_FT) / 10) * 10;
      if (feet !== lastShown && elevationRef.current) {
        elevationRef.current.textContent = feet.toLocaleString("en-US");
        lastShown = feet;
      }
      if (barRef.current) barRef.current.style.transform = `scaleY(${p})`;
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [progress]);

  /* Which section is on screen drives the rail. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = sections.findIndex((s) => s.id === entry.target.id);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    /* `content` is a dependency because the section elements only exist once
       the live content has rendered; observing on mount alone finds nothing. */
  }, [sections, content]);

  return (
    <div className={`${styles.hud} ${ready ? styles.ready : ""}`}>
      <div className={`${styles.bar} ${styles.top}`}>
        <div className={styles.cluster}>
          <span className={styles.mark} aria-hidden="true">
            MS
          </span>
          <span className={styles.divider} aria-hidden="true" />
          <span className="mark">{formatCoords(location.lat, location.lon)}</span>
          <span className={`mark ${styles.hideSm}`}>
            {location.city}, {location.region}
          </span>
        </div>

        <div className={styles.cluster}>
          <span className={`mark num ${styles.hideSm}`}>{clock}</span>
          {status.available && (
            <span className={styles.status}>
              <span className={styles.dot} aria-hidden="true" />
              <span className="mark">{status.label}</span>
            </span>
          )}

          {/*
            Reachable from any scroll position, and part of the bezel rather
            than of a section, which is the point: in the hero these sat over
            the canvas with nothing holding them down.

            Gated on the same width as the rail, which is the width at
            which the contents sheet appears and carries the same three
            links spelled out. Above it the bar is the only place they
            exist; below it the sheet is, and they are never doubled.
          */}
          {!noRail && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <ul className={styles.links}>
                {content.links.map((link) => (
                  <li key={link.id}>
                    <a
                      className={styles.link}
                      href={link.href}
                      target={
                        link.href.startsWith("mailto:") ? undefined : "_blank"
                      }
                      rel="noreferrer"
                      title={link.value}
                    >
                      <LinkIcon id={link.id} className={styles.linkIcon} />
                      <span className="sr-only">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <nav className={styles.rail} aria-label="Sections">
        <span className={styles.railTrack} aria-hidden="true">
          <span ref={barRef} className={styles.railFill} />
        </span>
        <ul className={styles.railList}>
          {sections.map((section, i) => (
            <li key={section.id}>
              <button
                type="button"
                className={`${styles.railItem} ${i === active ? styles.railActive : ""}`}
                onClick={() => scrollToSection(section.id)}
                aria-current={i === active ? "true" : undefined}
              >
                <span className={styles.railTick} aria-hidden="true" />
                <span className={styles.railLabel}>{section.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className={`${styles.bar} ${styles.bottom}`}>
        <span className={styles.elevation}>
          <span className="mark">Elevation</span>
          <span ref={elevationRef} className={`num ${styles.elevationValue}`}>
            0
          </span>
          <span className="mark">ft</span>
        </span>
        <div className={styles.cluster}>
          {/*
            A visible control, not just a media query. Most readers who are
            made ill by page motion have never heard of the operating system
            setting, so the page has to offer the choice itself.
          */}
          <button
            type="button"
            className={styles.motionToggle}
            aria-pressed={motion === "reduced"}
            onClick={() =>
              setMotionPref(motion === "reduced" ? "full" : "reduced")
            }
          >
            <span className={styles.motionMark} aria-hidden="true" />
            Reduce motion
          </button>

          {/* Only where the rail is gone: with the rail up, this would be a
              second way to do the same thing, two inches from the first. */}
          {noRail && (
            <Contents
              sections={sections}
              active={active}
              links={content.links}
            />
          )}
        </div>
      </div>
    </div>
  );
}
