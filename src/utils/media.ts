/**
 * Shared Cloudinary CDN helpers. Cloud name is public (not a secret).
 * Assets are uploaded with stable public_ids by `npm run seed:category-images`.
 */
export const CLOUDINARY_CLOUD_NAME = "dfoznqeww";

export function cdnImage(publicId: string, transforms = "f_auto,q_auto") {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transforms}/${publicId}`;
}

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

/** Default product / cart / order thumbnail when none is set. */
export const FALLBACK_PRODUCT_IMAGE = cdnImage("stuffsy/ui/product-fallback");

export const HERO_CAROUSEL_IMAGES = [
  cdnImage("stuffsy/ui/hero-carousel-1"),
  cdnImage("stuffsy/ui/hero-carousel-2"),
] as const;

export const SELL_STEP_IMAGES = [
  cdnImage("stuffsy/ui/seller-step-1"),
  cdnImage("stuffsy/ui/seller-step-2"),
  cdnImage("stuffsy/ui/seller-step-3"),
] as const;

export const FALLBACK_AVATAR_IMAGE = cdnImage("stuffsy/ui/avatar-fallback");
/** Shops without an uploaded logo use the Stuffsy mark. */
export const FALLBACK_SHOP_LOGO = "/brand/stuffsy-mark.png";
export const FALLBACK_SHOP_BANNER = cdnImage("stuffsy/ui/shop-banner-fallback");
