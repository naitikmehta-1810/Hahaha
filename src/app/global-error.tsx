"use client";

/**
 * Root global error boundary (must include html + body).
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
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Georgia, 'Times New Roman', serif",
          background: "linear-gradient(160deg, #f7f3ee 0%, #ebe4da 100%)",
          color: "#1c1917",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12, opacity: 0.7 }}>
            Stuffsy
          </p>
          <h1 style={{ fontSize: 28, margin: "8px 0 12px" }}>Something went wrong</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.8 }}>
            An unexpected error occurred. Try again, or return home.
          </p>
          {error?.digest ? (
            <p style={{ fontSize: 12, fontFamily: "monospace", opacity: 0.55 }}>
              Error ID: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                background: "#1c1917",
                color: "#fafaf9",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              style={{
                border: "1px solid #a8a29e",
                borderRadius: 8,
                padding: "10px 18px",
                background: "transparent",
                color: "#1c1917",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Go home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
