"use client";

import { useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

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
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Stuck pending payments</Heading>
          <Text size="sm" color="muted">
            Orders still in pending_payment after the reservation timeout (~20 min)
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
                    None stuck right now.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.note}>
        The release-expired-reservations job cancels these automatically; this view is for
        ops visibility.
      </p>
    </>
  );
}
