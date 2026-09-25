"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
import styles from "../admin.module.css";

type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  status: string;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "admin">("customer");
  const [shopName, setShopName] = useState("");
  const [sellingState, setSellingState] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest<{ users: AdminUser[] }>("GET", "/api/admin/users");
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load users.");
    } else {
      setError(null);
      setUsers(result.data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await apiRequest("POST", "/api/admin/users", {
      body: {
        fullName,
        email,
        phoneNumber,
        password,
        role,
        shopName: shopName.trim() || undefined,
        sellingState: sellingState.trim() || undefined,
      },
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setPassword("");
    setShopName("");
    setSellingState("");
    await load();
  }

  async function updateUser(id: string, body: { role?: "customer" | "admin"; status?: "active" | "blocked" }) {
    const result = await apiRequest("PATCH", `/api/admin/users/${id}`, { body });
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
          <Heading level={2}>Users</Heading>
          <Text size="sm" color="muted">
            Create a buyer, an admin, or a pending shop. Block or restore an account below.
          </Text>
        </div>
      </div>
      <form className={styles.formRow} onSubmit={(event) => void createUser(event)}>
        <label className={styles.field}>
          Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Phone
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Password
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as "customer" | "admin")}>
            <option value="customer">Buyer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className={styles.field}>
          Shop name (optional)
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Creates a pending seller"
          />
        </label>
        <label className={styles.field}>
          Selling state
          <input value={sellingState} onChange={(e) => setSellingState(e.target.value)} placeholder="Gujarat" />
        </label>
        <Button type="submit" size="sm" variant="primary" disabled={saving}>
          {saving ? "Creating…" : "Create"}
        </Button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <Text color="muted">Loading…</Text>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.phoneNumber ?? "—"}</td>
                  <td>{u.role}</td>
                  <td>{u.status}</td>
                  <td>{new Date(u.createdAt).toLocaleString()}</td>
                  <td>
                    <div className={styles.actions}>
                      {u.status !== "blocked" ? (
                        <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, { status: "blocked" })}>
                          Block
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, { status: "active" })}>
                          Restore
                        </Button>
                      )}
                      {u.role !== "admin" ? (
                        <Button size="sm" variant="primary" onClick={() => void updateUser(u.id, { role: "admin" })}>
                          Make admin
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void updateUser(u.id, { role: "customer" })}>
                          Remove admin
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    No users found.
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
