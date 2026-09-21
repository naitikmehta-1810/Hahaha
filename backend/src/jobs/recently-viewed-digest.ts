import { Queue, Worker } from "bullmq";
import { getRedis } from "../config/redis.js";
import { pool } from "../config/db.js";
import { enqueueEmailJob } from "../services/notify.enqueue.js";
import { userAllows } from "../services/notification-prefs.service.js";
import { env } from "../config/env.js";

const QUEUE_NAME = "recently-viewed-digest";
const JOB_NAME = "send-recently-viewed-digests";

async function sendDigests() {
  const viewers = await pool.query<{ user_id: string; email: string; full_name: string | null }>(
    `select distinct u.id as user_id, u.email, u.full_name
     from public.product_page_views v
     join public.users u on u.id = v.user_id
     where v.user_id is not null
       and v.created_at > now() - interval '7 days'
       and u.email is not null
       and u.deleted_at is null
       and not exists (
         select 1 from public.orders o
         where o.user_id = u.id and o.created_at > now() - interval '3 days'
           and o.status not in ('cancelled', 'pending_payment')
       )`
  );

  let enqueued = 0;
  for (const viewer of viewers.rows) {
    if (!(await userAllows(viewer.user_id, "recentlyViewed"))) continue;

    const products = await pool.query<{
      title: string;
      slug: string;
      thumbnail_url: string | null;
    }>(
      `select p.title, p.slug,
              (select pi.url from public.product_images pi
               where pi.product_id = p.id
               order by pi.is_thumbnail desc, pi.display_order asc limit 1) as thumbnail_url
       from public.product_page_views v
       join public.products p on p.id = v.product_id
       where v.user_id = $1
         and v.created_at > now() - interval '7 days'
         and p.deleted_at is null
       group by p.id, p.title, p.slug
       order by max(v.created_at) desc
       limit 6`,
      [viewer.user_id]
    );
    if (products.rows.length === 0) continue;

    await enqueueEmailJob("recently-viewed-digest", {
      to: viewer.email,
      customerName: viewer.full_name ?? undefined,
      items: products.rows.map((p) => ({
        title: p.title,
        url: `${env.FRONTEND_URL}/products/${p.slug}`,
        imageUrl: p.thumbnail_url ?? undefined,
      })),
      shopUrl: `${env.FRONTEND_URL}/shop`,
    });
    enqueued += 1;
  }

  console.log(`[recently-viewed] users=${viewers.rows.length} enqueued=${enqueued}`);
  return { enqueued };
}

export async function startRecentlyViewedDigestJob() {
  try {
    const connection = getRedis();
    const queue = new Queue(QUEUE_NAME, { connection });
    await queue.upsertJobScheduler(
      JOB_NAME,
      { every: 24 * 60 * 60 * 1000 },
      {
        name: JOB_NAME,
        data: {},
        opts: {
          removeOnComplete: 10,
          removeOnFail: 30,
        },
      }
    );
    // eslint-disable-next-line no-new
    new Worker(QUEUE_NAME, async () => sendDigests(), { connection });
    console.log("[recently-viewed] BullMQ worker started (daily)");
  } catch (error) {
    console.warn("[recently-viewed] failed to start", error);
  }
}
