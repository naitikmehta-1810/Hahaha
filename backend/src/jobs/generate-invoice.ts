import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    const { withQueueTimeout } = await import("../services/notify.enqueue.js");
    await withQueueTimeout(
      getQueue().add("generate-invoice", { orderId }, { jobId: `invoice-${orderId}` }),
      "invoice"
    );
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

/**
 * Assets ship in backend/assets. Resolve from this module (src/jobs or
 * dist/jobs) and fall back to the working directory.
 */
function assetPath(...parts: string[]) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../assets", ...parts),
    path.resolve(process.cwd(), "assets", ...parts),
    path.resolve(process.cwd(), "backend/assets", ...parts),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const INVOICE_ASSETS = {
  logo: assetPath("stuffsy-mark.png"),
  font: assetPath("fonts", "NotoSans-Regular.ttf"),
  fontBold: assetPath("fonts", "NotoSans-Bold.ttf"),
};

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** 125050.5 -> "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only" */
export function amountInWords(amount: number) {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  const words = parts.length ? parts.join(" ") : "Zero";
  return `${words} Rupee${rupees === 1 ? "" : "s"}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
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

export type InvoiceData = {
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

const INVOICE_COLORS = {
  brand: "#7C3AED",
  brandDark: "#4C1D95",
  brandTint: "#F5F1FE",
  ink: "#1F1430",
  muted: "#645C74",
  light: "#948CA3",
  border: "#E6E0EF",
  zebra: "#FBFAFE",
  amber: "#B45309",
  amberTint: "#FFF7E6",
};

const SUPPORT_EMAIL = "stuffsyworkplace@gmail.com";

export function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const M = 40;
    const doc = new PDFDocument({
      size: "A4",
      margin: M,
      bufferPages: true,
      info: {
        Title: `${data.invoiceNumber} · Stuffsy`,
        Author: "Stuffsy",
        Subject: `Invoice for order ${data.orderNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Noto Sans has the ₹ glyph; the built-in Helvetica does not.
    const hasFont = Boolean(INVOICE_ASSETS.font && INVOICE_ASSETS.fontBold);
    if (hasFont) {
      doc.registerFont("Body", INVOICE_ASSETS.font!);
      doc.registerFont("Bold", INVOICE_ASSETS.fontBold!);
    }
    // Ligatures (ff, fi) would make copied text read "Stufsy"; keep plain glyphs so
    // the PDF stays searchable.
    const rawText = doc.text.bind(doc) as (...args: unknown[]) => PDFKit.PDFDocument;
    (doc as unknown as { text: (...args: unknown[]) => PDFKit.PDFDocument }).text = (
      text: unknown,
      x?: unknown,
      yPos?: unknown,
      options?: unknown
    ) =>
      rawText(text, x, yPos, {
        features: { liga: false, clig: false },
        ...((options as Record<string, unknown> | undefined) ?? {}),
      });
    const BODY = hasFont ? "Body" : "Helvetica";
    const BOLD = hasFont ? "Bold" : "Helvetica-Bold";
    const money = (value: number) => (hasFont ? inr(value) : inr(value).replace("₹", "Rs. "));

    const C = INVOICE_COLORS;
    const pageW = doc.page.width;
    const contentW = pageW - M * 2;
    const right = pageW - M;
    const footerReserve = 64;

    const registered = data.groups.filter((group) => group.gstRegistered);
    const unregistered = data.groups.filter((group) => !group.gstRegistered);
    const documentTitle =
      registered.length > 0 && unregistered.length === 0
        ? "Tax Invoice"
        : registered.length === 0
          ? "Bill of Supply"
          : "Invoice";

    let y = 0;
    const ensureRoom = (needed: number) => {
      if (y + needed > doc.page.height - footerReserve) {
        doc.addPage();
        doc.rect(0, 0, pageW, 4).fill(C.brand);
        y = M;
      }
    };
    const label = (text: string, x: number, top: number, width: number, align: "left" | "right" = "left") => {
      doc.font(BOLD).fontSize(7).fillColor(C.light).text(text.toUpperCase(), x, top, {
        width,
        align,
        characterSpacing: 0.6,
      });
    };

    // ── Header ────────────────────────────────────────────────────────
    doc.rect(0, 0, pageW, 6).fill(C.brand);
    const logoSize = 42;
    let brandX = M;
    if (INVOICE_ASSETS.logo) {
      doc.image(INVOICE_ASSETS.logo, M, 30, { width: logoSize, height: logoSize });
      brandX = M + logoSize + 10;
    }
    doc.font(BOLD).fontSize(22).fillColor(C.ink).text("Stuffsy", brandX, 31, { lineBreak: false });
    doc.font(BODY).fontSize(9).fillColor(C.muted).text("Handmade marketplace", brandX, 59, {
      lineBreak: false,
    });

    doc.font(BOLD).fontSize(20).fillColor(C.brand).text(documentTitle, M, 30, {
      width: contentW,
      align: "right",
    });
    doc.font(BODY).fontSize(8).fillColor(C.light).text("Original for recipient", M, 57, {
      width: contentW,
      align: "right",
    });

    // ── Meta strip ────────────────────────────────────────────────────
    y = 92;
    const isCod = data.paymentMethod === "cod";
    const paymentLabel = isCod
      ? "Cash on Delivery"
      : data.paymentMethod === "upi"
        ? "UPI"
        : data.paymentMethod.charAt(0).toUpperCase() + data.paymentMethod.slice(1);
    const meta: Array<[string, string]> = [
      ["Invoice no.", data.invoiceNumber],
      ["Invoice date", data.orderDate],
      ["Order no.", data.orderNumber],
      ["Payment", isCod ? "Due on delivery" : "Paid"],
    ];
    doc.roundedRect(M, y, contentW, 50, 8).fill(C.brandTint);
    const metaW = contentW / meta.length;
    meta.forEach(([key, value], index) => {
      const x = M + 14 + index * metaW;
      label(key, x, y + 11, metaW - 20);
      doc.font(BOLD).fontSize(10).fillColor(C.ink).text(value, x, y + 24, {
        width: metaW - 20,
        lineBreak: false,
        ellipsis: true,
      });
    });
    y += 66;

    // ── Parties ───────────────────────────────────────────────────────
    const colW = (contentW - 16) / 2;
    const billLines = [...data.shippingLines.filter(Boolean)];
    const payLines = [
      paymentLabel,
      isCod
        ? `Amount due on delivery: ${money(data.totalAmount)}`
        : data.paymentReference
          ? `Reference: ${data.paymentReference}`
          : "Paid online",
    ];
    if (data.buyerState) payLines.push(`Place of supply: ${data.buyerState}`);

    const drawParty = (x: number, title: string, heading: string | null, lines: string[]) => {
      label(title, x, y, colW);
      let top = y + 13;
      if (heading) {
        doc.font(BOLD).fontSize(10.5).fillColor(C.ink).text(heading, x, top, { width: colW });
        top = doc.y + 1;
      }
      doc.font(BODY).fontSize(9).fillColor(C.muted);
      for (const line of lines) {
        doc.text(line, x, top, { width: colW });
        top = doc.y;
      }
      return top;
    };
    const leftEnd = drawParty(M, "Billed & shipped to", data.customerName, billLines);
    const rightEnd = drawParty(M + colW + 16, "Payment", null, payLines);
    y = Math.max(leftEnd, rightEnd) + 18;

    // ── Seller groups ─────────────────────────────────────────────────
    for (const group of data.groups) {
      ensureRoom(110);
      const gst = group.gstRegistered;

      doc.moveTo(M, y).lineTo(right, y).lineWidth(0.8).strokeColor(C.border).stroke();
      y += 12;
      label("Sold by", M, y, 200);
      const tag = gst ? "TAX INVOICE" : "BILL OF SUPPLY";
      doc.font(BOLD).fontSize(7);
      const tagW = doc.widthOfString(tag) + 16;
      doc.roundedRect(right - tagW, y - 2, tagW, 15, 7).fill(gst ? C.brandTint : C.amberTint);
      doc.font(BOLD).fontSize(7).fillColor(gst ? C.brandDark : C.amber).text(tag, right - tagW, y + 2, {
        width: tagW,
        align: "center",
      });
      y += 12;
      doc.font(BOLD).fontSize(11.5).fillColor(C.ink).text(group.shopName, M, y, { width: contentW - tagW - 10 });
      y = doc.y + 1;
      doc.font(BODY).fontSize(8.5).fillColor(C.muted);
      const sellerLines = [
        gst && group.legalName ? `Legal name: ${group.legalName}` : null,
        group.address,
        gst && group.gstin
          ? `GSTIN: ${group.gstin}${group.state ? `   ·   State: ${group.state}` : ""}`
          : "Not registered under GST. GST is not charged by this seller.",
      ].filter((line): line is string => Boolean(line));
      for (const line of sellerLines) {
        doc.text(line, M, y, { width: contentW });
        y = doc.y;
      }
      y += 10;

      const columns = gst
        ? [
            { key: "#", w: 22, align: "left" as const },
            { key: "Item", w: 183, align: "left" as const },
            { key: "Qty", w: 32, align: "right" as const },
            { key: "Rate", w: 64, align: "right" as const },
            { key: "Taxable", w: 66, align: "right" as const },
            { key: "GST", w: 38, align: "right" as const },
            { key: "Tax", w: 50, align: "right" as const },
            { key: "Amount", w: contentW - 455, align: "right" as const },
          ]
        : [
            { key: "#", w: 22, align: "left" as const },
            { key: "Item", w: 273, align: "left" as const },
            { key: "Qty", w: 40, align: "right" as const },
            { key: "Rate", w: 80, align: "right" as const },
            { key: "Amount", w: contentW - 415, align: "right" as const },
          ];
      const pad = 6;

      const drawHeader = () => {
        doc.rect(M, y, contentW, 20).fill(C.ink);
        let x = M;
        doc.font(BOLD).fontSize(7.5).fillColor("#FFFFFF");
        for (const col of columns) {
          doc.text(col.key.toUpperCase(), x + pad, y + 6.5, {
            width: col.w - pad * 2,
            align: col.align,
            characterSpacing: 0.4,
          });
          x += col.w;
        }
        y += 20;
      };

      ensureRoom(44);
      drawHeader();

      let groupTotal = 0;
      group.items.forEach((item, index) => {
        const name = item.variant ? `${item.title} (${item.variant})` : item.title;
        const tax = gst ? moneyRound((item.lineTotal * item.gstPercent) / 100) : 0;
        const amount = gst ? moneyRound(item.lineTotal + tax) : item.lineTotal;
        groupTotal += amount;

        doc.font(BOLD).fontSize(8.5);
        const nameH = doc.heightOfString(name, { width: columns[1].w - pad * 2 });
        doc.fontSize(7.5);
        const noteH = item.note
          ? doc.heightOfString(`Customization: ${item.note}`, { width: columns[1].w - pad * 2 }) + 2
          : 0;
        const rowH = Math.max(22, nameH + noteH + 12);

        if (y + rowH > doc.page.height - footerReserve) {
          ensureRoom(rowH + 20);
          drawHeader();
        }
        if (index % 2 === 1) doc.rect(M, y, contentW, rowH).fill(C.zebra);

        const cells = gst
          ? [
              String(index + 1),
              name,
              String(item.quantity),
              money(item.unitPrice),
              money(item.lineTotal),
              `${item.gstPercent}%`,
              money(tax),
              money(amount),
            ]
          : [String(index + 1), name, String(item.quantity), money(item.unitPrice), money(amount)];

        let x = M;
        cells.forEach((cell, cellIndex) => {
          const col = columns[cellIndex];
          const isAmount = cellIndex === cells.length - 1;
          doc
            .font(isAmount || cellIndex === 1 ? BOLD : BODY)
            .fontSize(8.5)
            .fillColor(cellIndex === 0 ? C.light : C.ink)
            .text(cell, x + pad, y + 6, { width: col.w - pad * 2, align: col.align });
          if (cellIndex === 1 && item.note) {
            doc
              .font(BODY)
              .fontSize(7.5)
              .fillColor(C.muted)
              .text(`Customization: ${item.note}`, x + pad, y + 6 + nameH + 2, {
                width: col.w - pad * 2,
              });
          }
          x += col.w;
        });
        y += rowH;
        doc.moveTo(M, y).lineTo(right, y).lineWidth(0.5).strokeColor(C.border).stroke();
      });

      if (data.groups.length > 1) {
        y += 6;
        doc.font(BODY).fontSize(8.5).fillColor(C.muted).text(`Subtotal · ${group.shopName}`, M, y, {
          width: contentW - 90,
          align: "right",
        });
        doc.font(BOLD).fontSize(8.5).fillColor(C.ink).text(money(moneyRound(groupTotal)), right - 90, y, {
          width: 90 - pad,
          align: "right",
        });
        y = doc.y;
      }
      y += 16;
    }

    // ── Totals ────────────────────────────────────────────────────────
    const totalRows: Array<[string, string]> = [["Subtotal", money(data.subtotal)]];
    if (data.discountAmount > 0) totalRows.push(["Discount", `− ${money(data.discountAmount)}`]);
    totalRows.push(["Shipping", data.shippingAmount > 0 ? money(data.shippingAmount) : "Free"]);

    if (registered.length > 0 && unregistered.length === 0 && data.taxAmount > 0) {
      const oneState = registered.every((group) => sameState(group.state, registered[0]?.state ?? null));
      const intra = oneState && sameState(registered[0]?.state ?? null, data.buyerState);
      if (intra) {
        const half = moneyRound(data.taxAmount / 2);
        totalRows.push(["CGST", money(half)]);
        totalRows.push(["SGST", money(moneyRound(data.taxAmount - half))]);
      } else if (data.buyerState) {
        totalRows.push(["IGST", money(data.taxAmount)]);
      } else {
        totalRows.push([`GST (${Number((data.taxRate * 100).toFixed(2))}%)`, money(data.taxAmount)]);
      }
    } else if (data.taxAmount > 0) {
      totalRows.push(["Tax on order", money(data.taxAmount)]);
    } else if (unregistered.length === data.groups.length) {
      totalRows.push(["GST", "Not charged"]);
    }

    const boxW = 230;
    const boxX = right - boxW;
    const totalsH = totalRows.length * 18 + 16 + 34;
    ensureRoom(totalsH + 30);

    // Amount in words, left of the totals box.
    const wordsW = contentW - boxW - 20;
    label("Amount in words", M, y + 4, wordsW);
    doc.font(BOLD).fontSize(9.5).fillColor(C.ink).text(amountInWords(data.totalAmount), M, y + 17, {
      width: wordsW,
    });
    const wordsEnd = doc.y;

    let ty = y + 4;
    for (const [key, value] of totalRows) {
      doc.font(BODY).fontSize(9).fillColor(C.muted).text(key, boxX, ty, { width: boxW / 2 });
      doc.font(BOLD).fontSize(9).fillColor(C.ink).text(value, boxX + boxW / 2, ty, {
        width: boxW / 2 - 10,
        align: "right",
      });
      ty += 18;
    }
    ty += 4;
    doc.roundedRect(boxX - 10, ty, boxW + 10, 32, 8).fill(C.brand);
    doc.font(BOLD).fontSize(10).fillColor("#FFFFFF").text(isCod ? "Total due" : "Total paid", boxX, ty + 10, {
      width: boxW / 2,
    });
    doc.font(BOLD).fontSize(13).fillColor("#FFFFFF").text(money(data.totalAmount), boxX + boxW / 2 - 20, ty + 8, {
      width: boxW / 2 + 10,
      align: "right",
    });
    y = Math.max(wordsEnd, ty + 32) + 24;

    // ── Notes ─────────────────────────────────────────────────────────
    ensureRoom(70);
    label("Notes", M, y, contentW);
    y += 13;
    doc.font(BODY).fontSize(8).fillColor(C.muted);
    const notes = [
      registered.length > 0
        ? "GST figures use the tax recorded on this order. Intra-state supplies show CGST and SGST; inter-state supplies show IGST."
        : "This is a bill of supply. The seller is not registered under GST, so GST is not charged on these goods.",
      "Stuffsy is a marketplace. Each item is sold and shipped by the seller named above.",
      "This is a computer-generated document and does not require a signature.",
    ];
    for (const note of notes) {
      doc.text(`•  ${note}`, M, y, { width: contentW });
      y = doc.y + 3;
    }
    y += 10;
    doc.font(BOLD).fontSize(10).fillColor(C.brand).text("Thank you for shopping handmade.", M, y, {
      width: contentW,
    });

    // ── Footer on every page ──────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would otherwise trigger an automatic page break.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 40;
      doc.moveTo(M, fy - 8).lineTo(right, fy - 8).lineWidth(0.5).strokeColor(C.border).stroke();
      doc.font(BODY).fontSize(7.5).fillColor(C.light);
      doc.text(`Stuffsy  ·  ${SUPPORT_EMAIL}  ·  ${data.invoiceNumber}`, M, fy, {
        width: contentW / 2,
        lineBreak: false,
      });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, M + contentW / 2, fy, {
        width: contentW / 2,
        align: "right",
        lineBreak: false,
      });
      doc.page.margins.bottom = bottomMargin;
    }

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
      // Unknown only if Razorpay did not report a method; never guess "card".
      paymentMethod: row.payment_method ?? "online",
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return null;
  }
  const ownership = await pool.query<{ user_id: string; status: string; paid_at: Date | null }>(
    `select user_id, status, paid_at from public.orders where id = $1`,
    [orderId]
  );
  const order = ownership.rows[0];
  if (!order || order.user_id !== userId) {
    return null;
  }
  // A tax invoice exists only for a sale: never for an unpaid or abandoned
  // order. Generating one would also consume a number from the GST series.
  if (order.status === "pending_payment" || (order.status === "cancelled" && !order.paid_at)) {
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
