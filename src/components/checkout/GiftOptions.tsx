"use client";

import { Gift } from "lucide-react";
import styles from "./GiftOptions.module.css";

export type GiftFormState = {
  enabled: boolean;
  message: string;
  senderName: string;
  wrap: boolean;
  hidePrices: boolean;
};

export const EMPTY_GIFT: GiftFormState = {
  enabled: false,
  message: "",
  senderName: "",
  wrap: true,
  hidePrices: true,
};

export const GIFT_MESSAGE_MAX = 250;

/** The `gift` field of the place-order request, or null when it isn't a gift. */
export function giftPayload(gift: GiftFormState) {
  if (!gift.enabled) return null;
  return {
    message: gift.message.trim() || null,
    senderName: gift.senderName.trim() || null,
    wrap: gift.wrap,
    hidePrices: gift.hidePrices,
  };
}

/**
 * "This is a gift": a note for the recipient, free gift wrapping and a
 * price-free parcel. Delivering to someone else only needs their address.
 */
export default function GiftOptions({
  value,
  onChange,
}: {
  value: GiftFormState;
  onChange: (next: GiftFormState) => void;
}) {
  const set = <K extends keyof GiftFormState>(key: K, next: GiftFormState[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <section className={styles.box} aria-labelledby="gift-title">
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          aria-describedby="gift-help"
        />
        <span className={styles.toggleIcon} aria-hidden="true">
          <Gift size={18} />
        </span>
        <span>
          <strong id="gift-title">This order is a gift</strong>
          <small id="gift-help">Add a note, free gift wrap, and keep prices out of the parcel.</small>
        </span>
      </label>

      {value.enabled ? (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Message for the recipient (optional)</span>
            <textarea
              rows={3}
              value={value.message}
              maxLength={GIFT_MESSAGE_MAX}
              placeholder="Happy birthday! Hope you love it."
              onChange={(e) => set("message", e.target.value)}
            />
            <span className={styles.count}>
              {value.message.length}/{GIFT_MESSAGE_MAX}
            </span>
          </label>
          <label className={styles.field}>
            <span>Sign the note as (optional)</span>
            <input
              type="text"
              value={value.senderName}
              maxLength={60}
              placeholder="Your name"
              onChange={(e) => set("senderName", e.target.value)}
            />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={value.wrap} onChange={(e) => set("wrap", e.target.checked)} />
            <span>Gift wrap it (free)</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value.hidePrices}
              onChange={(e) => set("hidePrices", e.target.checked)}
            />
            <span>Leave prices out of the parcel</span>
          </label>
          <p className={styles.note}>
            Choose the recipient&apos;s address in the delivery step, and we&apos;ll send it straight to them.
            Each maker packs their own items, so wrapping and notes come from them.
          </p>
        </div>
      ) : null}
    </section>
  );
}
