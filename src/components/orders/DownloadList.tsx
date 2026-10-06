"use client";

import React, { useState } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";
import { formatBytes } from "@/utils/direct-upload";
import { requestDownloadUrl, type DownloadFile } from "@/utils/downloads";
import styles from "./DownloadList.module.css";

/** A buyer's files for one order line, each with a download button. */
export default function DownloadList({
  orderId,
  orderItemId,
  files,
}: {
  orderId: string;
  orderItemId: string;
  files: DownloadFile[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (file: DownloadFile) => {
    setBusyId(file.id);
    setError(null);
    const result = await requestDownloadUrl(orderId, orderItemId, file.id);
    setBusyId(null);
    if (result.error || !result.data?.url) {
      setError(result.error ?? "Could not start the download. Try again.");
      return;
    }
    // The signed link answers with Content-Disposition: attachment, so the
    // page stays put and the browser saves the file.
    window.location.assign(result.data.url);
  };

  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {files.map((file) => (
          <li key={file.id} className={styles.row}>
            <FileDown size={18} aria-hidden="true" className={styles.icon} />
            <span className={styles.name} title={file.fileName}>
              {file.fileName}
            </span>
            {file.bytes > 0 ? <span className={styles.size}>{formatBytes(file.bytes)}</span> : null}
            <button
              type="button"
              className={styles.button}
              disabled={busyId !== null}
              onClick={() => void download(file)}
              aria-label={`Download ${file.fileName}`}
            >
              {busyId === file.id ? (
                <Loader2 size={15} className={styles.spin} aria-hidden="true" />
              ) : (
                <Download size={15} aria-hidden="true" />
              )}
              <span>{busyId === file.id ? "Preparing…" : "Download"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
