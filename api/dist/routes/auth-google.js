import { config } from "../config.js";
import { pool } from "../db.js";
import { signAuthTokens } from "../lib/auth.js";
import { schedulePasswordExpiryReminder } from "../lib/password-expiry-reminder.js";
const ALLOWED_ISS = ["accounts.google.com", "https://accounts.google.com"];
/**
 * Verify a Google ID token via the tokeninfo endpoint. Google validates the
 * signature + expiry server-side, so a 200 response means the token is genuine
 * and unexpired; we still enforce `aud` and `iss` ourselves.
 * Returns the parsed claims on success, or null on any failure.
 */
async function verifyGoogleIdToken(idToken) {
    const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok)
        return null;
    const info = (await res.json());
    if (!info || !info.sub || !info.email)
        return null;
    if (info.aud !== config.google.clientId)
        return null;
    if (info.iss && !ALLOWED_ISS.includes(info.iss))
        return null;
    return info;
}
function truncate(value, max) {
    return value.length > max ? value.slice(0, max) : value;
}
export async function authGoogleRoutes(app) {
    // ---- Public config so the static FO knows whether to render the button ----
    app.get("/api/v1/auth/google/config", async () => {
        const clientId = config.google.clientId;
        return { enabled: !!clientId, client_id: clientId };
    });
    // ---- Verify Google ID token → upsert user → issue our JWT pair ----
    app.post("/api/v1/auth/google", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
        if (!config.google.clientId) {
            return reply.status(503).send({ error: "oauth_not_configured" });
        }
        const idToken = String(req.body?.id_token ?? "").trim();
        if (!idToken) {
            return reply.status(400).send({ error: "id_token_required" });
        }
        let info;
        try {
            info = await verifyGoogleIdToken(idToken);
        }
        catch (err) {
            app.log.error(err);
            return reply.status(502).send({ error: "google_verify_failed" });
        }
        if (!info) {
            return reply.status(401).send({ error: "invalid_google_token" });
        }
        const emailVerified = info.email_verified === true || info.email_verified === "true";
        if (!emailVerified) {
            return reply.status(401).send({ error: "email_not_verified" });
        }
        const email = String(info.email).trim().toLowerCase();
        const googleSub = String(info.sub);
        const displayName = truncate((info.name && info.name.trim()) || email.split("@")[0] || "User", 50);
        const langRaw = String(req.body?.preferred_lang ?? "ko").toLowerCase();
        const preferredLang = ["ko", "my", "en"].includes(langRaw) ? langRaw : "ko";
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT id, email, name_ko, name_en, status, signup_provider, provider_uid
         FROM users
         WHERE email = $1
         LIMIT 1`, [email]);
            let user;
            if (existing.rows.length > 0) {
                const row = existing.rows[0];
                if (row.status !== "active") {
                    await client.query("ROLLBACK");
                    return reply.status(403).send({ error: "account_inactive" });
                }
                // Link the Google identity to a pre-existing account (e.g. email signup)
                // by recording the Google sub if we don't have one yet. We never flip an
                // email account's password/profile here.
                if (!row.provider_uid) {
                    await client.query(`UPDATE users SET provider_uid = $1, updated_at = NOW() WHERE id = $2`, [googleSub, row.id]);
                }
                user = {
                    id: Number(row.id),
                    email: row.email,
                    name_ko: row.name_ko,
                    name_en: row.name_en,
                };
            }
            else {
                // First-time Google sign-in → create a minimal account. The users table
                // enforces NOT NULL on the full TOPIK profile (birth_date, gender, etc.),
                // which Google does not supply, so we seed neutral placeholders and leave
                // password_hash NULL. The user completes the real profile via PATCH /me
                // before they can register for an exam.
                const inserted = await client.query(`INSERT INTO users (
             email, password_hash, signup_provider, provider_uid,
             name_ko, name_en, birth_date, gender, nationality, first_language,
             phone, job_code, motive_code, purpose_code, preferred_lang, status
           ) VALUES (
             $1, NULL, 'google', $2,
             $3, $4, '00000000', '1', '', '',
             '', 0, 0, 0, $5, 'active'
           )
           ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
           RETURNING id, email, name_ko, name_en`, [email, googleSub, displayName, truncate(displayName, 80), preferredLang]);
                const row = inserted.rows[0];
                user = {
                    id: Number(row.id),
                    email: row.email,
                    name_ko: row.name_ko,
                    name_en: row.name_en,
                };
            }
            await client.query(`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [user.id]);
            await client.query("COMMIT");
            const tokens = signAuthTokens({
                sub: String(user.id),
                email: user.email,
                role: "user",
            });
            schedulePasswordExpiryReminder(pool, user.id, (err) => app.log.error(err));
            return {
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                token_type: "Bearer",
                user: {
                    id: user.id,
                    email: user.email,
                    name_ko: user.name_ko,
                    name_en: user.name_en,
                    role: "user",
                },
            };
        }
        catch (err) {
            await client.query("ROLLBACK");
            app.log.error(err);
            return reply.status(503).send({ error: "database_unavailable" });
        }
        finally {
            client.release();
        }
    });
}
