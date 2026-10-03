"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDateTime, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

type StuckOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

export default function AdminStuckPaymentsPage() {
  const [orders, setOrders] = useState<StuckOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const result = await apiRequest<{ orders: StuckOrder[] }>(
        "GET",
        "/api/admin/stuck-pending-payments"
      );
      if (result.error || !result.data) {
        setError(result.error ?? "Could not load stuck payments.");
      } else {
        setOrders(result.data.orders);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Stuck payments"
        description="Orders still awaiting payment after the ~20 minute reservation timeout."
      />

      <Notice tone="info">
        The release-expired-reservations job cancels these automatically. This list is for
        visibility only.
      </Notice>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Placed</th>
                <th className={ui.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className={`${ui.cellPrimary} ${ui.mono}`}>{o.orderNumber}</td>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  <td className={ui.nowrap}>{formatDateTime(o.createdAt)}</td>
                  <td className={`${ui.num} ${ui.cellPrimary}`}>{rupees(o.totalAmount)}</td>
                </tr>
              ))}
              {!loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className={ui.emptyCell}>
                    Nothing is stuck right now.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={4} className={ui.emptyCell}>
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
