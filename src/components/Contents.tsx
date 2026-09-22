import { useEffect, useRef, useState, type MouseEvent } from "react";
import { lockScroll, scrollToSection } from "../lib/motion";
import type { SectionMark } from "./Hud";
import type { SiteContent } from "../lib/content";
import styles from "./Contents.module.css";

interface Props {
  sections: SectionMark[];
  active: number;
  links: SiteContent["links"];
}

/**
 * The contents sheet: the whole climb in one list, reachable from anywhere.
 *
 * The section rail on the right edge is the way around on a wide screen, but
 * it is hidden below 861px, which left a phone with no way to move between
 * sections at all. This is that way, and it doubles as the "you are here"
 * readout in the bottom bar so it costs no extra chrome. Hud mounts it only
 * below that width, so the two are never both on screen. It carries the
 * contact links for the same reason: they sit in the top bar only while
 * there is room for them there.
 *
 * Built on a native <dialog> opened with showModal(), which brings the focus
 * trap, the Escape handling and the inert background with it.
 */
export default function Contents({ sections, active, links }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const here = sections[active];

  /* `close` fires for every route out - the button, Escape, the backdrop - so
     unlocking here covers all of them. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      lockScroll(false);
      setOpen(false);
    };
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("close", onClose);
      /* Unmounting while open - a rotation up past the rail breakpoint - takes
         the sheet away without firing `close`, and the lock with it. */
      if (dialog.open) lockScroll(false);
    };
  }, []);

  const show = () => {
    dialogRef.current?.showModal();
    lockScroll(true);
    setOpen(true);
  };

  const go = (id: string) => {
    dialogRef.current?.close();
    /* One frame, so the scroll lock is lifted before the jump is asked for. */
    requestAnimationFrame(() => scrollToSection(id));
  };

  /* A modal dialog fills the viewport, so a click that lands on the element
     itself rather than on its contents is a click on the backdrop. */
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <span className={styles.triggerLabel}>{here?.label}</span>
        <span className={styles.triggerMark} aria-hidden="true" />
      </button>

      {/* Lenis, once stopped, answers every wheel event with preventDefault,
          including the ones aimed at this sheet. The attribute is its own
          escape hatch: it bows out of anything that starts inside, so the list
          scrolls natively while the page behind stays held by the lock. */}
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-label="Contents"
        data-lenis-prevent
        onClick={onBackdrop}
      >
        <div className={styles.inner}>
          <p className={`mark ${styles.head}`}>Contents</p>

          <nav className={styles.scroll}>
            <ol className={styles.list}>
              {sections.map((section, i) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${i === active ? styles.itemHere : ""}`}
                    aria-current={i === active ? "true" : undefined}
                    onClick={() => go(section.id)}
                  >
                    <span className={styles.label}>{section.label}</span>
                    {i === active && (
                      <span className={styles.hereMark} aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.id}>
                <a
                  className={styles.link}
                  href={link.href}
                  target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Pinned to the foot of the sheet: the thumb that opened this is
              already down here, and should not have to travel to close it. */}
          <button
            type="button"
            className={styles.close}
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
