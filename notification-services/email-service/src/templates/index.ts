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
  estimatedDeliveryAt?: string | null;
  frontendOrderUrl?: string;
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

function formatInr(amount: number | undefined) {
  const n = Number(amount ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: { title: string; preheader?: string; body: string }) {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:20px 24px;">
              <div style="font-size:22px;font-weight:700;letter-spacing:0.02em;color:#ffffff;">Stuffsy</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">
              You’re receiving this because of activity on your Stuffsy account.
              <br/>© Stuffsy
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemsTable(items: OrderEmailItem[] | CartEmailItem[] | undefined) {
  if (!items?.length) {
    return `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">No line items attached.</p>`;
  }

  const rows = items
    .map((item) => {
      const thumb = item.productThumbnailUrl
        ? `<img src="${escapeHtml(item.productThumbnailUrl)}" alt="" width="56" height="56" style="display:block;border-radius:8px;object-fit:cover;border:1px solid #e5e7eb;"/>`
        : `<div style="width:56px;height:56px;border-radius:8px;background:#f3f4f6;border:1px solid #e5e7eb;"></div>`;
      const variant =
        "variantLabel" in item && item.variantLabel
          ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(String(item.variantLabel))}</div>`
          : "";

      return `<tr>
        <td style="padding:10px 0;vertical-align:top;width:64px;">${thumb}</td>
        <td style="padding:10px 0 10px 12px;vertical-align:top;">
          <div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(item.productTitle)}</div>
          ${variant}
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Qty ${item.quantity} · ${formatInr(item.unitPrice)}</div>
        </td>
        <td style="padding:10px 0;vertical-align:top;text-align:right;font-size:14px;font-weight:600;white-space:nowrap;">${formatInr(item.lineTotal)}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${rows}</table>`;
}

function addressBlock(address: ShippingAddress | undefined) {
  if (!address) return "";
  const lines = [
    address.recipientName,
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
    address.phoneNumber ? `Phone: ${address.phoneNumber}` : null,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(String(line)))
    .join("<br/>");

  return `<div style="margin:0 0 20px;padding:14px 16px;background:#f9fafb;border-radius:10px;font-size:14px;line-height:1.5;color:#374151;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Shipping address</div>
    ${lines}
  </div>`;
}

function totalsBlock(order: OrderEmailPayload) {
  const taxPct = order.taxRate != null ? Math.round(Number(order.taxRate) * 100) : 18;
  const rows: Array<[string, string]> = [
    ["Subtotal", formatInr(order.subtotal)],
  ];
  if ((order.discountAmount ?? 0) > 0) {
    rows.push(["Discount", `−${formatInr(order.discountAmount)}`]);
  }
  rows.push(["Shipping", formatInr(order.shippingAmount)]);
  rows.push([`Tax (${taxPct}%)`, formatInr(order.taxAmount)]);
  rows.push(["Total", formatInr(order.totalAmount)]);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
    ${rows
      .map(
        ([label, value], i) => `<tr>
      <td style="padding:4px 0;font-size:${i === rows.length - 1 ? "15px" : "13px"};font-weight:${i === rows.length - 1 ? "700" : "400"};color:#374151;">${label}</td>
      <td style="padding:4px 0;text-align:right;font-size:${i === rows.length - 1 ? "15px" : "13px"};font-weight:${i === rows.length - 1 ? "700" : "400"};color:#111827;">${value}</td>
    </tr>`
      )
      .join("")}
  </table>`;
}

function cta(href: string, label: string) {
  return `<p style="margin:24px 0 0;">
    <a href="${escapeHtml(href)}" style="background:#111827;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>
  </p>`;
}

export function renderOrderConfirmation(order: OrderEmailPayload) {
  const delivery =
    order.deliveryOption === "express" ? "Express Delivery (2–3 business days)" : "Standard Delivery (5–7 business days)";
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">Order confirmed</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Thanks${order.customerName ? `, ${escapeHtml(order.customerName)}` : ""}! We’ve received payment for order
      <strong>#${escapeHtml(order.orderNumber)}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Delivery option: ${escapeHtml(delivery)}</p>
    ${itemsTable(order.items)}
    ${addressBlock(order.shippingAddress)}
    ${totalsBlock(order)}
    ${order.frontendOrderUrl ? cta(order.frontendOrderUrl, "View order") : ""}
  `;
  return {
    subject: `Order confirmed · #${order.orderNumber}`,
    text: `Your Stuffsy order #${order.orderNumber} is confirmed. Total ${formatInr(order.totalAmount)}.`,
    html: layout({ title: "Order confirmed", preheader: `Order #${order.orderNumber} confirmed`, body }),
  };
}

export function renderOrderProcessing(order: OrderEmailPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">Order is being prepared</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Good news${order.customerName ? `, ${escapeHtml(order.customerName)}` : ""} — order
      <strong>#${escapeHtml(order.orderNumber)}</strong> is now being prepared by the seller.
    </p>
    ${itemsTable(order.items)}
    ${order.frontendOrderUrl ? cta(order.frontendOrderUrl, "View order") : ""}
  `;
  return {
    subject: `Processing · #${order.orderNumber}`,
    text: `Your Stuffsy order #${order.orderNumber} is being prepared.`,
    html: layout({
      title: "Order processing",
      preheader: `Order #${order.orderNumber} is being prepared`,
      body,
    }),
  };
}

export function renderPaymentFailed(order: OrderEmailPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Payment unsuccessful</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      We couldn’t complete payment for order <strong>#${escapeHtml(order.orderNumber)}</strong>.
      Your items are still reserved for a short time — you can retry checkout without placing a new order.
    </p>
    ${totalsBlock(order)}
    ${order.frontendOrderUrl ? cta(order.frontendOrderUrl, "Retry payment") : ""}
  `;
  return {
    subject: `Payment failed · #${order.orderNumber}`,
    text: `Payment failed for Stuffsy order #${order.orderNumber}. Please retry checkout.`,
    html: layout({ title: "Payment failed", body }),
  };
}

export function renderOrderShipped(order: OrderEmailPayload) {
  const tracking = order.trackingNumber
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>${
        order.courierName ? ` · ${escapeHtml(order.courierName)}` : ""
      }</p>`
    : "";
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Your order has shipped</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Good news — order <strong>#${escapeHtml(order.orderNumber)}</strong> is on its way.
    </p>
    ${tracking}
    ${order.courierUrl ? cta(order.courierUrl, "Track shipment") : order.frontendOrderUrl ? cta(order.frontendOrderUrl, "View order") : ""}
  `;
  return {
    subject: `Shipped · #${order.orderNumber}`,
    text: `Order #${order.orderNumber} has shipped${order.trackingNumber ? ` · tracking ${order.trackingNumber}` : ""}.`,
    html: layout({ title: "Order shipped", body }),
  };
}

export function renderOrderOutForDelivery(order: OrderEmailPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Out for delivery</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Order <strong>#${escapeHtml(order.orderNumber)}</strong> is out for delivery today.
    </p>
    ${addressBlock(order.shippingAddress)}
    ${order.frontendOrderUrl ? cta(order.frontendOrderUrl, "Track order") : ""}
  `;
  return {
    subject: `Out for delivery · #${order.orderNumber}`,
    text: `Order #${order.orderNumber} is out for delivery.`,
    html: layout({ title: "Out for delivery", body }),
  };
}

export function renderOrderDelivered(order: OrderEmailPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Delivered</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Order <strong>#${escapeHtml(order.orderNumber)}</strong> was delivered. We hope you love it.
    </p>
    ${order.frontendOrderUrl ? cta(order.frontendOrderUrl, "View order") : ""}
  `;
  return {
    subject: `Delivered · #${order.orderNumber}`,
    text: `Order #${order.orderNumber} has been delivered.`,
    html: layout({ title: "Order delivered", body }),
  };
}

export function renderInvoiceReady(order: OrderEmailPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Your invoice is ready</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      The invoice for order <strong>#${escapeHtml(order.orderNumber)}</strong> is ready to download.
    </p>
    ${order.invoiceUrl ? cta(order.invoiceUrl, "Download invoice") : order.frontendOrderUrl ? cta(order.frontendOrderUrl, "View order") : ""}
  `;
  return {
    subject: `Invoice ready · #${order.orderNumber}`,
    text: `Invoice for order #${order.orderNumber} is ready${order.invoiceUrl ? `: ${order.invoiceUrl}` : "."}`,
    html: layout({ title: "Invoice ready", body }),
  };
}

export function renderAbandonedCart(payload: AbandonedCartPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">You left something behind</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Hi${payload.customerName ? ` ${escapeHtml(payload.customerName)}` : ""} — your cart is waiting.
    </p>
    ${itemsTable(payload.items)}
    ${payload.cartUrl ? cta(payload.cartUrl, "Return to cart") : ""}
  `;
  return {
    subject: "Your Stuffsy cart is waiting",
    text: "You still have items in your Stuffsy cart. Come back to finish checkout.",
    html: layout({ title: "Abandoned cart", body }),
  };
}

export function renderCouponOffer(payload: CouponOfferPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">An offer just for you</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#4b5563;">
      ${payload.description ? escapeHtml(payload.description) : "Use this coupon on your next Stuffsy order."}
    </p>
    <div style="margin:0 0 20px;padding:16px;background:#f9fafb;border-radius:10px;text-align:center;">
      <div style="font-size:12px;color:#6b7280;letter-spacing:0.06em;text-transform:uppercase;">Coupon code</div>
      <div style="font-size:24px;font-weight:700;letter-spacing:0.08em;margin-top:6px;">${escapeHtml(payload.couponCode)}</div>
      ${payload.expiresAt ? `<div style="font-size:12px;color:#6b7280;margin-top:8px;">Expires ${escapeHtml(payload.expiresAt)}</div>` : ""}
    </div>
    ${payload.shopUrl ? cta(payload.shopUrl, "Shop now") : ""}
  `;
  return {
    subject: `Coupon ${payload.couponCode} · Stuffsy`,
    text: `Use coupon ${payload.couponCode} on Stuffsy${payload.expiresAt ? ` before ${payload.expiresAt}` : ""}.`,
    html: layout({ title: "Coupon offer", body }),
  };
}

export function renderCartPriceDrop(payload: CartPriceDropPayload) {
  const rows = payload.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">
          <a href="${escapeHtml(item.url)}" style="color:#111827;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">
            Was ${formatInr(item.previousPrice)} · now <strong style="color:#059669;">${formatInr(item.currentPrice)}</strong>
          </div>
        </td>
      </tr>`
    )
    .join("");
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Price drop in your cart</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#4b5563;">
      Hi${payload.customerName ? ` ${escapeHtml(payload.customerName)}` : ""} — something in your cart got cheaper.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${payload.cartUrl ? cta(payload.cartUrl, "Review cart") : ""}
  `;
  return {
    subject: "Price drop on items in your Stuffsy cart",
    text: "An item in your Stuffsy cart dropped in price. Open your cart to check it out.",
    html: layout({ title: "Cart price drop", body }),
  };
}

export function renderRecentlyViewedDigest(payload: RecentlyViewedDigestPayload) {
  const rows = payload.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">
          <a href="${escapeHtml(item.url)}" style="color:#111827;font-weight:600;text-decoration:none;">${escapeHtml(item.title)}</a>
        </td>
      </tr>`
    )
    .join("");
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Still thinking about these?</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#4b5563;">
      Hi${payload.customerName ? ` ${escapeHtml(payload.customerName)}` : ""} — here are handmade pieces you looked at recently.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${payload.shopUrl ? cta(payload.shopUrl, "Keep browsing") : ""}
  `;
  return {
    subject: "Recently viewed on Stuffsy",
    text: "Come back to the handmade items you recently viewed on Stuffsy.",
    html: layout({ title: "Recently viewed", body }),
  };
}

export function renderEmailVerification(payload: AuthEmailPayload) {
  const url = payload.verifyUrl!;
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Verify your email</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Welcome to Stuffsy. Confirm your email to finish setting up your account.
    </p>
    ${cta(url, "Verify email")}
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Or paste this link:<br/>${escapeHtml(url)}</p>
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">This link expires in 24 hours.</p>
  `;
  return {
    subject: "Verify your Stuffsy email",
    text: `Verify your Stuffsy email: ${url}`,
    html: layout({ title: "Verify email", body }),
  };
}

export function renderPasswordReset(payload: AuthEmailPayload) {
  const url = payload.resetUrl!;
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Reset your password</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      We received a request to reset your Stuffsy password.
    </p>
    ${cta(url, "Choose new password")}
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Or paste this link:<br/>${escapeHtml(url)}</p>
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">This link expires in 1 hour.</p>
  `;
  return {
    subject: "Reset your Stuffsy password",
    text: `Reset your Stuffsy password: ${url}`,
    html: layout({ title: "Reset password", body }),
  };
}

export function renderLowStockAlert(payload: LowStockAlertPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Low stock alert</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#4b5563;">
      <strong>${escapeHtml(payload.productTitle)}</strong> is running low.
    </p>
    <p style="margin:0;font-size:15px;color:#4b5563;">
      Quantity on hand: <strong>${Number(payload.quantityOnHand)}</strong>
      ${
        payload.lowStockThreshold != null
          ? ` (threshold ${Number(payload.lowStockThreshold)})`
          : ""
      }
    </p>
  `;
  return {
    subject: `Low stock · ${payload.productTitle}`,
    text: `${payload.productTitle} is low on stock (${payload.quantityOnHand} left).`,
    html: layout({ title: "Low stock", body, preheader: "Restock soon" }),
  };
}

export function renderBackInStock(payload: BackInStockPayload) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Back in stock</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563;">
      Good news — <strong>${escapeHtml(payload.productTitle)}</strong> is available again.
    </p>
    ${payload.productUrl ? cta(payload.productUrl, "View product") : ""}
  `;
  return {
    subject: `Back in stock · ${payload.productTitle}`,
    text: `${payload.productTitle} is back in stock${payload.productUrl ? `: ${payload.productUrl}` : "."}`,
    html: layout({ title: "Back in stock", body }),
  };
}
