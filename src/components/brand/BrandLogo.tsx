import Image from "next/image";
import styles from "./BrandLogo.module.css";

/**
 * Versioned file name: the mark changed, and a new URL makes browsers and the
 * CDN fetch it instead of serving the old cached logo.
 */
export const BRAND_MARK_SRC = "/brand/stuffsy-mark.png";

type BrandLogoProps = {
  /** Size of the mark in px. The name scales with it. */
  size?: number;
  /** `mark` is the gift-bag S alone; `lockup` adds the "Stuffsy" name beside it. */
  variant?: "mark" | "lockup";
  className?: string;
  priority?: boolean;
  /** Decorative when adjacent text already names the brand. */
  decorative?: boolean;
};

/**
 * Official Stuffsy logo. Use this everywhere instead of inline SVGs so the
 * storefront, auth screens and consoles stay identical.
 */
export default function BrandLogo({
  size = 36,
  variant = "mark",
  className,
  priority = false,
  decorative = false,
}: BrandLogoProps) {
  const mark = (
    <Image
      src={BRAND_MARK_SRC}
      alt={variant === "mark" && !decorative ? "Stuffsy" : ""}
      width={size}
      height={size}
      className={variant === "mark" ? className : styles.mark}
      priority={priority}
      aria-hidden={variant === "mark" && decorative ? true : undefined}
    />
  );

  if (variant === "mark") return mark;

  return (
    <span
      className={`${styles.lockup} ${className ?? ""}`}
      aria-hidden={decorative || undefined}
    >
      {mark}
      <span className={styles.name} style={{ fontSize: `${Math.round(size * 0.62)}px` }}>
        Stuffsy
      </span>
    </span>
  );
}
