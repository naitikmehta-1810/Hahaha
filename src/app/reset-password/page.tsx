"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";

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
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await apiRequest<{ message?: string }>("POST", "/api/auth/reset-password", {
      body: { token, password, confirmPassword },
      skipRefresh: true,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(result.data?.message ?? "Password updated.");
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "64px auto",
        padding: 24,
      }}
    >
      <Heading level={2}>Reset Password</Heading>
      <Text color="muted" style={{ marginTop: 12, marginBottom: 24 }}>
        Choose a new password for your Stuffsy account.
      </Text>

      <form onSubmit={(e) => void onSubmit(e)}>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}>
          New password
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border-dark)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}>
          Confirm password
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border-dark)",
            borderRadius: 8,
            marginBottom: 16,
          }}
        />
        <Button variant="primary" fullWidth disabled={busy || !token} type="submit">
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>

      {message ? (
        <Text size="sm" style={{ marginTop: 16, color: "var(--color-success, #15803d)" }}>
          {message} <Link href="/login">Sign in</Link>
        </Text>
      ) : null}
      {error ? (
        <Text size="sm" style={{ marginTop: 16, color: "var(--color-danger)" }}>
          {error}
        </Text>
      ) : null}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: 480, margin: "64px auto", padding: 24 }}>
          <Text>Loading…</Text>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
