import { UnrecoverableError, type Job } from "bullmq";
import { env } from "../config/env.js";
import {
  renderAbandonedCart,
  renderBackInStock,
  renderCouponOffer,
  renderDigitalDelivery,
  renderCartPriceDrop,
  renderRecentlyViewedDigest,
  renderEmailVerification,
  renderInvoiceReady,
  renderLowStockAlert,
  renderOrderConfirmation,
  renderSellerNewOrder,
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
  type DigitalDeliveryPayload,
  type LowStockAlertPayload,
  type OrderEmailPayload,
  type RecentlyViewedDigestPayload,
} from "../templates/index.js";
import { sendMail as deliver, type SendMailInput } from "../utils/mailer.js";

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
  "seller-new-order",
  "digital-delivery",
] as const;

export type EmailJobName = (typeof EMAIL_JOB_NAMES)[number];

/**
 * Promotional mail. These carry List-Unsubscribe, which Gmail and Yahoo
 * require from bulk senders and which keeps them out of spam folders.
 */
const MARKETING_JOBS = new Set<EmailJobName>([
  "abandoned-cart",
  "coupon-offer",
  "cart-price-drop",
  "recently-viewed-digest",
]);

function listUnsubscribeHeaders(): Record<string, string> {
  const prefs = `${env.FRONTEND_URL.replace(/\/$/, "")}/account?tab=notifications`;
  return {
    "List-Unsubscribe": `<mailto:${env.SUPPORT_EMAIL}?subject=unsubscribe>, <${prefs}>`,
  };
}

/** Malformed payloads can't succeed on retry, so they fail once, permanently. */
function invalid(message: string): never {
  throw new UnrecoverableError(message);
}

/** Tokens are base64url from the backend; anything else is a corrupt job. */
function assertToken(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(token)) {
    invalid("auth email job has a malformed token");
  }
  return token;
}

function asOrder(data: unknown): OrderEmailPayload {
  const payload = data as OrderEmailPayload;
  if (!payload?.to) {
    invalid("Order email job requires to");
  }
  if (!payload.orderNumber) {
    payload.orderNumber = String(payload.orderId ?? "ORDER");
  }
  return payload;
}

export async function processEmailJob(job: Job) {
  const name = job.name as EmailJobName;
  console.log(`[email] processing job=${name} id=${job.id}`);

  const sendMail = (input: SendMailInput) =>
    deliver({
      ...input,
      idempotencyKey: `${job.queueName}-${job.name}-${job.id}`,
      headers: MARKETING_JOBS.has(name) ? { ...listUnsubscribeHeaders(), ...input.headers } : input.headers,
    });

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
      // The hosted PDF is linked; a job may also carry the PDF itself.
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
          : undefined,
      });
    }
    case "digital-delivery": {
      const payload = job.data as DigitalDeliveryPayload;
      if (!payload?.to || !payload.orderNumber || !Array.isArray(payload.products)) {
        invalid("digital-delivery requires to, orderNumber and products[]");
      }
      const rendered = renderDigitalDelivery(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "abandoned-cart": {
      const payload = job.data as AbandonedCartPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        invalid("abandoned-cart requires to and items[]");
      }
      const rendered = renderAbandonedCart(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "coupon-offer": {
      const payload = job.data as CouponOfferPayload;
      if (!payload?.to || !payload?.couponCode) {
        invalid("coupon-offer requires to and couponCode");
      }
      const rendered = renderCouponOffer(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "cart-price-drop": {
      const payload = job.data as CartPriceDropPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        invalid("cart-price-drop requires to and items[]");
      }
      const rendered = renderCartPriceDrop(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "recently-viewed-digest": {
      const payload = job.data as RecentlyViewedDigestPayload;
      if (!payload?.to || !Array.isArray(payload.items)) {
        invalid("recently-viewed-digest requires to and items[]");
      }
      const rendered = renderRecentlyViewedDigest(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "email-verification": {
      const payload = job.data as AuthEmailPayload;
      if (!payload?.to) invalid("email-verification requires to");
      const token = assertToken(payload.token);
      // Always our own site: a link in a security email must never point elsewhere.
      const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
      const rendered = renderEmailVerification({ ...payload, verifyUrl });
      return sendMail({ to: payload.to, ...rendered });
    }
    case "password-reset": {
      const payload = job.data as AuthEmailPayload;
      if (!payload?.to) invalid("password-reset requires to");
      const token = assertToken(payload.token);
      const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
      const rendered = renderPasswordReset({ ...payload, resetUrl });
      return sendMail({ to: payload.to, ...rendered });
    }
    case "low-stock-alert": {
      const payload = job.data as LowStockAlertPayload;
      if (!payload?.to || !payload?.productTitle) {
        invalid("low-stock-alert requires to and productTitle");
      }
      const rendered = renderLowStockAlert(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "back-in-stock": {
      const payload = job.data as BackInStockPayload;
      if (!payload?.to || !payload?.productTitle) {
        invalid("back-in-stock requires to and productTitle");
      }
      const rendered = renderBackInStock(payload);
      return sendMail({ to: payload.to, ...rendered });
    }
    case "seller-new-order": {
      const order = asOrder(job.data);
      const rendered = renderSellerNewOrder(order);
      return sendMail({ to: order.to, ...rendered });
    }
    default:
      invalid(`Unknown email job name: ${String(name)}`);
  }
}
