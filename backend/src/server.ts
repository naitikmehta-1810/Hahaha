import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import cartRouter from "./routes/cart.js";
import ordersRouter from "./routes/orders.js";
import addressesRouter from "./routes/addresses.js";
import categoriesRouter from "./routes/categories.js";
import productsRouter from "./routes/products.js";
import shopsRouter from "./routes/shops.js";
import reviewsRouter from "./routes/reviews.js";
import sellerRouter from "./routes/seller.js";
import wishlistsRouter from "./routes/wishlists.js";
import paymentsRouter, { paymentsWebhookHandler } from "./routes/payments.js";
import shippingWebhookRouter from "./routes/shipping-webhook.js";
import adminRouter from "./routes/admin.js";
import { env } from "./config/env.js";
import { startReservationReleaseJob } from "./jobs/release-expired-reservations.js";
import { startAbandonedCartJob } from "./jobs/find-abandoned-carts.js";
import { startInvoiceWorker } from "./jobs/generate-invoice.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { pool } from "./config/db.js";
import { logger } from "./utils/logger.js";
import * as Sentry from "@sentry/node";
import analyticsRouter from "./routes/analytics.js";
import searchRouter from "./routes/search.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

const app = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());

function isDevLanOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === env.FRONTEND_URL) {
        callback(null, true);
        return;
      }
      if (env.NODE_ENV !== "production" && isDevLanOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Razorpay webhooks need the raw body for HMAC verification — mount before JSON parser.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void paymentsWebhookHandler(req, res);
  }
);

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.get("/api/health", async (_req, res) => {
  const checks: { database: "ok" | "error"; redis: "ok" | "error" | "skipped" } = {
    database: "error",
    redis: "skipped",
  };

  try {
    await pool.query("select 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const { getRedis } = await import("./config/redis.js");
    const redis = getRedis();
    if (redis.status === "wait") {
      await redis.connect();
    }
    const pong = await redis.ping();
    checks.redis = pong === "PONG" ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  const ok = checks.database === "ok" && checks.redis === "ok";
  res.status(ok ? 200 : 503).json({ ok, ...checks });
});

app.use("/api/auth", authRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/addresses", addressesRouter);
// Public catalog + storefront reads (no auth required).
app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/shops", shopsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/seller", sellerRouter);
app.use("/api/wishlists", wishlistsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/shipping/webhook", shippingWebhookRouter);
app.use("/api/admin", adminRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/search", searchRouter);
app.use(notFound);
app.use(errorHandler);

async function warmPool() {
  try {
    await pool.query("select 1");
    logger.info("database pool warmed");
  } catch (error) {
    logger.error({ err: error }, "database warm failed");
  }
  setInterval(() => {
    void pool.query("select 1").catch((err) => {
      logger.error({ err }, "database heartbeat failed");
    });
  }, 60_000);
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `Stuffsy backend listening on http://localhost:${env.PORT}`);
  void startReservationReleaseJob();
  void startAbandonedCartJob();
  try {
    startInvoiceWorker();
  } catch (error) {
    logger.error({ err: error }, "invoice worker failed to start");
  }
  void warmPool();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error(
      { port: env.PORT },
      `Port ${env.PORT} is already in use. Stop the other process or re-run npm run dev (free-port runs automatically).`
    );
    process.exit(1);
  }
  throw error;
});
