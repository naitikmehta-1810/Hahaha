import PDFDocument from "pdfkit";
import { Queue, Worker } from "bullmq";
import { pool } from "../config/db.js";
import { createBullConnection, queuePrefix } from "../config/queue.js";
import { uploadRawFile } from "../services/media.service.js";
import { enqueueEmailJob } from "../services/notify.enqueue.js";

const QUEUE_NAME = "invoice";

let invoiceQueue: Queue | null = null;

function getQueue() {
  if (!invoiceQueue) {
    invoiceQueue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
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

type InvoiceLine = {
  title: string;
  variant: string | null;
  note: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  gstPercent: number;
};

type InvoiceSellerGroup = {
  shopName: string;
  address: string | null;
  gstin: string | null;
  legalName: string | null;
  state: string | null;
  gstRegistered: boolean;
  items: InvoiceLine[];
};

type InvoiceData = {
  invoiceNumber: string;
  orderNumber: string;
  orderDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  customerName: string;
  shippingLines: string[];
  buyerState: string | null;
  groups: InvoiceSellerGroup[];
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
};

function sameState(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function moneyRound(value: number) {
  return Math.round(value * 100) / 100;
}

function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const registered = data.groups.filter((group) => group.gstRegistered);
    const unregistered = data.groups.filter((group) => !group.gstRegistered);
    const documentTitle =
      registered.length > 0 && unregistered.length === 0
        ? "Tax Invoice"
        : registered.length === 0
          ? "Bill of Supply"
          : "Invoice";

    doc.rect(0, 0, doc.page.width, 78).fill("#7C3AED");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text("Stuffsy", 36, 22);
    doc.font("Helvetica").fontSize(10).text("Handmade marketplace", 36, 48);
    doc.font("Helvetica-Bold").fontSize(13).text(documentTitle, 320, 22, {
      width: 239,
      align: "right",
    });
    doc.font("Helvetica").fontSize(9).fillColor("#ede9fe");
    doc.text(data.invoiceNumber, 320, 42, { width: 239, align: "right" });
    doc.text(`${data.orderDate}  ·  Order ${data.orderNumber}`, 320, 56, {
      width: 239,
      align: "right",
    });

    doc.fillColor("#111827");
    let y = 98;
    const drawCard = (x: number, title: string, lines: string[]) => {
      const height = 22 + lines.length * 13;
      doc.roundedRect(x, y, 250, height, 8).fillAndStroke("#faf8ff", "#ece7f5");
      doc.fillColor("#7C3AED").font("Helvetica-Bold").fontSize(9).text(title, x + 12, y + 10);
      doc.fillColor("#374151").font("Helvetica").fontSize(9);
      lines.forEach((line, index) => {
        doc.text(line, x + 12, y + 24 + index * 13, { width: 226 });
      });
      return height;
    };

    const billLines = [data.customerName, ...data.shippingLines.filter(Boolean)];
    if (data.buyerState) billLines.push(`Place of supply: ${data.buyerState}`);
    const leftHeight = drawCard(36, "BILL TO", billLines);
    const isCod = data.paymentMethod === "cod";
    const payLines = [
      isCod ? "Cash on Delivery" : data.paymentMethod.toUpperCase(),
      isCod
        ? "Amount due on delivery"
        : data.paymentReference
          ? `Ref ${data.paymentReference}`
          : "Paid online",
    ];
    const rightHeight = drawCard(309, "PAYMENT", payLines);
    y += Math.max(leftHeight, rightHeight) + 18;

    const ensureRoom = (needed: number) => {
      if (y + needed > doc.page.height - 50) {
        doc.addPage();
        y = 40;
      }
    };

    for (const group of data.groups) {
      ensureRoom(90);
      doc.roundedRect(36, y, 523, 8).fill(group.gstRegistered ? "#7C3AED" : "#f59e0b");
      y += 16;
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text(group.shopName, 36, y);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(group.gstRegistered ? "#7C3AED" : "#b45309")
        .text(group.gstRegistered ? "TAX INVOICE" : "BILL OF SUPPLY", 400, y, {
          width: 159,
          align: "right",
        });
      y = doc.y + 2;
      doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
      if (group.legalName && group.gstRegistered) doc.text(`Legal name: ${group.legalName}`, 36, y);
      y = doc.y;
      if (group.address) doc.text(group.address, 36, y, { width: 360 });
      y = doc.y;
      doc.text(
        group.gstRegistered && group.gstin
          ? `GSTIN ${group.gstin}${group.state ? `  ·  ${group.state}` : ""}`
          : "Not registered under GST. GST is not charged by this seller.",
        36,
        y,
        { width: 500 }
      );
      y = doc.y + 8;

      const gstCols = group.gstRegistered;
      const headers = gstCols
        ? ["Item", "Qty", "Rate", "Taxable", "GST", "Amount"]
        : ["Item", "Qty", "Rate", "Amount"];
      const widths = gstCols ? [190, 40, 70, 70, 70, 73] : [280, 50, 90, 103];
      ensureRoom(36);
      doc.rect(36, y, 523, 18).fill("#f5f3ff");
      doc.fillColor("#5b21b6").font("Helvetica-Bold").fontSize(8);
      let hx = 42;
      headers.forEach((header, index) => {
        doc.text(header, hx, y + 5, { width: widths[index] - 6 });
        hx += widths[index];
      });
      y += 22;

      for (const item of group.items) {
        const label = [
          item.variant ? `${item.title} (${item.variant})` : item.title,
          item.note ? `Customization: ${item.note}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        const gstAmount = gstCols ? moneyRound((item.lineTotal * item.gstPercent) / 100) : 0;
        const amount = gstCols ? moneyRound(item.lineTotal + gstAmount) : item.lineTotal;
        const cells = gstCols
          ? [
              label,
              String(item.quantity),
              inr(item.unitPrice),
              inr(item.lineTotal),
              `${item.gstPercent}%`,
              inr(amount),
            ]
          : [label, String(item.quantity), inr(item.unitPrice), inr(amount)];
        ensureRoom(36);
        doc.fillColor("#111827").font("Helvetica").fontSize(8);
        const labelHeight = doc.heightOfString(cells[0] ?? "", { width: widths[0] - 8 });
        const rowHeight = Math.max(18, labelHeight + 6);
        let cx = 42;
        cells.forEach((cell, index) => {
          doc.text(cell, cx, y, { width: widths[index] - 8 });
          cx += widths[index];
        });
        y += rowHeight;
        doc.moveTo(36, y - 4).lineTo(559, y - 4).strokeColor("#f3e8ff").stroke();
      }
      y += 8;
    }

    ensureRoom(120);
    const summaryX = 330;
    doc.fillColor("#374151").font("Helvetica").fontSize(10);
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#111827" : "#374151");
      doc.fontSize(bold ? 12 : 10);
      doc.text(label, summaryX, y, { width: 110 });
      doc.text(value, summaryX + 110, y, { width: 110, align: "right" });
      y += bold ? 20 : 16;
    };
    row("Subtotal", inr(data.subtotal));
    if (data.discountAmount > 0) row("Discount", `-${inr(data.discountAmount)}`);
    row("Shipping", inr(data.shippingAmount));

    if (registered.length > 0 && unregistered.length === 0 && data.taxAmount > 0) {
      const oneState = registered.every(
        (group) => sameState(group.state, registered[0]?.state ?? null)
      );
      const intra = oneState && sameState(registered[0]?.state ?? null, data.buyerState);
      if (intra) {
        const half = moneyRound(data.taxAmount / 2);
        row("CGST", inr(half));
        row("SGST", inr(moneyRound(data.taxAmount - half)));
      } else if (data.buyerState) {
        row("IGST", inr(data.taxAmount));
      } else {
        row(`GST (${Number((data.taxRate * 100).toFixed(2))}%)`, inr(data.taxAmount));
      }
    } else if (data.taxAmount > 0) {
      row("Tax on order", inr(data.taxAmount));
    } else if (unregistered.length === data.groups.length) {
      row("GST", "Not charged");
    }

    doc.moveTo(summaryX, y).lineTo(555, y).strokeColor("#e5e7eb").stroke();
    y += 8;
    row("Total", inr(data.totalAmount), true);

    y += 16;
    doc.fillColor("#6b7280").font("Helvetica").fontSize(8);
    doc.text(
      registered.length > 0
        ? "GST figures use the tax stored on this order. Intra-state orders split GST into CGST and SGST. Inter-state orders show IGST."
        : "This is a bill of supply. The seller is not registered under GST, so GST is not charged on these goods.",
      36,
      y,
      { width: 523 }
    );
    y = doc.y + 14;
    doc.text("Thank you for shopping on Stuffsy.", 36, y, { width: 523, align: "center" });
    doc.text("support@stuffsy.in  ·  This is a computer-generated document.", 36, doc.y + 2, {
      width: 523,
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
    gst_rate: string | null;
    variant_option_values: Record<string, unknown> | null;
    customization_note: string | null;
    seller_id: string;
  }>(
    `select product_title, quantity, unit_price, line_total, gst_rate, variant_option_values,
            customization_note, seller_id
     from public.order_items where order_id = $1`,
    [orderId]
  );

  const sellerIds = [...new Set(items.rows.map((item) => item.seller_id).filter(Boolean))];
  const sellers = sellerIds.length
    ? await pool.query<{
        id: string;
        shop_name: string;
        business_address: string | null;
        gstin: string | null;
        gst_legal_name: string | null;
        gst_verified_at: Date | null;
        selling_state: string | null;
      }>(
        `select id, shop_name, business_address, gstin, gst_legal_name, gst_verified_at, selling_state
         from public.sellers where id = any($1::uuid[])`,
        [sellerIds]
      )
    : { rows: [] };

  const sellerById = new Map(sellers.rows.map((seller) => [seller.id, seller]));
  const groups = new Map<string, InvoiceSellerGroup>();
  for (const item of items.rows) {
    const seller = sellerById.get(item.seller_id);
    const key = item.seller_id || "unknown";
    if (!groups.has(key)) {
      groups.set(key, {
        shopName: seller?.shop_name || "Stuffsy Seller",
        address: seller?.business_address ?? null,
        gstin: seller?.gstin ?? null,
        legalName: seller?.gst_legal_name ?? null,
        state: seller?.selling_state ?? null,
        gstRegistered: Boolean(seller?.gstin && seller.gst_verified_at),
        items: [],
      });
    }
    groups.get(key)!.items.push({
      title: item.product_title,
      variant: item.variant_option_values
        ? Object.values(item.variant_option_values).filter(Boolean).join(" / ") || null
        : null,
      note: item.customization_note,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      gstPercent: Number(item.gst_rate ?? 0),
    });
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
      buyerState: address.state ?? null,
      groups: [...groups.values()],
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
    { connection: createBullConnection(), prefix: queuePrefix }
  );
  worker.on("failed", (job, err) => {
    console.error(`[invoice] job failed id=${job?.id}`, err);
  });
  worker.on("error", (err) => {
    console.error("[invoice] redis error", err);
  });
  console.log("[invoice] BullMQ worker started");
}
