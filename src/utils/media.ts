/**
 * Shared Cloudinary CDN helpers. Cloud name is public (not a secret).
 * Assets are uploaded with stable public_ids by `npm run seed:category-images`.
 */
export const CLOUDINARY_CLOUD_NAME = "dfoznqeww";

export function cdnImage(publicId: string, transforms = "f_auto,q_auto") {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transforms}/${publicId}`;
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
export const FALLBACK_SHOP_LOGO = cdnImage("stuffsy/ui/shop-logo-fallback");
export const FALLBACK_SHOP_BANNER = cdnImage("stuffsy/ui/shop-banner-fallback");
