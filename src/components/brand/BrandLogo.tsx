import Image from "next/image";

type BrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  /** Decorative when adjacent text already names the brand. */
  decorative?: boolean;
};

/**
 * Official Stuffsy mark (shopping-bag S). Prefer this over inline SVGs.
 */
export default function BrandLogo({
  size = 36,
  className,
  priority = false,
  decorative = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/brand/stuffsy-logo.png"
      alt={decorative ? "" : "Stuffsy"}
      width={size}
      height={size}
      className={className}
      priority={priority}
      aria-hidden={decorative || undefined}
    />
  );
}
