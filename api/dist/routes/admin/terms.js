import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { insertAuditLog } from "../../lib/admin-helpers.js";
import { cleanString, parseDateOrNull } from "../../lib/validation.js";
// terms.term_type CHECK — service(이용약관) / privacy(개인정보처리방침) / marketing(마케팅 수신)
const TERM_TYPES = new Set(["service", "privacy", "marketing"]);
const TERM_TYPE_LABEL = {
    service: "서비스 이용약관",
    privacy: "개인정보처리방침",
    marketing: "마케팅 수신 동의",
};
// terms.status CHECK — draft / published / retired
const TERM_STATUSES = new Set(["draft", "published", "retired"]);
function mapTermRow(r, includeBody) {
    const base = {
        id: Number(r.id),
        term_type: r.term_type,
        term_type_label: TERM_TYPE_LABEL[r.term_type] ?? r.term_type,
        version: r.version,
        effective_at: r.effective_at,
        status: r.status,
    };
    if (includeBody) {
        base.body_ko = r.body_ko;
        base.body_my = r.body_my;
        base.body_en = r.body_en;
    }
    return base;
}
export async function adminTermsRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/terms — 약관/개인정보 버전 목록 (전체 상태)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/terms", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        const type = req.query.type?.trim();
        if (type && TERM_TYPES.has(type)) {
            conditions.push(`term_type = $${idx++}`);
            params.push(type);
        }
        const status = req.query.status?.trim();
        if (status && TERM_STATUSES.has(status)) {
            conditions.push(`status = $${idx++}`);
            params.push(status);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const { rows } = await pool.query(`SELECT id, term_type, version, effective_at, status
           FROM terms
           ${where}
           ORDER BY term_type, effective_at DESC NULLS LAST, id DESC`, params);
            return { items: rows.map((r) => mapTermRow(r, false)) };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/term-agreements — 약관 동의 이력 (감사 자료)
    //   term_agreements(가입·접수 시 기록) + terms + users 조인. 회원/약관종류 필터.
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/term-agreements", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(500, Math.max(1, Number(req.query.page_size) || 200));
        const offset = (page - 1) * pageSize;
        const conditions = [];
        const params = [];
        let idx = 1;
        const termType = req.query.term_type?.trim();
        if (termType && TERM_TYPES.has(termType)) {
            conditions.push(`t.term_type = $${idx++}`);
            params.push(termType);
        }
        if (req.query.user_id && Number.isFinite(Number(req.query.user_id))) {
            conditions.push(`ta.user_id = $${idx++}`);
            params.push(Number(req.query.user_id));
        }
        const q = req.query.q?.trim();
        if (q) {
            conditions.push(`(u.name_ko ILIKE $${idx} OR u.email ILIKE $${idx} OR CAST(ta.user_id AS TEXT) ILIKE $${idx})`);
            params.push(`%${q}%`);
            idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total
           FROM term_agreements ta
           INNER JOIN terms t ON t.id = ta.term_id
           INNER JOIN users u ON u.id = ta.user_id
           ${where}`, params);
            const total = countRes.rows[0]?.total ?? 0;
            const listRes = await pool.query(`SELECT ta.id, ta.user_id, ta.agreed_at, ta.ip_address, ta.user_agent,
                  u.name_ko, u.email,
                  t.term_type, t.version
           FROM term_agreements ta
           INNER JOIN terms t ON t.id = ta.term_id
           INNER JOIN users u ON u.id = ta.user_id
           ${where}
           ORDER BY ta.agreed_at DESC, ta.id DESC
           LIMIT $${idx++} OFFSET $${idx++}`, [...params, pageSize, offset]);
            return {
                items: listRes.rows.map((r) => ({
                    id: Number(r.id),
                    user_id: Number(r.user_id),
                    name_ko: r.name_ko,
                    email: r.email,
                    term_type: r.term_type,
                    term_type_label: TERM_TYPE_LABEL[r.term_type] ?? r.term_type,
                    version: r.version,
                    agreed_at: r.agreed_at,
                    ip_address: r.ip_address ? String(r.ip_address) : "",
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
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/terms/:id — 상세 (본문 포함)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/terms/:id", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT id, term_type, version, body_ko, body_my, body_en,
                  effective_at, status
           FROM terms WHERE id = $1 LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "약관을 찾을 수 없습니다." },
                });
            }
            return mapTermRow(rows[0], true);
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/terms — 새 버전 생성 (기본 draft)
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/terms", { preHandler: requireAdmin }, async (req, reply) => {
        const body = req.body ?? {};
        const termType = String(body.term_type ?? "").trim();
        const version = cleanString(body.version, 16);
        const bodyKo = cleanString(body.body_ko, 200000);
        if (!TERM_TYPES.has(termType)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 약관 종류입니다." },
            });
        }
        if (!version) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "버전을 입력해 주세요. (예: v1.1)" },
            });
        }
        if (!bodyKo) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "본문(한국어)은 필수입니다." },
            });
        }
        const status = TERM_STATUSES.has(String(body.status)) ? String(body.status) : "draft";
        const effectiveAt = parseDateOrNull(body.effective_at) ?? new Date();
        try {
            const { rows } = await pool.query(`INSERT INTO terms (
             term_type, version, body_ko, body_my, body_en, effective_at, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`, [
                termType,
                version,
                bodyKo,
                cleanString(body.body_my, 200000),
                cleanString(body.body_en, 200000),
                effectiveAt,
                status,
            ]);
            const termId = Number(rows[0].id);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "terms",
                targetId: termId,
                action: "term_create",
                statusAfter: status,
                payload: { term_type: termType, version },
            });
            return reply.status(201).send({ id: termId, created: true });
        }
        catch (err) {
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: {
                        code: "DUPLICATE_VERSION",
                        message: "동일 종류·버전이 이미 존재합니다. 버전을 변경해 주세요.",
                    },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // PATCH /api/v1/admin/terms/:id — 본문/시행일 수정
    //   동의 무결성을 위해 본문 수정은 draft 상태에서만 허용.
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/terms/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        const body = req.body ?? {};
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const cur = await client.query(`SELECT id, status FROM terms WHERE id = $1 FOR UPDATE`, [id]);
            if (cur.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "약관을 찾을 수 없습니다." },
                });
            }
            if (cur.rows[0].status !== "draft") {
                await client.query("ROLLBACK");
                return reply.status(409).send({
                    error: {
                        code: "NOT_EDITABLE",
                        message: "게시·만료된 약관 본문은 수정할 수 없습니다. 새 버전을 생성해 주세요.",
                    },
                });
            }
            const sets = [];
            const params = [];
            let idx = 1;
            if (body.version !== undefined) {
                const v = cleanString(body.version, 16);
                if (!v) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "버전을 입력해 주세요." },
                    });
                }
                sets.push(`version = $${idx++}`);
                params.push(v);
            }
            if (body.body_ko !== undefined) {
                const v = cleanString(body.body_ko, 200000);
                if (!v) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "본문(한국어)은 비울 수 없습니다." },
                    });
                }
                sets.push(`body_ko = $${idx++}`);
                params.push(v);
            }
            if (body.body_my !== undefined) {
                sets.push(`body_my = $${idx++}`);
                params.push(cleanString(body.body_my, 200000));
            }
            if (body.body_en !== undefined) {
                sets.push(`body_en = $${idx++}`);
                params.push(cleanString(body.body_en, 200000));
            }
            if (body.effective_at !== undefined) {
                const d = parseDateOrNull(body.effective_at);
                if (!d) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "시행일 형식이 올바르지 않습니다." },
                    });
                }
                sets.push(`effective_at = $${idx++}`);
                params.push(d);
            }
            if (sets.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
                });
            }
            params.push(id);
            await client.query(`UPDATE terms SET ${sets.join(", ")} WHERE id = $${idx}`, params);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "terms",
                targetId: id,
                action: "term_update",
            });
            await client.query("COMMIT");
            return { id, updated: true };
        }
        catch (err) {
            await client.query("ROLLBACK");
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_VERSION", message: "동일 종류·버전이 이미 존재합니다." },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
        finally {
            client.release();
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/terms/:id/publish — 게시 (같은 종류의 기존 게시본은 retired)
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/terms/:id/publish", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const cur = await client.query(`SELECT id, term_type, status, effective_at FROM terms WHERE id = $1 FOR UPDATE`, [id]);
            if (cur.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "약관을 찾을 수 없습니다." },
                });
            }
            const termType = String(cur.rows[0].term_type);
            // 같은 종류의 기존 published → retired
            await client.query(`UPDATE terms SET status = 'retired'
           WHERE term_type = $1 AND status = 'published' AND id <> $2`, [termType, id]);
            await client.query(`UPDATE terms
           SET status = 'published',
               effective_at = COALESCE(effective_at, NOW())
           WHERE id = $1`, [id]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "terms",
                targetId: id,
                action: "term_publish",
                statusAfter: "published",
            });
            await client.query("COMMIT");
            return { id, status: "published" };
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
    // -------------------------------------------------------------------------
    // DELETE /api/v1/admin/terms/:id — 삭제 (draft 만; 동의 이력 있는 버전은 FK가 차단)
    // -------------------------------------------------------------------------
    app.delete("/api/v1/admin/terms/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const cur = await pool.query(`SELECT status FROM terms WHERE id = $1`, [id]);
            if (cur.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "약관을 찾을 수 없습니다." },
                });
            }
            if (cur.rows[0].status !== "draft") {
                return reply.status(409).send({
                    error: {
                        code: "NOT_DELETABLE",
                        message: "초안(draft) 상태만 삭제할 수 있습니다. 게시본은 만료 처리하세요.",
                    },
                });
            }
            await pool.query(`DELETE FROM terms WHERE id = $1`, [id]);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "terms",
                targetId: id,
                action: "term_delete",
            });
            return { id, deleted: true };
        }
        catch (err) {
            if (err?.code === "23503") {
                return reply.status(409).send({
                    error: {
                        code: "IN_USE",
                        message: "동의 이력이 있는 약관은 삭제할 수 없습니다.",
                    },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
}
