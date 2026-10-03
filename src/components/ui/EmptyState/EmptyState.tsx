import React from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Drop the dashed frame when already inside a card. */
  bare?: boolean;
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  bare = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${bare ? styles.bare : ""} ${className}`}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
