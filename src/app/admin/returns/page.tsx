"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDate, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

type ReturnRequest = {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  reason: string;
  status: string;
  totalAmount: number;
  /** What approving refunds; lower than the total when items were sold with no returns. */
  refundAmount?: number;
  excludedItemCount?: number;
  createdAt: string;
};

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiRequest<{ returnRequests: ReturnRequest[] }>(
      "GET",
      "/api/admin/return-requests"
    );
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load return requests.");
    } else {
      setError(null);
      setRows(result.data.returnRequests);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    const result = await apiRequest<{ returnRequest: { id: string; status: string } }>(
      "POST",
      `/api/admin/return-requests/${encodeURIComponent(id)}/decide`,
      { body: { decision } }
    );
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  const waiting = rows.filter((r) => r.status === "requested").length;

  return (
    <>
      <PageHeader
        title="Returns"
        description="Approve or reject return requests from buyers."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Return requests</h2>
            <p className={ui.cardSub}>
              {loading ? "Loading…" : `${waiting} waiting for a decision · ${rows.length} total`}
            </p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested</th>
                <th className={ui.num}>Refund</th>
                <th className={ui.num}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${ui.cellPrimary} ${ui.mono}`}>{r.orderNumber}</td>
                  <td>{r.reason}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className={ui.nowrap}>{formatDate(r.createdAt)}</td>
                  <td className={`${ui.num} ${ui.cellPrimary}`}>
                    {rupees(r.refundAmount ?? r.totalAmount)}
                    {r.excludedItemCount ? (
                      <div className={ui.muted}>
                        of {rupees(r.totalAmount)} · {r.excludedItemCount} no-returns item
                        {r.excludedItemCount === 1 ? "" : "s"} excluded
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {r.status === "requested" ? (
                      <div className={ui.rowActions}>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className={`${ui.rowActions} ${ui.muted}`}>Decided</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    No return requests.
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
