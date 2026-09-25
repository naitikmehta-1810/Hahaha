"use client";

import { useCallback, useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

type AdminSeller = {
  id: string;
  shopName: string;
  shopSlug: string;
  status: string;
  contactPhone: string | null;
  createdAt: string;
  sellingScope: "state" | "pan_india";
  sellingState: string | null;
  gstin: string | null;
  gstVerified: boolean;
  panIndiaBypass: boolean;
};

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<AdminSeller[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiRequest<{ sellers: AdminSeller[] }>("GET", "/api/admin/sellers");
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load sellers.");
    } else {
      setError(null);
      setSellers(result.data.sellers);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "pending" | "active" | "suspended") {
    setBusyId(id);
    const result = await apiRequest<{ seller: { id: string; status: string } }>(
      "PATCH",
      `/api/admin/sellers/${encodeURIComponent(id)}/status`,
      { body: { status } }
    );
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function setPanIndia(id: string, panIndia: boolean) {
    setBusyId(id);
    const result = await apiRequest("PATCH", `/api/admin/sellers/${encodeURIComponent(id)}/selling-scope`, {
      body: { panIndia },
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  function reachLabel(seller: AdminSeller) {
    if (seller.gstVerified) return `GST · all India`;
    if (seller.panIndiaBypass || seller.sellingScope === "pan_india") {
      return seller.panIndiaBypass ? "Admin bypass · all India" : "All India";
    }
    return seller.sellingState ? `State only · ${seller.sellingState}` : "State only";
  }

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Sellers</Heading>
          <Text size="sm" color="muted">
            Approve shops, suspend them, or let a shop sell across India without GST
          </Text>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <Text color="muted">Loading…</Text>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Slug</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Selling reach</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id}>
                  <td>{s.shopName}</td>
                  <td>{s.shopSlug}</td>
                  <td>{s.contactPhone ?? "—"}</td>
                  <td>{s.status}</td>
                  <td>{reachLabel(s)}</td>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                  <td>
                    <div className={styles.actions}>
                      {s.status !== "active" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === s.id}
                          onClick={() => void setStatus(s.id, "active")}
                        >
                          Approve
                        </Button>
                      ) : null}
                      {s.status !== "suspended" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === s.id}
                          onClick={() => void setStatus(s.id, "suspended")}
                        >
                          Suspend
                        </Button>
                      ) : null}
                      {!s.gstVerified && s.sellingScope !== "pan_india" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === s.id}
                          onClick={() => void setPanIndia(s.id, true)}
                        >
                          Allow all India
                        </Button>
                      ) : null}
                      {!s.gstVerified && (s.panIndiaBypass || s.sellingScope === "pan_india") && s.sellingState ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === s.id}
                          onClick={() => void setPanIndia(s.id, false)}
                        >
                          Limit to {s.sellingState}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    No sellers found.
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
