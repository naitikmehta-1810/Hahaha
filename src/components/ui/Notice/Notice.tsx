import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import styles from "./Notice.module.css";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

type NoticeProps = {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/** Inline banner for errors, confirmations and heads-ups. */
export default function Notice({ tone = "info", title, children, action, className = "" }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div
      className={`${styles.notice} ${styles[tone]} ${className}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon size={18} className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
