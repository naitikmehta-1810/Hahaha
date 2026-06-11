import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
const app = express();
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
}));
app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use(notFound);
app.use(errorHandler);
app.listen(env.PORT, () => {
    console.log(`Stuffsy backend listening on http://localhost:${env.PORT}`);
});
