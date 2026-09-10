"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";

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
    const result = await apiRequest<{ message?: string }>("POST", "/api/auth/forgot-password", {
      body: { email: email.trim() },
      skipRefresh: true,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(
      result.data?.message ??
        "If an account exists for that email, a password reset link was sent."
    );
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "64px auto",
        padding: 24,
      }}
    >
      <Heading level={2}>Forgot Password</Heading>
      <Text color="muted" style={{ marginTop: 12, marginBottom: 24 }}>
        Enter the email on your Stuffsy account. If it exists, we&apos;ll send a reset link.
      </Text>

      <form onSubmit={(e) => void onSubmit(e)}>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-border-dark)",
            borderRadius: 8,
            marginBottom: 16,
          }}
        />
        <Button variant="primary" fullWidth disabled={busy} type="submit">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      {message ? (
        <Text size="sm" style={{ marginTop: 16, color: "var(--color-success, #15803d)" }}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text size="sm" style={{ marginTop: 16, color: "var(--color-danger)" }}>
          {error}
        </Text>
      ) : null}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/login">Back to Sign In</Link>
      </div>
    </div>
  );
}
