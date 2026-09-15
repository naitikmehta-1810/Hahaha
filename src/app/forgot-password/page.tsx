"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/utils/api-client";
import styles from "./forgot-password.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<{ message?: string }>("POST", "/api/auth/forgot-password", {
        body: { email: email.trim() },
        skipRefresh: true,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        result.data?.message ??
          "If an account exists for that email, a password reset link was sent."
      );
    } catch {
      setError("Could not reach the server. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Forgot Password</h1>
        <p className={styles.subtitle}>
          Enter the email on your Stuffsy account. If it exists, we&apos;ll send a reset link.
        </p>

        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={styles.field}>
            Email
            <input
              className={styles.input}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>

        {message ? <p className={styles.statusOk}>{message}</p> : null}
        {error ? <p className={styles.statusErr}>{error}</p> : null}

        <div className={styles.footer}>
          <Link href="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
