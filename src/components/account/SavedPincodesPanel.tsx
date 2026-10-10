"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPinned, Star, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import {
  MAX_SAVED_PINCODES,
  deleteSavedPincode,
  fetchSavedPincodes,
  makePincodePrimary,
  savePincode,
  type SavedPincode,
} from "@/utils/pincodes";
import { rememberPincode } from "@/utils/deliverability";
import styles from "./SavedPincodesPanel.module.css";

/** Account → Addresses: PIN codes kept for quick delivery checks on product pages. */
export default function SavedPincodesPanel() {
  const [items, setItems] = useState<SavedPincode[] | null>(null);
  const [pincode, setPincode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchSavedPincodes();
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load your PIN codes.");
      setItems((current) => current ?? []);
      return;
    }
    setItems(result.data.pincodes);
    // The primary PIN pre-fills delivery checks on this device.
    const primary = result.data.pincodes.find((p) => p.isPrimary);
    if (primary) rememberPincode(primary.pincode);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      setError("Enter a valid 6-digit PIN code.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await savePincode({ pincode, label: label.trim() || null });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPincode("");
    setLabel("");
    await load();
  };

  const act = async (work: () => Promise<{ error: string | null }>) => {
    setError(null);
    const result = await work();
    if (result.error) setError(result.error);
    else await load();
  };

  const full = (items?.length ?? 0) >= MAX_SAVED_PINCODES;

  return (
    <section className={styles.panel} aria-labelledby="pins-title">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <MapPinned size={18} />
        </span>
        <div>
          <h3 id="pins-title" className={styles.title}>
            Delivery PIN codes
          </h3>
          <p className={styles.sub}>
            Save the places you ship to (home, office, family) and check delivery dates in one tap. Up to{" "}
            {MAX_SAVED_PINCODES}.
          </p>
        </div>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {items === null ? (
        <p className={styles.sub}>Loading…</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <span className={styles.pin}>{item.pincode}</span>
              <span className={styles.label}>{item.label ?? "—"}</span>
              {item.isPrimary ? (
                <span className={styles.primary}>
                  <Star size={12} fill="currentColor" aria-hidden="true" /> Primary
                </span>
              ) : (
                <button type="button" className={styles.link} onClick={() => void act(() => makePincodePrimary(item.id))}>
                  Make primary
                </button>
              )}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${item.pincode}`}
                onClick={() => void act(() => deleteSavedPincode(item.id))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.form} onSubmit={(e) => void add(e)}>
        <label>
          <span className="sr-only">PIN code</span>
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="PIN code"
            value={pincode}
            disabled={full}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </label>
        <label>
          <span className="sr-only">Label</span>
          <input
            maxLength={30}
            placeholder="Label (Home, Office…)"
            value={label}
            disabled={full}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy || full || pincode.length !== 6}>
          {full ? "Limit reached" : busy ? "Saving…" : "Save PIN code"}
        </Button>
      </form>
    </section>
  );
}
