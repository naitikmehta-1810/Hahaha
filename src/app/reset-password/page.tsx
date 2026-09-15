"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/utils/api-client";
import styles from "../forgot-password/forgot-password.module.css";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Missing reset token. Open the link from your email again.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<{ message?: string }>("POST", "/api/auth/reset-password", {
        body: { token, password, confirmPassword },
        skipRefresh: true,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.data?.message ?? "Password updated.");
    } catch {
      setError("Could not reach the server. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset Password</h1>
        <p className={styles.subtitle}>Choose a new password for your Stuffsy account.</p>

        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={styles.field}>
            New password
            <input
              className={styles.input}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <label className={styles.field}>
            Confirm password
            <input
              className={styles.input}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
          </label>
          <button className={styles.submit} type="submit" disabled={busy || !token}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>

        {message ? (
          <p className={styles.statusOk}>
            {message} <Link href="/login">Sign in</Link>
          </p>
        ) : null}
        {error ? <p className={styles.statusErr}>{error}</p> : null}

        <div className={styles.footer}>
          <Link href="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.card}>
            <p className={styles.subtitle}>Loading…</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
