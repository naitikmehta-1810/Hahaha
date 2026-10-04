import { env } from "../config/env.js";

export type OrderEmailItem = {
  productTitle: string;
  productThumbnailUrl?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  variantLabel?: string | null;
};

export type ShippingAddress = {
  recipientName: string;
  phoneNumber?: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
};

export type OrderEmailPayload = {
  to: string;
  orderId?: string;
  orderNumber: string;
  customerName?: string;
  items?: OrderEmailItem[];
  shippingAddress?: ShippingAddress;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  totalAmount?: number;
  deliveryOption?: string;
  trackingNumber?: string | null;
  courierName?: string | null;
  courierUrl?: string | null;
  trackingUrl?: string | null;
  invoiceUrl?: string | null;
  invoiceNumber?: string | null;
  estimatedDeliveryAt?: string | null;
  frontendOrderUrl?: string;
  shopName?: string;
};

export type CartEmailItem = {
  productTitle: string;
  productThumbnailUrl?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type AbandonedCartPayload = {
  to: string;
  customerName?: string;
  items: CartEmailItem[];
  cartUrl?: string;
};

export type CouponOfferPayload = {
  to: string;
  customerName?: string;
  couponCode: string;
  description?: string;
  expiresAt?: string | null;
  shopUrl?: string;
};

export type AuthEmailPayload = {
  to: string;
  token: string;
  verifyUrl?: string;
  resetUrl?: string;
};

export type LowStockAlertPayload = {
  to: string;
  productTitle: string;
  quantityOnHand: number;
  lowStockThreshold?: number;
  variantId?: string;
};

export type BackInStockPayload = {
  to: string;
  productTitle: string;
  productUrl?: string;
};

export type CartPriceDropPayload = {
  to: string;
  customerName?: string;
  items: Array<{
    title: string;
    url: string;
    previousPrice: number;
    currentPrice: number;
  }>;
  cartUrl?: string;
};

export type RecentlyViewedDigestPayload = {
  to: string;
  customerName?: string;
  items: Array<{ title: string; url: string; imageUrl?: string }>;
  shopUrl?: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

/** Mirrors the storefront tokens in src/app/globals.css. */
const C = {
  primary: "#7c3aed",
  primaryDark: "#6d28d9",
  primarySoft: "#f3edff",
  ink: "#1f1430",
  body: "#4a4258",
  muted: "#645c74",
  subtle: "#948ca3",
  border: "#ebe6f2",
  canvas: "#f6f4fa",
  panel: "#faf8fd",
  white: "#ffffff",
  success: "#047857",
  successBg: "#ecfdf5",
  warning: "#b45309",
  warningBg: "#fffbeb",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
};

const FONT =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Verification links live this long (backend EMAIL_VERIFY_TTL_MS). */
const VERIFY_LINK_TTL = "7 days";
/** Password reset links live this long (backend requestPasswordReset). */
const RESET_LINK_TTL = "1 hour";

function siteUrl(path = "") {
  return `${env.FRONTEND_URL.replace(/\/+$/, "")}${path}`;
}

function logoUrl() {
  return env.EMAIL_LOGO_URL ?? siteUrl("/brand/stuffsy-mark.png");
}

type Tone = "brand" | "success" | "warning" | "danger";

const TONES: Record<Tone, { fg: string; bg: string }> = {
  brand: { fg: C.primaryDark, bg: C.primarySoft },
  success: { fg: C.success, bg: C.successBg },
  warning: { fg: C.warning, bg: C.warningBg },
  danger: { fg: C.danger, bg: C.dangerBg },
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function formatInr(amount: number | undefined | null) {
  const n = Number(amount ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-10-04" or ISO → "4 Oct 2026"; anything unparseable is shown as given. */
function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function firstName(name: string | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? escapeHtml(first) : "";
}

function greeting(name: string | undefined) {
  const first = firstName(name);
  return first ? `Hi ${first},` : "Hi there,";
}

function deliveryLabel(option: string | undefined) {
  if (option === "express") return "Express · 2–3 business days";
  return "Standard · 5–7 business days";
}

/* ------------------------------------------------------------------ */
/* Building blocks (table-based for Outlook / Gmail compatibility)     */
/* ------------------------------------------------------------------ */

function p(html: string, opts: { size?: number; color?: string; margin?: string } = {}) {
  return `<p style="margin:${opts.margin ?? "0 0 16px"};font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:1.6;color:${opts.color ?? C.body};">${html}</p>`;
}

function hero(opts: { eyebrow: string; tone?: Tone; title: string; intro?: string }) {
  const tone = TONES[opts.tone ?? "brand"];
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
      <tr><td style="background:${tone.bg};border-radius:999px;padding:5px 12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${tone.fg};">${escapeHtml(opts.eyebrow)}</td></tr>
    </table>
    <h1 style="margin:0 0 12px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${C.ink};">${opts.title}</h1>
    ${opts.intro ? p(opts.intro, { margin: "0 0 24px" }) : ""}`;
}

/** Bulletproof button: the table cell carries the colour so Outlook renders it. */
function button(href: string, label: string, variant: "primary" | "secondary" = "primary") {
  const primary = variant === "primary";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
      <tr>
        <td align="center" bgcolor="${primary ? C.primary : C.white}" style="border-radius:10px;${primary ? "" : `border:1px solid ${C.border};`}">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.2;color:${primary ? C.white : C.ink};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

function actions(primary?: { href?: string | null; label: string }, secondary?: { href?: string | null; label: string }) {
  if (!primary?.href) return "";
  const second = secondary?.href
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:14px;color:${C.muted};">or <a href="${escapeHtml(secondary.href)}" style="color:${C.primary};font-weight:600;text-decoration:none;">${escapeHtml(secondary.label)}</a></p>`
    : "";
  return `<div style="margin:28px 0 4px;">${button(primary.href, primary.label)}${second}</div>`;
}

function sectionLabel(text: string) {
  return `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.subtle};">${escapeHtml(text)}</p>`;
}

function divider(margin = "24px 0") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function panel(
  inner: string,
  opts: { dashed?: boolean; align?: "left" | "center"; tight?: boolean } = {}
) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
      <tr><td align="${opts.align ?? "left"}" style="background:${C.panel};border:1px ${opts.dashed ? "dashed" : "solid"} ${opts.dashed ? C.primary : C.border};border-radius:12px;padding:${opts.tight ? "18px 20px 4px" : "18px 20px"};">${inner}</td></tr>
    </table>`;
}

/** Label/value pairs laid out as a two-column grid that stacks on phones. */
function facts(pairs: Array<[string, string | null | undefined]>) {
  const cells = pairs.filter((pair): pair is [string, string] => Boolean(pair[1]));
  if (!cells.length) return "";
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const row = cells.slice(i, i + 2);
    rows.push(
      `<tr>${row
        .map(
          ([label, value]) => `<td class="stack" width="50%" valign="top" style="padding:0 12px 14px 0;">
            <div style="font-family:${FONT};font-size:12px;color:${C.subtle};margin-bottom:3px;">${escapeHtml(label)}</div>
            <div style="font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};">${value}</div>
          </td>`
        )
        .join("")}${row.length === 1 ? '<td class="stack" width="50%">&nbsp;</td>' : ""}</tr>`
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">${rows.join("")}</table>`;
}

const ORDER_STEPS = ["Confirmed", "Preparing", "Shipped", "Out for delivery", "Delivered"] as const;

/** Segmented order tracker; `current` is the index of the step just reached. */
function orderProgress(current: number) {
  const cells = ORDER_STEPS.map((label, index) => {
    const reached = index <= current;
    return `<td width="20%" valign="top" style="padding:0 3px;">
      <div style="height:4px;border-radius:4px;background:${reached ? C.primary : C.border};font-size:0;line-height:0;">&nbsp;</div>
      <div style="margin-top:8px;font-family:${FONT};font-size:11px;line-height:1.3;font-weight:${index === current ? 700 : 500};color:${index === current ? C.primary : reached ? C.ink : C.subtle};">${label}</div>
    </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;table-layout:fixed;"><tr>${cells}</tr></table>`;
}

/** Cloudinary URLs get a square, compressed crop (2x for retina); others pass through. */
function squareImage(url: string, size: number) {
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) return url;
  const px = size * 2;
  return url.replace("/image/upload/", `/image/upload/c_fill,g_auto,w_${px},h_${px},q_auto/`);
}

function thumb(url: string | null | undefined, size = 64) {
  return url
    ? `<img src="${escapeHtml(squareImage(url, size))}" alt="" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;border-radius:10px;object-fit:cover;border:1px solid ${C.border};"/>`
    : `<div style="width:${size}px;height:${size}px;border-radius:10px;background:${C.primarySoft};border:1px solid ${C.border};"></div>`;
}

function itemsTable(items: Array<OrderEmailItem | CartEmailItem> | undefined, label = "Items") {
  if (!items?.length) return "";
  const rows = items
    .map((item, index) => {
      const variant =
        "variantLabel" in item && item.variantLabel
          ? `<div style="font-family:${FONT};font-size:13px;color:${C.muted};margin-top:2px;">${escapeHtml(String(item.variantLabel))}</div>`
          : "";
      const border = index < items.length - 1 ? `border-bottom:1px solid ${C.border};` : "";
      return `<tr>
        <td width="64" valign="top" style="padding:14px 0;${border}">${thumb(item.productThumbnailUrl)}</td>
        <td valign="top" style="padding:14px 12px 14px 14px;${border}">
          <div style="font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${C.ink};">${escapeHtml(item.productTitle)}</div>
          ${variant}
          <div style="font-family:${FONT};font-size:13px;color:${C.muted};margin-top:4px;">Qty ${Number(item.quantity)} × ${formatInr(item.unitPrice)}</div>
        </td>
        <td valign="top" align="right" style="padding:14px 0;${border}font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};white-space:nowrap;">${formatInr(item.lineTotal)}</td>
      </tr>`;
    })
    .join("");
  return `${sectionLabel(label)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-top:1px solid ${C.border};">${rows}</table>`;
}

function totalsBlock(order: OrderEmailPayload) {
  if (order.totalAmount == null) return "";
  const rows: Array<[string, string, string?]> = [];
  if (order.subtotal != null) rows.push(["Subtotal", formatInr(order.subtotal)]);
  if ((order.discountAmount ?? 0) > 0) {
    rows.push(["Discount", `−${formatInr(order.discountAmount)}`, C.success]);
  }
  if (order.shippingAmount != null) {
    rows.push(["Shipping", Number(order.shippingAmount) > 0 ? formatInr(order.shippingAmount) : "Free"]);
  }
  if ((order.taxAmount ?? 0) > 0) {
    const pct = order.taxRate != null && Number(order.taxRate) > 0 ? ` (${Math.round(Number(order.taxRate) * 100)}%)` : "";
    rows.push([`Tax${pct}`, formatInr(order.taxAmount)]);
  }
  const lines = rows
    .map(
      ([label, value, color]) => `<tr>
        <td style="padding:5px 0;font-family:${FONT};font-size:14px;color:${C.muted};">${label}</td>
        <td align="right" style="padding:5px 0;font-family:${FONT};font-size:14px;color:${color ?? C.ink};">${value}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    ${lines}
    <tr>
      <td style="padding:14px 0 0;border-top:1px solid ${C.border};font-family:${FONT};font-size:16px;font-weight:800;color:${C.ink};">Total</td>
      <td align="right" style="padding:14px 0 0;border-top:1px solid ${C.border};font-family:${FONT};font-size:18px;font-weight:800;color:${C.ink};">${formatInr(order.totalAmount)}</td>
    </tr>
  </table>`;
}

function addressHtml(address: ShippingAddress | undefined) {
  if (!address) return "";
  return [
    `<strong style="color:${C.ink};">${escapeHtml(address.recipientName)}</strong>`,
    escapeHtml(address.line1),
    address.line2 ? escapeHtml(address.line2) : "",
    escapeHtml(`${address.city}, ${address.state} ${address.postalCode}`),
    address.phoneNumber ? escapeHtml(address.phoneNumber) : "",
  ]
    .filter(Boolean)
    .join("<br/>");
}

/** Shipping address beside the delivery method, stacked on phones. */
function deliveryPanel(order: OrderEmailPayload, opts: { showMethod?: boolean } = {}) {
  const address = addressHtml(order.shippingAddress);
  const eta = order.estimatedDeliveryAt ? `Arriving by ${escapeHtml(formatDate(order.estimatedDeliveryAt))}` : "";
  const method = opts.showMethod ? escapeHtml(deliveryLabel(order.deliveryOption)) : "";
  if (!address && !eta && !method) return "";
  const col = (title: string, body: string) =>
    body
      ? `<td class="stack" width="50%" valign="top" style="padding:0 12px 0 0;">
          ${sectionLabel(title)}
          <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${C.body};">${body}</div>
        </td>`
      : "";
  return panel(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${col("Delivering to", address)}
      ${col("Delivery", [method, eta].filter(Boolean).join("<br/>"))}
    </tr></table>`
  );
}

function linkFallback(url: string, ttl: string) {
  return `
    <p style="margin:24px 0 6px;font-family:${FONT};font-size:13px;color:${C.muted};">Button not working? Paste this link into your browser:</p>
    <p style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${C.primary};text-decoration:none;">${escapeHtml(url)}</a></p>
    <p style="margin:0;font-family:${FONT};font-size:13px;color:${C.muted};">This link expires in ${ttl}.</p>`;
}

function securityNote(text: string) {
  return `${divider("28px 0 20px")}${p(text, { size: 13, color: C.muted, margin: "0" })}`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

type LayoutOptions = {
  title: string;
  preheader: string;
  body: string;
  /** Marketing mail gets a preferences link (transactional mail does not). */
  marketing?: boolean;
};

function layout(opts: LayoutOptions) {
  const year = new Date().getFullYear();
  const footerLink = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:${C.muted};text-decoration:underline;">${label}</a>`;
  const reason = opts.marketing
    ? `You’re receiving this because you have a Stuffsy account. ${footerLink(siteUrl("/account?tab=notifications"), "Manage email preferences")}.`
    : "You’re receiving this email because of activity on your Stuffsy account.";
  // Pads the preview text so clients don't pull body copy into the inbox snippet.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(60);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>${escapeHtml(opts.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:${C.primary}; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .pad { padding-left:22px !important; padding-right:22px !important; }
      .stack { display:block !important; width:100% !important; padding-right:0 !important; padding-bottom:14px !important; }
      h1 { font-size:23px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(opts.preheader)}${spacer}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td class="pad" style="padding:0 8px 20px;">
              <a href="${escapeHtml(siteUrl("/"))}" target="_blank" style="text-decoration:none;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(logoUrl())}" width="36" height="36" alt="Stuffsy" style="display:block;width:36px;height:36px;"/></td>
                  <td valign="middle" style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${C.ink};">Stuffsy</td>
                </tr></table>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:${C.white};border:1px solid ${C.border};border-radius:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:4px;background:${C.primary};border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr><td class="pad" style="padding:36px 40px 40px;">${opts.body}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:28px 8px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};" align="center">
              <p style="margin:0 0 12px;">
                ${footerLink(siteUrl("/shop"), "Shop")}&nbsp;&nbsp;·&nbsp;&nbsp;${footerLink(siteUrl("/account?tab=orders"), "Your orders")}&nbsp;&nbsp;·&nbsp;&nbsp;${footerLink(`mailto:${env.SUPPORT_EMAIL}`, "Help")}
              </p>
              <p style="margin:0 0 12px;">Questions? Write to us at <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}" style="color:${C.primary};text-decoration:none;font-weight:600;">${escapeHtml(env.SUPPORT_EMAIL)}</a></p>
              <p style="margin:0 0 6px;font-size:12px;color:${C.subtle};">${reason}</p>
              <p style="margin:0;font-size:12px;color:${C.subtle};">© ${year} Stuffsy · The marketplace for handmade &amp; unique goods</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text alternative: one paragraph per entry, empty entries dropped. */
function textBody(...parts: Array<string | null | undefined | false>) {
  return [
    ...parts.filter(Boolean),
    `Questions? ${env.SUPPORT_EMAIL}`,
    "— Stuffsy",
  ].join("\n\n");
}

function textItems(items: Array<OrderEmailItem | CartEmailItem> | undefined) {
  if (!items?.length) return "";
  return items
    .map((item) => `• ${item.productTitle} — ${item.quantity} × ${formatInr(item.unitPrice)} = ${formatInr(item.lineTotal)}`)
    .join("\n");
}

function orderNo(order: OrderEmailPayload) {
  return `#${escapeHtml(order.orderNumber)}`;
}

/* ------------------------------------------------------------------ */
/* Buyer order lifecycle                                               */
/* ------------------------------------------------------------------ */

export function renderOrderConfirmation(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Order confirmed",
      tone: "success",
      title: "Thank you for your order",
      intro: `${greeting(order.customerName)} we’ve received your order and passed it to the maker. We’ll email you again as soon as it ships.`,
    })}
    ${orderProgress(0)}
    ${facts([
      ["Order number", orderNo(order)],
      ["Order total", formatInr(order.totalAmount)],
    ])}
    ${divider("8px 0 24px")}
    ${itemsTable(order.items, "Order summary")}
    ${totalsBlock(order)}
    ${deliveryPanel(order, { showMethod: true })}
    ${actions({ href: order.frontendOrderUrl, label: "View order" })}
  `;
  return {
    subject: `Order confirmed · #${order.orderNumber}`,
    text: textBody(
      `${order.customerName ? `Hi ${order.customerName.split(" ")[0]},` : "Hi there,"} thank you for your order.`,
      `Order #${order.orderNumber} is confirmed. Total: ${formatInr(order.totalAmount)}.`,
      textItems(order.items),
      order.frontendOrderUrl && `View your order: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Order confirmed",
      preheader: `Order #${order.orderNumber} is confirmed — ${formatInr(order.totalAmount)}. We’ll let you know when it ships.`,
      body,
    }),
  };
}

export function renderOrderProcessing(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Being prepared",
      title: "Your order is being prepared",
      intro: `${greeting(order.customerName)} the seller has accepted order <strong style="color:${C.ink};">${orderNo(order)}</strong> and is getting it ready to ship.`,
    })}
    ${orderProgress(1)}
    ${itemsTable(order.items)}
    ${actions({ href: order.frontendOrderUrl, label: "Track order" })}
  `;
  return {
    subject: `Your order #${order.orderNumber} is being prepared`,
    text: textBody(
      `Order #${order.orderNumber} has been accepted by the seller and is being prepared for shipping.`,
      order.frontendOrderUrl && `Track your order: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Order being prepared",
      preheader: `The seller is getting order #${order.orderNumber} ready to ship.`,
      body,
    }),
  };
}

export function renderPaymentFailed(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Payment unsuccessful",
      tone: "danger",
      title: "We couldn’t complete your payment",
      intro: `${greeting(order.customerName)} the payment for order <strong style="color:${C.ink};">${orderNo(order)}</strong> didn’t go through. No money has been taken — if your bank shows a debit, it’s reversed automatically within 5–7 business days.`,
    })}
    ${p("Your items are held for a short while. You can retry without placing a new order.")}
    ${itemsTable(order.items)}
    ${totalsBlock(order)}
    ${actions({ href: order.frontendOrderUrl, label: "Retry payment" })}
  `;
  return {
    subject: `Payment unsuccessful for order #${order.orderNumber}`,
    text: textBody(
      `The payment for order #${order.orderNumber} didn't go through. No money has been taken.`,
      order.frontendOrderUrl && `Retry payment: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Payment unsuccessful",
      preheader: `Payment for order #${order.orderNumber} didn’t go through — retry in one tap.`,
      body,
    }),
  };
}

export function renderOrderShipped(order: OrderEmailPayload): RenderedEmail {
  const trackHref = order.trackingUrl || order.courierUrl;
  const tracking =
    order.trackingNumber || order.courierName
      ? panel(facts([
            ["Courier", order.courierName ? escapeHtml(order.courierName) : null],
            ["Tracking number", order.trackingNumber ? escapeHtml(order.trackingNumber) : null],
            ["Expected by", order.estimatedDeliveryAt ? escapeHtml(formatDate(order.estimatedDeliveryAt)) : null],
          ]), { tight: true })
      : "";
  const body = `
    ${hero({
      eyebrow: "Shipped",
      title: "Your order is on its way",
      intro: `${greeting(order.customerName)} good news — order <strong style="color:${C.ink};">${orderNo(order)}</strong> has been handed to the courier.`,
    })}
    ${orderProgress(2)}
    ${tracking}
    ${itemsTable(order.items)}
    ${
      trackHref
        ? actions({ href: trackHref, label: "Track shipment" }, { href: order.frontendOrderUrl, label: "view order details" })
        : actions({ href: order.frontendOrderUrl, label: "Track order" })
    }
  `;
  return {
    subject: `Shipped: your order #${order.orderNumber} is on its way`,
    text: textBody(
      `Order #${order.orderNumber} has shipped.`,
      order.trackingNumber && `Tracking number: ${order.trackingNumber}${order.courierName ? ` (${order.courierName})` : ""}`,
      trackHref && `Track shipment: ${trackHref}`,
      order.frontendOrderUrl && `Order details: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Order shipped",
      preheader: `Order #${order.orderNumber} is on its way${order.trackingNumber ? ` · tracking ${order.trackingNumber}` : ""}.`,
      body,
    }),
  };
}

export function renderOrderOutForDelivery(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Out for delivery",
      title: "Arriving today",
      intro: `${greeting(order.customerName)} order <strong style="color:${C.ink};">${orderNo(order)}</strong> is out for delivery. Keep your phone handy in case the courier calls.`,
    })}
    ${orderProgress(3)}
    ${deliveryPanel(order)}
    ${actions({ href: order.trackingUrl || order.courierUrl || order.frontendOrderUrl, label: "Track order" })}
  `;
  return {
    subject: `Out for delivery: order #${order.orderNumber} arrives today`,
    text: textBody(
      `Order #${order.orderNumber} is out for delivery today.`,
      order.frontendOrderUrl && `Track your order: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Out for delivery",
      preheader: `Order #${order.orderNumber} arrives today.`,
      body,
    }),
  };
}

export function renderOrderDelivered(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Delivered",
      tone: "success",
      title: "Your order has arrived",
      intro: `${greeting(order.customerName)} order <strong style="color:${C.ink};">${orderNo(order)}</strong> was delivered. We hope you love it.`,
    })}
    ${orderProgress(4)}
    ${panel(
      `${sectionLabel("Enjoying your purchase?")}${p(
        "Leave a review on the product page — it helps independent makers grow and helps other shoppers choose.",
        { size: 14, margin: "0" }
      )}`
    )}
    ${actions({ href: order.frontendOrderUrl, label: "View your order" })}
    ${p(`Something not right? You can request a return from your order page.`, { size: 13, color: C.muted, margin: "20px 0 0" })}
  `;
  return {
    subject: `Delivered: order #${order.orderNumber}`,
    text: textBody(
      `Order #${order.orderNumber} has been delivered. We hope you love it.`,
      order.frontendOrderUrl && `Leave a review or request a return: ${order.frontendOrderUrl}`
    ),
    html: layout({
      title: "Order delivered",
      preheader: `Order #${order.orderNumber} was delivered — tell us what you think.`,
      body,
    }),
  };
}

export function renderInvoiceReady(order: OrderEmailPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Invoice",
      title: "Your invoice is ready",
      intro: `${greeting(order.customerName)} the tax invoice for order <strong style="color:${C.ink};">${orderNo(order)}</strong> is ready. Keep it for your records, warranty claims or returns.`,
    })}
    ${panel(facts([
        ["Order number", orderNo(order)],
        ["Invoice number", order.invoiceNumber ? escapeHtml(order.invoiceNumber) : null],
      ]), { tight: true })}
    ${
      order.invoiceUrl
        ? actions({ href: order.invoiceUrl, label: "Download invoice (PDF)" }, { href: order.frontendOrderUrl, label: "view order" })
        : actions({ href: order.frontendOrderUrl, label: "View order" })
    }
  `;
  return {
    subject: `Invoice for order #${order.orderNumber}`,
    text: textBody(
      `The invoice for order #${order.orderNumber} is ready.`,
      order.invoiceUrl && `Download: ${order.invoiceUrl}`
    ),
    html: layout({
      title: "Invoice ready",
      preheader: `Download the invoice for order #${order.orderNumber}.`,
      body,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Marketing / lifecycle nudges                                        */
/* ------------------------------------------------------------------ */

export function renderAbandonedCart(payload: AbandonedCartPayload): RenderedEmail {
  const count = payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const body = `
    ${hero({
      title: "You left something in your cart",
      eyebrow: "Still interested?",
      intro: `${greeting(payload.customerName)} your cart is saved. Handmade pieces are often one of a kind, so they may not be around for long.`,
    })}
    ${itemsTable(payload.items, count === 1 ? "1 item in your cart" : `${count} items in your cart`)}
    ${actions({ href: payload.cartUrl ?? siteUrl("/cart"), label: "Complete your order" })}
  `;
  return {
    subject: "You left something in your Stuffsy cart",
    text: textBody(
      "Your Stuffsy cart is saved:",
      textItems(payload.items),
      `Complete your order: ${payload.cartUrl ?? siteUrl("/cart")}`
    ),
    html: layout({
      title: "Your cart is waiting",
      preheader: "Your cart is saved — pick up where you left off.",
      body,
      marketing: true,
    }),
  };
}

export function renderCouponOffer(payload: CouponOfferPayload): RenderedEmail {
  const expires = payload.expiresAt ? formatDate(payload.expiresAt) : "";
  const body = `
    ${hero({
      eyebrow: "Exclusive offer",
      title: "A little something for you",
      intro: `${greeting(payload.customerName)} here’s a coupon for your next Stuffsy order.`,
    })}
    ${payload.description ? p(`<strong style="color:${C.ink};">${escapeHtml(payload.description)}</strong>`, { margin: "-8px 0 24px" }) : ""}
    ${panel(
      `<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">Your code</div>
       <div style="margin:8px 0 0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.12em;color:${C.primary};">${escapeHtml(payload.couponCode)}</div>
       ${expires ? `<div style="margin-top:10px;font-family:${FONT};font-size:13px;color:${C.muted};">Valid until ${escapeHtml(expires)}</div>` : ""}`,
      { dashed: true, align: "center" }
    )}
    ${p("Enter the code at checkout to apply it.", { size: 14, color: C.muted })}
    ${actions({ href: payload.shopUrl ?? siteUrl("/shop"), label: "Start shopping" })}
  `;
  return {
    subject: `Your Stuffsy code: ${payload.couponCode}`,
    text: textBody(
      payload.description ?? "Here's a coupon for your next Stuffsy order.",
      `Code: ${payload.couponCode}${expires ? ` (valid until ${expires})` : ""}`,
      `Shop now: ${payload.shopUrl ?? siteUrl("/shop")}`
    ),
    html: layout({
      title: "An offer for you",
      preheader: `Use ${payload.couponCode} at checkout${expires ? ` before ${expires}` : ""}.`,
      body,
      marketing: true,
    }),
  };
}

export function renderCartPriceDrop(payload: CartPriceDropPayload): RenderedEmail {
  const rows = payload.items
    .map((item, index) => {
      const saved = Number(item.previousPrice) - Number(item.currentPrice);
      const border = index < payload.items.length - 1 ? `border-bottom:1px solid ${C.border};` : "";
      return `<tr>
        <td valign="top" style="padding:14px 12px 14px 0;${border}">
          <a href="${escapeHtml(item.url)}" style="font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${C.ink};text-decoration:none;">${escapeHtml(item.title)}</a>
          ${saved > 0 ? `<div style="margin-top:6px;"><span style="display:inline-block;background:${C.successBg};color:${C.success};border-radius:999px;padding:3px 9px;font-family:${FONT};font-size:12px;font-weight:700;">Save ${formatInr(saved)}</span></div>` : ""}
        </td>
        <td valign="top" align="right" style="padding:14px 0;${border}white-space:nowrap;">
          <div style="font-family:${FONT};font-size:15px;font-weight:800;color:${C.ink};">${formatInr(item.currentPrice)}</div>
          <div style="font-family:${FONT};font-size:13px;color:${C.subtle};text-decoration:line-through;">${formatInr(item.previousPrice)}</div>
        </td>
      </tr>`;
    })
    .join("");
  const body = `
    ${hero({
      eyebrow: "Price drop",
      tone: "success",
      title: "Prices dropped in your cart",
      intro: `${greeting(payload.customerName)} ${payload.items.length === 1 ? "an item" : "some items"} in your cart just got cheaper.`,
    })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-top:1px solid ${C.border};">${rows}</table>
    ${actions({ href: payload.cartUrl ?? siteUrl("/cart"), label: "Review your cart" })}
  `;
  return {
    subject: "Price drop on items in your Stuffsy cart",
    text: textBody(
      "Prices dropped in your Stuffsy cart:",
      payload.items
        .map((item) => `• ${item.title}: ${formatInr(item.previousPrice)} → ${formatInr(item.currentPrice)}`)
        .join("\n"),
      `Review your cart: ${payload.cartUrl ?? siteUrl("/cart")}`
    ),
    html: layout({
      title: "Price drop",
      preheader: "Something in your cart just got cheaper.",
      body,
      marketing: true,
    }),
  };
}

export function renderRecentlyViewedDigest(payload: RecentlyViewedDigestPayload): RenderedEmail {
  const items = payload.items.slice(0, 6);
  const card = (item: (typeof items)[number]) => `<td class="stack" width="50%" valign="top" style="padding:0 6px 16px;">
      <a href="${escapeHtml(item.url)}" style="text-decoration:none;">
        ${
          item.imageUrl
            ? `<img src="${escapeHtml(squareImage(item.imageUrl, 244))}" alt="" width="244" height="244" style="display:block;width:100%;max-width:244px;height:auto;border-radius:12px;border:1px solid ${C.border};"/>`
            : `<div style="height:244px;max-width:244px;border-radius:12px;background:${C.primarySoft};border:1px solid ${C.border};"></div>`
        }
        <div style="margin-top:10px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.4;color:${C.ink};">${escapeHtml(item.title)}</div>
      </a>
    </td>`;
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    rows.push(`<tr>${pair.map(card).join("")}${pair.length === 1 ? '<td class="stack" width="50%">&nbsp;</td>' : ""}</tr>`);
  }
  const body = `
    ${hero({
      eyebrow: "Picked for you",
      title: "Still thinking about these?",
      intro: `${greeting(payload.customerName)} here are the pieces you looked at recently.`,
    })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">${rows.join("")}</table>
    ${actions({ href: payload.shopUrl ?? siteUrl("/shop"), label: "Keep browsing" })}
  `;
  return {
    subject: "Still thinking about these?",
    text: textBody(
      "Pieces you viewed recently on Stuffsy:",
      items.map((item) => `• ${item.title}: ${item.url}`).join("\n")
    ),
    html: layout({
      title: "Recently viewed",
      preheader: "The pieces you looked at are still here.",
      body,
      marketing: true,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export function renderEmailVerification(payload: AuthEmailPayload): RenderedEmail {
  const url = payload.verifyUrl!;
  const body = `
    ${hero({
      eyebrow: "Welcome to Stuffsy",
      title: "Confirm your email address",
      intro: "Thanks for joining Stuffsy. Confirm your email to secure your account and get order updates.",
    })}
    ${actions({ href: url, label: "Verify email address" })}
    ${linkFallback(url, VERIFY_LINK_TTL)}
    ${securityNote("If you didn’t create a Stuffsy account, you can safely ignore this email — no account will be activated.")}
  `;
  return {
    subject: "Confirm your Stuffsy email address",
    text: textBody(
      "Thanks for joining Stuffsy. Confirm your email address by opening this link:",
      url,
      `This link expires in ${VERIFY_LINK_TTL}. If you didn't create an account, ignore this email.`
    ),
    html: layout({
      title: "Confirm your email",
      preheader: "One click to confirm your email and finish setting up your account.",
      body,
    }),
  };
}

export function renderPasswordReset(payload: AuthEmailPayload): RenderedEmail {
  const url = payload.resetUrl!;
  const body = `
    ${hero({
      eyebrow: "Account security",
      tone: "warning",
      title: "Reset your password",
      intro: "We received a request to reset the password for your Stuffsy account. Choose a new one below.",
    })}
    ${actions({ href: url, label: "Choose a new password" })}
    ${linkFallback(url, RESET_LINK_TTL)}
    ${securityNote(
      `Didn’t ask for this? Ignore this email — your password stays the same. If you think someone else is trying to access your account, contact <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}" style="color:${C.primary};text-decoration:none;">${escapeHtml(env.SUPPORT_EMAIL)}</a>.`
    )}
  `;
  return {
    subject: "Reset your Stuffsy password",
    text: textBody(
      "We received a request to reset your Stuffsy password. Choose a new one here:",
      url,
      `This link expires in ${RESET_LINK_TTL}. If you didn't request this, ignore this email.`
    ),
    html: layout({
      title: "Reset your password",
      preheader: `Your password reset link — valid for ${RESET_LINK_TTL}.`,
      body,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Seller                                                              */
/* ------------------------------------------------------------------ */

export function renderLowStockAlert(payload: LowStockAlertPayload): RenderedEmail {
  const qty = Number(payload.quantityOnHand);
  const body = `
    ${hero({
      eyebrow: qty <= 0 ? "Out of stock" : "Low stock",
      tone: qty <= 0 ? "danger" : "warning",
      title: qty <= 0 ? "A product has sold out" : "A product is running low",
      intro: `<strong style="color:${C.ink};">${escapeHtml(payload.productTitle)}</strong> ${qty <= 0 ? "is out of stock and hidden from buyers until you restock." : "is close to selling out."}`,
    })}
    ${panel(facts([
        ["In stock", String(qty)],
        ["Alert threshold", payload.lowStockThreshold != null ? String(Number(payload.lowStockThreshold)) : null],
      ]), { tight: true })}
    ${actions({ href: siteUrl("/seller/products"), label: "Update stock" })}
  `;
  return {
    subject: `${qty <= 0 ? "Out of stock" : "Low stock"}: ${payload.productTitle}`,
    text: textBody(
      `${payload.productTitle} has ${qty} left in stock.`,
      `Update stock: ${siteUrl("/seller/products")}`
    ),
    html: layout({
      title: "Low stock",
      preheader: `${payload.productTitle} has ${qty} left — restock to keep selling.`,
      body,
    }),
  };
}

export function renderSellerNewOrder(order: OrderEmailPayload): RenderedEmail {
  const shop = order.shopName ? escapeHtml(order.shopName) : "your shop";
  const body = `
    ${hero({
      eyebrow: "New order",
      tone: "success",
      title: `You have a new order`,
      intro: `${greeting(order.customerName)} order <strong style="color:${C.ink};">${orderNo(order)}</strong> includes items from <strong style="color:${C.ink};">${shop}</strong>.`,
    })}
    ${itemsTable(order.items)}
    ${panel(
      `${sectionLabel("Next steps")}${p(
        "Accept the order, pack it carefully and ship it within your dispatch time. Fast dispatch keeps your shop rating high.",
        { size: 14, margin: "0" }
      )}`
    )}
    ${actions({ href: order.frontendOrderUrl ?? siteUrl("/seller/orders"), label: "Open seller panel" })}
  `;
  return {
    subject: `New order #${order.orderNumber} for ${order.shopName || "your shop"}`,
    text: textBody(
      `New order #${order.orderNumber} for ${order.shopName || "your shop"}.`,
      textItems(order.items),
      `Open the seller panel: ${order.frontendOrderUrl ?? siteUrl("/seller/orders")}`
    ),
    html: layout({
      title: "New order",
      preheader: `Order #${order.orderNumber} is waiting for you to accept and ship.`,
      body,
    }),
  };
}

export function renderBackInStock(payload: BackInStockPayload): RenderedEmail {
  const body = `
    ${hero({
      eyebrow: "Back in stock",
      tone: "success",
      title: "It’s back",
      intro: `<strong style="color:${C.ink};">${escapeHtml(payload.productTitle)}</strong> is available again. Stock is limited, so grab it while you can.`,
    })}
    ${actions({ href: payload.productUrl ?? siteUrl("/shop"), label: "Shop it now" })}
  `;
  return {
    subject: `Back in stock: ${payload.productTitle}`,
    text: textBody(
      `${payload.productTitle} is back in stock.`,
      `Shop it now: ${payload.productUrl ?? siteUrl("/shop")}`
    ),
    html: layout({
      title: "Back in stock",
      preheader: `${payload.productTitle} is available again.`,
      body,
      marketing: true,
    }),
  };
}
