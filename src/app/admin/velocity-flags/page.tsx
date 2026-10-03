"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

type VelocityFlag = {
  userId: string;
  email: string;
  fullName: string | null;
  orderCount: number;
  codOrderCount: number;
  codTotal: number;
  flagReason: string;
};

export default function AdminVelocityFlagsPage() {
  const [flags, setFlags] = useState<VelocityFlag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await apiRequest<{ flags: VelocityFlag[] }>(
      "GET",
      "/api/admin/velocity-flags"
    );
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load velocity flags.");
    } else {
      setError(null);
      setFlags(result.data.flags);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Velocity flags"
        description="Accounts with more than 5 orders in 24 hours, or more than 3 COD orders totalling over ₹15,000."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Reason</th>
                <th className={ui.num}>Orders (24h)</th>
                <th className={ui.num}>COD orders</th>
                <th className={ui.num}>COD total</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.userId}>
                  <td>
                    <span className={ui.cellPrimary}>{f.fullName ?? f.userId.slice(0, 8)}</span>
                    <span className={ui.cellSub}>{f.email}</span>
                  </td>
                  <td>
                    <StatusPill tone="warning">{f.flagReason}</StatusPill>
                  </td>
                  <td className={ui.num}>{f.orderCount}</td>
                  <td className={ui.num}>{f.codOrderCount}</td>
                  <td className={`${ui.num} ${ui.cellPrimary}`}>{rupees(f.codTotal)}</td>
                </tr>
              ))}
              {!loading && flags.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    No accounts are flagged right now.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    Loading…
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
