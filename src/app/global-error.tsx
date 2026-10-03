"use client";

import "./globals.css";
import styles from "./error.module.css";

/**
 * Root global error boundary (must include html + body). It replaces the root
 * layout, so it imports the global tokens itself.
 * If you see "global-error.js … React Client Manifest" in dev, delete `.next` and restart `npm run dev`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className={`${styles.screen} ${styles.fullScreen}`}>
          <div className={styles.card} role="alert">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/stuffsy-mark.png" alt="Stuffsy" width={52} height={52} />
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.text}>An unexpected error occurred. Try again, or return home.</p>
            {error?.digest ? <p className={styles.digest}>Error ID: {error.digest}</p> : null}
            <div className={styles.actions}>
              <button
                type="button"
                className="stuffsy-error-btn stuffsy-error-btn-primary"
                onClick={() => reset()}
              >
                Try again
              </button>
              {/* A plain anchor: the router may be unavailable when the root layout has crashed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="stuffsy-error-btn">
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
