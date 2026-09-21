import type { Job } from "bullmq";
import { env } from "../config/env.js";
import {
  renderAbandonedCart,
  renderBackInStock,
  renderCouponOffer,
  renderCartPriceDrop,
  renderRecentlyViewedDigest,
  renderEmailVerification,
  renderInvoiceReady,
  renderLowStockAlert,
  renderOrderConfirmation,
  renderOrderDelivered,
  renderOrderOutForDelivery,
  renderOrderProcessing,
  renderOrderShipped,
  renderPasswordReset,
  renderPaymentFailed,
  type AbandonedCartPayload,
  type AuthEmailPayload,
  type BackInStockPayload,
  type CartPriceDropPayload,
  type CouponOfferPayload,
  type LowStockAlertPayload,
  type OrderEmailPayload,
  type RecentlyViewedDigestPayload,
} from "../templates/index.js";
import { sendMail } from "../utils/mailer.js";

export const EMAIL_JOB_NAMES = [
  "order-confirmation",
  "order-processing",
  "payment-failed",
  "order-shipped",
  "order-out-for-delivery",
  "order-delivered",
  "invoice-ready",
  "abandoned-cart",
  "coupon-offer",
  "cart-price-drop",
  "recently-viewed-digest",
  "email-verification",
  "password-reset",
  "low-stock-alert",
  "back-in-stock",
] as const;

export type EmailJobName = (typeof EMAIL_JOB_NAMES)[number];

function asOrder(data: unknown): OrderEmailPayload {
  const payload = data as OrderEmailPayload;
  if (!payload?.to) {
    throw new Error("Order email job requires to");
  }
  if (!payload.orderNumber) {
    payload.orderNumber = String(payload.orderId ?? "ORDER");
  }
  return payload;
}

export async function processEmailJob(job: Job) {
  const name = job.name as EmailJobName;
  console.log(`[email] processing job=${name} id=${job.id}`);

  switch (name) {
    case "order-confirmation": {
      const order = asOrder(job.data);
      const rendered = renderOrderConfirmation(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "order-processing": {
      const order = asOrder(job.data);
      const rendered = renderOrderProcessing(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "payment-failed": {
      const order = asOrder(job.data);
      const rendered = renderPaymentFailed(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "order-shipped": {
      const order = asOrder(job.data);
      const rendered = renderOrderShipped(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "order-out-for-delivery": {
      const order = asOrder(job.data);
      const rendered = renderOrderOutForDelivery(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "order-delivered": {
      const order = asOrder(job.data);
      const rendered = renderOrderDelivered(order);
      return sendMail({ to: order.to, ...rendered });
    }
    case "invoice-ready": {
      const order = asOrder(job.data);
      const rendered = renderInvoiceReady(order);
      const attachments =
        order.invoiceUrl && !order.invoiceUrl.startsWith("http")
          ? undefined
          : undefined;
      // Prefer linking the hosted PDF; Phase 6 may also attach a buffer via job.data.pdfAttachment.
      const pdf = (job.data as { pdfAttachment?: { filename: string; contentBase64: string } })
        .pdfAttachment;
      return sendMail({
        to: order.to,
        ...rendered,
        attachments: pdf
          ? [
              {
                filename: pdf.filename || `invoice-${order.orderNumber}.pdf`,
                content: Buffer.from(pdf.contentBase64, "base64"),
                contentType: "application/pdf",
              },
            ]
          : attachments,
      });
    }
    case "abandoned-cart": {
      const payload = job.data as AbandonedCartPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        throw new Error("abandoned-cart requires to and items[]");
      }
      const rendered = renderAbandonedCart(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "coupon-offer": {
      const payload = job.data as CouponOfferPayload;
      if (!payload?.to || !payload?.couponCode) {
        throw new Error("coupon-offer requires to and couponCode");
      }
      const rendered = renderCouponOffer(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "cart-price-drop": {
      const payload = job.data as CartPriceDropPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        throw new Error("cart-price-drop requires to and items[]");
      }
      const rendered = renderCartPriceDrop(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "recently-viewed-digest": {
      const payload = job.data as RecentlyViewedDigestPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        throw new Error("recently-viewed-digest requires to and items[]");
      }
      const rendered = renderRecentlyViewedDigest(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "email-verification": {
      const payload = job.data as AuthEmailPayload;
      if (!payload?.to || !payload?.token) {
        throw new Error("email-verification requires to and token");
      }
      const verifyUrl =
        payload.verifyUrl ||
        `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(payload.token)}`;
      const rendered = renderEmailVerification({ ...payload, verifyUrl });
      return sendMail({ to: payload.to, ...rendered });
    }
    case "password-reset": {
      const payload = job.data as AuthEmailPayload;
      if (!payload?.to || !payload?.token) {
        throw new Error("password-reset requires to and token");
      }
      const resetUrl =
        payload.resetUrl ||
        `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(payload.token)}`;
      const rendered = renderPasswordReset({ ...payload, resetUrl });
      return sendMail({ to: payload.to, ...rendered });
    }
    case "low-stock-alert": {
      const payload = job.data as LowStockAlertPayload;
      if (!payload?.to || !payload?.productTitle) {
        throw new Error("low-stock-alert requires to and productTitle");
      }
      const rendered = renderLowStockAlert(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "back-in-stock": {
      const payload = job.data as BackInStockPayload;
      if (!payload?.to || !payload?.productTitle) {
        throw new Error("back-in-stock requires to and productTitle");
      }
      const rendered = renderBackInStock(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    default:
      throw new Error(`Unknown email job name: ${String(name)}`);
  }
}
