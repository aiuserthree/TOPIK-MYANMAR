import bcrypt from "bcrypt";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { adminDisplayName, formatDateTime, generateTempPassword, insertAuditLog, } from "../../lib/admin-helpers.js";
import { buildEmailDefaults, enqueueEmail, } from "../../lib/email-templates/enqueue-notification.js";
import { genderToCode, normalizeBirthDate } from "../../lib/validation.js";
const FIELD_LABELS = {
    name_ko: "한글 성명",
    name_en: "영문 성명",
    birth_date: "생년월일",
    gender: "성별",
    nationality: "국적",
    first_language: "모국어",
    phone: "연락처",
    preferred_lang: "언어",
    marketing_opt_in: "마케팅 수신",
    status: "계정 상태",
};
function genderLabel(g) {
    return g === "1" ? "남" : g === "2" ? "여" : g;
}
function buildDiff(before, after, keys) {
    const changed = [];
    const lines = [];
    for (const key of keys) {
        const b = before[key];
        const a = after[key];
        if (String(b ?? "") === String(a ?? ""))
            continue;
        const label = FIELD_LABELS[key] ?? key;
        changed.push(label);
        lines.push(`${label}: ${String(b ?? "—")} → ${String(a ?? "—")}`);
    }
    return {
        summary: changed.length ? changed.join(" · ") : "—",
        diffHtml: lines.length ? lines.join("\n") : "—",
    };
}
async function notifyMemberInfoChanged(userId, admin, diff) {
    const { rows } = await pool.query(`SELECT email, name_ko, preferred_lang FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (rows.length === 0)
        return;
    const u = rows[0];
    const locale = String(u.preferred_lang ?? "ko");
    await enqueueEmail(pool, {
        templateKey: "member_info_changed",
        toEmail: String(u.email),
        userId,
        locale,
        variables: buildEmailDefaults({
            userName: String(u.name_ko ?? u.email),
            changedAt: formatDateTime(new Date()),
            changedBy: adminDisplayName(admin),
            changedFieldsSummary: diff.summary,
            changeDiffHtml: diff.diffHtml,
        }),
    });
}
const MEMBER_STATUSES = new Set(["active", "suspended", "withdrawn"]);
export async function adminUsersRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/users — 회원 목록 (검색·상태·국적 필터 + 페이지네이션)
    // 마지막 로그인은 users.last_login_at (FO 로그인·Google 로그인 시 갱신).
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/users", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(req.query.page_size) || 50));
        const offset = (page - 1) * pageSize;
        const conditions = [];
        const params = [];
        let idx = 1;
        const status = req.query.status?.trim();
        if (status && MEMBER_STATUSES.has(status)) {
            conditions.push(`u.status = $${idx++}`);
            params.push(status);
        }
        const nationality = req.query.nationality?.trim();
        if (nationality && nationality !== "all") {
            conditions.push(`u.nationality = $${idx++}`);
            params.push(nationality);
        }
        const q = req.query.q?.trim();
        if (q) {
            conditions.push(`(u.name_ko ILIKE $${idx} OR u.name_en ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone ILIKE $${idx})`);
            params.push(`%${q}%`);
            idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, params);
            const total = countRes.rows[0]?.total ?? 0;
            const listRes = await pool.query(`SELECT u.id, u.name_ko, u.name_en, u.email, u.phone, u.nationality,
                  u.status, u.marketing_opt_in, u.preferred_lang, u.created_at,
                  u.withdrawn_at, u.last_login_at
           FROM users u
           ${where}
           ORDER BY u.created_at DESC, u.id DESC
           LIMIT $${idx++} OFFSET $${idx++}`, [...params, pageSize, offset]);
            return {
                items: listRes.rows.map((r) => ({
                    id: Number(r.id),
                    name_ko: r.name_ko,
                    name_en: r.name_en,
                    email: r.email,
                    phone: r.phone,
                    nationality: r.nationality,
                    status: r.status,
                    marketing_opt_in: r.marketing_opt_in,
                    preferred_lang: r.preferred_lang,
                    created_at: r.created_at,
                    created_at_label: formatDateTime(r.created_at),
                    last_login_at: r.last_login_at,
                    last_login_label: r.last_login_at ? formatDateTime(r.last_login_at) : "",
                    withdrawn_at: r.withdrawn_at,
                })),
                pagination: {
                    page,
                    page_size: pageSize,
                    total_items: total,
                    total_pages: Math.ceil(total / pageSize) || 1,
                },
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    app.patch("/api/v1/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const userId = Number(req.params.id);
        const body = req.body ?? {};
        const shouldNotify = body.notify_member !== false;
        if (!Number.isFinite(userId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const cur = await client.query(`SELECT id, email, name_ko, name_en, birth_date, gender, nationality,
                  first_language, phone, preferred_lang, marketing_opt_in, status, rev
           FROM users WHERE id = $1 FOR UPDATE`, [userId]);
            if (cur.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." },
                });
            }
            const before = cur.rows[0];
            const sets = [];
            const params = [];
            let idx = 1;
            const setField = (col, val) => {
                sets.push(`${col} = $${idx++}`);
                params.push(val);
            };
            if (body.name_ko !== undefined)
                setField("name_ko", String(body.name_ko).trim());
            if (body.name_en !== undefined)
                setField("name_en", String(body.name_en).trim());
            if (body.birth_date !== undefined) {
                const birth = normalizeBirthDate(String(body.birth_date));
                if (!birth) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "생년월일 형식이 올바르지 않습니다." },
                    });
                }
                setField("birth_date", birth);
            }
            if (body.gender !== undefined) {
                const g = genderToCode(String(body.gender));
                if (!g) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "성별 값이 올바르지 않습니다." },
                    });
                }
                setField("gender", g);
            }
            if (body.nationality !== undefined) {
                setField("nationality", String(body.nationality).trim());
            }
            if (body.first_language !== undefined) {
                setField("first_language", String(body.first_language).trim());
            }
            if (body.phone !== undefined)
                setField("phone", String(body.phone).trim());
            if (body.preferred_lang !== undefined) {
                const lang = String(body.preferred_lang).toLowerCase();
                if (!["ko", "my", "en"].includes(lang)) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "지원하지 않는 언어입니다." },
                    });
                }
                setField("preferred_lang", lang);
            }
            if (body.marketing_opt_in !== undefined) {
                setField("marketing_opt_in", !!body.marketing_opt_in);
            }
            if (body.status !== undefined) {
                const st = String(body.status);
                if (!["active", "suspended", "withdrawn"].includes(st)) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "유효하지 않은 상태입니다." },
                    });
                }
                setField("status", st);
            }
            if (sets.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
                });
            }
            sets.push(`updated_at = NOW()`, `rev = rev + 1`);
            params.push(userId);
            await client.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}`, params);
            const afterRes = await client.query(`SELECT name_ko, name_en, birth_date, gender, nationality,
                  first_language, phone, preferred_lang, marketing_opt_in, status
           FROM users WHERE id = $1`, [userId]);
            const afterRaw = afterRes.rows[0];
            const afterDisplay = {
                ...afterRaw,
                gender: genderLabel(String(afterRaw.gender)),
                marketing_opt_in: afterRaw.marketing_opt_in ? "동의" : "미동의",
            };
            const beforeDisplay = {
                name_ko: before.name_ko,
                name_en: before.name_en,
                birth_date: before.birth_date,
                gender: genderLabel(String(before.gender)),
                nationality: before.nationality,
                first_language: before.first_language,
                phone: before.phone,
                preferred_lang: before.preferred_lang,
                marketing_opt_in: before.marketing_opt_in ? "동의" : "미동의",
                status: before.status,
            };
            const trackKeys = Object.keys(body).filter((k) => k !== "notify_member" && FIELD_LABELS[k]);
            const diff = buildDiff(beforeDisplay, afterDisplay, trackKeys);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "users",
                targetId: userId,
                action: "member_update",
                statusBefore: String(before.status),
                statusAfter: String(afterRaw.status),
                payload: { changed_fields: diff.summary },
            });
            await client.query("COMMIT");
            if (shouldNotify && diff.summary !== "—") {
                void notifyMemberInfoChanged(userId, req.authAdmin, diff).catch((err) => app.log.error(err));
            }
            return {
                user_id: userId,
                updated: true,
                email_queued: shouldNotify && diff.summary !== "—",
            };
        }
        catch (err) {
            await client.query("ROLLBACK");
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
        finally {
            client.release();
        }
    });
    app.post("/api/v1/admin/users/:id/notify-changed", { preHandler: requireAdmin }, async (req, reply) => {
        const userId = Number(req.params.id);
        const body = req.body;
        if (!Number.isFinite(userId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const summary = String(body?.changed_fields_summary ?? "회원정보").trim();
        const diffHtml = String(body?.change_diff_html ?? summary).trim();
        try {
            await notifyMemberInfoChanged(userId, req.authAdmin, {
                summary,
                diffHtml,
            });
            return { user_id: userId, email_queued: true };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    app.post("/api/v1/admin/users/:id/reset-password", { preHandler: requireAdmin }, async (req, reply) => {
        const userId = Number(req.params.id);
        if (!Number.isFinite(userId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const tempPassword = generateTempPassword();
        const hash = await bcrypt.hash(tempPassword, 10);
        try {
            const upd = await pool.query(`UPDATE users
           SET password_hash = $2, password_changed_at = NULL, updated_at = NOW(), rev = rev + 1
           WHERE id = $1 AND status IN ('active', 'suspended')
           RETURNING email, name_ko, preferred_lang`, [userId, hash]);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." },
                });
            }
            const u = upd.rows[0];
            const locale = String(u.preferred_lang ?? "ko");
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "users",
                targetId: userId,
                action: "reset_password",
            });
            await enqueueEmail(pool, {
                templateKey: "temp_password",
                toEmail: String(u.email),
                userId,
                locale,
                variables: buildEmailDefaults({
                    userName: String(u.name_ko ?? u.email),
                    temporaryPassword: tempPassword,
                }),
            });
            return {
                user_id: userId,
                email_queued: true,
                temporary_password: config.appEnv === "development" ? tempPassword : undefined,
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
}
