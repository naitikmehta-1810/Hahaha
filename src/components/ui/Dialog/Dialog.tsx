"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Dialog.module.css";

type DialogProps = {
  title: string;
  /** Small round icon beside the title. */
  icon?: ReactNode;
  onClose: () => void;
  /** Maximum width in px; the dialog never exceeds the viewport. */
  width?: number;
  children: ReactNode;
};

/**
 * A modal built on the native <dialog>: focus is trapped, Escape closes it and
 * focus returns to whatever opened it. Mount it only while open.
 */
export default function Dialog({ title, icon, onClose, width = 480, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      // Unmounting removes the modal; hand focus back to the trigger.
      opener?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      style={{ "--dialog-width": `${width}px` } as CSSProperties}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          {icon ? (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
