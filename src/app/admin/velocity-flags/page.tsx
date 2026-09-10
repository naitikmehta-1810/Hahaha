"use client";

import { useCallback, useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

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
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Velocity flags</Heading>
          <Text size="sm" color="muted">
            Accounts with &gt;5 orders in 24h, or &gt;3 COD orders totaling over ₹15,000
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
                <th>User</th>
                <th>Email</th>
                <th>Orders (24h)</th>
                <th>COD orders</th>
                <th>COD total</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.userId}>
                  <td>{f.fullName ?? f.userId.slice(0, 8)}</td>
                  <td>{f.email}</td>
                  <td>{f.orderCount}</td>
                  <td>{f.codOrderCount}</td>
                  <td>₹{f.codTotal.toLocaleString("en-IN")}</td>
                  <td>{f.flagReason}</td>
                </tr>
              ))}
              {flags.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    No velocity flags right now.
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
