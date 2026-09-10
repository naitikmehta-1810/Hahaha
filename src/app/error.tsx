"use client";

import React, { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "32px 16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: "460px",
          width: "100%",
          backgroundColor: "var(--color-card, #ffffff)",
          padding: "32px",
          borderRadius: "16px",
          border: "1px solid var(--color-border, #f1f5f9)",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            backgroundColor: "#fef2f2",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px auto",
            fontSize: "20px",
            fontWeight: "bold",
          }}
        >
          !
        </div>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "var(--color-text-main, #0f172a)",
          }}
        >
          Something went wrong!
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-text-muted, #64748b)",
            marginBottom: "20px",
            lineHeight: "1.5",
          }}
        >
          {error?.message || "An unexpected error occurred while loading this page."}
        </p>
        {error?.digest && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-text-light, #94a3b8)",
              marginBottom: "20px",
              fontFamily: "monospace",
            }}
          >
            Digest: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: "var(--color-primary, #7c3aed)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              backgroundColor: "var(--color-border, #f1f5f9)",
              color: "var(--color-text-main, #0f172a)",
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
