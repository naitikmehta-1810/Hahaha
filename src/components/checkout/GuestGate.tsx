"use client";

import { useState } from "react";
import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, type AuthUser } from "@/utils/api-client";
import { emailProblem, normalizeIndianMobile, personNameProblem, phoneProblem } from "@/utils/validation";
import styles from "./GuestGate.module.css";

/**
 * Shown at checkout to someone who isn't signed in: sign in, or carry on as a
 * guest with just a name, email and phone. A guest gets a password-less account
 * behind the scenes, so the order, payment, tracking and invoice all work as
 * for any buyer.
 */
export default function GuestGate() {
  const { setUser, refreshSession } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem =
      personNameProblem(fullName) ||
      emailProblem(email) ||
      phoneProblem(phone) ||
      (accepted ? null : "Accept the terms to continue.");
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setAccountExists(false);
    const result = await apiRequest<{ user: AuthUser }>("POST", "/api/auth/guest-checkout", {
      skipRefresh: true,
      body: {
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: normalizeIndianMobile(phone) ?? phone.trim(),
        termsAccepted: true,
      },
    });
    setBusy(false);
    if (result.error || !result.data) {
      const code = (result.errorData as { code?: string } | undefined)?.code;
      setAccountExists(code === "ACCOUNT_EXISTS");
      setError(result.error ?? "We couldn't start guest checkout. Try again.");
      return;
    }
    setUser(result.data.user);
    // Pull the session as the server sees it so every page agrees.
    void refreshSession();
  };

  const next = encodeURIComponent("/checkout");
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>How would you like to check out?</h1>
      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="gate-signin">
          <span className={styles.icon} aria-hidden="true">
            <LogIn size={18} />
          </span>
          <h2 id="gate-signin" className={styles.h2}>
            I have an account
          </h2>
          <p className={styles.lead}>Sign in to use your saved addresses and see your past orders.</p>
          <ButtonLink href={`/login?next=${next}`} fullWidth>
            Sign in
          </ButtonLink>
          <p className={styles.small}>
            New here? <Link href={`/signup?next=${next}`}>Create an account</Link>
          </p>
        </section>

        <form className={styles.card} onSubmit={(e) => void submit(e)} noValidate aria-labelledby="gate-guest">
          <span className={styles.icon} aria-hidden="true">
            <UserRound size={18} />
          </span>
          <h2 id="gate-guest" className={styles.h2}>
            Continue as guest
          </h2>
          <p className={styles.lead}>No password needed. We&apos;ll use these details for your order updates.</p>
          <label className={styles.field}>
            <span>Full name</span>
            <input value={fullName} autoComplete="name" maxLength={80} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Email</span>
            <input type="email" value={email} autoComplete="email" maxLength={120} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Mobile number</span>
            <input value={phone} inputMode="tel" autoComplete="tel" maxLength={16} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              I agree to the Terms of Service and Privacy Policy. A Stuffsy account is created for this email so you can
              track your order; set a password any time with “Forgot password”.
            </span>
          </label>
          {error ? (
            <Notice
              tone="danger"
              action={
                accountExists ? (
                  <ButtonLink href={`/login?next=${next}`} size="sm" variant="outline">
                    Sign in
                  </ButtonLink>
                ) : undefined
              }
            >
              {error}
            </Notice>
          ) : null}
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? "One moment…" : "Continue as guest"}
          </Button>
        </form>
      </div>
    </div>
  );
}
