"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDate } from "@/utils/format";
import ui from "@/components/console/console.module.css";
import styles from "../admin.module.css";
import {
  emailProblem,
  newPasswordProblem,
  PASSWORD_HINT,
  personNameProblem,
  phoneProblem,
} from "@/utils/validation";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    setNotice(null);
    const problem =
      personNameProblem(fullName) ??
      emailProblem(email) ??
      phoneProblem(phoneNumber) ??
      newPasswordProblem(password, { email, fullName });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
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
    setNotice(`Account created for ${fullName.trim() || email}.`);
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setPassword("");
    setShopName("");
    setSellingState("");
    await load();
  }

  async function updateUser(id: string, body: { role?: "customer" | "admin"; status?: "active" | "blocked" }) {
    setBusyId(id);
    const result = await apiRequest("PATCH", `/api/admin/users/${id}`, { body });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    await load();
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Create a buyer, an admin, or a pending shop. Block or restore an account from the list."
      />

      <form className={ui.card} onSubmit={(event) => void createUser(event)}>
        <h2 className={styles.formTitle}>Add an account</h2>
        <div className={ui.formGrid}>
          <label className={ui.field}>
            <span>Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className={ui.field}>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className={ui.field}>
            <span>Phone</span>
            <input
              value={phoneNumber}
              inputMode="tel"
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            <span>Password</span>
            <input
              type="password"
              minLength={8}
              maxLength={72}
              placeholder={PASSWORD_HINT}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as "customer" | "admin")}>
              <option value="customer">Buyer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Shop name (optional)</span>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Creates a pending seller"
            />
          </label>
          <label className={ui.field}>
            <span>Selling state</span>
            <input
              value={sellingState}
              onChange={(e) => setSellingState(e.target.value)}
              placeholder="e.g. Gujarat"
            />
          </label>
        </div>
        <div className={ui.formActions}>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>All accounts</h2>
            <p className={ui.cardSub}>
              {loading ? "Loading…" : `${users.length.toLocaleString("en-IN")} accounts`}
            </p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className={ui.cellPrimary}>{u.fullName}</span>
                    <span className={ui.cellSub}>{u.email}</span>
                  </td>
                  <td className={ui.nowrap}>{u.phoneNumber ?? "—"}</td>
                  <td>
                    <StatusPill status={u.role}>{u.role === "admin" ? "Admin" : "Buyer"}</StatusPill>
                  </td>
                  <td>
                    <StatusPill status={u.status} />
                  </td>
                  <td className={ui.nowrap}>{formatDate(u.createdAt)}</td>
                  <td>
                    <div className={ui.rowActions}>
                      {u.role !== "admin" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === u.id}
                          onClick={() => void updateUser(u.id, { role: "admin" })}
                        >
                          Make admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === u.id}
                          onClick={() => void updateUser(u.id, { role: "customer" })}
                        >
                          Remove admin
                        </Button>
                      )}
                      {u.status !== "blocked" ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === u.id}
                          onClick={() => {
                            if (window.confirm(`Block ${u.fullName}'s account?`)) {
                              void updateUser(u.id, { status: "blocked" });
                            }
                          }}
                        >
                          Block
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === u.id}
                          onClick={() => void updateUser(u.id, { status: "active" })}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    No users found.
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
