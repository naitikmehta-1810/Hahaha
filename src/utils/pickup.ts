/** Shiprocket pickup nickname: letters, numbers, spaces, hyphen, underscore. */
export function pickupNicknameFromShop(shopName: string) {
  const cleaned = shopName
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
  if (cleaned.length >= 2 && /^[A-Za-z0-9]/.test(cleaned)) return cleaned;
  return "Shop Pickup";
}

export function isPickupAddressComplete(pickup: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  pickupLocationName?: string | null;
} | null | undefined) {
  if (!pickup) return false;
  const phone = String(pickup.phone ?? "").replace(/\D/g, "").slice(-10);
  return Boolean(
    pickup.pickupLocationName?.trim() &&
      pickup.name?.trim() &&
      pickup.email?.includes("@") &&
      phone.length === 10 &&
      pickup.address1?.trim() &&
      pickup.city?.trim() &&
      pickup.state?.trim() &&
      /^\d{6}$/.test(String(pickup.pincode ?? "").trim())
  );
}
