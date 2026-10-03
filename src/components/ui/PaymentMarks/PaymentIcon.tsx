import styles from "./PaymentMarks.module.css";

export type PaymentBrand = "visa" | "mastercard" | "rupay" | "upi" | "paytm";

const LABELS: Record<PaymentBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  rupay: "RuPay",
  upi: "UPI",
  paytm: "Paytm",
};

/** Simplified acceptance marks drawn inline: no network request, sharp at any size. */
function Mark({ brand }: { brand: PaymentBrand }) {
  switch (brand) {
    case "visa":
      return (
        <text
          x="24"
          y="20.5"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="14"
          fontWeight="900"
          fontStyle="italic"
          letterSpacing="0.5"
          fill="#1a1f71"
        >
          VISA
        </text>
      );
    case "mastercard":
      return (
        <>
          <circle cx="19.5" cy="15" r="8.5" fill="#eb001b" />
          <circle cx="28.5" cy="15" r="8.5" fill="#f79e1b" />
          <path d="M24 7.8a8.5 8.5 0 0 1 0 14.4a8.5 8.5 0 0 1 0-14.4z" fill="#ff5f00" />
        </>
      );
    case "rupay":
      return (
        <>
          <text
            x="5"
            y="19.5"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="11.5"
            fontWeight="900"
            fontStyle="italic"
            fill="#1b3f8f"
          >
            RuPay
          </text>
          <path d="M39 9l5 6-5 6z" fill="#f47920" />
          <path d="M36 9l5 6-5 6z" fill="#0d8f46" opacity="0.9" />
        </>
      );
    case "upi":
      return (
        <>
          <text
            x="7"
            y="20"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="13"
            fontWeight="900"
            fontStyle="italic"
            fill="#3a3a3a"
          >
            UPI
          </text>
          <path d="M34 8l6 7-6 7z" fill="#f47920" />
          <path d="M30.5 8l6 7-6 7z" fill="#0d8f46" />
        </>
      );
    case "paytm":
      return (
        <text x="24" y="19.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="12.5" fontWeight="800">
          <tspan fill="#002e6e">pay</tspan>
          <tspan fill="#00baf2">tm</tspan>
        </text>
      );
  }
}

export default function PaymentIcon({
  brand,
  className = "",
}: {
  brand: PaymentBrand;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 30"
      className={`${styles.icon} ${className}`}
      role="img"
      aria-label={LABELS[brand]}
    >
      <title>{LABELS[brand]}</title>
      <rect x="0.5" y="0.5" width="47" height="29" rx="5" className={styles.iconFrame} />
      <Mark brand={brand} />
    </svg>
  );
}
