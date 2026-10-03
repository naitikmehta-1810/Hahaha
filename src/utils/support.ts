/** Public support contact, shown in the footer and on order pages. */
export const SUPPORT_EMAIL = "support@stuffsy.in";

export function supportMailto(subject?: string) {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
