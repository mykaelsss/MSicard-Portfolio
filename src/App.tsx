import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadContent,
  fallbackContent,
  type SiteContent,
} from "./lib/content";
import {
  initSmoothScroll,
  lockScroll,
  ScrollTrigger,
  watchSystemMotionPref,
} from "./lib/motion";
import { useScrollProgress } from "./hooks/useScrollProgress";
import { useMotionPref } from "./hooks/useMotionPref";

import Atmosphere from "./components/Atmosphere";
import Preloader from "./components/Preloader";
import Hud, { type SectionMark } from "./components/Hud";
import Hero from "./components/Hero";
import Approach from "./components/Approach";
import Experience from "./components/Experience";
import Projects from "./components/Projects";
import Toolkit from "./components/Toolkit";
import Credentials from "./components/Credentials";
import Summit from "./components/Summit";
import Footer from "./components/Footer";

const SECTIONS: SectionMark[] = [
  { id: "origin", label: "Origin" },
  { id: "approach", label: "Approach" },
  { id: "field-work", label: "Field work" },
  { id: "builds", label: "Builds" },
  { id: "toolkit", label: "The kit" },
  { id: "credentials", label: "Record" },
  { id: "summit", label: "Summit" },
];

export default function App() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [ready, setReady] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress();
  const motion = useMotionPref();

  /*
   * The bundled copy is not a fallback of last resort, it is what the first
   * frame is built from. `content.json` is compiled into the bundle, so the
   * page has every word it needs the moment the script runs; waiting for
   * /api/content before rendering anything put a network round trip in front
   * of the largest paint to fetch, in the normal case, a byte-identical
   * document. The live copy swaps in when it lands.
   */
  const data = content ?? fallbackContent;

  /* Track the operating system setting for as long as the reader has not
     overridden it with the in-page control. */
  useEffect(watchSystemMotionPref, []);

  /* Live content from R2, with the bundled copy as a floor. */
  useEffect(() => {
    const controller = new AbortController();
    loadContent(controller.signal).then(setContent);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    initSmoothScroll();
  }, []);

  /*
   * The lock is derived from `ready` rather than set imperatively on mount.
   * Child effects run before parent effects, so when the preloader finishes
   * synchronously - which is exactly what it does in reduced motion - its
   * unlock ran first and App's mount effect then re-locked the page, leaving
   * it unscrollable for the readers least able to work around it.
   */
  useEffect(() => {
    lockScroll(!ready);
    return () => lockScroll(false);
  }, [ready]);

  useEffect(() => {
    document.title = data.meta.seo.title;
  }, [data]);

  const handleLoaded = useCallback(() => setReady(true), []);

  /* Reveals are wired once the curtain is up and the real content is in the
     DOM, so SplitText measures against final type and final copy. */
  useEffect(() => {
    if (!ready || !mainRef.current) return;
    const root = mainRef.current;
    let dispose = () => {};
    let cancelled = false;

    /* SplitText is only ever needed here, and here is already past the first
       paint, so the plugin is fetched rather than bundled into the script the
       page is blocked on. */
    document.fonts.ready
      .then(() => import("./lib/reveal"))
      .then(({ initReveals }) => {
        if (cancelled) return;
        dispose = initReveals(root);
        ScrollTrigger.refresh();
      });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [ready, data, motion]);

  return (
    <>
      <a className="skip-link" href="#approach">
        Skip to content
      </a>

      <Atmosphere scroll={progress} />
      <Hud content={data} sections={SECTIONS} progress={progress} ready={ready} />

      {!ready && (
        <Preloader
          name={fallbackContent.meta.name}
          role={fallbackContent.meta.role}
          onComplete={handleLoaded}
        />
      )}

      <main ref={mainRef}>
        <Hero content={data} ready={ready} nextId="approach" />
        <Approach content={data} />
        <Experience content={data} />
        <Projects content={data} />
        <Toolkit content={data} />
        <Credentials content={data} />
        <Summit content={data} />
        <Footer content={data} />
      </main>
    </>
  );
}
