"use client";

import React, { useEffect, useRef, useState } from "react";
import { FileDown, FileUp, Film, RotateCcw, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import { directUpload, formatBytes, type UploadedFile, type UploadProof } from "@/utils/direct-upload";
import ui from "@/components/console/console.module.css";
import sellerStyles from "@/app/seller/seller.module.css";
import styles from "./ProductMediaFields.module.css";

/* ── Video ──────────────────────────────────────────────────────────────── */

/** Formats Cloudinary takes in; every upload is served back as H.264 MP4. */
const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"];
const VIDEO_ACCEPT = ["video/*", ...VIDEO_EXTENSIONS.map((ext) => `.${ext}`)].join(",");

/**
 * Browsers often report no type, or application/octet-stream, for .mov files
 * (Windows has no QuickTime type registered), so the extension decides too.
 */
function isVideoFile(file: File) {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

export type VideoState =
  | { kind: "none" }
  | { kind: "existing"; url: string; posterUrl: string }
  | { kind: "uploading"; fileName: string; progress: number; previewUrl: string }
  | { kind: "new"; proof: UploadProof; previewUrl: string }
  | { kind: "error"; message: string };

/** What the save request should say about the video (undefined = unchanged). */
export function videoPayload(state: VideoState, hadVideo: boolean): UploadProof | null | undefined {
  if (state.kind === "new") return state.proof;
  if (state.kind === "none" && hadVideo) return null;
  return undefined;
}

export function VideoField({
  value,
  onChange,
  onBusyChange,
}: {
  value: VideoState;
  onChange: (next: VideoState) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Chrome and Firefox can't play HEVC .mov files locally; the saved MP4 plays everywhere.
  const [previewFailed, setPreviewFailed] = useState(false);

  // Revoke object URLs the preview created once they are replaced.
  const previewUrl = value.kind === "uploading" || value.kind === "new" ? value.previewUrl : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async (file: File) => {
    if (!isVideoFile(file)) {
      onChange({
        kind: "error",
        message: `"${file.name}" isn't a video file. Use MP4, MOV, M4V or WebM.`,
      });
      return;
    }
    setPreviewFailed(false);
    const preview = URL.createObjectURL(file);
    const controller = new AbortController();
    abortRef.current = controller;
    onBusyChange(true);
    onChange({ kind: "uploading", fileName: file.name, progress: 0, previewUrl: preview });
    try {
      const uploaded = await directUpload("video", file, {
        signal: controller.signal,
        onProgress: (progress) =>
          onChange({ kind: "uploading", fileName: file.name, progress, previewUrl: preview }),
      });
      onChange({ kind: "new", proof: uploaded, previewUrl: preview });
    } catch (err) {
      URL.revokeObjectURL(preview);
      if (err instanceof DOMException && err.name === "AbortError") onChange({ kind: "none" });
      else onChange({ kind: "error", message: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      abortRef.current = null;
      onBusyChange(false);
    }
  };

  const src = value.kind === "existing" ? value.url : value.kind === "new" ? value.previewUrl : null;

  return (
    <section className={ui.card}>
      <div className={sellerStyles.labelRow}>
        <h2 className={sellerStyles.sectionTitle}>
          <Film size={16} aria-hidden="true" /> Product video
        </h2>
        <span className={styles.optional}>Optional</span>
      </div>
      <p className={sellerStyles.sectionHint}>
        Plays first on your product page, before the photos. A 15–60 second clip works best.
      </p>

      {src ? (
        <div className={styles.videoPreview}>
          <video
            src={src}
            poster={value.kind === "existing" ? value.posterUrl : undefined}
            controls
            muted
            playsInline
            preload="metadata"
            onError={() => setPreviewFailed(true)}
          />
          {previewFailed && value.kind === "new" ? (
            <p className={sellerStyles.sectionHint} role="status">
              Uploaded. This browser can&apos;t preview this format, but buyers will see it as an
              MP4 once you save.
            </p>
          ) : null}
          <div className={styles.videoActions}>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              onClick={() => onChange({ kind: "none" })}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : value.kind === "uploading" ? (
        <div className={styles.progressBox} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <span className={styles.fileName}>{value.fileName}</span>
            <span>{Math.round(value.progress * 100)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.round(value.progress * 100)}%` }} />
          </div>
          <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={() => abortRef.current?.abort()}>
            Cancel upload
          </Button>
        </div>
      ) : (
        <div className={sellerStyles.dropZone}>
          <Film size={24} aria-hidden="true" />
          <p>Add a short video</p>
          <span>MP4, MOV, M4V or WebM</span>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Choose video
          </Button>
        </div>
      )}

      {value.kind === "error" ? (
        <p className={styles.error} role="alert">
          {value.message}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void start(file);
        }}
      />
    </section>
  );
}

/* ── Digital files ──────────────────────────────────────────────────────── */

export type DigitalFileEntry =
  | { key: string; kind: "existing"; id: string; fileName: string; bytes: number }
  | { key: string; kind: "new"; upload: UploadedFile }
  | { key: string; kind: "uploading"; fileName: string; bytes: number; progress: number }
  | { key: string; kind: "failed"; fileName: string; bytes: number; message: string; file: File };

export const MAX_DIGITAL_FILES = 10;

/** The list sent on save: existing ids and fresh uploads, in display order. */
export function digitalFilesPayload(
  entries: DigitalFileEntry[]
): Array<{ id: string } | UploadedFile> {
  return entries.flatMap((entry): Array<{ id: string } | UploadedFile> =>
    entry.kind === "existing"
      ? [{ id: entry.id }]
      : entry.kind === "new"
        ? [entry.upload]
        : []
  );
}

let keySeq = 0;
const nextKey = () => `f${Date.now().toString(36)}${(keySeq += 1)}`;

export function DigitalFilesField({
  value,
  onChange,
  onBusyChange,
}: {
  value: DigitalFileEntry[];
  onChange: (update: (current: DigitalFileEntry[]) => DigitalFileEntry[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef(0);

  const patch = (key: string, next: DigitalFileEntry | null) =>
    onChange((current) =>
      next ? current.map((entry) => (entry.key === key ? next : entry)) : current.filter((e) => e.key !== key)
    );

  const uploadOne = async (key: string, file: File) => {
    active.current += 1;
    onBusyChange(true);
    try {
      const uploaded = await directUpload("digital", file, {
        onProgress: (progress) =>
          patch(key, { key, kind: "uploading", fileName: file.name, bytes: file.size, progress }),
      });
      patch(key, { key, kind: "new", upload: uploaded });
    } catch (err) {
      patch(key, {
        key,
        kind: "failed",
        fileName: file.name,
        bytes: file.size,
        message: err instanceof Error ? err.message : "Upload failed",
        file,
      });
    } finally {
      active.current -= 1;
      if (active.current === 0) onBusyChange(false);
    }
  };

  const addFiles = (files: File[]) => {
    setNotice(null);
    const room = MAX_DIGITAL_FILES - value.length;
    if (room <= 0) {
      setNotice(`You can attach up to ${MAX_DIGITAL_FILES} files.`);
      return;
    }
    const picked = files.slice(0, room);
    if (files.length > room) setNotice(`Only the first ${room} file${room === 1 ? "" : "s"} were added (limit ${MAX_DIGITAL_FILES}).`);
    const entries = picked.map((file) => ({
      key: nextKey(),
      kind: "uploading" as const,
      fileName: file.name,
      bytes: file.size,
      progress: 0,
    }));
    onChange((current) => [...current, ...entries]);
    // Uploaded one at a time so a large batch doesn't saturate the connection.
    void (async () => {
      for (let i = 0; i < picked.length; i += 1) await uploadOne(entries[i].key, picked[i]);
    })();
  };

  const nameOf = (entry: DigitalFileEntry) => (entry.kind === "new" ? entry.upload.fileName : entry.fileName);
  const bytesOf = (entry: DigitalFileEntry) => (entry.kind === "new" ? entry.upload.bytes : entry.bytes);

  return (
    <section className={ui.card}>
      <div className={sellerStyles.labelRow}>
        <h2 className={sellerStyles.sectionTitle}>
          <FileDown size={16} aria-hidden="true" /> Files buyers download <span className={sellerStyles.req}>*</span>
        </h2>
        <span className={styles.optional}>
          {value.length}/{MAX_DIGITAL_FILES}
        </span>
      </div>
      <p className={sellerStyles.sectionHint}>
        Any file type: PDF, ZIP, audio, images, templates. Buyers get these right after paying, on
        their order page and by email. Files stay private until someone buys.
      </p>

      <div
        className={`${sellerStyles.dropZone} ${dragOver ? sellerStyles.dropZoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <FileUp size={24} aria-hidden="true" />
        <p>Drag &amp; drop files here</p>
        <span>Any type</span>
        <Button
          variant="outline"
          size="sm"
          disabled={value.length >= MAX_DIGITAL_FILES}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            addFiles(files);
          }}
        />
      </div>

      {notice ? <p className={styles.note}>{notice}</p> : null}

      {value.length > 0 ? (
        <ul className={styles.fileList}>
          {value.map((entry) => (
            <li key={entry.key} className={styles.fileRow}>
              <FileDown size={18} aria-hidden="true" className={styles.fileIcon} />
              <div className={styles.fileMain}>
                <span className={styles.fileName}>{nameOf(entry)}</span>
                {entry.kind === "uploading" ? (
                  <div className={styles.progressTrack} aria-label={`Uploading ${Math.round(entry.progress * 100)}%`}>
                    <div className={styles.progressFill} style={{ width: `${Math.round(entry.progress * 100)}%` }} />
                  </div>
                ) : entry.kind === "failed" ? (
                  <span className={styles.error}>{entry.message}</span>
                ) : (
                  <span className={styles.fileMeta}>
                    {formatBytes(bytesOf(entry))}
                    {entry.kind === "new" ? " · uploaded" : ""}
                  </span>
                )}
              </div>
              {entry.kind === "failed" ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`Retry ${entry.fileName}`}
                  title="Retry"
                  onClick={() => {
                    patch(entry.key, { key: entry.key, kind: "uploading", fileName: entry.fileName, bytes: entry.bytes, progress: 0 });
                    void uploadOne(entry.key, entry.file);
                  }}
                >
                  <RotateCcw size={15} />
                </button>
              ) : null}
              {entry.kind !== "uploading" ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`Remove ${nameOf(entry)}`}
                  title="Remove"
                  onClick={() => patch(entry.key, null)}
                >
                  <X size={15} />
                </button>
              ) : (
                <span className={styles.fileMeta}>{Math.round(entry.progress * 100)}%</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function existingFileEntries(
  files: Array<{ id: string; fileName: string; bytes: number }> | undefined
): DigitalFileEntry[] {
  return (files ?? []).map((file) => ({
    key: file.id,
    kind: "existing",
    id: file.id,
    fileName: file.fileName,
    bytes: file.bytes,
  }));
}
