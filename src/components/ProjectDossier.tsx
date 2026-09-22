import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "../lib/motion";
import type { Project } from "../lib/content";
import styles from "./ProjectDossier.module.css";

interface Props {
  project: Project;
}

/**
 * The full write-up for one project, opened from its card.
 *
 * The page is read as a climb, and several paragraphs of prose sitting in the
 * scroll path is a wall across it: a reader who only wants to know what the
 * thing is has to wade through how it was built to reach the next section.
 * Lifting the write-up into a dialog lets them step off the trail, read, and
 * step back on with the scroll position exactly where they left it.
 *
 * Built on a native <dialog> opened with showModal(), as the contents sheet
 * is, which brings the focus trap, the Escape handling, the inert background
 * and the return of focus to the trigger with it.
 *
 * The dialog is portalled to the body because the trigger sits inside a
 * `data-reveal` container, and a reveal carries `opacity: 0` and a
 * `will-change: transform` until it has played. An element in the top layer is
 * meant to ignore both, but a will-change containing block is exactly the kind
 * of thing engines disagree about; rendering outside that subtree puts the
 * question beyond reach.
 */
export default function ProjectDossier({ project }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `${project.id}-entry-title`;

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
      if (dialog.open) lockScroll(false);
    };
  }, []);

  const show = () => {
    dialogRef.current?.showModal();
    lockScroll(true);
    setOpen(true);
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
        Read the full entry
      </button>

      {createPortal(
        /* Lenis, once stopped, answers every wheel event with preventDefault,
           including the ones aimed at this panel. The attribute is its own
           escape hatch: it bows out of anything that starts inside, so the
           prose scrolls natively while the page behind stays held by the
           lock. */
        <dialog
          ref={dialogRef}
          className={styles.dossier}
          aria-labelledby={titleId}
          data-lenis-prevent
          onClick={onBackdrop}
        >
          <div className={styles.inner}>
            {/* Pinned, so the entry names itself however far down the reader
                has scrolled. */}
            <header className={styles.head}>
              <div className={styles.headLine}>
                <h3 id={titleId} className={`display ${styles.name}`}>
                  {project.name}
                </h3>
                <span className={`num ${styles.year}`}>{project.year}</span>
              </div>
              <p className={`mark ${styles.tagline}`}>{project.tagline}</p>
            </header>

            <div className={styles.scroll}>
              <div className={styles.body}>
                {project.overview.map((para, i) => (
                  <p key={i} className={styles.para}>
                    {para}
                  </p>
                ))}
              </div>
            </div>

            <footer className={styles.foot}>
              <div className={styles.links}>
                {project.links.site && (
                  <a
                    className={styles.link}
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
                    className={styles.link}
                    href={project.links.github}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Source</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={() => dialogRef.current?.close()}
              >
                Close
              </button>
            </footer>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
