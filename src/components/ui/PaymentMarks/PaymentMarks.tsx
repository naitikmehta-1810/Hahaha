import PaymentIcon, { type PaymentBrand } from "./PaymentIcon";
import styles from "./PaymentMarks.module.css";

const BRANDS: PaymentBrand[] = ["visa", "mastercard", "rupay", "upi", "paytm"];

/** "We accept" row shared by the footer and the cart summary. */
export default function PaymentMarks({
  label = "We accept",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`${styles.row} ${className}`}>
      <span className={styles.label}>{label}</span>
      <ul className={styles.marks}>
        {BRANDS.map((brand) => (
          <li key={brand}>
            <PaymentIcon brand={brand} />
          </li>
        ))}
      </ul>
    </div>
  );
}
