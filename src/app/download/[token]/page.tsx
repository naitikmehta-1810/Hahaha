"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import { redeemDownloadToken } from "@/utils/downloads";
import styles from "./download.module.css";

type State =
  | { phase: "loading" }
  | { phase: "ready"; url: string; fileName: string }
  | { phase: "error"; message: string; expired: boolean };

/**
 * Landing page for download links in the delivery email. Fetches a fresh
 * short-lived file link, starts the download, and offers it again by button.
 */
export default function DownloadTokenPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    void redeemDownloadToken(token).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data?.url) {
        setState({
          phase: "error",
          message: result.error ?? "This download link isn't valid.",
          expired: result.status === 410,
        });
        return;
      }
      setState({ phase: "ready", url: result.data.url, fileName: result.data.fileName });
      window.location.assign(result.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {state.phase === "loading" ? (
          <>
            <Loader2 size={32} className={styles.spin} aria-hidden="true" />
            <h1 className={styles.title}>Preparing your download…</h1>
          </>
        ) : state.phase === "ready" ? (
          <>
            <span className={styles.icon} aria-hidden="true">
              <Download size={26} />
            </span>
            <h1 className={styles.title}>Your download has started</h1>
            <p className={styles.text}>
              <strong>{state.fileName}</strong> should be saving now. If nothing happened, use the
              button below.
            </p>
            <Button onClick={() => window.location.assign(state.url)} leftIcon={<Download size={16} />}>
              Download again
            </Button>
            <p className={styles.small}>
              Your purchases are always under <Link href="/account?tab=downloads">Account → Downloads</Link>.
            </p>
          </>
        ) : (
          <>
            <span className={`${styles.icon} ${styles.iconError}`} aria-hidden="true">
              <AlertCircle size={26} />
            </span>
            <h1 className={styles.title}>{state.expired ? "This link has expired" : "We couldn’t start this download"}</h1>
            <p className={styles.text}>{state.message}</p>
            <ButtonLink href="/account?tab=downloads">Go to my downloads</ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}
