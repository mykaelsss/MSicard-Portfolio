import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Section from "./Section";
import { gsap, ScrollTrigger } from "../lib/motion";
import { useMotionPref } from "../hooks/useMotionPref";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { SiteContent } from "../lib/content";
import styles from "./Experience.module.css";

/*
 * The width at which the tab strip stands up into a column beside the panel.
 * Set where a column of company names stops being cramped rather than at a
 * device size; below it the strip lies flat above the panel and gives each
 * name the full width to itself. Kept in step with the `.tabs` media query in
 * Experience.module.css: the orientation has to be reported to assistive
 * technology and decides which arrow keys move between tabs, so the
 * breakpoint cannot live in the stylesheet alone.
 */
const VERTICAL = "(min-width: 1000px)";

interface Props {
  content: SiteContent;
}

export default function Experience({ content }: Props) {
  const roles = content.experience;
  const motion = useMotionPref();
  const vertical = useMediaQuery(VERTICAL);

  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const index = Math.min(active, Math.max(roles.length - 1, 0));
  const role = roles[index];

  /*
   * The gilt marker on the track is positioned from the active tab's own box
   * rather than from an nth-child calculation, because the tabs are sized by
   * their labels and a stack of company names is never evenly divided. Both
   * axes are published every time; the stylesheet picks the pair that matches
   * the orientation it is currently drawing, so no measurement here has to
   * know about the breakpoint.
   */
  const placeMarker = useCallback(() => {
    const rail = railRef.current;
    const list = tablistRef.current;
    const tab = tabRefs.current[index];
    if (!rail || !list || !tab) return;
    /* The track is painted on the rail rather than inside the strip, so once
       there are more names than fit the marker has to be pulled back by
       however far the strip has been scrolled. `offsetLeft` is layout, not
       viewport, and does not account for that on its own. */
    rail.style.setProperty("--mark-top", `${tab.offsetTop}px`);
    rail.style.setProperty("--mark-height", `${tab.offsetHeight}px`);
    rail.style.setProperty("--mark-left", `${tab.offsetLeft - list.scrollLeft}px`);
    rail.style.setProperty("--mark-width", `${tab.offsetWidth}px`);
  }, [index]);

  useLayoutEffect(placeMarker, [placeMarker, vertical]);

  /* Selecting a name that has been scrolled off the end of the strip brings it
     back into view, moving the strip alone rather than the page: handing this
     to scrollIntoView would let it walk up the ancestors and fight the smooth
     scroll for the document. */
  useLayoutEffect(() => {
    const list = tablistRef.current;
    const tab = tabRefs.current[index];
    if (!list || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < list.scrollLeft) list.scrollLeft = start;
    else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = end - list.clientWidth;
    }
  }, [index, vertical]);

  /* Labels reflow on resize and again when the display face lands, and either
     one moves the tab the marker is tracking. */
  useEffect(() => {
    const list = tablistRef.current;
    if (!list) return;
    const observer = new ResizeObserver(placeMarker);
    observer.observe(list);
    for (const tab of tabRefs.current) if (tab) observer.observe(tab);
    list.addEventListener("scroll", placeMarker, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", placeMarker);
    };
  }, [placeMarker, roles.length]);

  /*
   * Swapping panels changes the height of the document, so the scroll-driven
   * instruments have to be remeasured. The entrance is run here rather than
   * through `data-reveal` because only the selected panel is in the DOM: the
   * reveal pass is wired once, at load, and would never see the others.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    if (motion === "reduced") {
      gsap.set(panel, { clearProps: "all" });
      ScrollTrigger.refresh();
      return;
    }

    const ctx = gsap.context(() => {
      gsap
        .timeline({ onComplete: () => ScrollTrigger.refresh() })
        .fromTo(
          panel,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
        )
        .from(
          panel.querySelectorAll(`.${styles.bullet}`),
          { opacity: 0, y: 10, duration: 0.5, ease: "power3.out", stagger: 0.05 },
          0.08,
        );
    }, panel);

    return () => ctx.revert();
  }, [index, motion]);

  /* Arrow keys move between tabs and select as they go. Both axes are
     accepted whichever way the strip is drawn, so the keys a reader reaches
     for first always work. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = roles.length - 1;
    let next = index;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  if (!role) return null;

  return (
    <Section
      id="field-work"
      title="Field work"
      kicker="Production systems, owned end to end"
    >
      <div className={styles.tabs}>
        <div ref={railRef} className={styles.rail} data-reveal="up">
          <span className={styles.track} aria-hidden="true">
            <span className={styles.marker} />
          </span>

          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Employers"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            className={styles.tablist}
            onKeyDown={handleKeyDown}
          >
            {roles.map((entry, i) => (
              <button
                key={entry.id}
                ref={(node) => {
                  tabRefs.current[i] = node;
                }}
                type="button"
                role="tab"
                id={`field-work-tab-${entry.id}`}
                aria-selected={i === index}
                aria-controls={`field-work-panel-${entry.id}`}
                tabIndex={i === index ? 0 : -1}
                className={styles.tab}
                onClick={() => setActive(i)}
              >
                {entry.org}
              </button>
            ))}
          </div>
        </div>

        <div
          key={role.id}
          ref={panelRef}
          role="tabpanel"
          id={`field-work-panel-${role.id}`}
          aria-labelledby={`field-work-tab-${role.id}`}
          tabIndex={0}
          className={styles.panel}
        >
          <div className={styles.meta}>
            <p className={`mark ${styles.period}`}>{role.period}</p>
            {role.current && <p className={`mark ${styles.current}`}>Current</p>}
          </div>

          <h3 className={`display ${styles.role}`}>{role.role}</h3>

          <p className={styles.org}>
            <span className={styles.orgName}>{role.org}</span>
            {role.orgNote && (
              <span className={styles.orgNote}>({role.orgNote})</span>
            )}
            {role.location && (
              <span className={styles.orgLoc}>{role.location}</span>
            )}
          </p>

          <ul className={styles.bullets}>
            {role.bullets.map((bullet, i) => (
              <li key={i} className={styles.bullet}>
                <span className={styles.bulletMark} aria-hidden="true" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
