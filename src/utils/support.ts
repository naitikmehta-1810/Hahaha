/** Public contact details, shown in the footer, on order pages and the selling page. */
export const SUPPORT_EMAIL = "stuffsyworkplace@gmail.com";

export const INSTAGRAM_HANDLE = "@stuffsy.app";
export const INSTAGRAM_URL = "https://www.instagram.com/stuffsy.app";

export function supportMailto(subject?: string) {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
