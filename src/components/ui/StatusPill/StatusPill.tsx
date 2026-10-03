import React from "react";
import styles from "./StatusPill.module.css";

export type StatusTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Orders and shipments
  delivered: "success",
  paid: "success",
  accepted: "info",
  shipped: "info",
  in_transit: "info",
  out_for_delivery: "info",
  picked_up: "info",
  processing: "brand",
  pending_pickup: "brand",
  pending_payment: "warning",
  awaiting_pickup: "warning",
  cancelled: "danger",
  returned: "neutral",
  refunded: "neutral",
  rto: "danger",
  failed: "danger",
  // Accounts, shops and listings
  active: "success",
  approved: "success",
  verified: "success",
  pending: "warning",
  requested: "warning",
  draft: "neutral",
  archived: "neutral",
  inactive: "neutral",
  blocked: "danger",
  suspended: "danger",
  rejected: "danger",
  // Roles
  admin: "brand",
  customer: "neutral",
};

/** `out_for_delivery` -> `Out for delivery` */
export function humanizeStatus(status: string) {
  const words = status.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "—";
}

export function statusTone(status: string): StatusTone {
  return TONE_BY_STATUS[status.toLowerCase()] ?? "neutral";
}

type StatusPillProps = {
  /** Raw backend status; drives both the label and the colour. */
  status?: string;
  /** Override the colour when the label is not a backend status. */
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
};

export default function StatusPill({ status = "", tone, children, className = "" }: StatusPillProps) {
  const resolved = tone ?? statusTone(status);
  return (
    <span className={`${styles.pill} ${styles[resolved]} ${className}`}>
      <span className={styles.dot} aria-hidden="true" />
      {children ?? humanizeStatus(status)}
    </span>
  );
}
