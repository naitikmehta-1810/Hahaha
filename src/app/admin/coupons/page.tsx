"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
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

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);

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
      setError("Expires at is required (ISO datetime).");
      return;
    }
    setSaving(true);
    const expiresIso = new Date(expiresAt).toISOString();
    const body = {
      code,
      type,
      value: Number(value),
      expiresAt: expiresIso,
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
    resetForm();
    await load();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Soft-delete this coupon?")) return;
    const result = await apiRequest("DELETE", `/api/admin/coupons/${id}`);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Coupons</Heading>
          <Text size="sm" color="muted">
            List, create, edit, and soft-delete coupons
          </Text>
        </div>
      </div>

      <form className={styles.formRow} onSubmit={(e) => void onSubmit(e)}>
        <label className={styles.field}>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "percentage" | "flat")}
          >
            <option value="percentage">percentage</option>
            <option value="flat">flat</option>
          </select>
        </label>
        <label className={styles.field}>
          Value
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          Expires at
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            required
          />
        </label>
        {editingId ? (
          <label className={styles.field}>
            Active
            <select
              value={isActive ? "yes" : "no"}
              onChange={(e) => setIsActive(e.target.value === "yes")}
            >
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </label>
        ) : null}
        <Button type="submit" size="sm" variant="primary" disabled={saving}>
          {editingId ? "Update" : "Create"}
        </Button>
        {editingId ? (
          <Button type="button" size="sm" variant="outline" onClick={resetForm}>
            Cancel
          </Button>
        ) : null}
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <Text color="muted">Loading…</Text>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Active</th>
                <th>Starts</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.type}</td>
                  <td>{c.value}</td>
                  <td>{c.is_active ? "yes" : "no"}</td>
                  <td>{c.starts_at ? new Date(c.starts_at).toLocaleString() : "—"}</td>
                  <td>{c.expires_at ? new Date(c.expires_at).toLocaleString() : "—"}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(c.id);
                        setCode(c.code);
                        setType(c.type === "flat" ? "flat" : "percentage");
                        setValue(String(c.value));
                        setExpiresAt(toLocalInput(c.expires_at));
                        setIsActive(Boolean(c.is_active));
                      }}
                    >
                      Edit
                    </Button>{" "}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void (async () => {
                          const result = await apiRequest<{ enqueued: number }>(
                            "POST",
                            `/api/admin/coupons/${c.id}/send-offer`,
                            {
                              body: {
                                description: `Use code ${c.code} on Stuffsy`,
                                limit: 100,
                              },
                            }
                          );
                          if (result.error) {
                            setError(result.error);
                            return;
                          }
                          setError(null);
                          window.alert(`Offer queued to ${result.data?.enqueued ?? 0} users.`);
                        })();
                      }}
                    >
                      Send offer
                    </Button>{" "}
                    <Button size="sm" variant="outline" onClick={() => void onDelete(c.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    No coupons yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
