"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill, { humanizeStatus } from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDateTime, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

const STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const result = await apiRequest<{ orders: AdminOrder[] }>("GET", `/api/admin/orders${qs}`);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load orders.");
    } else {
      setError(null);
      setOrders(result.data.orders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  return (
    <>
      <PageHeader title="Orders" description="The latest 100 orders across every shop." />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div className={ui.toolbar}>
            <label className={ui.field}>
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {humanizeStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={15} />}
              disabled={loading}
              onClick={() => void load(statusFilter)}
            >
              Refresh
            </Button>
          </div>
        </div>
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
                    No orders{statusFilter ? ` with status “${humanizeStatus(statusFilter)}”` : ""}.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={4} className={ui.emptyCell}>
                    Loading orders…
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
