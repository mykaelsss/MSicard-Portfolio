import { gsap, ScrollTrigger, prefersReducedMotion } from "./motion";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

/**
 * Scroll reveals, driven by `data-reveal` attributes so section components
 * stay declarative and free of animation wiring.
 *
 *   data-reveal="lines"    line-by-line mask reveal
 *   data-reveal="up"       fade and rise (default)
 *   data-reveal="stagger"  direct children rise in sequence
 *   data-reveal-delay="n"  seconds of additional delay
 *
 * Travel distance is what provokes motion sickness, not fading, so `up` and
 * `stagger` rise by a few pixels rather than a few dozen. `lines` is reserved
 * for short headings: a masked line reveal has to travel a full line height to
 * work at all, and running that down a whole paragraph is the single most
 * nauseating thing a page like this can do.
 */
export function initReveals(scope: HTMLElement): () => void {
  if (prefersReducedMotion()) {
    /* Two calls, deliberately: gsap applies `clearProps` last within a single
       set(), which would wipe the opacity set alongside it and leave every
       revealed element stuck at the stylesheet's opacity: 0. */
    const targets = scope.querySelectorAll("[data-reveal]");
    gsap.set(targets, { clearProps: "all" });
    gsap.set(targets, { opacity: 1, y: 0, yPercent: 0 });
    return () => {};
  }

  const splits: SplitText[] = [];
  const ctx = gsap.context(() => {
    const start = "top 85%";

    for (const el of scope.querySelectorAll<HTMLElement>('[data-reveal="lines"]')) {
      const split = SplitText.create(el, {
        type: "lines",
        mask: "lines",
        linesClass: "reveal-line",
      });
      splits.push(split);
      gsap.set(el, { opacity: 1 });
      gsap.from(split.lines, {
        yPercent: 118,
        duration: 0.9,
        ease: "expo.out",
        stagger: 0.06,
        delay: Number(el.dataset.revealDelay ?? 0),
        scrollTrigger: { trigger: el, start },
      });
    }

    for (const el of scope.querySelectorAll<HTMLElement>('[data-reveal="stagger"]')) {
      gsap.set(el, { opacity: 1 });
      gsap.from(Array.from(el.children), {
        y: 14,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.06,
        delay: Number(el.dataset.revealDelay ?? 0),
        scrollTrigger: { trigger: el, start },
      });
    }

    for (const el of scope.querySelectorAll<HTMLElement>('[data-reveal="up"]')) {
      gsap.fromTo(
        el,
        { y: 14, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power3.out",
          delay: Number(el.dataset.revealDelay ?? 0),
          scrollTrigger: { trigger: el, start },
        },
      );
    }
  }, scope);

  ScrollTrigger.refresh();

  return () => {
    for (const split of splits) split.revert();
    ctx.revert();
  };
}
