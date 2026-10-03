import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small label above the title, e.g. the section name. */
  eyebrow?: React.ReactNode;
  /** Buttons or links shown on the right (stacked under the title on phones). */
  actions?: React.ReactNode;
  /** Back link for detail pages. */
  back?: { href: string; label: string };
  className?: string;
};

/** Title row used by every console and account page. */
export default function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`${styles.header} ${className}`}>
      <div className={styles.copy}>
        {back ? (
          <Link href={back.href} className={styles.back}>
            <ArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
