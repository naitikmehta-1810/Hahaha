"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, X, XCircle } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import {
  checkDeliverability,
  deliveryWindowLabel,
  isValidPincode,
  placeLabel,
  rememberPincode,
  type Deliverability,
} from "@/utils/deliverability";
import styles from "./DeliveryCheckDialog.module.css";

type Props = {
  productSlug: string;
  shopName: string;
  /** Set for a shop that delivers only inside its state; null for pan-India shops. */
  sellerState: string | null;
  /** A download: the state rule still applies (GST), but nothing is "delivered". */
  isDigital?: boolean;
  initialPincode: string;
  initialResult: Deliverability | null;
  /** What the buyer was doing, e.g. "Add to cart". Null when only checking. */
  actionLabel: string | null;
  onResult: (result: Deliverability) => void;
  /** Delivery is possible (or could not be ruled out): carry on with the action. */
  onProceed: () => void;
  onClose: () => void;
};

/**
 * Asks for a PIN code and shows whether, and by when, the item can be
 * delivered there. For a state-only shop it also gates adding to the cart.
 * Mount it only while open.
 */
export default function DeliveryCheckDialog({
  productSlug,
  shopName,
  sellerState,
  isDigital = false,
  initialPincode,
  initialResult,
  actionLabel,
  onResult,
  onProceed,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pincode, setPincode] = useState(initialPincode);
  const [result, setResult] = useState<Deliverability | null>(initialResult);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // No close() on cleanup: unmounting removes the modal, and a close event
    // there would report a dismissal the buyer never made.
    if (!dialog.open) dialog.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const shown = result && result.pincode === pincode ? result : null;

  const check = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!isValidPincode(pincode)) {
      setError("Enter a valid 6-digit PIN code.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setChecking(true);
    const response = await checkDeliverability(productSlug, pincode);
    setChecking(false);
    if (!response.data) {
      setResult(null);
      setError(response.error ?? "Could not check this PIN code. Try again.");
      return;
    }
    rememberPincode(pincode);
    setResult(response.data);
    onResult(response.data);
    if (response.data.deliverable === true && actionLabel) onProceed();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="delivery-check-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            <MapPin size={18} />
          </span>
          <h2 id="delivery-check-title" className={styles.title}>
            {isDigital ? "Check availability" : "Check delivery"}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className={styles.lead}>
          {!sellerState ? (
            <>Enter the PIN code you want this delivered to, to see when it will arrive.</>
          ) : isDigital ? (
            <>
              {shopName} can sell only to buyers in <strong>{sellerState}</strong>. Enter your
              billing PIN code.
            </>
          ) : (
            <>
              {shopName} delivers only within <strong>{sellerState}</strong>. Enter the PIN code
              you want this delivered to.
            </>
          )}
        </p>

        <form className={styles.form} onSubmit={(e) => void check(e)} noValidate>
          <label htmlFor="delivery-pincode" className={styles.label}>
            PIN code
          </label>
          <div className={styles.row}>
            <input
              ref={inputRef}
              id="delivery-pincode"
              className={styles.input}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="e.g. 560001"
              value={pincode}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby="delivery-check-status"
              onChange={(e) => {
                setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
            <Button type="submit" variant="outline" disabled={checking}>
              {checking ? "Checking…" : "Check"}
            </Button>
          </div>
        </form>

        <div id="delivery-check-status" className={styles.status} aria-live="polite">
          {error ? <p className={styles.error}>{error}</p> : null}

          {shown?.deliverable === true ? (
            <p className={`${styles.result} ${styles.ok}`}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                {isDigital ? "Available for" : "Delivers to"} <strong>{shown.pincode}</strong>
                {placeLabel(shown) ? ` · ${placeLabel(shown)}` : ""}
                {!isDigital && shown.estimate ? (
                  <>
                    <br />
                    {deliveryWindowLabel(shown.estimate)}, if ordered today.
                  </>
                ) : null}
              </span>
            </p>
          ) : null}

          {shown?.deliverable === false ? (
            <p className={`${styles.result} ${styles.blocked}`}>
              <XCircle size={18} aria-hidden="true" />
              {shown.courierUnavailable ? (
                <span>
                  Can&apos;t deliver to <strong>{shown.pincode}</strong> right now: no courier
                  serves this PIN code from {shown.shopName}. Try another PIN code.
                </span>
              ) : (
                <span>
                  {isDigital ? "Not available for" : "Can’t deliver to"} <strong>{shown.pincode}</strong>
                  {shown.state ? ` in ${shown.state}` : ""}. {shown.shopName}{" "}
                  {isDigital ? "can sell only within" : "ships only within"}{" "}
                  {shown.sellerState ?? sellerState}, so this item can&apos;t be added to your cart
                  for this address. Try another PIN code.
                </span>
              )}
            </p>
          ) : null}

          {shown && shown.deliverable === null ? (
            <p className={`${styles.result} ${styles.unknown}`}>
              <MapPin size={18} aria-hidden="true" />
              <span>
                We couldn&apos;t confirm where {shown.pincode} is right now. You can continue;
                checkout will confirm against your address.
              </span>
            </p>
          ) : null}
        </div>

        <div className={styles.actions}>
          {shown?.deliverable === null && actionLabel ? (
            <Button type="button" onClick={onProceed}>
              {actionLabel} anyway
            </Button>
          ) : null}
          {shown?.deliverable === true && !actionLabel ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : null}
          {shown?.deliverable === false ? (
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
