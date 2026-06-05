import { pool } from "../db.js";
const CAT_LABEL = {
    important: "중요",
    registration: "접수",
    exam: "시험",
    result: "결과",
};
/** Absolute base URL of the public API (proxy-aware) for building file links. */
function publicApiBase(req) {
    const fwdProto = String(req.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim();
    const proto = fwdProto || req.protocol || "https";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
        .split(",")[0]
        .trim();
    return host ? `${proto}://${host}` : "";
}
function formatDate(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
}
export async function noticesRoutes(app) {
    app.get("/api/v1/notices", async (req, reply) => {
        const category = req.query.category?.trim();
        const q = req.query.q?.trim().toLowerCase();
        const homePreview = req.query.home_preview === "1";
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = homePreview
            ? 5
            : Math.min(50, Math.max(1, Number(req.query.page_size) || 20));
        const offset = (page - 1) * pageSize;
        const conditions = ["is_published = true"];
        const params = [];
        let idx = 1;
        if (category && category !== "all") {
            const map = {
                imp: "important",
                apply: "registration",
                exam: "exam",
                result: "result",
                important: "important",
                registration: "registration",
            };
            const cat = map[category] ?? category;
            conditions.push(`category = $${idx++}`);
            params.push(cat);
        }
        if (q) {
            conditions.push(`LOWER(title) LIKE $${idx++}`);
            params.push(`%${q}%`);
        }
        const where = conditions.join(" AND ");
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM notices WHERE ${where}`, params);
            const total = countRes.rows[0]?.total ?? 0;
            const listRes = await pool.query(`SELECT id, category, title, is_pinned, view_count, published_at, created_at
         FROM notices
         WHERE ${where}
         ORDER BY is_pinned DESC, published_at DESC NULLS LAST, id DESC
         LIMIT $${idx++} OFFSET $${idx++}`, [...params, pageSize, offset]);
            const items = listRes.rows.map((row) => ({
                id: Number(row.id),
                category: row.category,
                category_label: CAT_LABEL[row.category] ?? row.category,
                title: row.title,
                is_pinned: row.is_pinned,
                view_count: row.view_count,
                published_at: row.published_at,
                date_formatted: formatDate(row.published_at ?? row.created_at),
            }));
            return {
                items,
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
    app.get("/api/v1/notices/:id", async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const sessionKey = (req.query.session_key || "anon").slice(0, 64);
        try {
            const { rows } = await pool.query(`SELECT id, category, title, body_html, is_pinned, view_count,
                  published_at, created_at
           FROM notices
           WHERE id = $1 AND is_published = true
           LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            const viewIns = await pool.query(`INSERT INTO notice_view_logs (notice_id, session_key)
           VALUES ($1, $2)
           ON CONFLICT (notice_id, session_key) DO NOTHING
           RETURNING id`, [id, sessionKey]);
            if (viewIns.rows.length > 0) {
                await pool.query(`UPDATE notices SET view_count = view_count + 1 WHERE id = $1`, [id]);
            }
            // Post attachments (owner_id = notice id). Inline editor images live as
            // owner_id = 0 and are referenced from body_html, so they are excluded.
            const attRes = await pool.query(`SELECT id, original_filename, mime_type, size_bytes
           FROM file_attachments
           WHERE owner_type = 'notice' AND owner_id = $1
           ORDER BY id ASC`, [id]);
            const base = publicApiBase(req);
            const fileUrl = (fileId, dl) => {
                const p = `/api/v1/public/notice-files/${fileId}${dl ? "?dl=1" : ""}`;
                return base ? base + p : p;
            };
            const attachments = attRes.rows.map((a) => ({
                id: Number(a.id),
                filename: a.original_filename,
                mime: a.mime_type,
                size: Number(a.size_bytes),
                download_url: fileUrl(Number(a.id), true),
                inline_url: fileUrl(Number(a.id), false),
            }));
            const row = rows[0];
            return {
                id: Number(row.id),
                category: row.category,
                category_label: CAT_LABEL[row.category] ?? row.category,
                title: row.title,
                body_html: row.body_html,
                is_pinned: row.is_pinned,
                view_count: row.view_count + (viewIns.rows.length > 0 ? 1 : 0),
                published_at: row.published_at,
                date_formatted: formatDate(row.published_at ?? row.created_at),
                attachments,
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
