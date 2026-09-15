import { apiRequest } from "./api-client";

export type CreatePaymentOrderResult = {
  paymentId: string;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  keyId: string;
  mode: "razorpay" | "stub";
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

export async function createPaymentOrder(orderId: string) {
  const result = await apiRequest<CreatePaymentOrderResult>(
    "POST",
    "/api/payments/create-order",
    { body: { orderId } }
  );
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Could not start payment");
  }
  return result.data;
}

export async function stubCapturePayment(input: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
}) {
  const result = await apiRequest("POST", "/api/payments/stub-capture", {
    body: input,
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data;
}

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Razorpay requires a browser"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay script failed"));
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(opts: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  name?: string;
  email?: string;
  contact?: string;
  method?: "card" | "upi" | "netbanking" | "wallet";
  onSuccess: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss: () => void;
}) {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error("Razorpay SDK not available");
  }

  const methodPref =
    opts.method === "upi"
      ? { upi: true }
      : opts.method === "netbanking"
        ? { netbanking: true }
        : opts.method === "wallet"
          ? { wallet: true }
          : { card: true };

  const rzp = new window.Razorpay({
    key: opts.keyId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: "Stuffsy",
    image: "/brand/stuffsy-logo.png",
    description: "Order payment",
    order_id: opts.razorpayOrderId,
    prefill: {
      name: opts.name,
      email: opts.email,
      contact: opts.contact,
    },
    theme: { color: "#7c3aed" },
    config: { display: { preferences: { show_default_blocks: true } } },
    method: methodPref,
    handler: (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      opts.onSuccess(response);
    },
    modal: {
      ondismiss: () => opts.onDismiss(),
    },
  });

  rzp.open();
}
