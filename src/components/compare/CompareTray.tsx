"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Columns2, X } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import { MAX_COMPARE, clearCompare, useCompareIds } from "@/utils/compare";
import styles from "./Compare.module.css";

/** A slim bar at the bottom of the screen while products are picked for comparison. */
export default function CompareTray() {
  const ids = useCompareIds();
  const pathname = usePathname() ?? "";
  if (ids.length === 0 || pathname.startsWith("/compare") || pathname.startsWith("/checkout")) return null;

  return (
    <div className={styles.tray} role="region" aria-label="Product comparison">
      <span className={styles.trayIcon} aria-hidden="true">
        <Columns2 size={18} />
      </span>
      <p className={styles.trayText}>
        <strong>{ids.length}</strong> of {MAX_COMPARE} picked to compare
        {ids.length < 2 ? <span> · add one more</span> : null}
      </p>
      <Link
        href={`/compare?ids=${ids.join(",")}`}
        className={`${styles.trayLink} ${ids.length < 2 ? styles.trayLinkDisabled : ""}`}
        aria-disabled={ids.length < 2}
        tabIndex={ids.length < 2 ? -1 : undefined}
        onClick={(event) => {
          if (ids.length < 2) event.preventDefault();
        }}
      >
        Compare
      </Link>
      <Button size="sm" variant="ghost" onClick={clearCompare} leftIcon={<X size={14} />}>
        Clear
      </Button>
    </div>
  );
}
