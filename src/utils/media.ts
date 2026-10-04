/**
 * Image helpers. Storefront artwork is uploaded by admins (see utils/siteMedia);
 * nothing here points at hosted images.
 */

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;
/** A leading transformation segment such as `f_auto,q_auto` (not a `v123` version). */
const TRANSFORM_SEGMENT = /^(?!v\d+\/)([a-z]{1,3}_[^/]*)\/(.*)$/;

/**
 * Resizes a Cloudinary image on the CDN so phones download a thumbnail instead
 * of the full upload. Non-Cloudinary URLs (pasted links, local files) pass through.
 */
export function optimizedImage(url: string | null | undefined, width: number) {
  if (!url) return url ?? "";
  const match = CLOUDINARY_UPLOAD.exec(url);
  if (!match) return url;
  const [, prefix, rest] = match;
  const transform = `f_auto,q_auto,c_limit,w_${Math.round(width)}`;
  const existing = TRANSFORM_SEGMENT.exec(rest);
  return existing ? `${prefix}${transform}/${existing[2]}` : `${prefix}${transform}/${rest}`;
}

/** `srcSet` for a Cloudinary image at a few widths; empty for other hosts. */
export function imageSrcSet(url: string | null | undefined, widths: number[]) {
  if (!url || !CLOUDINARY_UPLOAD.test(url)) return undefined;
  return widths.map((w) => `${optimizedImage(url, w)} ${w}w`).join(", ");
}

/** Default product / cart / order thumbnail when none is set (local, no network). */
export const FALLBACK_PRODUCT_IMAGE = "/brand/product-placeholder.svg";

/** Cloudinary cloud for the storefront's default artwork (public, not a secret). */
const CLOUDINARY_CLOUD_NAME = "dfoznqeww";

function cdnImage(publicId: string, transforms = "f_auto,q_auto") {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transforms}/${publicId}`;
}

/** Default homepage carousel photos; admins can replace them under Storefront. */
export const HERO_CAROUSEL_IMAGES = [
  cdnImage("stuffsy/ui/hero-carousel-1"),
  cdnImage("stuffsy/ui/hero-carousel-2"),
] as const;

export const SELL_STEP_IMAGES = [
  cdnImage("stuffsy/ui/seller-step-1"),
  cdnImage("stuffsy/ui/seller-step-2"),
  cdnImage("stuffsy/ui/seller-step-3"),
] as const;

/** Shops without an uploaded logo use the Stuffsy mark. */
export const FALLBACK_SHOP_LOGO = "/brand/stuffsy-mark.png";
