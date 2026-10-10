import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { pool, withTransaction } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";
import { recordUserNotification } from "../services/order-notifications.service.js";
import { recomputeProductRating } from "../services/review.service.js";
import { REPORT_TARGETS, type ReportTarget } from "./reports.js";

/**
 * Moderation queue. Mounted inside the admin router (already auth + admin
 * guarded). A decision applies to the whole target: every open report about it
 * closes together, with the same outcome.
 */
const adminReportsRouter = Router();

const listSchema = z.object({
  status: z.enum(["open", "actioned", "dismissed"]).default("open"),
  type: z.enum(REPORT_TARGETS).optional(),
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

type TargetView = {
  exists: boolean;
  title: string;
  detail: string | null;
  href: string | null;
  image: string | null;
};

const GONE: TargetView = { exists: false, title: "No longer available", detail: null, href: null, image: null };

/** What an admin needs to see to judge a report, per target type. */
async function describeTarget(type: ReportTarget, id: string): Promise<TargetView> {
  switch (type) {
    case "product": {
      const row = await pool.query<{ title: string; slug: string; status: string; shop_name: string; image: string | null }>(
        `select p.title, p.slug, p.status, s.shop_name,
                (select pi.url from public.product_images pi where pi.product_id = p.id
                 order by pi.is_thumbnail desc, pi.display_order asc limit 1) as image
         from public.products p join public.sellers s on s.id = p.seller_id
         where p.id = $1 and p.deleted_at is null`,
        [id]
      );
      const r = row.rows[0];
      return r
        ? { exists: true, title: r.title, detail: `${r.shop_name} · ${r.status}`, href: `/products/${r.slug}`, image: r.image }
        : GONE;
    }
    case "shop": {
      const row = await pool.query<{ shop_name: string; shop_slug: string; status: string; logo_url: string | null }>(
        `select shop_name, shop_slug, status, logo_url from public.sellers where id = $1 and deleted_at is null`,
        [id]
      );
      const r = row.rows[0];
      return r
        ? { exists: true, title: r.shop_name, detail: r.status, href: `/shops/${r.shop_slug}`, image: r.logo_url }
        : GONE;
    }
    case "review": {
      const row = await pool.query<{ rating: number; title: string | null; body: string | null; slug: string; ptitle: string; deleted_at: Date | null }>(
        `select r.rating, r.title, r.body, r.deleted_at, p.slug, p.title as ptitle
         from public.reviews r join public.products p on p.id = r.product_id where r.id = $1`,
        [id]
      );
      const r = row.rows[0];
      return r && !r.deleted_at
        ? {
            exists: true,
            title: `${r.rating}★ ${r.title ?? ""}`.trim(),
            detail: [r.body, `On ${r.ptitle}`].filter(Boolean).join(" — "),
            href: `/products/${r.slug}#reviews`,
            image: null,
          }
        : GONE;
    }
    case "question": {
      const row = await pool.query<{ question: string; answer: string | null; slug: string; ptitle: string; status: string }>(
        `select q.question, q.answer, q.status, p.slug, p.title as ptitle
         from public.product_questions q join public.products p on p.id = q.product_id where q.id = $1`,
        [id]
      );
      const r = row.rows[0];
      return r && r.status === "visible"
        ? { exists: true, title: r.question, detail: `On ${r.ptitle}${r.answer ? ` — answered: ${r.answer}` : ""}`, href: `/products/${r.slug}#questions`, image: null }
        : GONE;
    }
    case "message": {
      const row = await pool.query<{ body: string; sender_role: string; removed_at: Date | null }>(
        `select body, sender_role, removed_at from public.messages where id = $1`,
        [id]
      );
      const r = row.rows[0];
      return r && !r.removed_at
        ? { exists: true, title: r.body, detail: `Sent by the ${r.sender_role}`, href: null, image: null }
        : GONE;
    }
  }
}

adminReportsRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const { status, type, page, pageSize } = parsed.data;
    const rows = await pool.query<{
      id: string;
      target_type: ReportTarget;
      target_id: string;
      reason: string;
      details: string | null;
      status: string;
      resolution_note: string | null;
      created_at: Date;
      resolved_at: Date | null;
      reporter_email: string | null;
      report_count: string;
    }>(
      `select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.resolution_note,
              r.created_at, r.resolved_at, u.email as reporter_email,
              (select count(*) from public.reports r2
               where r2.target_type = r.target_type and r2.target_id = r.target_id)::text as report_count
       from public.reports r
       left join public.users u on u.id = r.reporter_user_id
       where r.status = $1 and ($2::text is null or r.target_type = $2)
       order by r.created_at desc, r.id desc
       limit $3 offset $4`,
      [status, type ?? null, pageSize, (page - 1) * pageSize]
    );
    const total = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.reports where status = $1 and ($2::text is null or target_type = $2)`,
      [status, type ?? null]
    );
    const targets = await Promise.all(rows.rows.map((row) => describeTarget(row.target_type, row.target_id)));
    res.json({
      page,
      pageSize,
      total: Number(total.rows[0]?.c ?? 0),
      reports: rows.rows.map((row, index) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        resolutionNote: row.resolution_note,
        reporter: row.reporter_email,
        reportCount: Number(row.report_count),
        createdAt: new Date(row.created_at).toISOString(),
        resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        target: targets[index],
      })),
    });
  })
);

const resolveSchema = z.object({
  action: z.enum(["dismiss", "remove"]),
  note: z.string().trim().max(500).optional().nullable(),
});

adminReportsRouter.post(
  "/reports/:id/resolve",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const parsed = resolveSchema.safeParse(req.body);
    if (!id.success) {
      res.status(404).json({ message: "Report not found" });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ message: "Choose dismiss or remove" });
      return;
    }
    const adminId = req.user!.id;
    const note = parsed.data.note?.trim() || null;

    let bustCatalog = false;
    const outcome = await withTransaction(async (client) => {
      const found = await client.query<{ target_type: ReportTarget; target_id: string; status: string }>(
        `select target_type, target_id, status from public.reports where id = $1 for update`,
        [id.data]
      );
      const report = found.rows[0];
      if (!report) throw new AppError(404, "REPORT_NOT_FOUND", "Report not found");
      if (report.status !== "open") throw new AppError(409, "ALREADY_RESOLVED", "This report was already handled.");

      const { target_type: type, target_id: targetId } = report;
      let removed = false;

      if (parsed.data.action === "remove") {
        switch (type) {
          case "product": {
            const result = await client.query<{ seller_user_id: string; title: string }>(
              `update public.products p set status = 'archived', updated_at = now()
               from public.sellers s
               where p.id = $1 and s.id = p.seller_id and p.deleted_at is null
               returning s.user_id as seller_user_id, p.title`,
              [targetId]
            );
            removed = (result.rowCount ?? 0) > 0;
            bustCatalog = true;
            if (result.rows[0]) {
              await recordUserNotification({
                userId: result.rows[0].seller_user_id,
                kind: "listing-removed",
                title: "A listing was taken down",
                body: `“${result.rows[0].title}” was removed after a report. Contact support if you think this is a mistake.`,
                href: "/seller/products",
                dedupeKey: `listing-removed:${targetId}`,
              });
            }
            break;
          }
          case "shop": {
            const result = await client.query<{ user_id: string }>(
              `update public.sellers set status = 'suspended', updated_at = now()
               where id = $1 and deleted_at is null returning user_id`,
              [targetId]
            );
            removed = (result.rowCount ?? 0) > 0;
            bustCatalog = true;
            break;
          }
          case "review": {
            const result = await client.query<{ product_id: string }>(
              `update public.reviews
               set deleted_at = now(), removed_reason = coalesce($2, 'removed_after_report'), removed_by = $3
               where id = $1 and deleted_at is null returning product_id`,
              [targetId, note, adminId]
            );
            removed = (result.rowCount ?? 0) > 0;
            if (result.rows[0]) {
              await recomputeProductRating(client, result.rows[0].product_id);
              bustCatalog = true;
            }
            break;
          }
          case "question": {
            const result = await client.query(
              `update public.product_questions set status = 'removed', removed_reason = coalesce($2, 'removed_after_report')
               where id = $1 and status = 'visible'`,
              [targetId, note]
            );
            removed = (result.rowCount ?? 0) > 0;
            break;
          }
          case "message": {
            const result = await client.query(
              `update public.messages set removed_at = now() where id = $1 and removed_at is null`,
              [targetId]
            );
            removed = (result.rowCount ?? 0) > 0;
            break;
          }
        }
      }

      const status = parsed.data.action === "remove" ? "actioned" : "dismissed";
      // One decision for the target: close every open report about it.
      const closed = await client.query(
        `update public.reports
         set status = $3, resolution_note = $4, resolved_by = $5, resolved_at = now()
         where target_type = $1 and target_id = $2 and status = 'open'`,
        [type, targetId, status, note, adminId]
      );
      return { status, removed, closedReports: closed.rowCount ?? 0 };
    });

    if (bustCatalog) void invalidateCatalogCaches();
    res.json(outcome);
  })
);

export default adminReportsRouter;
