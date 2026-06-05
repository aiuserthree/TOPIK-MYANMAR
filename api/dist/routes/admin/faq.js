import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { insertAuditLog } from "../../lib/admin-helpers.js";
import { cleanString, parseIntInRange } from "../../lib/validation.js";
// FO faq.ts 와 동일한 분류 체계 (account/apply/exam/result/other)
const CAT_LABEL = {
    account: "계정",
    apply: "접수",
    exam: "시험",
    result: "결과",
    other: "기타",
};
const FAQ_CATEGORIES = new Set(Object.keys(CAT_LABEL));
function mapFaqRow(r) {
    return {
        id: Number(r.id),
        category: r.category,
        category_label: CAT_LABEL[r.category] ?? r.category,
        sort_order: Number(r.sort_order),
        question_ko: r.question_ko,
        question_my: r.question_my,
        question_en: r.question_en,
        answer_ko: r.answer_ko,
        answer_my: r.answer_my,
        answer_en: r.answer_en,
        is_active: r.is_active,
        updated_at: r.updated_at,
    };
}
export async function adminFaqRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/faq — 목록 (비활성 포함)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/faq", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const conditions = [];
        const params = [];
        let idx = 1;
        const category = req.query.category?.trim();
        if (category && category !== "all" && FAQ_CATEGORIES.has(category)) {
            conditions.push(`category = $${idx++}`);
            params.push(category);
        }
        if (req.query.active === "1" || req.query.active === "true") {
            conditions.push(`is_active = true`);
        }
        else if (req.query.active === "0" || req.query.active === "false") {
            conditions.push(`is_active = false`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const { rows } = await pool.query(`SELECT id, category, sort_order, question_ko, question_my, question_en,
                  answer_ko, answer_my, answer_en, is_active, updated_at
           FROM faq_items
           ${where}
           ORDER BY category, sort_order, id`, params);
            return { items: rows.map(mapFaqRow) };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/faq/:id — 상세
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/faq/:id", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT id, category, sort_order, question_ko, question_my, question_en,
                  answer_ko, answer_my, answer_en, is_active, updated_at
           FROM faq_items WHERE id = $1 LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "FAQ를 찾을 수 없습니다." },
                });
            }
            return mapFaqRow(rows[0]);
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/faq — 생성
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/faq", { preHandler: requireAdmin }, async (req, reply) => {
        const body = req.body ?? {};
        const category = String(body.category ?? "").trim();
        const questionKo = cleanString(body.question_ko, 2000);
        const answerKo = cleanString(body.answer_ko, 8000);
        if (!FAQ_CATEGORIES.has(category)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 분류입니다." },
            });
        }
        if (!questionKo || !answerKo) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "질문/답변(한국어)은 필수입니다." },
            });
        }
        const sortOrder = parseIntInRange(body.sort_order, 0, 100000) ?? 0;
        const isActive = body.is_active === undefined ? true : !!body.is_active;
        try {
            const { rows } = await pool.query(`INSERT INTO faq_items (
             category, sort_order, question_ko, question_my, question_en,
             answer_ko, answer_my, answer_en, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`, [
                category,
                sortOrder,
                questionKo,
                cleanString(body.question_my, 2000),
                cleanString(body.question_en, 2000),
                answerKo,
                cleanString(body.answer_my, 8000),
                cleanString(body.answer_en, 8000),
                isActive,
            ]);
            const faqId = Number(rows[0].id);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "faq_items",
                targetId: faqId,
                action: "faq_create",
                payload: { category },
            });
            return reply.status(201).send({ id: faqId, created: true });
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // PATCH /api/v1/admin/faq/:id — 수정 (활성/비활성 포함)
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/faq/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        const body = req.body ?? {};
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const sets = [];
        const params = [];
        let idx = 1;
        const setField = (col, val) => {
            sets.push(`${col} = $${idx++}`);
            params.push(val);
        };
        if (body.category !== undefined) {
            const category = String(body.category).trim();
            if (!FAQ_CATEGORIES.has(category)) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "유효하지 않은 분류입니다." },
                });
            }
            setField("category", category);
        }
        if (body.sort_order !== undefined) {
            const so = parseIntInRange(body.sort_order, 0, 100000);
            if (so === null) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "정렬 순서가 올바르지 않습니다." },
                });
            }
            setField("sort_order", so);
        }
        if (body.question_ko !== undefined) {
            const v = cleanString(body.question_ko, 2000);
            if (!v) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "질문(한국어)은 비울 수 없습니다." },
                });
            }
            setField("question_ko", v);
        }
        if (body.question_my !== undefined)
            setField("question_my", cleanString(body.question_my, 2000));
        if (body.question_en !== undefined)
            setField("question_en", cleanString(body.question_en, 2000));
        if (body.answer_ko !== undefined) {
            const v = cleanString(body.answer_ko, 8000);
            if (!v) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "답변(한국어)은 비울 수 없습니다." },
                });
            }
            setField("answer_ko", v);
        }
        if (body.answer_my !== undefined)
            setField("answer_my", cleanString(body.answer_my, 8000));
        if (body.answer_en !== undefined)
            setField("answer_en", cleanString(body.answer_en, 8000));
        if (body.is_active !== undefined)
            setField("is_active", !!body.is_active);
        if (sets.length === 0) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
            });
        }
        sets.push(`updated_at = NOW()`);
        params.push(id);
        try {
            const upd = await pool.query(`UPDATE faq_items SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`, params);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "FAQ를 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "faq_items",
                targetId: id,
                action: "faq_update",
            });
            return { id, updated: true };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/faq/reorder — 정렬 순서 일괄 변경
    // body: { orders: [{ id, sort_order }] }
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/faq/reorder", { preHandler: requireAdmin }, async (req, reply) => {
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        if (orders.length === 0) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "정렬 대상이 없습니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            let updated = 0;
            for (const o of orders) {
                const id = Number(o?.id);
                const so = parseIntInRange(o?.sort_order, 0, 100000);
                if (!Number.isFinite(id) || so === null)
                    continue;
                const r = await client.query(`UPDATE faq_items SET sort_order = $2, updated_at = NOW() WHERE id = $1`, [id, so]);
                updated += r.rowCount ?? 0;
            }
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "faq_items",
                targetId: 0,
                action: "faq_reorder",
                statusAfter: `updated:${updated}`,
            });
            await client.query("COMMIT");
            return { updated };
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
    // DELETE /api/v1/admin/faq/:id — 삭제
    // -------------------------------------------------------------------------
    app.delete("/api/v1/admin/faq/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const del = await pool.query(`DELETE FROM faq_items WHERE id = $1 RETURNING id`, [id]);
            if (del.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "FAQ를 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "faq_items",
                targetId: id,
                action: "faq_delete",
            });
            return { id, deleted: true };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
}
