import { config } from "../../config.js";
import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { formatDateTime, insertAuditLog } from "../../lib/admin-helpers.js";
import { cleanString } from "../../lib/validation.js";
import { saveBase64File, StorageError, NOTICE_IMAGE_MIME, NOTICE_FILE_MIME, } from "../../lib/storage.js";
import { buildEmailDefaults, enqueueEmail, } from "../../lib/email-templates/enqueue-notification.js";
// Upload payloads arrive as base64 JSON, so the request body can be a few MB.
// Raise the per-route body limit above Fastify's 1 MB default accordingly.
const IMAGE_BODY_LIMIT = 12 * 1024 * 1024; // editor inline images (≤8 MB raw)
const FILE_BODY_LIMIT = 30 * 1024 * 1024; // post attachments (≤20 MB raw)
const IMAGE_MAX_BYTES = config.storage.maxBytes; // reuse photo cap (default 5 MB)
const FILE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Absolute base URL of the public API as seen by browsers. Built from the proxy
 * forwarding headers (Railway sets x-forwarded-proto=https) so the URLs we bake
 * into notice bodies / attachment lists work cross-origin from the FO. Falls
 * back to the Fastify-parsed protocol/host when no proxy headers are present.
 */
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
function noticeFilePath(fileId) {
    return `/api/v1/public/notice-files/${fileId}`;
}
const CAT_LABEL = {
    important: "중요",
    registration: "접수",
    exam: "시험",
    result: "결과",
};
const NOTICE_CATEGORIES = new Set(Object.keys(CAT_LABEL));
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 120;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function noticeDetailUrl(noticeId) {
    return `${config.publicFoBase}/notice.html?id=${noticeId}`;
}
function formatNoticeDate(iso) {
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
export async function adminNoticesRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/notices — 목록 (미게시 포함, 검색·페이지네이션)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/notices", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
        const offset = (page - 1) * pageSize;
        const conditions = [];
        const params = [];
        let idx = 1;
        const category = req.query.category?.trim();
        if (category && category !== "all" && NOTICE_CATEGORIES.has(category)) {
            conditions.push(`n.category = $${idx++}`);
            params.push(category);
        }
        const q = req.query.q?.trim().toLowerCase();
        if (q) {
            conditions.push(`LOWER(n.title) LIKE $${idx++}`);
            params.push(`%${q}%`);
        }
        if (req.query.published === "1" || req.query.published === "true") {
            conditions.push(`n.is_published = true`);
        }
        else if (req.query.published === "0" || req.query.published === "false") {
            conditions.push(`n.is_published = false`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM notices n ${where}`, params);
            const total = countRes.rows[0]?.total ?? 0;
            const listRes = await pool.query(`SELECT n.id, n.category, n.title, n.is_published, n.is_pinned,
                  n.view_count, n.published_at, n.created_at, n.updated_at,
                  a.email AS author_email
           FROM notices n
           LEFT JOIN admin_users a ON a.id = n.author_admin_id
           ${where}
           ORDER BY n.is_pinned DESC, n.created_at DESC, n.id DESC
           LIMIT $${idx++} OFFSET $${idx++}`, [...params, pageSize, offset]);
            return {
                items: listRes.rows.map((r) => ({
                    id: Number(r.id),
                    category: r.category,
                    category_label: CAT_LABEL[r.category] ?? r.category,
                    title: r.title,
                    is_published: r.is_published,
                    is_pinned: r.is_pinned,
                    view_count: Number(r.view_count),
                    published_at: r.published_at,
                    published_at_label: formatNoticeDate(r.published_at),
                    created_at: r.created_at,
                    created_at_label: formatDateTime(r.created_at),
                    author_email: r.author_email,
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
    // GET /api/v1/admin/notices/:id — 상세 (미게시 포함)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/notices/:id", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT id, category, title, body_html, is_published, is_pinned,
                  view_count, published_at, created_at, updated_at
           FROM notices WHERE id = $1 LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            const r = rows[0];
            return {
                id: Number(r.id),
                category: r.category,
                category_label: CAT_LABEL[r.category] ?? r.category,
                title: r.title,
                body_html: r.body_html,
                is_published: r.is_published,
                is_pinned: r.is_pinned,
                view_count: Number(r.view_count),
                published_at: r.published_at,
                created_at: r.created_at,
                updated_at: r.updated_at,
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
    // POST /api/v1/admin/notices — 생성
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/notices", { preHandler: requireAdmin }, async (req, reply) => {
        const body = req.body ?? {};
        const category = String(body.category ?? "").trim();
        const title = cleanString(body.title, 200);
        if (!NOTICE_CATEGORIES.has(category)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 분류입니다." },
            });
        }
        if (!title) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "제목을 입력해 주세요." },
            });
        }
        const bodyHtml = typeof body.body_html === "string" ? body.body_html : "";
        const isPinned = !!body.is_pinned;
        const isPublished = !!body.is_published;
        try {
            const { rows } = await pool.query(`INSERT INTO notices (
             category, title, body_html, is_published, is_pinned,
             author_admin_id, published_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`, [
                category,
                title,
                bodyHtml,
                isPublished,
                isPinned,
                req.authAdmin.id,
                isPublished ? new Date() : null,
            ]);
            const noticeId = Number(rows[0].id);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: noticeId,
                action: "notice_create",
                statusAfter: isPublished ? "published" : "draft",
                payload: { category, title },
            });
            return reply.status(201).send({ id: noticeId, created: true });
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // PATCH /api/v1/admin/notices/:id — 수정
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/notices/:id", { preHandler: requireAdmin }, async (req, reply) => {
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
        if (body.category !== undefined) {
            const category = String(body.category).trim();
            if (!NOTICE_CATEGORIES.has(category)) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "유효하지 않은 분류입니다." },
                });
            }
            sets.push(`category = $${idx++}`);
            params.push(category);
        }
        if (body.title !== undefined) {
            const title = cleanString(body.title, 200);
            if (!title) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "제목을 입력해 주세요." },
                });
            }
            sets.push(`title = $${idx++}`);
            params.push(title);
        }
        if (body.body_html !== undefined) {
            sets.push(`body_html = $${idx++}`);
            params.push(String(body.body_html));
        }
        if (body.is_pinned !== undefined) {
            sets.push(`is_pinned = $${idx++}`);
            params.push(!!body.is_pinned);
        }
        if (sets.length === 0) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
            });
        }
        sets.push(`updated_at = NOW()`);
        params.push(id);
        try {
            const upd = await pool.query(`UPDATE notices SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`, params);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: id,
                action: "notice_update",
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
    // POST /api/v1/admin/notices/:id/publish | /unpublish — 발행 토글
    // -------------------------------------------------------------------------
    const setPublished = (publish) => async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const upd = await pool.query(`UPDATE notices
           SET is_published = $2,
               published_at = CASE
                 WHEN $2 = true AND published_at IS NULL THEN NOW()
                 ELSE published_at END,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, is_published, published_at`, [id, publish]);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: id,
                action: publish ? "notice_publish" : "notice_unpublish",
                statusAfter: publish ? "published" : "draft",
            });
            return {
                id,
                is_published: upd.rows[0].is_published,
                published_at: upd.rows[0].published_at,
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    };
    app.post("/api/v1/admin/notices/:id/publish", { preHandler: requireAdmin }, setPublished(true));
    app.post("/api/v1/admin/notices/:id/unpublish", { preHandler: requireAdmin }, setPublished(false));
    // -------------------------------------------------------------------------
    // DELETE /api/v1/admin/notices/:id — 삭제 (notice_view_logs CASCADE)
    // -------------------------------------------------------------------------
    app.delete("/api/v1/admin/notices/:id", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const del = await pool.query(`DELETE FROM notices WHERE id = $1 RETURNING id`, [id]);
            if (del.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            // Best-effort cleanup of this notice's post attachments (owner_id = id).
            // Inline editor images (owner_id = 0) are referenced by URL inside the
            // body HTML and are intentionally left untouched.
            await pool.query(`DELETE FROM file_attachments WHERE owner_type = 'notice' AND owner_id = $1`, [id]);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: id,
                action: "notice_delete",
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
    app.post("/api/v1/admin/notices/:id/send-marketing", { preHandler: requireAdmin }, async (req, reply) => {
        const noticeId = Number(req.params.id);
        if (!Number.isFinite(noticeId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            const noticeRes = await client.query(`SELECT id, category, title, is_published, published_at
           FROM notices WHERE id = $1`, [noticeId]);
            if (noticeRes.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            const notice = noticeRes.rows[0];
            if (!notice.is_published) {
                return reply.status(400).send({
                    error: {
                        code: "NOT_PUBLISHED",
                        message: "게시된 공지만 마케팅 발송할 수 있습니다.",
                    },
                });
            }
            const recipientsRes = await client.query(`SELECT u.id, u.email, u.name_ko, u.preferred_lang
           FROM users u
           WHERE u.status = 'active'
             AND u.marketing_opt_in = true
             AND NOT EXISTS (
               SELECT 1 FROM email_outbox e
               WHERE e.template_key = 'notice_marketing'
                 AND e.user_id = u.id
                 AND e.subject LIKE $1
                 AND e.status IN ('sent', 'queued')
             )
           ORDER BY u.id`, [`%[notice:${noticeId}]%`]);
            const categoryLabel = CAT_LABEL[notice.category] ?? String(notice.category);
            const publishedAt = formatNoticeDate(notice.published_at);
            const noticeUrl = noticeDetailUrl(noticeId);
            const subjectPrefix = `[notice:${noticeId}]`;
            // When the background email worker is enabled, enqueue-only (insert
            // status='queued') and let the worker drain + retry — this avoids a
            // long inline for-loop that can time out the request. With the worker
            // off we keep the original inline send so nothing breaks today.
            const deferSend = config.enableEmailWorker;
            let queued = 0;
            let failed = 0;
            const errors = [];
            for (let i = 0; i < recipientsRes.rows.length; i += 1) {
                const user = recipientsRes.rows[i];
                const locale = String(user.preferred_lang ?? "ko");
                try {
                    const result = await enqueueEmail(pool, {
                        templateKey: "notice_marketing",
                        toEmail: String(user.email),
                        userId: Number(user.id),
                        locale,
                        deferSend,
                        variables: buildEmailDefaults({
                            userName: String(user.name_ko ?? user.email),
                            noticeTitle: String(notice.title),
                            noticeCategory: categoryLabel,
                            publishedAt,
                            noticeUrl,
                        }),
                    });
                    if (result.sent || result.outboxId) {
                        queued += 1;
                        await pool.query(`UPDATE email_outbox SET subject = $1 WHERE id = $2`, [`${subjectPrefix} ${result.subject}`, result.outboxId]);
                    }
                }
                catch (err) {
                    failed += 1;
                    if (errors.length < 5) {
                        errors.push(err instanceof Error ? err.message : String(err));
                    }
                }
                // Pacing only matters for inline sends; enqueue-only is fast and the
                // worker paces actual delivery.
                if (!deferSend && (i + 1) % BATCH_SIZE === 0) {
                    await sleep(BATCH_DELAY_MS);
                }
            }
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: noticeId,
                action: "notice_marketing_send",
                statusBefore: "published",
                statusAfter: `queued:${queued}`,
            });
            return {
                notice_id: noticeId,
                recipients_total: recipientsRes.rows.length,
                queued,
                failed,
                mode: deferSend ? "queued_for_worker" : "inline",
                errors: errors.length ? errors : undefined,
                completed_at: formatDateTime(new Date()),
            };
        }
        catch (err) {
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
    // POST /api/v1/admin/notices/images — 본문 인라인 이미지 업로드
    // Stored as file_attachments(owner_type='notice', owner_id=0) so it is served
    // publicly by GET /api/v1/public/notice-files/:id and embedded in body HTML.
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/notices/images", { preHandler: requireAdmin, bodyLimit: IMAGE_BODY_LIMIT }, async (req, reply) => {
        const body = req.body ?? {};
        if (typeof body.data !== "string" || body.data.length < 10) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "이미지 데이터가 없습니다." },
            });
        }
        try {
            const saved = await saveBase64File(pool, {
                ownerType: "notice",
                ownerId: 0,
                base64: body.data,
                filename: body.filename || "image",
                declaredMime: body.mime,
                allowedMime: NOTICE_IMAGE_MIME,
                maxBytes: IMAGE_MAX_BYTES,
                subdir: "notice-images",
            });
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "file_attachments",
                targetId: saved.fileId,
                action: "notice_image_upload",
            });
            const base = publicApiBase(req);
            const path = noticeFilePath(saved.fileId);
            return reply.status(201).send({
                id: saved.fileId,
                url: base ? base + path : path,
                path,
                mime: saved.mimeType,
                size: saved.sizeBytes,
            });
        }
        catch (err) {
            if (err instanceof StorageError) {
                return reply.status(400).send({
                    error: { code: err.code, message: err.message },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "upload_failed" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/notices/:id/attachments — 첨부파일 목록
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/notices/:id/attachments", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT id, original_filename, mime_type, size_bytes, created_at
           FROM file_attachments
           WHERE owner_type = 'notice' AND owner_id = $1
           ORDER BY id ASC`, [id]);
            return {
                items: rows.map((r) => ({
                    id: Number(r.id),
                    filename: r.original_filename,
                    mime: r.mime_type,
                    size: Number(r.size_bytes),
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
    // POST /api/v1/admin/notices/:id/attachments — 첨부파일 업로드
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/notices/:id/attachments", { preHandler: requireAdmin, bodyLimit: FILE_BODY_LIMIT }, async (req, reply) => {
        const id = Number(req.params.id);
        const body = req.body ?? {};
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (typeof body.data !== "string" || body.data.length < 10) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "파일 데이터가 없습니다." },
            });
        }
        try {
            const exists = await pool.query(`SELECT id FROM notices WHERE id = $1 LIMIT 1`, [id]);
            if (exists.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "공지를 찾을 수 없습니다." },
                });
            }
            const saved = await saveBase64File(pool, {
                ownerType: "notice",
                ownerId: id,
                base64: body.data,
                filename: body.filename || "file",
                declaredMime: body.mime,
                allowedMime: NOTICE_FILE_MIME,
                maxBytes: FILE_MAX_BYTES,
                subdir: "notices",
            });
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: id,
                action: "notice_attachment_add",
            });
            return reply.status(201).send({
                id: saved.fileId,
                filename: body.filename || "file",
                mime: saved.mimeType,
                size: saved.sizeBytes,
            });
        }
        catch (err) {
            if (err instanceof StorageError) {
                return reply.status(400).send({
                    error: { code: err.code, message: err.message },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "upload_failed" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // DELETE /api/v1/admin/notices/:id/attachments/:fileId — 첨부파일 삭제
    // -------------------------------------------------------------------------
    app.delete("/api/v1/admin/notices/:id/attachments/:fileId", { preHandler: requireAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        const fileId = Number(req.params.fileId);
        if (!Number.isFinite(id) || !Number.isFinite(fileId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const del = await pool.query(`DELETE FROM file_attachments
           WHERE id = $1 AND owner_type = 'notice' AND owner_id = $2
           RETURNING id`, [fileId, id]);
            if (del.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "첨부파일을 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "notices",
                targetId: id,
                action: "notice_attachment_delete",
            });
            return { id: fileId, deleted: true };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
}
