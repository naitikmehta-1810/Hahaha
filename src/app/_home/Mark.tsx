import React from "react";
import { BrushUnderline } from "@/components/art/Doodles";
import styles from "../page.module.css";

/** A word with a hand-painted brush stroke under it. */
export default function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.mark}>
      {children}
      <BrushUnderline className={styles.markStroke} />
    </span>
  );
}
