import { pool } from "../../db.js";
import { requireAnyAdmin } from "../../lib/auth.js";
import { formatDateTime } from "../../lib/admin-helpers.js";
/**
 * 관리자 처리 이력 (admin_audit_logs) 통합 조회.
 * BO 처리 이력 패널은 받아온 목록을 클라이언트에서 필터/페이지네이션하므로
 * 여기서는 최근 N건을 페이지 단위로 내려준다. 한국어 유형/액션 라벨 매핑은
 * 프런트 어댑터(bo-api-data.js)에서 수행한다.
 *
 * 권한: super 는 전체, 그 외(standard/readonly)는 본인 이력만 조회.
 */
export async function adminAuditLogsRoutes(app) {
    app.get("/api/v1/admin/audit-logs", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(500, Math.max(1, Number(req.query.page_size) || 200));
        const offset = (page - 1) * pageSize;
        const conditions = [];
        const params = [];
        let idx = 1;
        // 권한 게이트: super 가 아니면 본인 이력만.
        if (req.authAdmin.dbRole !== "super") {
            conditions.push(`l.admin_user_id = $${idx++}`);
            params.push(req.authAdmin.id);
        }
        else if (req.query.admin_user_id && Number.isFinite(Number(req.query.admin_user_id))) {
            conditions.push(`l.admin_user_id = $${idx++}`);
            params.push(Number(req.query.admin_user_id));
        }
        const targetTable = req.query.target_table?.trim();
        if (targetTable && targetTable !== "all") {
            conditions.push(`l.target_table = $${idx++}`);
            params.push(targetTable);
        }
        const action = req.query.action?.trim();
        if (action && action !== "all") {
            conditions.push(`l.action = $${idx++}`);
            params.push(action);
        }
        const q = req.query.q?.trim();
        if (q) {
            conditions.push(`CAST(l.target_id AS TEXT) ILIKE $${idx++}`);
            params.push(`%${q}%`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM admin_audit_logs l ${where}`, params);
            const total = countRes.rows[0]?.total ?? 0;
            const listRes = await pool.query(`SELECT l.id, l.admin_user_id, l.target_table, l.target_id, l.action,
                  l.status_before, l.status_after, l.memo, l.payload, l.created_at,
                  a.email AS actor_email, a.name AS actor_name
           FROM admin_audit_logs l
           LEFT JOIN admin_users a ON a.id = l.admin_user_id
           ${where}
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT $${idx++} OFFSET $${idx++}`, [...params, pageSize, offset]);
            return {
                items: listRes.rows.map((r) => ({
                    id: Number(r.id),
                    admin_user_id: Number(r.admin_user_id),
                    actor_email: r.actor_email,
                    actor_name: r.actor_name,
                    target_table: r.target_table,
                    target_id: r.target_id != null ? Number(r.target_id) : null,
                    action: r.action,
                    status_before: r.status_before,
                    status_after: r.status_after,
                    memo: r.memo,
                    payload: r.payload,
                    created_at: r.created_at,
                    created_at_label: formatDateTime(r.created_at),
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
}
