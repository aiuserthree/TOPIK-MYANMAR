import bcrypt from "bcrypt";
import { config } from "../../config.js";
import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { formatDateTime, generateTempPassword, insertAuditLog, } from "../../lib/admin-helpers.js";
import { cleanString } from "../../lib/validation.js";
import { buildEmailDefaults, enqueueEmail, } from "../../lib/email-templates/enqueue-notification.js";
const DB_ROLES = new Set(["super", "standard", "readonly"]);
/** Normalize a BO role label (super/general/viewer) or DB role to a DB role. */
function normalizeRole(input) {
    const r = String(input ?? "").trim().toLowerCase();
    if (r === "super")
        return "super";
    if (r === "standard" || r === "general" || r === "manager")
        return "standard";
    if (r === "readonly" || r === "viewer")
        return "readonly";
    return null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function adminAdminUsersRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/admin-users — 관리자 계정 목록 (감사·권한 패널 공용)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/admin-users", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        const role = normalizeRole(req.query.role);
        if (role) {
            conditions.push(`role = $${idx++}`);
            params.push(role);
        }
        if (req.query.active === "1" || req.query.active === "true") {
            conditions.push(`is_active = true`);
        }
        else if (req.query.active === "0" || req.query.active === "false") {
            conditions.push(`is_active = false`);
        }
        const q = req.query.q?.trim();
        if (q) {
            conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
            params.push(`%${q}%`);
            idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const { rows } = await pool.query(`SELECT id, name, email, role, is_active, last_login_at, created_at
           FROM admin_users
           ${where}
           ORDER BY id ASC`, params);
            return {
                items: rows.map((r) => ({
                    id: Number(r.id),
                    name: r.name,
                    email: r.email,
                    role: r.role,
                    is_active: r.is_active,
                    last_login_at: r.last_login_at,
                    last_login_label: r.last_login_at ? formatDateTime(r.last_login_at) : "",
                    created_at: r.created_at,
                })),
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/admin-users — 관리자 계정 생성 (super 전용)
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/admin-users", { preHandler: requireAdmin }, async (req, reply) => {
        if (req.authAdmin.dbRole !== "super") {
            return reply.status(403).send({
                error: { code: "FORBIDDEN", message: "관리자 계정 생성은 최고관리자만 가능합니다." },
            });
        }
        const body = req.body ?? {};
        const name = cleanString(body.name, 50);
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        const role = normalizeRole(body.role);
        if (!name) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "이름을 입력해 주세요." },
            });
        }
        if (!EMAIL_RE.test(email)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "올바른 이메일을 입력해 주세요." },
            });
        }
        if (password.length < 8) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "초기 비밀번호는 8자 이상이어야 합니다." },
            });
        }
        if (!role || !DB_ROLES.has(role)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 권한 등급입니다." },
            });
        }
        try {
            const hash = await bcrypt.hash(password, 10);
            const ins = await pool.query(`INSERT INTO admin_users (name, email, password_hash, role, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`, [name, email, hash, role]);
            const newId = Number(ins.rows[0].id);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "admin_users",
                targetId: newId,
                action: "admin_create",
                statusAfter: role,
                payload: { name, email, role },
            });
            return reply.status(201).send({ id: newId, created: true });
        }
        catch (err) {
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_EMAIL", message: "이미 사용 중인 이메일입니다." },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // PATCH /api/v1/admin/admin-users/:id — 관리자 계정 수정 (super 전용)
    //   이름·이메일·권한 등급·활성화 상태. 본인 비활성화는 차단.
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/admin-users/:id", { preHandler: requireAdmin }, async (req, reply) => {
        if (req.authAdmin.dbRole !== "super") {
            return reply.status(403).send({
                error: { code: "FORBIDDEN", message: "관리자 계정 수정은 최고관리자만 가능합니다." },
            });
        }
        const targetId = Number(req.params.id);
        const body = req.body ?? {};
        if (!Number.isFinite(targetId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const sets = [];
        const params = [];
        let idx = 1;
        if (body.name !== undefined) {
            const name = cleanString(body.name, 50);
            if (!name) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "이름을 입력해 주세요." },
                });
            }
            sets.push(`name = $${idx++}`);
            params.push(name);
        }
        if (body.email !== undefined) {
            const email = String(body.email).trim().toLowerCase();
            if (!EMAIL_RE.test(email)) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "올바른 이메일을 입력해 주세요." },
                });
            }
            sets.push(`email = $${idx++}`);
            params.push(email);
        }
        if (body.role !== undefined) {
            const role = normalizeRole(body.role);
            if (!role) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "유효하지 않은 권한 등급입니다." },
                });
            }
            sets.push(`role = $${idx++}`);
            params.push(role);
        }
        if (body.is_active !== undefined) {
            if (!body.is_active && targetId === req.authAdmin.id) {
                return reply.status(422).send({
                    error: { code: "BUSINESS_RULE_VIOLATION", message: "본인 계정은 비활성화할 수 없습니다." },
                });
            }
            sets.push(`is_active = $${idx++}`);
            params.push(!!body.is_active);
        }
        if (sets.length === 0) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
            });
        }
        sets.push(`updated_at = NOW()`, `rev = rev + 1`);
        params.push(targetId);
        try {
            const upd = await pool.query(`UPDATE admin_users SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`, params);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "관리자 계정을 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "admin_users",
                targetId,
                action: "admin_update",
            });
            return { id: targetId, updated: true };
        }
        catch (err) {
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_EMAIL", message: "이미 사용 중인 이메일입니다." },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    app.post("/api/v1/admin/admin-users/:id/reset-password", { preHandler: requireAdmin }, async (req, reply) => {
        const adminUserId = Number(req.params.id);
        if (!Number.isFinite(adminUserId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (req.authAdmin.dbRole !== "super" && adminUserId !== req.authAdmin.id) {
            return reply.status(403).send({
                error: {
                    code: "FORBIDDEN",
                    message: "다른 관리자 비밀번호는 super 권한이 필요합니다.",
                },
            });
        }
        const tempPassword = generateTempPassword();
        const hash = await bcrypt.hash(tempPassword, 10);
        try {
            const upd = await pool.query(`UPDATE admin_users
           SET password_hash = $2, updated_at = NOW(), rev = rev + 1
           WHERE id = $1 AND is_active = true
           RETURNING email, name`, [adminUserId, hash]);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "관리자 계정을 찾을 수 없습니다." },
                });
            }
            const target = upd.rows[0];
            const adminUsername = String(target.email).split("@")[0] ?? String(target.name);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "admin_users",
                targetId: adminUserId,
                action: "admin_reset_password",
            });
            await enqueueEmail(pool, {
                templateKey: "temp_password_admin",
                toEmail: String(target.email),
                userId: null,
                locale: "ko",
                variables: buildEmailDefaults({
                    adminUsername,
                    temporaryPassword: tempPassword,
                }),
            });
            return {
                admin_user_id: adminUserId,
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
