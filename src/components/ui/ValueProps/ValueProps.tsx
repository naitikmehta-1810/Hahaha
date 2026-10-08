import React from "react";
import { Download, Headphones, Mail, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import styles from "./ValueProps.module.css";

export const VALUE_PROPS = [
  { Icon: Truck, title: "Free shipping", desc: "On orders over ₹499" },
  { Icon: RotateCcw, title: "Easy returns", desc: "Within 7 days" },
  { Icon: ShieldCheck, title: "Secure payments", desc: "100% protected" },
  { Icon: Headphones, title: "24/7 support", desc: "We're here to help" },
];

/** A download has nothing to ship or return, so the first two promises differ. */
const DIGITAL_PROPS = [
  { Icon: Download, title: "Instant download", desc: "Right after payment" },
  { Icon: Mail, title: "Also sent by email", desc: "Plus your order page" },
  VALUE_PROPS[2],
  VALUE_PROPS[3],
];

type ValuePropsProps = {
  /** `card` sits on the page background; `tinted` is the softer violet strip. */
  variant?: "card" | "tinted";
  /** Two columns even on wide screens, for narrow containers like the cart. */
  compact?: boolean;
  /** Promises for a downloadable product instead of shipping and returns. */
  digital?: boolean;
  className?: string;
};

/** Shipping / returns / payments / support reassurance strip. */
export default function ValueProps({
  variant = "card",
  compact = false,
  digital = false,
  className = "",
}: ValuePropsProps) {
  return (
    <ul
      className={`${styles.strip} ${styles[variant]} ${compact ? styles.compact : ""} ${className}`}
      aria-label="Why shop with Stuffsy"
    >
      {(digital ? DIGITAL_PROPS : VALUE_PROPS).map(({ Icon, title, desc }) => (
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
