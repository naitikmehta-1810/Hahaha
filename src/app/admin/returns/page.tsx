"use client";

import { useCallback, useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

type ReturnRequest = {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  reason: string;
  status: string;
  totalAmount: number;
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

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Returns</Heading>
          <Text size="sm" color="muted">
            Approve or reject return requests
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
                <th>Reason</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.orderNumber}</td>
                  <td>{r.reason}</td>
                  <td>₹{r.totalAmount.toLocaleString("en-IN")}</td>
                  <td>{r.status}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    {r.status === "requested" ? (
                      <div className={styles.actions}>
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
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => void decide(r.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    No return requests.
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
