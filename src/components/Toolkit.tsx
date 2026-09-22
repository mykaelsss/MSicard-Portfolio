import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Section from "./Section";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { normalizeSkill, type SiteContent, type Skill } from "../lib/content";
import styles from "./Toolkit.module.css";

/*
 * The width at which the rack stops being a rack.
 *
 * Above it every category stands in its own column and the whole kit is one
 * screen. Below it five tracks are narrower than the names they carry, so the
 * categories fold into a strip of tabs and one category is drawn at a time -
 * a rack you have to scroll for a screen and a half is not the thing being
 * modelled.
 *
 * Kept in step with the `.grid` media query in Toolkit.module.css. The strip
 * is a tablist and the columns become a tabpanel, and roles have to be
 * reported to assistive technology, so the breakpoint cannot live in the
 * stylesheet alone.
 */
const TABBED = "(max-width: 800px)";

interface Props {
  content: SiteContent;
}

/**
 * The kit, laid out as a loadout rack: one column per category, one cell per
 * entry, and a spec panel in the rail beside it for whatever is selected.
 *
 * The figure in the corner of every cell is the year the entry entered the
 * kit, and it is the reason the rack reads as a rack. A grid of names in
 * boxes is a list; a grid of names carrying a figure each can be scanned, and
 * the scan is the point - the columns run oldest first, so each one reads
 * top to bottom as a chronology and the rack as a whole shows the shape of
 * how the kit was assembled.
 *
 * The panel is measured rather than asserted. Years in service is drawn
 * against the longest-held entry in the whole kit, so the bar means something
 * relative to its neighbours instead of being a number in a box.
 */

export default function Toolkit({ content }: Props) {
  const now = new Date().getFullYear();
  const tabbed = useMediaQuery(TABBED);

  const columns = useMemo(
    () =>
      content.skills.map((group) => ({
        group: group.group,
        /* Oldest first so the column is a chronology. Entries with no year
           sort to the foot rather than to 1970. */
        items: group.items
          .map(normalizeSkill)
          .sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity)),
      })),
    [content.skills],
  );

  const all = useMemo(() => columns.flatMap((c) => c.items), [columns]);

  /* The scale every service bar is drawn against. Floored at one so a kit
     assembled entirely this year cannot divide by zero. */
  const span = useMemo(
    () => Math.max(1, ...all.map((s) => (s.since ? now - s.since : 0))),
    [all, now],
  );

  const earliest = useMemo(() => {
    const years = all.map((s) => s.since).filter((y): y is number => y !== null);
    return years.length > 0 ? Math.min(...years) : null;
  }, [all]);

  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  /* What the panel is drawing. Hovering previews an entry the way the rack it
     is modelled on does; the selection is what it falls back to, so moving
     the pointer off the grid does not empty the panel. */
  const [preview, setPreview] = useState<Skill | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Which column an entry belongs to, so the panel can name its category
     without searching the rack on every render. Keyed by the entry itself:
     two categories are free to carry the same name. */
  const groupOf = useMemo(() => {
    const map = new Map<Skill, string>();
    for (const col of columns) {
      for (const item of col.items) map.set(item, col.group);
    }
    return map;
  }, [columns]);

  const column = columns[cursor.col];
  const selected = column?.items[cursor.row];
  const active = preview ?? selected;
  const activeId = `kit-${cursor.col}-${cursor.row}`;

  const activeGroup = active ? (groupOf.get(active) ?? "") : "";
  const years = active?.since ? now - active.since : null;

  /* Clamped rather than wrapped: columns are ragged, and landing on a
     different row than the one you aimed at is disorienting. */
  const move = (col: number, row: number) => {
    const nextCol = Math.min(Math.max(col, 0), columns.length - 1);
    const count = columns[nextCol]?.items.length ?? 0;
    if (count === 0) return;
    setPreview(null);
    setCursor({ col: nextCol, row: Math.min(Math.max(row, 0), count - 1) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { col, row } = cursor;
    switch (event.key) {
      case "ArrowDown":
        move(col, row + 1);
        break;
      case "ArrowUp":
        move(col, row - 1);
        break;
      /* Sideways is the next category either way. Drawn as columns that is a
         step across the rack; drawn as tabs it turns the page, and the row
         goes back to the top because the category underneath is a different
         length and holding the row would land the cursor somewhere arbitrary
         in a list the reader has not seen yet. */
      case "ArrowRight":
        move(col + 1, tabbed ? 0 : row);
        break;
      case "ArrowLeft":
        move(col - 1, tabbed ? 0 : row);
        break;
      case "Home":
        move(col, 0);
        break;
      case "End":
        move(col, (columns[col]?.items.length ?? 1) - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  /* The strip carries its own roving focus, as a tablist is expected to. */
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = columns.length - 1;
    let next = cursor.col;

    switch (event.key) {
      case "ArrowRight":
        next = cursor.col === last ? 0 : cursor.col + 1;
        break;
      case "ArrowLeft":
        next = cursor.col === 0 ? last : cursor.col - 1;
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
    setPreview(null);
    setCursor({ col: next, row: 0 });
    tabRefs.current[next]?.focus();
  };

  const cell = (item: Skill, colIndex: number, rowIndex: number) => {
    const on = colIndex === cursor.col && rowIndex === cursor.row;
    return (
      <div
        key={item.name}
        id={`kit-${colIndex}-${rowIndex}`}
        role="option"
        aria-selected={on}
        className={`${styles.cell} ${on ? styles.cellOn : ""}`}
        onMouseEnter={() => setPreview(item)}
        onClick={() => {
          setPreview(null);
          setCursor({ col: colIndex, row: rowIndex });
          listRef.current?.focus();
        }}
      >
        <span className={styles.cellName}>{item.name}</span>
        {item.since && (
          <span className={`num ${styles.cellYear}`}>{item.since}</span>
        )}
      </div>
    );
  };

  /* One category at a time under the strip, every category side by side
     without it. The cursor's column is the open tab either way, so folding
     the rack down keeps whatever the reader was already looking at. */
  const drawn = tabbed
    ? column
      ? [{ col: column, index: cursor.col }]
      : []
    : columns.map((col, index) => ({ col, index }));

  const grid = (
    <div
      ref={listRef}
      className={styles.grid}
      /* The stylesheet lays out one track per category and must not wrap, so
         the count has to cross over from the content. */
      style={{ ["--groups" as string]: columns.length }}
      role="listbox"
      tabIndex={0}
      aria-label="Toolkit"
      aria-activedescendant={activeId}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setPreview(null)}
    >
      {drawn.map(({ col, index }) => (
        <div
          key={col.group}
          className={styles.column}
          role="group"
          aria-label={col.group}
        >
          {/* Folded down, the open tab already names the category. */}
          {!tabbed && <p className={styles.columnHead}>{col.group}</p>}
          {col.items.map((item, rowIndex) => cell(item, index, rowIndex))}
        </div>
      ))}
    </div>
  );

  return (
    <Section id="toolkit" title="The kit">
      <div className={styles.rack} data-reveal="up">
        <p className={styles.manifest}>
          <span className={styles.manifestFig}>{all.length}</span> in the kit
          {earliest && (
            <>
              <span className={styles.manifestSep} aria-hidden="true" />
              carried since{" "}
              <span className={styles.manifestFig}>{earliest}</span>
            </>
          )}
        </p>

        <div className={styles.body}>
          {tabbed ? (
            <div className={styles.folded}>
              <div
                className={styles.strip}
                role="tablist"
                aria-label="Kit categories"
                onKeyDown={onTabKeyDown}
              >
                {columns.map((col, i) => (
                  <button
                    key={col.group}
                    ref={(node) => {
                      tabRefs.current[i] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`kit-tab-${i}`}
                    aria-selected={i === cursor.col}
                    aria-controls={`kit-panel-${i}`}
                    tabIndex={i === cursor.col ? 0 : -1}
                    className={styles.tab}
                    onClick={() => {
                      setPreview(null);
                      setCursor({ col: i, row: 0 });
                    }}
                  >
                    {col.group}
                    <span className={`num ${styles.tabCount}`}>
                      {col.items.length}
                    </span>
                  </button>
                ))}
              </div>

              <div
                id={`kit-panel-${cursor.col}`}
                role="tabpanel"
                aria-labelledby={`kit-tab-${cursor.col}`}
              >
                {grid}
              </div>
            </div>
          ) : (
            grid
          )}

          <div className={styles.panel} aria-live="polite">
            {active && (
              <>
                <p className={styles.panelHead}>
                  <span className={styles.panelName}>{active.name}</span>
                  <span className={styles.panelGroup}>{activeGroup}</span>
                </p>

                <div className={styles.stat}>
                  <p className={`mark ${styles.statLabel}`}>In service</p>
                  <p className={`num ${styles.statValue}`}>
                    {years === null ? "--" : years === 0 ? "<1" : years}
                    <span className={styles.statUnit}>
                      {years === 1 ? "yr" : "yrs"}
                    </span>
                  </p>
                  {active.since && (
                    <p className={`mark ${styles.statSince}`}>
                      since {active.since}
                    </p>
                  )}
                  <span
                    className={styles.bar}
                    aria-hidden="true"
                    style={{
                      ["--fill" as string]: `${Math.max(
                        ((years ?? 0) / span) * 100,
                        years === null ? 0 : 5,
                      )}%`,
                    }}
                  />
                </div>

                {active.note && (
                  <div className={styles.block}>
                    <p className={`mark ${styles.blockLabel}`}>Note</p>
                    <p className={styles.note}>{active.note}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
