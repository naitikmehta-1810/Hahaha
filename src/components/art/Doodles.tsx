/**
 * Hand-drawn SVG accents for the storefront's crafted look. They inherit
 * `currentColor`, carry no text, and are hidden from assistive tech.
 */
type DoodleProps = { className?: string };

/** Brush-stroke underline; stretch it under a word with width: 100%. */
export function BrushUnderline({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 220 18" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path
        d="M4 12.5C42 6 97 4.2 150 5.6c24 .6 45 2.2 64 4.6"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M22 15.2c48-4.6 108-5.4 170-2.4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}

export function Squiggle({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 120 20" fill="none" aria-hidden="true">
      <path
        d="M3 12c9-9 17-9 24 0s15 9 23 0 16-9 24 0 15 9 23 0 13-8 20-2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Six-armed hand-drawn asterisk. */
export function Asterisk({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.8v18.4M4.2 7.4l15.6 9.2M19.6 7.2 4.4 16.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Loose curved arrow pointing down-right, for margin notes. */
export function DoodleArrow({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 64 48" fill="none" aria-hidden="true">
      <path
        d="M4 8c14-6 34-2 42 12 4 7 5 14 4 22"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M41 34.5 50 43l7.5-9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Open hand-drawn loop, drawn around a word. */
export function ScribbleCircle({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 160 70" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path
        d="M118 9C88 1 34 4 14 22c-17 15 4 36 46 40 40 4 86-4 92-24 5-15-18-26-44-29"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Soft organic blob, used behind icons. */
export function Blob({ className, variant = 0 }: DoodleProps & { variant?: number }) {
  const paths = [
    "M44.6 6.3c11 4.2 16.6 15 15.4 26.2-1.2 11.4-9.8 21.8-21.4 24.6C26.9 60 13.2 55.3 6.8 45 .3 34.6 1 20.8 8.6 12.1 16.4 3.2 33.5 2.1 44.6 6.3Z",
    "M48.2 9.6c8.4 7.6 12.6 19.8 8.4 30.2-4.3 10.6-17 19.2-29 18.5C15.5 57.6 4.1 47.8 2.6 36.2 1.1 24.5 9.5 11 20.9 5.6c11.6-5.4 18.9-3.6 27.3 4Z",
    "M41.9 4.7C53.4 7.4 60 19 59 30.6 58 42.4 49.6 54 37.8 57c-11.7 3-26.1-2.6-32.5-13.4C-1.2 32.7 1.4 18 10.6 10.4 19.8 2.8 30.4 2 41.9 4.7Z",
  ];
  return (
    <svg className={className} viewBox="0 0 62 62" aria-hidden="true">
      <path d={paths[variant % paths.length]} fill="currentColor" />
    </svg>
  );
}
