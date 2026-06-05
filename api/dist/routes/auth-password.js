import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db.js";
import { buildEmailDefaults, enqueueEmail, formatVerificationCode, maskEmail, } from "../lib/email-templates/enqueue-notification.js";
import { isValidEmail, isValidPassword, normalizeBirthDate } from "../lib/validation.js";
function randomCode() {
    return String(crypto.randomInt(100000, 999999));
}
const RESET_TTL_SECONDS = 30 * 60;
export async function authPasswordRoutes(app) {
    // ---- find-email (아이디 찾기): match name + birth + phone → masked emails ----
    app.post("/api/v1/auth/find-email", async (req, reply) => {
        const nameKo = String(req.body?.name_ko ?? "").trim();
        const birth = normalizeBirthDate(String(req.body?.birth_date ?? ""));
        const phone = String(req.body?.phone ?? "").trim();
        if (!nameKo || !birth || !phone) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "이름, 생년월일, 연락처를 모두 입력해 주세요.",
                },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT email, signup_provider, created_at
           FROM users
           WHERE name_ko = $1 AND birth_date = $2 AND phone = $3 AND status = 'active'
           ORDER BY created_at ASC
           LIMIT 5`, [nameKo, birth, phone]);
            return {
                count: rows.length,
                matches: rows.map((r) => ({
                    email_masked: maskEmail(String(r.email)),
                    provider: r.signup_provider === "google" ? "google" : "email",
                    created_at: r.created_at,
                })),
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
            });
        }
    });
    // ---- forgot-password: issue reset code, queue email ----
    app.post("/api/v1/auth/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
        const email = String(req.body?.email ?? "")
            .trim()
            .toLowerCase();
        if (!isValidEmail(email)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효한 이메일을 입력해 주세요." },
            });
        }
        try {
            // Look up an active email-signup user (Google accounts have no password).
            const userRes = await pool.query(`SELECT id, password_hash, signup_provider, name_ko, preferred_lang
           FROM users
           WHERE email = $1 AND status = 'active'
           LIMIT 1`, [email]);
            const user = userRes.rows[0];
            const exists = !!user;
            const provider = exists
                ? user.signup_provider === "google"
                    ? "google"
                    : "email"
                : null;
            const resettable = exists && !!user.password_hash;
            // SECURITY TRADEOFF: `registered`/`provider` let the FO 비밀번호 찾기 popup
            // alert on unknown / Google-only emails (spec docs/07_account.md), at the
            // cost of account enumeration. The route's IP rate limit (5/min) bounds abuse.
            const payload = {
                message: "입력하신 이메일이 가입되어 있다면 비밀번호 재설정 인증코드를 발송했습니다.",
                expires_in_seconds: RESET_TTL_SECONDS,
                registered: exists,
                provider,
                sent: false,
            };
            if (!resettable) {
                // Google (no password) / non-existent: nothing to send.
                return payload;
            }
            const userId = Number(user.id);
            // Rate limit: 1 request / 60s per user.
            const recent = await pool.query(`SELECT id FROM password_reset_tokens
           WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
           ORDER BY id DESC LIMIT 1`, [userId]);
            if (recent.rows.length > 0) {
                return reply.status(429).send({
                    error: {
                        code: "RATE_LIMITED",
                        message: "잠시 후 다시 요청해 주세요. (1분 간격)",
                    },
                });
            }
            const code = randomCode();
            const codeHash = await bcrypt.hash(code, 10);
            const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);
            await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`, [userId, codeHash, expiresAt]);
            await enqueueEmail(pool, {
                templateKey: "password_reset",
                locale: String(user.preferred_lang ?? "ko"),
                toEmail: email,
                userId,
                variables: buildEmailDefaults({
                    userName: String(user.name_ko ?? email.split("@")[0]),
                    email: maskEmail(email),
                    verificationCode: formatVerificationCode(code),
                    expiresMinutes: "30",
                }),
            });
            payload.sent = true;
            if (config.appEnv === "development") {
                payload.dev_code = code;
            }
            return payload;
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
            });
        }
    });
    // ---- verify-reset-code: check code validity WITHOUT consuming it ----
    // Lets the FO gate the new-password inputs behind a server-side validity check.
    // CRITICAL: this performs a read-only check (SELECT + bcrypt.compare) and never
    // sets consumed_at, so the same code stays usable for the subsequent
    // reset-password call (which is the step that actually consumes the token).
    app.post("/api/v1/auth/verify-reset-code", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
        const email = String(req.body?.email ?? "")
            .trim()
            .toLowerCase();
        const code = String(req.body?.code ?? "").trim();
        if (!isValidEmail(email) || code.length !== 6) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "이메일과 6자리 인증코드를 입력해 주세요.",
                },
            });
        }
        try {
            const userRes = await pool.query(`SELECT id FROM users
           WHERE email = $1 AND status = 'active'
           LIMIT 1`, [email]);
            if (userRes.rows.length === 0) {
                return reply.status(400).send({
                    error: {
                        code: "INVALID_CODE",
                        message: "인증코드가 올바르지 않거나 만료되었습니다.",
                    },
                });
            }
            const userId = Number(userRes.rows[0].id);
            const tokensRes = await pool.query(`SELECT id, token_hash FROM password_reset_tokens
           WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > NOW()
           ORDER BY id DESC
           LIMIT 5`, [userId]);
            let matched = false;
            for (const row of tokensRes.rows) {
                // eslint-disable-next-line no-await-in-loop
                const ok = await bcrypt.compare(code, row.token_hash);
                if (ok) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                return reply.status(400).send({
                    error: {
                        code: "INVALID_CODE",
                        message: "인증코드가 올바르지 않거나 만료되었습니다.",
                    },
                });
            }
            return { verified: true, message: "인증코드가 확인되었습니다." };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
            });
        }
    });
    // ---- reset-password: verify code + set new password ----
    app.post("/api/v1/auth/reset-password", async (req, reply) => {
        const body = req.body ?? {};
        const email = String(body.email ?? "")
            .trim()
            .toLowerCase();
        const code = String(body.code ?? "").trim();
        const password = String(body.password ?? "");
        const passwordConfirm = String(body.password_confirm ?? "");
        if (!isValidEmail(email) || code.length !== 6) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "이메일과 6자리 인증코드를 입력해 주세요.",
                },
            });
        }
        if (!isValidPassword(password)) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "비밀번호는 8자 이상, 영문·숫자·특수문자를 각각 포함해야 합니다.",
                },
            });
        }
        if (password !== passwordConfirm) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "비밀번호 확인이 일치하지 않습니다.",
                },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const userRes = await client.query(`SELECT id FROM users
         WHERE email = $1 AND status = 'active'
         LIMIT 1`, [email]);
            if (userRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(400).send({
                    error: {
                        code: "INVALID_CODE",
                        message: "인증코드가 올바르지 않거나 만료되었습니다.",
                    },
                });
            }
            const userId = Number(userRes.rows[0].id);
            const tokensRes = await client.query(`SELECT id, token_hash FROM password_reset_tokens
         WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC
         LIMIT 5`, [userId]);
            let matchedId = null;
            for (const row of tokensRes.rows) {
                // eslint-disable-next-line no-await-in-loop
                const ok = await bcrypt.compare(code, row.token_hash);
                if (ok) {
                    matchedId = Number(row.id);
                    break;
                }
            }
            if (!matchedId) {
                await client.query("ROLLBACK");
                return reply.status(400).send({
                    error: {
                        code: "INVALID_CODE",
                        message: "인증코드가 올바르지 않거나 만료되었습니다.",
                    },
                });
            }
            const newHash = await bcrypt.hash(password, 10);
            await client.query(`UPDATE users
         SET password_hash = $1, password_changed_at = NOW(),
             updated_at = NOW(), rev = rev + 1
         WHERE id = $2`, [newHash, userId]);
            // Consume the used token and invalidate any other outstanding ones.
            await client.query(`UPDATE password_reset_tokens
         SET consumed_at = NOW()
         WHERE user_id = $1 AND consumed_at IS NULL`, [userId]);
            await client.query("COMMIT");
            return {
                reset: true,
                message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
            };
        }
        catch (err) {
            await client.query("ROLLBACK");
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
            });
        }
        finally {
            client.release();
        }
    });
}
