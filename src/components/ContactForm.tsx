import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadTurnstile,
  TURNSTILE_SITE_KEY,
  type TurnstileApi,
} from "../lib/turnstile";
import { circuit } from "../lib/circuit";
import styles from "./ContactForm.module.css";

type Field = "name" | "email" | "message" | "captcha";
type Status = "idle" | "sending" | "sent" | "error";

interface Reply {
  ok: boolean;
  error?: string;
  field?: Field;
}

/*
 * The server is the authority on every one of these; the same rules are
 * mirrored here only so a reader is told about a typo before a round trip
 * rather than after one. Nothing is trusted because it passed this.
 */
const NAME_MAX = 80;
const MESSAGE_MIN = 20;
const MESSAGE_MAX = 4000;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/*
 * Every failure the endpoint can name, in a reader's words. A code with no
 * entry - a new one from a newer Worker, say - falls back to the generic
 * line, so an unrecognised reply is never a blank error.
 */
const MESSAGES: Record<string, string> = {
  bad_name: "Please give a name I can address you by.",
  bad_email: "That address does not look complete.",
  bad_message: `Please write at least ${MESSAGE_MIN} characters.`,
  no_captcha: "Please complete the check below.",
  bad_captcha: "The check expired. Please try it again.",
  rate_limited: "That is a few too many in a row. Try again in a minute.",
  not_configured: "The form is not accepting mail right now.",
  send_failed: "The message did not go through.",
  too_large: "That message is too long to send.",
};
const GENERIC = "Something went wrong.";

/*
 * The failures the reader cannot fix by editing a field. Only these get the
 * address offered beside them - holding out an escape hatch when the actual
 * remedy is to write two more sentences just reads as the form giving up.
 */
const OFFER_FALLBACK = new Set([
  "not_configured",
  "send_failed",
  "rate_limited",
  "offline",
  "unknown",
]);

interface Props {
  /** The address offered as the fallback whenever the form cannot deliver. */
  email?: string;
}

export default function ContactForm({ email }: Props) {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [token, setToken] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [badField, setBadField] = useState<Field | null>(null);
  const [captchaDown, setCaptchaDown] = useState(false);

  /* Elapsed, not a timestamp: a duration cannot be wrong because a visitor's
     clock is. Paired with the honeypot in the Worker. Stamped in an effect
     rather than at render, so the clock starts when the form is actually on
     screen and interactive, and so render itself stays pure. */
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  /* ---- the circuit ---- */

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const edgeRef = useRef<SVGPathElement>(null);
  const surfaceRef = useRef<SVGPathElement>(null);
  const centreRef = useRef<SVGPathElement>(null);
  const curbRef = useRef<SVGPathElement>(null);
  const startRef = useRef<SVGPathElement>(null);

  /*
   * Written straight to the DOM rather than through state. Opening the form
   * animates its height, so this runs on every frame of that transition, and
   * a re-render per frame to change four attributes is work for nothing.
   */
  const draw = useCallback(() => {
    const host = hostRef.current;
    const svg = svgRef.current;
    if (!host || !svg) return;

    const { width, height } = host.getBoundingClientRect();
    if (width < 2 || height < 2) return;

    const track = circuit(width, height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const paint = (
      ref: React.RefObject<SVGPathElement | null>,
      d: string,
      strokeWidth: number,
    ) => {
      const el = ref.current;
      if (!el) return;
      el.setAttribute("d", d);
      el.setAttribute("stroke-width", String(strokeWidth));
    };

    paint(curbRef, track.curbs, track.widths.curb);
    paint(edgeRef, track.outline, track.widths.edge);
    paint(surfaceRef, track.outline, track.widths.surface);
    paint(centreRef, track.outline, track.widths.centre);
    paint(startRef, track.start, track.widths.start);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    /* Fires once on observe, so the first draw is covered too. */
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => observer.disconnect();
  }, [draw]);

  /* ---- the challenge ---- */

  const widgetHost = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetId = useRef<string | null>(null);
  const requested = useRef(false);

  /*
   * Deferred until the form is opened. Turnstile is a third-party script that
   * phones home, and a reader who never opens the form has no reason to load
   * it. Guarded by a ref rather than by the dependency list, because closing
   * and reopening must not build a second widget.
   */
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled || !widgetHost.current) return;
        apiRef.current = api;
        widgetId.current = api.render(widgetHost.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          action: "contact",
          callback: (value) => {
            setToken(value);
            setCaptchaDown(false);
          },
          /* A token is good for five minutes. Clearing it on expiry is what
             stops a reader composing a long note and then being told, on
             submit, that the check they already passed is stale. */
          "expired-callback": () => setToken(""),
          "timeout-callback": () => setToken(""),
          "error-callback": () => {
            setToken("");
            setCaptchaDown(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setCaptchaDown(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  /* Turnstile keeps its own iframe and timers; dropping the host node without
     telling it leaves both running. */
  useEffect(() => {
    return () => {
      const api = apiRef.current;
      const id = widgetId.current;
      if (api && id) api.remove(id);
    };
  }, []);

  /* After a failure. The token is spent either way - Turnstile issues them for
     single use - so a retry needs a fresh challenge. */
  const resetChallenge = useCallback(() => {
    setToken("");
    const api = apiRef.current;
    const id = widgetId.current;
    if (api && id) api.reset(id);
  }, []);

  /*
   * After a success, before the form is swapped for the confirmation. The
   * widget has to be given up deliberately here: this component stays mounted
   * across that swap, so the cleanup above does not run, and React detaches
   * the host node while Turnstile still believes it owns one.
   */
  const teardownChallenge = useCallback(() => {
    const api = apiRef.current;
    const id = widgetId.current;
    if (api && id) api.remove(id);
    widgetId.current = null;
    setToken("");
  }, []);

  /* ---- submit ---- */

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (status === "sending") return;

      const trimmed = {
        name: name.trim(),
        email: from.trim(),
        message: message.trim(),
      };

      const reject = (field: Field, text: string) => {
        setStatus("error");
        setBadField(field);
        setError(text);
        setShowFallback(false);
      };

      if (!trimmed.name || trimmed.name.length > NAME_MAX) {
        return reject("name", MESSAGES.bad_name);
      }
      if (!EMAIL.test(trimmed.email)) {
        return reject("email", MESSAGES.bad_email);
      }
      if (
        trimmed.message.length < MESSAGE_MIN ||
        trimmed.message.length > MESSAGE_MAX
      ) {
        return reject("message", MESSAGES.bad_message);
      }
      if (!token) return reject("captcha", MESSAGES.no_captcha);

      setStatus("sending");
      setError("");
      setBadField(null);

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...trimmed,
            token,
            company,
            elapsed: Date.now() - mountedAt.current,
          }),
        });

        const reply = (await res.json().catch(() => null)) as Reply | null;

        if (res.ok && reply?.ok) {
          teardownChallenge();
          setStatus("sent");
          return;
        }

        resetChallenge();
        const code = reply?.error ?? "unknown";
        setStatus("error");
        setBadField(reply?.field ?? null);
        setError(MESSAGES[code] ?? GENERIC);
        setShowFallback(OFFER_FALLBACK.has(code) || !MESSAGES[code]);
      } catch {
        resetChallenge();
        setStatus("error");
        setError("No connection. Check your network and try again.");
        setShowFallback(true);
      }
    },
    [
      company,
      from,
      message,
      name,
      resetChallenge,
      status,
      teardownChallenge,
      token,
    ],
  );

  const sending = status === "sending";
  const sent = status === "sent";
  const invalid = (field: Field) => badField === field;

  return (
    <div className={styles.circuit} ref={hostRef} data-reveal="up">
      {/*
        The track: one lap, stroked five times. Widest and underneath is the
        curbing, then a pale edge, then dark tarmac over the middle of it -
        which is what leaves a boundary line showing down either side - then
        the broken centre line and the start/finish tick.
      */}
      <svg className={styles.track} ref={svgRef} aria-hidden="true">
        <path className={styles.curb} ref={curbRef} />
        <path className={styles.edge} ref={edgeRef} />
        <path className={styles.surface} ref={surfaceRef} />
        <path className={styles.centre} ref={centreRef} />
        <path className={styles.start} ref={startRef} />
      </svg>

      <div className={styles.infield}>
        <button
          type="button"
          className={styles.opener}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="contact-form-panel"
          disabled={sent}
        >
          <span className={styles.openerLabel}>
            {sent ? "Message sent" : "Send me a message"}
          </span>
          <span className={styles.chevron} aria-hidden="true" />
        </button>

        {/*
          Height is animated by transitioning the grid track from 0fr to 1fr,
          which gets the real content height without measuring it. `inert`
          does the other half: a collapsed panel is only visually clipped, and
          without it every field stays in the tab order behind a closed lid.
        */}
        <div
          className={styles.panel}
          id="contact-form-panel"
          data-open={open}
          inert={!open}
        >
          <div className={styles.panelInner}>
            {sent ? (
              <div className={styles.sent}>
                <p className={styles.sentHead}>Chequered flag.</p>
              </div>
            ) : (
              <form className={styles.form} onSubmit={submit} noValidate>
                <label className={styles.field}>
                  <span className={`mark ${styles.label}`}>Name</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={NAME_MAX}
                    autoComplete="name"
                    required
                    aria-invalid={invalid("name")}
                    disabled={sending}
                  />
                </label>

                <label className={styles.field}>
                  <span className={`mark ${styles.label}`}>Email</span>
                  <input
                    className={styles.input}
                    type="email"
                    name="email"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    maxLength={254}
                    autoComplete="email"
                    required
                    aria-invalid={invalid("email")}
                    disabled={sending}
                  />
                </label>

                <label className={styles.field}>
                  <span className={`mark ${styles.label}`}>Message</span>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    name="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MESSAGE_MAX}
                    rows={6}
                    required
                    aria-invalid={invalid("message")}
                    disabled={sending}
                  />
                </label>

                {/*
                  The honeypot. Hidden from sight, from the tab order, and from
                  assistive technology, so the only thing that can fill it is
                  something reading the markup rather than the page. Neither
                  `display: none` nor `visibility: hidden` is used - the better
                  scrapers check for both before deciding a field is worth
                  filling.
                */}
                <div className={styles.trap} aria-hidden="true">
                  <label>
                    Company
                    <input
                      type="text"
                      name="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className={styles.check}>
                  <div ref={widgetHost} className={styles.widget} />
                  {captchaDown && (
                    <p className={`mark ${styles.captchaNote}`}>
                      The bot check could not load. A blocker or extension is
                      the usual cause
                      {email ? ", so email me directly instead." : "."}
                    </p>
                  )}
                </div>

                <div className={styles.foot}>
                  <button
                    className={styles.send}
                    type="submit"
                    disabled={sending || !token}
                  >
                    <span>{sending ? "Sending" : "Send message"}</span>
                  </button>

                  {!token && !captchaDown && (
                    <span className={`mark ${styles.hint}`}>
                      Complete the check to send
                    </span>
                  )}
                </div>

                {/*
                  One live region for the whole form. Assertive, because it is
                  only ever written to in response to a submit the reader just
                  made, and a polite region would be queued behind whatever
                  else is speaking.
                */}
                <p className={styles.status} role="alert" aria-live="assertive">
                  {status === "error" && error ? (
                    <>
                      {error}
                      {showFallback && email && (
                        <>
                          {" Email me at "}
                          <a
                            className={styles.statusLink}
                            href={`mailto:${email}`}
                          >
                            {email}
                          </a>
                          {" instead."}
                        </>
                      )}
                    </>
                  ) : null}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
