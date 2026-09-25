import PDFDocument from "pdfkit";
import { Queue, Worker } from "bullmq";
import { pool } from "../config/db.js";
import { queueConnection, queuePrefix } from "../config/queue.js";
import { uploadRawFile } from "../services/media.service.js";
import { enqueueEmailJob } from "../services/notify.enqueue.js";

const QUEUE_NAME = "invoice";

let invoiceQueue: Queue | null = null;

function getQueue() {
  if (!invoiceQueue) {
    invoiceQueue = new Queue(QUEUE_NAME, {
      connection: queueConnection,
      prefix: queuePrefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return invoiceQueue;
}

export async function enqueueInvoiceGeneration(orderId: string) {
  try {
    await getQueue().add("generate-invoice", { orderId }, { jobId: `invoice-${orderId}` });
  } catch (error) {
    console.error("[invoice] enqueue failed", error);
  }
}

async function nextInvoiceNumber() {
  const result = await pool.query<{ n: string }>(
    `select nextval('public.invoice_number_seq')::text as n`
  );
  const n = Number(result.rows[0]?.n ?? 1001);
  return `INV-${n}`;
}

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type InvoiceData = {
  invoiceNumber: string;
  orderNumber: string;
  orderDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  customerName: string;
  shippingLines: string[];
  sellerName: string;
  sellerAddress: string | null;
  items: Array<{
    title: string;
    variant: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
};

function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#5b21b6").fontSize(22).text("Stuffsy", { continued: false });
    doc.fillColor("#111827").fontSize(11).text("Tax Invoice / Bill of Supply", { align: "right" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#4b5563");
    doc.text(`Invoice: ${data.invoiceNumber}`);
    doc.text(`Order: ${data.orderNumber}`);
    doc.text(`Date: ${data.orderDate}`);
    doc.moveDown();

    doc.fillColor("#111827").fontSize(12).text("Bill To", { underline: true });
    doc.fontSize(10).fillColor("#374151");
    doc.text(data.customerName);
    for (const line of data.shippingLines) {
      if (line) doc.text(line);
    }
    doc.moveDown();

    doc.fillColor("#111827").fontSize(12).text("Sold By", { underline: true });
    doc.fontSize(10).fillColor("#374151");
    doc.text(data.sellerName);
    if (data.sellerAddress) doc.text(data.sellerAddress);
    doc.moveDown();

    const isCod = data.paymentMethod === "cod";
    doc.fillColor("#111827").fontSize(11).text(
      `Payment method: ${isCod ? "Cash on Delivery" : data.paymentMethod.toUpperCase()}`
    );
    if (!isCod && data.paymentReference) {
      doc.fontSize(10).fillColor("#4b5563").text(`Transaction reference: ${data.paymentReference}`);
    } else if (isCod) {
      doc.fontSize(10).fillColor("#4b5563").text("Amount due on delivery — no gateway transaction ID.");
    }
    doc.moveDown();

    const tableTop = doc.y;
    doc.fillColor("#111827").fontSize(10);
    doc.text("Item", 50, tableTop, { width: 220 });
    doc.text("Qty", 280, tableTop, { width: 40 });
    doc.text("Unit", 330, tableTop, { width: 80 });
    doc.text("Total", 420, tableTop, { width: 100 });
    doc
      .moveTo(50, tableTop + 14)
      .lineTo(545, tableTop + 14)
      .strokeColor("#e5e7eb")
      .stroke();

    let y = tableTop + 22;
    for (const item of data.items) {
      const label = item.variant ? `${item.title} (${item.variant})` : item.title;
      doc.fillColor("#111827").text(label, 50, y, { width: 220 });
      doc.text(String(item.quantity), 280, y, { width: 40 });
      doc.text(inr(item.unitPrice), 330, y, { width: 80 });
      doc.text(inr(item.lineTotal), 420, y, { width: 100 });
      y += 28;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.y = y + 10;
    doc.fillColor("#374151").fontSize(10);
    doc.text(`Subtotal: ${inr(data.subtotal)}`, { align: "right" });
    if (data.discountAmount > 0) {
      doc.text(`Discount: -${inr(data.discountAmount)}`, { align: "right" });
    }
    doc.text(`Shipping: ${inr(data.shippingAmount)}`, { align: "right" });
    doc.text(
      `GST (${Number((data.taxRate * 100).toFixed(2))}%): ${inr(data.taxAmount)}`,
      { align: "right" }
    );
    doc.fillColor("#111827").fontSize(12).text(`Total: ${inr(data.totalAmount)}`, {
      align: "right",
    });

    doc.moveDown(2);
    doc.fillColor("#6b7280").fontSize(9);
    doc.text("Thank you for shopping on Stuffsy.", { align: "center" });
    doc.text("Support: support@stuffsy.in · This is a computer-generated invoice.", {
      align: "center",
    });

    doc.end();
  });
}

type OrderInvoiceRow = {
  order_number: string;
  total_amount: string;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  tax_rate: string;
  payment_method: string | null;
  payment_reference: string | null;
  shipping_address: {
    recipientName?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  placed_at: Date | null;
  created_at: Date;
  user_email: string | null;
  full_name: string | null;
};

async function loadInvoiceData(
  orderId: string,
  invoiceNumber: string
): Promise<{ data: InvoiceData; row: OrderInvoiceRow } | null> {
  const order = await pool.query<OrderInvoiceRow>(
    `select o.order_number, o.total_amount, o.subtotal, o.discount_amount, o.shipping_amount,
            o.tax_amount, o.tax_rate, o.payment_method, o.payment_reference, o.shipping_address,
            o.placed_at, o.created_at, u.email as user_email, u.full_name
     from public.orders o
     join public.users u on u.id = o.user_id
     where o.id = $1`,
    [orderId]
  );
  if (!order.rows[0]) return null;
  const row = order.rows[0];

  const items = await pool.query<{
    product_title: string;
    quantity: number;
    unit_price: string;
    line_total: string;
    variant_option_values: Record<string, unknown> | null;
    seller_id: string;
  }>(
    `select product_title, quantity, unit_price, line_total, variant_option_values, seller_id
     from public.order_items where order_id = $1`,
    [orderId]
  );

  const sellerId = items.rows[0]?.seller_id;
  let sellerName = "Stuffsy Seller";
  let sellerAddress: string | null = null;
  if (sellerId) {
    const seller = await pool.query<{ shop_name: string; business_address: string | null }>(
      `select shop_name, business_address from public.sellers where id = $1`,
      [sellerId]
    );
    if (seller.rows[0]) {
      sellerName = seller.rows[0].shop_name;
      sellerAddress = seller.rows[0].business_address;
    }
  }

  const address = row.shipping_address ?? {};
  return {
    row,
    data: {
      invoiceNumber,
      orderNumber: row.order_number,
      orderDate: new Date(row.placed_at ?? row.created_at).toLocaleDateString("en-IN"),
      paymentMethod: row.payment_method ?? "card",
      paymentReference: row.payment_reference,
      customerName: address.recipientName || row.full_name || "Customer",
      shippingLines: [
        [address.line1, address.line2].filter(Boolean).join(", "),
        [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
        address.country || "IN",
      ],
      sellerName,
      sellerAddress,
      items: items.rows.map((item) => ({
        title: item.product_title,
        variant: item.variant_option_values
          ? Object.values(item.variant_option_values).filter(Boolean).join(" / ") || null
          : null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discount_amount),
      shippingAmount: Number(row.shipping_amount),
      taxAmount: Number(row.tax_amount),
      taxRate: Number(row.tax_rate),
      totalAmount: Number(row.total_amount),
    },
  };
}

/**
 * Rebuild PDF bytes from order data for an authenticated buyer.
 * Independent of Cloudinary delivery (which may return 401 on restricted raw assets).
 */
export async function getInvoicePdfForOrder(orderId: string, userId: string) {
  const ownership = await pool.query<{ user_id: string }>(
    `select user_id from public.orders where id = $1`,
    [orderId]
  );
  if (!ownership.rows[0] || ownership.rows[0].user_id !== userId) {
    return null;
  }

  let invoiceNumber: string | null = null;
  const existing = await pool.query<{ invoice_number: string }>(
    `select invoice_number from public.invoices where order_id = $1`,
    [orderId]
  );
  invoiceNumber = existing.rows[0]?.invoice_number ?? null;

  if (!invoiceNumber) {
    await generateInvoiceForOrder(orderId);
    const again = await pool.query<{ invoice_number: string }>(
      `select invoice_number from public.invoices where order_id = $1`,
      [orderId]
    );
    invoiceNumber = again.rows[0]?.invoice_number ?? null;
  }
  if (!invoiceNumber) return null;

  const loaded = await loadInvoiceData(orderId, invoiceNumber);
  if (!loaded) return null;
  const buffer = await buildInvoicePdf(loaded.data);
  return {
    buffer,
    invoiceNumber,
    fileName: `${invoiceNumber}.pdf`,
  };
}

export async function generateInvoiceForOrder(orderId: string): Promise<{
  pdfUrl: string;
  pdfBuffer: Buffer;
} | null> {
  const existing = await pool.query<{ pdf_url: string }>(
    `select pdf_url from public.invoices where order_id = $1`,
    [orderId]
  );
  if (existing.rows[0]) {
    return null;
  }

  const invoiceNumber = await nextInvoiceNumber();
  const loaded = await loadInvoiceData(orderId, invoiceNumber);
  if (!loaded) return null;
  const { row, data } = loaded;
  const pdfBuffer = await buildInvoicePdf(data);

  const uploaded = await uploadRawFile({
    buffer: pdfBuffer,
    fileName: `${invoiceNumber}.pdf`,
    folder: "invoices",
    contentType: "application/pdf",
  });
  const pdfUrl = uploaded.url;

  await pool.query(
    `insert into public.invoices (id, order_id, invoice_number, pdf_url, generated_at)
     values (gen_random_uuid(), $1, $2, $3, now())`,
    [orderId, invoiceNumber, pdfUrl]
  );
  await pool.query(`update public.orders set invoice_url = $1, updated_at = now() where id = $2`, [
    pdfUrl,
    orderId,
  ]);

  if (row.user_email) {
    await enqueueEmailJob("invoice-ready", {
      to: row.user_email,
      orderId,
      orderNumber: row.order_number,
      invoiceUrl: pdfUrl,
      invoiceNumber,
      pdfUrl,
    });
  }

  return { pdfUrl, pdfBuffer };
}

let workerStarted = false;

export function startInvoiceWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "generate-invoice") {
        await generateInvoiceForOrder(String(job.data.orderId));
      }
    },
    { connection: queueConnection, prefix: queuePrefix }
  );
  worker.on("failed", (job, err) => {
    console.error(`[invoice] job failed id=${job?.id}`, err);
  });
  console.log("[invoice] BullMQ worker started");
}
