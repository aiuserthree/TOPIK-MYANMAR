import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { examRoundsRoutes } from "./routes/exam-rounds.js";
import { examVenuesRoutes } from "./routes/exam-venues.js";
import { authRoutes } from "./routes/auth.js";
import { authGoogleRoutes } from "./routes/auth-google.js";
import { meRoutes } from "./routes/me.js";
import { applicationSubmissionsRoutes } from "./routes/application-submissions.js";
import { applicationDraftsRoutes } from "./routes/application-drafts.js";
import { applicationsRoutes } from "./routes/applications.js";
import { authSignupRoutes } from "./routes/auth-signup.js";
import { authPasswordRoutes } from "./routes/auth-password.js";
import { noticesRoutes } from "./routes/notices.js";
import { faqRoutes } from "./routes/faq.js";
import { termsRoutes } from "./routes/terms.js";
import { boardRoutes } from "./routes/board.js";
import { internalNotificationRoutes } from "./routes/internal-notifications.js";
import { filesRoutes } from "./routes/files.js";
import { adminRoutes } from "./routes/admin/index.js";
import { runPasswordExpiryBatch } from "./lib/password-expiry-reminder.js";
import { startEmailWorker } from "./lib/email-worker.js";
import { pool } from "./db.js";
import { storageMode } from "./lib/storage.js";

const app = Fastify({ logger: true });

if (config.appEnv === "production" && storageMode() === "local") {
  app.log.warn(
    "STORAGE_PROVIDER=local in production — uploads are stored on ephemeral disk and are lost on redeploy. " +
      "Set STORAGE_PROVIDER=s3 and S3_BUCKET/S3_REGION/S3_ACCESS_KEY/S3_SECRET for durable photos."
  );
}

// Security headers (helmet). CSP is intentionally relaxed/off: this process is a
// JSON + file-download API consumed by a SEPARATE FO origin, so a strict
// default-src 'self' policy adds no protection here and risks breaking file
// responses. The high-value headers (X-Frame-Options: DENY, HSTS, noSniff) are
// kept. crossOriginResourcePolicy is set to cross-origin so the FO can load
// uploaded photos served by GET /api/v1/files/:id.
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: "deny" },
  hsts: { maxAge: 15552000, includeSubDomains: true },
  noSniff: true,
});

// Rate limiting. Global sane default of 100 req/min/IP; auth endpoints tighten
// this via per-route `config.rateLimit`. Returns 429 with a Retry-After header.
await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: "1 minute",
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    if (
      config.appEnv === "development" &&
      (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))
    ) {
      return cb(null, true);
    }
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
});

await app.register(healthRoutes);
await app.register(examRoundsRoutes);
await app.register(examVenuesRoutes);
await app.register(authRoutes);
await app.register(authGoogleRoutes);
await app.register(authSignupRoutes);
await app.register(authPasswordRoutes);
await app.register(meRoutes);
await app.register(applicationSubmissionsRoutes);
await app.register(applicationDraftsRoutes);
await app.register(applicationsRoutes);
await app.register(noticesRoutes);
await app.register(faqRoutes);
await app.register(termsRoutes);
await app.register(boardRoutes);
await app.register(filesRoutes);
await app.register(adminRoutes);
await app.register(internalNotificationRoutes);

const enablePasswordExpiryCron =
  String(process.env.ENABLE_PASSWORD_EXPIRY_CRON ?? "").toLowerCase() === "true";

if (enablePasswordExpiryCron) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const runBatch = () => {
    void runPasswordExpiryBatch(pool)
      .then((n) => {
        if (n > 0) app.log.info({ queued: n }, "password_expiry batch");
      })
      .catch((err) => app.log.error(err));
  };
  runBatch();
  setInterval(runBatch, DAY_MS);
  app.log.info("ENABLE_PASSWORD_EXPIRY_CRON: daily password expiry batch enabled");
}

if (config.enableEmailWorker) {
  startEmailWorker(app);
  app.log.info("ENABLE_EMAIL_WORKER: email_outbox drain worker enabled");
}

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`API listening on http://0.0.0.0:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
