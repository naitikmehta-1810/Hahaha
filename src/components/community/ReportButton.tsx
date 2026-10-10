"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Dialog from "@/components/ui/Dialog/Dialog";
import Notice from "@/components/ui/Notice/Notice";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { REPORT_REASONS, submitReport, type ReportTargetType } from "@/utils/community";
import styles from "./Community.module.css";

const NOUN: Record<ReportTargetType, string> = {
  product: "listing",
  review: "review",
  shop: "shop",
  question: "question",
  message: "message",
};

/** A small "Report" link that opens a form for flagging a listing, review, shop, question or message. */
export default function ReportButton({
  targetType,
  targetId,
  label = "Report",
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
  className?: string;
}) {
  const { isAuthenticated, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const noun = NOUN[targetType];

  const close = () => {
    setOpen(false);
    if (done) {
      setDone(false);
      setReason("");
      setDetails("");
    }
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError("Choose what's wrong.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await submitReport({
      targetType,
      targetId,
      reason,
      details: details.trim() || undefined,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.reportLink} ${className ?? ""}`}
        onClick={() => {
          if (status === "loading") return;
          if (!isAuthenticated) {
            redirectToLogin();
            return;
          }
          setOpen(true);
        }}
        aria-label={`${label} this ${noun}`}
      >
        <Flag size={12} aria-hidden="true" />
        {label}
      </button>

      {open ? (
        <Dialog title={`Report this ${noun}`} icon={<Flag size={18} />} onClose={close}>
          {done ? (
            <>
              <Notice tone="success">
                Thanks for letting us know. Our team will review this {noun}.
              </Notice>
              <div className={styles.actions}>
                <Button onClick={close}>Done</Button>
              </div>
            </>
          ) : (
            <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
              <p className={styles.lead}>
                Reports are private. We look at every one and take action when something breaks our rules.
              </p>
              <fieldset className={styles.reasons}>
                <legend>What&apos;s wrong?</legend>
                {REPORT_REASONS.map((item) => (
                  <label key={item.value} className={styles.reason}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={item.value}
                      checked={reason === item.value}
                      onChange={() => {
                        setReason(item.value);
                        setError(null);
                      }}
                    />
                    <span>
                      {item.label}
                      {item.hint ? <small>{item.hint}</small> : null}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className={styles.field}>
                <span>More details (optional)</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Anything that helps us look into it"
                />
                <span className={styles.hint}>
                  <span />
                  <span>{details.length}/500</span>
                </span>
              </label>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <div className={styles.actions}>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send report"}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
