"use client";

import { useCallback, useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

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
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Orders</Heading>
          <Text size="sm" color="muted">
            Latest 100 orders
          </Text>
        </div>
      </div>
      <div className={styles.formRow}>
        <label className={styles.field}>
          Status filter
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending_payment">pending_payment</option>
            <option value="paid">paid</option>
            <option value="processing">processing</option>
            <option value="shipped">shipped</option>
            <option value="delivered">delivered</option>
            <option value="cancelled">cancelled</option>
            <option value="returned">returned</option>
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => void load(statusFilter)}>
          Refresh
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <Text color="muted">Loading…</Text>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNumber}</td>
                  <td>{o.status}</td>
                  <td>₹{o.totalAmount.toLocaleString("en-IN")}</td>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.muted}>
                    No orders found.
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
