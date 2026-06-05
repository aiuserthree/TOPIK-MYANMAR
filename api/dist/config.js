import "dotenv/config";
export const config = {
    port: Number(process.env.PORT ?? 3000),
    appEnv: process.env.APP_ENV ?? "development",
    databaseUrl: process.env.DATABASE_URL ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-insecure-refresh",
    jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
    corsOrigins: (process.env.CORS_ORIGINS ??
        "http://localhost:5500,http://localhost:8080,http://127.0.0.1:5500,http://127.0.0.1:8080,https://topik-myanmar.vercel.app")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    // Public FO base used to build deep links inside emails (e.g. password reset)
    publicFoBase: (process.env.PUBLIC_FO_BASE ?? "https://topik-myanmar.vercel.app").replace(/\/$/, ""),
    // Public BO base for admin notification links (optional)
    publicBoBase: (process.env.PUBLIC_BO_BASE ?? "").replace(/\/$/, ""),
    // Internal API key for POST /internal/notifications/enqueue (BO/cron)
    internalApiKey: process.env.INTERNAL_API_KEY ?? "",
    // Google Sign-In (GIS). Empty clientId = feature disabled (frontend hides button,
    // POST /auth/google → 503). clientSecret unused for ID-token verification but kept
    // for completeness / future server-side OAuth code exchange.
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    // Pluggable file storage. provider = local (dev, disk) | s3.
    // Mirrors the mailer pattern: if s3 is selected but creds are missing we fall
    // back to local with a warning (see lib/storage.ts). No invented credentials.
    storage: {
        provider: (process.env.STORAGE_PROVIDER ?? "local").toLowerCase(),
        // Local disk root for uploaded photos (relative paths resolve against api/).
        uploadDir: process.env.UPLOAD_DIR ?? "var/uploads",
        // Max accepted decoded image size in bytes (default 5 MB).
        maxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024),
        s3: {
            bucket: process.env.S3_BUCKET ?? "",
            region: process.env.S3_REGION ?? "",
            accessKeyId: process.env.S3_ACCESS_KEY ?? "",
            secretAccessKey: process.env.S3_SECRET ?? "",
            // Optional custom endpoint (MinIO / non-AWS S3-compatible).
            endpoint: process.env.S3_ENDPOINT ?? "",
            // Optional key prefix inside the bucket.
            prefix: (process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, ""),
        },
    },
    // Pluggable mailer. provider = console (dev, logs only) | smtp | resend
    mail: {
        provider: (process.env.MAIL_PROVIDER ?? "console").toLowerCase(),
        // Default sender uses the Resend-verified domain (chodrum.com) so a missing
        // MAIL_FROM env var still produces a deliverable From: rather than a domain
        // Resend would reject. Production should still set MAIL_FROM explicitly
        // (and swap to the customer's final domain once that is verified).
        from: process.env.MAIL_FROM ?? "TOPIK Myanmar <no-reply@chodrum.com>",
        supportEmail: process.env.MAIL_SUPPORT ?? "topik.myanmar@koica.go.kr",
        /** Operator inbox for board_admin_new_post and similar BO alerts */
        adminNotifyTo: process.env.MAIL_ADMIN_TO ?? "",
        resendApiKey: process.env.RESEND_API_KEY ?? "",
        smtp: {
            host: process.env.SMTP_HOST ?? "",
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: String(process.env.SMTP_SECURE ?? "false") === "true",
            user: process.env.SMTP_USER ?? "",
            pass: process.env.SMTP_PASS ?? "",
        },
    },
    // Background email_outbox drain worker (retry of queued/failed sends).
    // Default OFF so behavior is unchanged unless explicitly enabled.
    enableEmailWorker: String(process.env.ENABLE_EMAIL_WORKER ?? "").toLowerCase() === "true",
};
// ---------------------------------------------------------------------------
// Fail-fast on insecure JWT secrets in production.
// Dev keeps working with the built-in defaults; production must NOT boot with
// the dev placeholders (or empty values), otherwise tokens could be forged.
// ---------------------------------------------------------------------------
const INSECURE_JWT_SECRETS = new Set(["dev-insecure-secret", "dev-insecure-refresh"]);
if (config.appEnv === "production") {
    const insecureAccess = !config.jwtSecret || INSECURE_JWT_SECRETS.has(config.jwtSecret);
    const insecureRefresh = !config.jwtRefreshSecret || INSECURE_JWT_SECRETS.has(config.jwtRefreshSecret);
    if (insecureAccess || insecureRefresh) {
        throw new Error("Refusing to boot in production with insecure JWT secrets. " +
            "Set strong unique JWT_SECRET and JWT_REFRESH_SECRET env vars " +
            "(e.g. `openssl rand -base64 48`).");
    }
}
