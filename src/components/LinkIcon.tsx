/*
 * The glyphs for the contact links in the HUD bar. The marks are the ones a
 * reader already knows on sight, so they carry the link without a word of
 * label beside them; the anchor supplies the name to a screen reader.
 *
 * Everything is a filled path on a 24x24 box in `currentColor`, so weight
 * stays even between the three and the colour comes from whatever is around
 * them. An id the map does not know renders nothing rather than a blank box,
 * which is the same tolerance `src/lib/content.ts` shows the live document:
 * a link can be added upstream before its mark exists here.
 */

const PATHS: Record<string, string[]> = {
  email: [
    "M1.5 6.75A2.25 2.25 0 0 1 3.75 4.5h16.5a2.25 2.25 0 0 1 2.25 2.25v.44l-10.5 6.02L1.5 7.19v-.44Z",
    "M22.5 9.32v7.93a2.25 2.25 0 0 1-2.25 2.25H3.75a2.25 2.25 0 0 1-2.25-2.25V9.32l9.94 5.7c.35.2.77.2 1.12 0l9.94-5.7Z",
  ],
  linkedin: [
    "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z",
  ],
  github: [
    "M12 .5C5.73.5.75 5.48.75 11.75c0 4.95 3.2 9.14 7.66 10.62.56.1.77-.24.77-.54 0-.27-.01-1.15-.02-2.09-3.11.68-3.77-1.32-3.77-1.32-.51-1.29-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.12.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.94.1-.73.39-1.22.71-1.5-2.48-.28-5.1-1.24-5.1-5.54 0-1.22.44-2.22 1.15-3.01-.11-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.79 1.15 1.79 1.15 3.01 0 4.31-2.62 5.26-5.12 5.53.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.77.54a11.26 11.26 0 0 0 7.65-10.62C23.25 5.48 18.27.5 12 .5Z",
  ],
};

interface Props {
  id: string;
  className?: string;
}

export default function LinkIcon({ id, className }: Props) {
  const paths = PATHS[id];
  if (!paths) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
