"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import styles from "./error.module.css";

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
    <div className={styles.screen}>
      <div className={styles.card} role="alert">
        <span className={styles.icon} aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.text}>
          {error?.message || "An unexpected error occurred while loading this page."}
        </p>
        {error?.digest ? <p className={styles.digest}>Error ID: {error.digest}</p> : null}
        <div className={styles.actions}>
          <Button variant="primary" leftIcon={<RotateCw size={16} />} onClick={() => reset()}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Go home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
