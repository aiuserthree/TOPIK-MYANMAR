import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { signAuthTokens as signTokens } from "../lib/auth.js";
import { schedulePasswordExpiryReminder } from "../lib/password-expiry-reminder.js";
import { checkLock, recordFailure, recordSuccess } from "../lib/login-throttle.js";
function parseBearer(header) {
    if (!header)
        return null;
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    return m ? m[1] : null;
}
export async function authRoutes(app) {
    app.post("/api/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
        const { email, password } = req.body ?? {};
        if (!email || !password) {
            return reply.status(400).send({ error: "email_and_password_required" });
        }
        const clientIp = req.ip;
        // Brute-force guard: short-circuit locked accounts/IPs before touching the DB.
        const lock = checkLock(email, clientIp);
        if (lock.locked) {
            reply.header("Retry-After", String(lock.retryAfterSeconds));
            return reply.status(429).send({
                error: "account_locked",
                retry_after_seconds: lock.retryAfterSeconds,
                message: "로그인 시도가 많아 계정이 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.",
            });
        }
        const fail = () => {
            recordFailure(email, clientIp);
            return reply.status(401).send({ error: "invalid_credentials" });
        };
        try {
            const userResult = await pool.query(`SELECT id, email, password_hash, name_ko, name_en, status
           FROM users
           WHERE email = $1 AND status = 'active'
           LIMIT 1`, [email]);
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                if (!user.password_hash) {
                    return fail();
                }
                const match = await bcrypt.compare(password, user.password_hash);
                if (!match) {
                    return fail();
                }
                recordSuccess(email, clientIp);
                await pool.query(`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [user.id]);
                const tokens = signTokens({
                    sub: String(user.id),
                    email: user.email,
                    role: "user",
                });
                schedulePasswordExpiryReminder(pool, Number(user.id), (err) => app.log.error(err));
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
            const adminResult = await pool.query(`SELECT id, email, password_hash, name, role
           FROM admin_users
           WHERE email = $1 AND is_active = true
           LIMIT 1`, [email]);
            if (adminResult.rows.length > 0) {
                const admin = adminResult.rows[0];
                const match = await bcrypt.compare(password, admin.password_hash);
                if (!match) {
                    return fail();
                }
                recordSuccess(email, clientIp);
                const tokens = signTokens({
                    sub: `admin:${admin.id}`,
                    email: admin.email,
                    role: "admin",
                });
                return {
                    access_token: tokens.accessToken,
                    refresh_token: tokens.refreshToken,
                    token_type: "Bearer",
                    user: {
                        id: admin.id,
                        email: admin.email,
                        name: admin.name,
                        role: admin.role,
                    },
                };
            }
            return fail();
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({ error: "database_unavailable" });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/auth/refresh — rotate tokens using a valid refresh token.
    // Accepts the refresh token from the JSON body ({ refresh_token }) or an
    // Authorization: Bearer header. Verifies with JWT_REFRESH_SECRET, then
    // re-issues a fresh access + refresh pair via signAuthTokens(). The account
    // must still exist and be active (stateless tokens have no server-side store,
    // so the active-status check is our "revoked" guard).
    // -------------------------------------------------------------------------
    app.post("/api/v1/auth/refresh", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
        const fromBody = typeof req.body?.refresh_token === "string" ? req.body.refresh_token.trim() : "";
        const token = fromBody || parseBearer(req.headers.authorization);
        if (!token) {
            return reply.status(400).send({ error: "refresh_token_required" });
        }
        let decoded;
        try {
            decoded = jwt.verify(token, config.jwtRefreshSecret);
        }
        catch {
            return reply.status(401).send({ error: "invalid_refresh_token" });
        }
        if (!decoded || decoded.type !== "refresh" || !decoded.sub) {
            return reply.status(401).send({ error: "invalid_refresh_token" });
        }
        const sub = String(decoded.sub);
        try {
            if (sub.startsWith("admin:")) {
                const adminId = Number(sub.slice("admin:".length));
                if (!Number.isFinite(adminId) || adminId <= 0) {
                    return reply.status(401).send({ error: "invalid_refresh_token" });
                }
                const { rows } = await pool.query(`SELECT id, email, role FROM admin_users
             WHERE id = $1 AND is_active = true LIMIT 1`, [adminId]);
                if (rows.length === 0) {
                    return reply.status(401).send({ error: "invalid_refresh_token" });
                }
                const admin = rows[0];
                const tokens = signTokens({
                    sub: `admin:${admin.id}`,
                    email: admin.email,
                    role: "admin",
                });
                return {
                    access_token: tokens.accessToken,
                    refresh_token: tokens.refreshToken,
                    token_type: "Bearer",
                };
            }
            const userId = Number(sub);
            if (!Number.isFinite(userId) || userId <= 0) {
                return reply.status(401).send({ error: "invalid_refresh_token" });
            }
            const { rows } = await pool.query(`SELECT id, email FROM users
           WHERE id = $1 AND status = 'active' LIMIT 1`, [userId]);
            if (rows.length === 0) {
                return reply.status(401).send({ error: "invalid_refresh_token" });
            }
            const user = rows[0];
            const tokens = signTokens({
                sub: String(user.id),
                email: user.email,
                role: "user",
            });
            return {
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                token_type: "Bearer",
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({ error: "database_unavailable" });
        }
    });
}
