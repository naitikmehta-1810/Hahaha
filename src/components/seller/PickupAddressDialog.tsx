"use client";

import { useEffect, useState } from "react";
import { INDIA_STATES } from "@/utils/india-states";
import { pickupNicknameFromShop } from "@/utils/pickup";
import { updateMyShop } from "@/utils/seller";
import styles from "./PickupAddressDialog.module.css";

export type PickupDialogDefaults = {
  shopName: string;
  name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  pickupLocationName?: string;
  sellingScope?: string | null;
  sellingState?: string | null;
};

type PickupAddressDialogProps = {
  open: boolean;
  defaults: PickupDialogDefaults;
  onSaved: () => void;
};

export default function PickupAddressDialog({
  open,
  defaults,
  onSaved,
}: PickupAddressDialogProps) {
  const lockedState =
    defaults.sellingScope === "state" && defaults.sellingState
      ? defaults.sellingState
      : "";
  const [form, setForm] = useState({
    pickupLocationName: "",
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      pickupLocationName:
        defaults.pickupLocationName?.trim() || pickupNicknameFromShop(defaults.shopName),
      name: defaults.name?.trim() || defaults.shopName.trim(),
      email: defaults.email?.trim() || "",
      phone: String(defaults.phone ?? "").replace(/\D/g, "").slice(-10),
      address1: defaults.address1?.trim() || "",
      address2: defaults.address2?.trim() || "",
      city: defaults.city?.trim() || "",
      state: lockedState || defaults.state?.trim() || "",
      pincode: defaults.pincode?.trim() || "",
    });
  }, [
    open,
    defaults.shopName,
    defaults.name,
    defaults.email,
    defaults.phone,
    defaults.address1,
    defaults.address2,
    defaults.city,
    defaults.state,
    defaults.pincode,
    defaults.pickupLocationName,
    lockedState,
  ]);

  if (!open) return null;

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const phone = form.phone.replace(/\D/g, "").slice(-10);
    const result = await updateMyShop({
      pickupAddress: {
        pickupLocationName: form.pickupLocationName.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone,
        address1: form.address1.trim(),
        address2: form.address2.trim() || null,
        city: form.city.trim(),
        state: (lockedState || form.state).trim(),
        pincode: form.pincode.trim(),
        country: "India",
      },
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  const stateOptions = lockedState
    ? [lockedState]
    : INDIA_STATES;

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-dialog-title"
      >
        <h2 id="pickup-dialog-title" className={styles.title}>
          Add a pickup address
        </h2>
        <p className={styles.lead}>
          Shipments leave from this address. Saving registers it on Shiprocket under
          your shop nickname, so you can ship without setting it up again later.
        </p>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className={`${styles.field} ${styles.span2}`}>
            <span className={styles.label}>Shiprocket nickname</span>
            <input
              className={styles.control}
              value={form.pickupLocationName}
              maxLength={36}
              required
              onChange={(event) => set("pickupLocationName", event.target.value)}
            />
            <span className={styles.hint}>
              Defaults to your shop name. This is the name you will see in Shiprocket.
            </span>
          </label>
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span className={styles.label}>Contact name</span>
              <input
                className={styles.control}
                value={form.name}
                required
                minLength={2}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.control}
                type="email"
                value={form.email}
                required
                onChange={(event) => set("email", event.target.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Phone (10 digits)</span>
            <input
              className={styles.control}
              inputMode="numeric"
              value={form.phone}
              required
              pattern="[0-9]{10}"
              onChange={(event) => set("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Address</span>
            <input
              className={styles.control}
              value={form.address1}
              required
              minLength={5}
              onChange={(event) => set("address1", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Address line 2</span>
            <input
              className={styles.control}
              value={form.address2}
              onChange={(event) => set("address2", event.target.value)}
            />
          </label>
          <div className={styles.grid3}>
            <label className={styles.field}>
              <span className={styles.label}>City</span>
              <input
                className={styles.control}
                value={form.city}
                required
                onChange={(event) => set("city", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>State</span>
              <select
                className={styles.control}
                value={lockedState || form.state}
                required
                disabled={Boolean(lockedState)}
                onChange={(event) => set("state", event.target.value)}
              >
                <option value="">Select state</option>
                {stateOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Pincode</span>
              <input
                className={styles.control}
                inputMode="numeric"
                value={form.pincode}
                required
                pattern="[0-9]{6}"
                maxLength={6}
                onChange={(event) => set("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
          </div>
          {lockedState ? (
            <p className={styles.hint}>
              This shop sells only in {lockedState}, so the pickup address has to be there.
            </p>
          ) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button className={styles.save} type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save pickup address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
