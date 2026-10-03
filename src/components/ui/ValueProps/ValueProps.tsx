import React from "react";
import { Headphones, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import styles from "./ValueProps.module.css";

const PROPS = [
  { Icon: Truck, title: "Free shipping", desc: "On orders over ₹499" },
  { Icon: RotateCcw, title: "Easy returns", desc: "Within 7 days" },
  { Icon: ShieldCheck, title: "Secure payments", desc: "100% protected" },
  { Icon: Headphones, title: "24/7 support", desc: "We're here to help" },
];

type ValuePropsProps = {
  /** `card` sits on the page background; `tinted` is the softer violet strip. */
  variant?: "card" | "tinted";
  /** Two columns even on wide screens, for narrow containers like the cart. */
  compact?: boolean;
  className?: string;
};

/** Shipping / returns / payments / support reassurance strip. */
export default function ValueProps({
  variant = "card",
  compact = false,
  className = "",
}: ValuePropsProps) {
  return (
    <ul
      className={`${styles.strip} ${styles[variant]} ${compact ? styles.compact : ""} ${className}`}
      aria-label="Why shop with Stuffsy"
    >
      {PROPS.map(({ Icon, title, desc }) => (
        <li key={title} className={styles.item}>
          <span className={styles.icon} aria-hidden="true">
            <Icon size={20} />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{title}</span>
            <span className={styles.desc}>{desc}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
