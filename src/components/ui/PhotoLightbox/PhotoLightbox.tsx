"use client";

import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { optimizedImage } from "@/utils/media";
import styles from "./PhotoLightbox.module.css";

export type LightboxPhoto = { url: string; caption?: string | null };

/**
 * Full-screen photo viewer. Arrow keys move, Escape closes, focus returns to
 * whatever opened it. Mount it only while a photo is open.
 */
export default function PhotoLightbox({
  photos,
  index,
  label = "Photo",
  onIndexChange,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  label?: string;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = photos.length;
  const active = photos[index];

  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + count) % count),
    [index, count, onIndexChange]
  );

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && count > 1) step(1);
      else if (event.key === "ArrowLeft" && count > 1) step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step, count]);

  if (!active) return null;
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <button ref={closeRef} type="button" className={styles.close} aria-label="Close photo" onClick={onClose}>
        <X size={20} />
      </button>
      {count > 1 ? (
        <button
          type="button"
          className={`${styles.nav} ${styles.prev}`}
          aria-label="Previous photo"
          onClick={(event) => {
            event.stopPropagation();
            step(-1);
          }}
        >
          <ChevronLeft size={24} />
        </button>
      ) : null}
      <figure className={styles.figure} onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={optimizedImage(active.url, 1600)} alt={active.caption ?? ""} />
        {active.caption ? <figcaption>{active.caption}</figcaption> : null}
      </figure>
      {count > 1 ? (
        <button
          type="button"
          className={`${styles.nav} ${styles.next}`}
          aria-label="Next photo"
          onClick={(event) => {
            event.stopPropagation();
            step(1);
          }}
        >
          <ChevronRight size={24} />
        </button>
      ) : null}
    </div>
  );
}
