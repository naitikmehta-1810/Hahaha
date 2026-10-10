"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDate } from "@/utils/format";
import ui from "@/components/console/console.module.css";

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
  /** Null = the platform default. */
  commissionPercent: number | null;
};

const FILTERS = [
  { value: "all", label: "All shops" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;

function reach(seller: AdminSeller) {
  if (seller.gstVerified) return { label: "All India · GST", tone: "success" as const };
  if (seller.panIndiaBypass || seller.sellingScope === "pan_india") {
    return {
      label: seller.panIndiaBypass ? "All India · admin bypass" : "All India",
      tone: "info" as const,
    };
  }
  return {
    label: seller.sellingState ? `${seller.sellingState} only` : "Home state only",
    tone: "neutral" as const,
  };
}

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<AdminSeller[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [defaultCommission, setDefaultCommission] = useState(0);

  const load = useCallback(async () => {
    const result = await apiRequest<{ sellers: AdminSeller[]; defaultCommissionPercent?: number }>(
      "GET",
      "/api/admin/sellers"
    );
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load sellers.");
    } else {
      setError(null);
      setSellers(result.data.sellers);
      if (typeof result.data.defaultCommissionPercent === "number") {
        setDefaultCommission(result.data.defaultCommissionPercent);
      }
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

  async function editCommission(seller: AdminSeller) {
    const current = seller.commissionPercent ?? defaultCommission;
    const input = window.prompt(
      `Commission for ${seller.shopName} (%). Leave empty to use the platform default of ${defaultCommission}%.`,
      seller.commissionPercent == null ? "" : String(current)
    );
    if (input === null) return;
    const trimmed = input.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      setError("Commission must be a number from 0 to 100.");
      return;
    }
    setBusyId(seller.id);
    const result = await apiRequest("PATCH", `/api/admin/sellers/${encodeURIComponent(seller.id)}/commission`, {
      body: { commissionPercent: value },
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function adjustBalance(seller: AdminSeller) {
    const amountText = window.prompt(
      `Adjust ${seller.shopName}'s balance (₹). Use a negative number to deduct (e.g. -1500), positive to add.`
    );
    if (amountText === null) return;
    const amount = Number(amountText.trim());
    if (!Number.isFinite(amount) || amount === 0) {
      setError("Enter a non-zero amount, e.g. -1500 or 250.");
      return;
    }
    const reason = window.prompt("Reason (the seller sees this in their earnings history):")?.trim();
    if (!reason || reason.length < 3) return;
    if (!window.confirm(`${amount > 0 ? "Add" : "Deduct"} ₹${Math.abs(amount)} ${amount > 0 ? "to" : "from"} ${seller.shopName}?`)) return;
    setBusyId(seller.id);
    const result = await apiRequest("POST", `/api/admin/sellers/${encodeURIComponent(seller.id)}/adjust`, {
      body: { amount, reason },
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
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

  const counts = {
    all: sellers.length,
    pending: sellers.filter((s) => s.status === "pending").length,
    active: sellers.filter((s) => s.status === "active").length,
    suspended: sellers.filter((s) => s.status === "suspended").length,
  };
  const visible = filter === "all" ? sellers : sellers.filter((s) => s.status === filter);

  return (
    <>
      <PageHeader
        title="Sellers"
        description="Approve new shops, suspend them, or let a shop sell across India without a GSTIN."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div className={ui.toolbar} role="tablist" aria-label="Filter shops by status">
            {FILTERS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={filter === item.value ? "primary" : "secondary"}
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label} ({counts[item.value]})
              </Button>
            ))}
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Status</th>
                <th>Selling reach</th>
                <th>Commission</th>
                <th>Phone</th>
                <th>Joined</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const shopReach = reach(s);
                const busy = busyId === s.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/shops/${s.shopSlug}`} className={ui.cellPrimary}>
                        {s.shopName}
                      </Link>
                      <span className={ui.cellSub}>/{s.shopSlug}</span>
                    </td>
                    <td>
                      <StatusPill status={s.status} />
                    </td>
                    <td>
                      <StatusPill tone={shopReach.tone}>{shopReach.label}</StatusPill>
                    </td>
                    <td className={ui.nowrap}>
                      {s.commissionPercent ?? defaultCommission}%
                      {s.commissionPercent == null ? <span className={ui.cellSub}>default</span> : null}
                    </td>
                    <td className={ui.nowrap}>{s.contactPhone ?? "—"}</td>
                    <td className={ui.nowrap}>{formatDate(s.createdAt)}</td>
                    <td>
                      <div className={ui.rowActions}>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void editCommission(s)}>
                          Commission
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void adjustBalance(s)}>
                          Adjust balance
                        </Button>
                        {s.status !== "active" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            onClick={() => void setStatus(s.id, "active")}
                          >
                            {s.status === "suspended" ? "Reactivate" : "Approve"}
                          </Button>
                        ) : null}
                        {!s.gstVerified && s.sellingScope !== "pan_india" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void setPanIndia(s.id, true)}
                          >
                            Allow all India
                          </Button>
                        ) : null}
                        {!s.gstVerified &&
                        (s.panIndiaBypass || s.sellingScope === "pan_india") &&
                        s.sellingState ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void setPanIndia(s.id, false)}
                          >
                            Limit to {s.sellingState}
                          </Button>
                        ) : null}
                        {s.status !== "suspended" ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Suspend ${s.shopName}?`)) {
                                void setStatus(s.id, "suspended");
                              }
                            }}
                          >
                            Suspend
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className={ui.emptyCell}>
                    {filter === "all" ? "No sellers yet." : `No ${filter} shops.`}
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={7} className={ui.emptyCell}>
                    Loading shops…
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
