"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/utils/api-client";
import styles from "@/components/auth/AuthPage.module.css";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus({ type: "error", message: "Verification token is required" });
      return;
    }

    let cancelled = false;

    void apiRequest<{ message?: string }>("POST", "/api/auth/verify-email/confirm", {
      body: { token },
      skipRefresh: true,
    }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.error) {
        setStatus({ type: "error", message: result.error });
        return;
      }
      setStatus({
        type: "success",
        message: result.data?.message ?? "Email verified",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.card} style={{ gridTemplateColumns: "1fr", minHeight: "auto" }}>
        <section className={styles.panel} style={{ minHeight: "auto", padding: 40 }}>
          <div className={styles.formHeader}>
            <h1>Verify email</h1>
            <p>Confirming your Stuffsy account email.</p>
          </div>
          {status && (
            <p
              className={`${styles.statusMessage} ${
                status.type === "error" ? styles.statusError : styles.statusSuccess
              }`}
              role="alert"
            >
              {status.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
