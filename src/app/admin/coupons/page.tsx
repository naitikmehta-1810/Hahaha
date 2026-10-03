"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDate, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";
import styles from "../admin.module.css";

type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: string | number;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function couponValue(coupon: CouponRow) {
  return coupon.type === "flat" ? rupees(coupon.value) : `${Number(coupon.value)}%`;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Read once per visit: comparing against a fresh Date.now() each render is impure.
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const result = await apiRequest<{ coupons: CouponRow[] }>("GET", "/api/admin/coupons");
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load coupons.");
    } else {
      setError(null);
      setCoupons(result.data.coupons);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setCode("");
    setType("percentage");
    setValue("10");
    setExpiresAt("");
    setIsActive(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!expiresAt) {
      setError("Choose when the coupon expires.");
      return;
    }
    setSaving(true);
    setNotice(null);
    const body = {
      code,
      type,
      value: Number(value),
      expiresAt: new Date(expiresAt).toISOString(),
      ...(editingId ? { isActive } : {}),
    };
    const result = editingId
      ? await apiRequest("PATCH", `/api/admin/coupons/${editingId}`, { body })
      : await apiRequest("POST", "/api/admin/coupons", { body });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(editingId ? `Coupon ${code} updated.` : `Coupon ${code} created.`);
    resetForm();
    await load();
  }

  async function onDelete(coupon: CouponRow) {
    if (!window.confirm(`Delete coupon ${coupon.code}? Buyers will no longer be able to use it.`)) return;
    setBusyId(coupon.id);
    const result = await apiRequest("DELETE", `/api/admin/coupons/${coupon.id}`);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (editingId === coupon.id) resetForm();
    await load();
  }

  async function sendOffer(coupon: CouponRow) {
    setBusyId(coupon.id);
    setNotice(null);
    const result = await apiRequest<{ enqueued: number }>(
      "POST",
      `/api/admin/coupons/${coupon.id}/send-offer`,
      { body: { description: `Use code ${coupon.code} on Stuffsy`, limit: 100 } }
    );
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(`Offer for ${coupon.code} queued to ${result.data?.enqueued ?? 0} buyers.`);
  }

  function startEdit(coupon: CouponRow) {
    setEditingId(coupon.id);
    setCode(coupon.code);
    setType(coupon.type === "flat" ? "flat" : "percentage");
    setValue(String(coupon.value));
    setExpiresAt(toLocalInput(coupon.expires_at));
    setIsActive(Boolean(coupon.is_active));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Create discount codes, edit them, and send an offer email to buyers."
      />

      <form className={ui.card} onSubmit={(e) => void onSubmit(e)}>
        <h2 className={styles.formTitle}>
          {editingId ? "Edit coupon" : "New coupon"}
          {editingId ? <span className={styles.editingTag}>Editing {code}</span> : null}
        </h2>
        <div className={ui.formGrid}>
          <label className={ui.field}>
            <span>Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME10"
              required
            />
          </label>
          <label className={ui.field}>
            <span>Discount type</span>
            <select value={type} onChange={(e) => setType(e.target.value as "percentage" | "flat")}>
              <option value="percentage">Percentage off</option>
              <option value="flat">Flat amount (₹)</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>{type === "flat" ? "Amount (₹)" : "Percent off"}</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            <span>Expires</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
          </label>
          {editingId ? (
            <label className={ui.field}>
              <span>Status</span>
              <select
                value={isActive ? "yes" : "no"}
                onChange={(e) => setIsActive(e.target.value === "yes")}
              >
                <option value="yes">Active</option>
                <option value="no">Paused</option>
              </select>
            </label>
          ) : null}
        </div>
        <div className={ui.formActions}>
          {editingId ? (
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Create coupon"}
          </Button>
        </div>
      </form>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>All coupons</h2>
            <p className={ui.cardSub}>{loading ? "Loading…" : `${coupons.length} coupons`}</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Status</th>
                <th>Starts</th>
                <th>Expires</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const expired = c.expires_at ? new Date(c.expires_at).getTime() < now : false;
                return (
                  <tr key={c.id}>
                    <td>
                      <span className={styles.code}>{c.code}</span>
                    </td>
                    <td className={ui.cellPrimary}>{couponValue(c)}</td>
                    <td>
                      {expired ? (
                        <StatusPill tone="neutral">Expired</StatusPill>
                      ) : (
                        <StatusPill status={c.is_active ? "active" : "inactive"}>
                          {c.is_active ? "Active" : "Paused"}
                        </StatusPill>
                      )}
                    </td>
                    <td className={ui.nowrap}>{formatDate(c.starts_at)}</td>
                    <td className={ui.nowrap}>{formatDate(c.expires_at)}</td>
                    <td>
                      <div className={ui.rowActions}>
                        <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id || !c.is_active || expired}
                          onClick={() => void sendOffer(c)}
                        >
                          Send offer
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === c.id}
                          onClick={() => void onDelete(c)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    No coupons yet. Create one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
