"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MAX_SAVED_PINCODES, fetchSavedPincodes, savePincode, type SavedPincode } from "@/utils/pincodes";
import styles from "./SavedPincodePicker.module.css";

/**
 * For signed-in buyers: tap a PIN code saved on the account to fill the check,
 * and save the one just checked. Shows nothing for guests.
 */
export default function SavedPincodePicker({
  current,
  checkedPincode,
  onPick,
}: {
  current: string;
  /** The PIN code of the result on screen, offered for saving. */
  checkedPincode: string | null;
  onPick: (pincode: string) => void;
}) {
  const { isAuthenticated, status } = useAuth();
  const [saved, setSaved] = useState<SavedPincode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading" || !isAuthenticated) return;
    let cancelled = false;
    void fetchSavedPincodes().then((result) => {
      if (!cancelled) setSaved(result.data?.pincodes ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [status, isAuthenticated]);

  if (!isAuthenticated || saved === null) return null;

  const alreadySaved = checkedPincode ? saved.some((item) => item.pincode === checkedPincode) : false;
  const canSave = Boolean(checkedPincode) && !alreadySaved && saved.length < MAX_SAVED_PINCODES;

  const save = async () => {
    if (!checkedPincode) return;
    setBusy(true);
    setError(null);
    const result = await savePincode({ pincode: checkedPincode });
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not save this PIN code.");
      return;
    }
    const refreshed = await fetchSavedPincodes();
    setSaved(refreshed.data?.pincodes ?? saved);
  };

  if (saved.length === 0 && !canSave) return null;

  return (
    <div className={styles.wrap}>
      {saved.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="Your saved PIN codes">
          {saved.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.chip} ${current === item.pincode ? styles.chipOn : ""}`}
              aria-pressed={current === item.pincode}
              onClick={() => onPick(item.pincode)}
            >
              {item.label ? `${item.label} · ` : ""}
              {item.pincode}
            </button>
          ))}
        </div>
      ) : null}
      {canSave ? (
        <button type="button" className={styles.save} disabled={busy} onClick={() => void save()}>
          <BookmarkPlus size={14} aria-hidden="true" /> {busy ? "Saving…" : `Save ${checkedPincode} to my account`}
        </button>
      ) : alreadySaved ? (
        <span className={styles.savedNote}>
          <Check size={13} aria-hidden="true" /> Saved on your account
        </span>
      ) : null}
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
