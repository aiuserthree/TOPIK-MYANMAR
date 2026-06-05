import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { formatDateTime, genderLabel, insertAuditLog, jobLabel, levelLabel, motiveLabel, purposeLabel, } from "../../lib/admin-helpers.js";
const SORTABLE = {
    created_at: "a.created_at",
    name_en: "u.name_en",
    name_ko: "u.name_ko",
    exam_number: "a.exam_number",
    status: "a.status",
};
const VALID_STATUS = new Set([
    "submitted",
    "photo_review",
    "payment_pending",
    "approved",
    "exam_number_assigned",
    "rejected",
    "cancelled",
]);
function checkRev(rowRev, bodyRev, reply) {
    if (bodyRev === undefined)
        return true;
    if (rowRev !== bodyRev) {
        reply.status(409).send({
            error: {
                code: "CONFLICT",
                message: "다른 관리자가 먼저 수정했습니다. 목록을 새로고침해 주세요.",
                current_rev: rowRev,
            },
        });
        return false;
    }
    return true;
}
export async function adminApplicationsOpsRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/applications — 접수자 목록 (필터 + 검색 + 페이지네이션 + 정렬)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/applications", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const qs = req.query ?? {};
        const where = [];
        const params = [];
        let i = 1;
        if (qs.exam_round_id && Number.isFinite(Number(qs.exam_round_id))) {
            where.push(`a.exam_round_id = $${i++}`);
            params.push(Number(qs.exam_round_id));
        }
        if (qs.exam_venue_id && Number.isFinite(Number(qs.exam_venue_id))) {
            where.push(`a.exam_venue_id = $${i++}`);
            params.push(Number(qs.exam_venue_id));
        }
        if (qs.status && VALID_STATUS.has(qs.status)) {
            where.push(`a.status = $${i++}`);
            params.push(qs.status);
        }
        if (qs.payment_status && ["unpaid", "paid", "refunded"].includes(qs.payment_status)) {
            where.push(`a.payment_status = $${i++}`);
            params.push(qs.payment_status);
        }
        if (qs.photo_review_status &&
            ["pending", "approved", "rejected"].includes(qs.photo_review_status)) {
            where.push(`a.photo_review_status = $${i++}`);
            params.push(qs.photo_review_status);
        }
        if (qs.level && ["I", "II"].includes(String(qs.level).toUpperCase())) {
            where.push(`a.exam_level = $${i++}`);
            params.push(String(qs.level).toUpperCase());
        }
        const q = String(qs.q ?? "").trim();
        if (q) {
            where.push(`(u.name_ko ILIKE $${i} OR u.name_en ILIKE $${i} OR u.email ILIKE $${i} OR a.exam_number ILIKE $${i} OR a.application_no ILIKE $${i} OR u.birth_date ILIKE $${i})`);
            params.push(`%${q}%`);
            i++;
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const page = Math.max(1, Number(qs.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(qs.page_size) || 20));
        const offset = (page - 1) * pageSize;
        const sortCol = SORTABLE[String(qs.sort ?? "")] ?? "a.created_at";
        const order = String(qs.order ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
        try {
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total
           FROM applications a
           INNER JOIN users u ON u.id = a.user_id
           ${whereSql}`, params);
            const total = Number(countRes.rows[0]?.total ?? 0);
            const listParams = params.slice();
            listParams.push(pageSize, offset);
            const { rows } = await pool.query(`SELECT
             a.id AS application_id,
             a.application_no,
             a.exam_level,
             a.status,
             a.photo_review_status,
             a.photo_reject_code,
             a.payment_status,
             a.paid_at,
             a.receipt_no,
             a.exam_number,
             a.photo_file_id,
             a.rev,
             a.created_at,
             u.id AS user_id,
             u.name_ko,
             u.name_en,
             u.birth_date,
             u.gender,
             u.nationality,
             u.first_language,
             u.job_code,
             u.motive_code,
             u.purpose_code,
             u.email,
             r.round_no,
             r.title AS round_title,
             v.id AS venue_id,
             v.venue_code,
             v.name_ko AS venue_name
           FROM applications a
           INNER JOIN users u ON u.id = a.user_id
           INNER JOIN exam_rounds r ON r.id = a.exam_round_id
           INNER JOIN exam_venues v ON v.id = a.exam_venue_id
           ${whereSql}
           ORDER BY ${sortCol} ${order}, a.id ${order}
           LIMIT $${i++} OFFSET $${i++}`, listParams);
            const items = rows.map((row) => ({
                application_id: Number(row.application_id),
                application_no: row.application_no,
                exam_level: row.exam_level,
                exam_level_label: levelLabel(String(row.exam_level)),
                status: row.status,
                photo_review_status: row.photo_review_status,
                photo_reject_code: row.photo_reject_code,
                payment_status: row.payment_status,
                paid_at: row.paid_at,
                receipt_no: row.receipt_no,
                exam_number: row.exam_number,
                photo_file_id: row.photo_file_id ? Number(row.photo_file_id) : null,
                rev: Number(row.rev),
                created_at: row.created_at,
                created_at_label: formatDateTime(row.created_at),
                user: {
                    id: Number(row.user_id),
                    name_ko: row.name_ko,
                    name_en: row.name_en,
                    birth_date: row.birth_date,
                    gender: row.gender,
                    gender_label: genderLabel(String(row.gender)),
                    nationality: row.nationality,
                    first_language: row.first_language,
                    job_label: jobLabel(row.job_code),
                    motive_label: motiveLabel(row.motive_code),
                    purpose_label: purposeLabel(row.purpose_code),
                    email: row.email,
                },
                venue: {
                    id: Number(row.venue_id),
                    venue_code: row.venue_code,
                    name_ko: row.venue_name,
                },
                round_no: Number(row.round_no),
                round_title: row.round_title,
            }));
            return {
                items,
                pagination: {
                    page,
                    page_size: pageSize,
                    total_items: total,
                    total_pages: Math.max(1, Math.ceil(total / pageSize)),
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
    // GET /api/v1/admin/applications/:id — 상세 + 사진 + 처리 이력
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/applications/:id", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT
             a.*, 
             u.name_ko, u.name_en, u.birth_date, u.gender, u.nationality,
             u.first_language, u.phone, u.email, u.job_code, u.motive_code,
             u.purpose_code, u.preferred_lang,
             r.round_no, r.title AS round_title, r.exam_date, r.exam_number_visible_at,
             v.id AS venue_id, v.venue_code, v.name_ko AS venue_name,
             s.submitted_at, s.terms_snapshot
           FROM applications a
           INNER JOIN users u ON u.id = a.user_id
           INNER JOIN exam_rounds r ON r.id = a.exam_round_id
           INNER JOIN exam_venues v ON v.id = a.exam_venue_id
           INNER JOIN application_submissions s ON s.id = a.submission_id
           WHERE a.id = $1 LIMIT 1`, [appId]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 건을 찾을 수 없습니다." },
                });
            }
            const a = rows[0];
            const auditRes = await pool.query(`SELECT al.action, al.status_before, al.status_after, al.memo,
                  al.created_at, au.email AS admin_email, au.name AS admin_name
           FROM admin_audit_logs al
           LEFT JOIN admin_users au ON au.id = al.admin_user_id
           WHERE al.target_table = 'applications' AND al.target_id = $1
           ORDER BY al.created_at DESC
           LIMIT 50`, [appId]);
            const memoRes = await pool.query(`SELECT m.id, m.body, m.created_at,
                  au.email AS admin_email, au.name AS admin_name
           FROM application_memos m
           LEFT JOIN admin_users au ON au.id = m.admin_user_id
           WHERE m.application_id = $1
           ORDER BY m.created_at DESC
           LIMIT 100`, [appId]);
            return {
                application: {
                    id: Number(a.id),
                    application_no: a.application_no,
                    exam_level: a.exam_level,
                    exam_level_label: levelLabel(String(a.exam_level)),
                    status: a.status,
                    photo_review_status: a.photo_review_status,
                    photo_reject_code: a.photo_reject_code,
                    photo_reject_note: a.photo_reject_note,
                    payment_status: a.payment_status,
                    paid_at: a.paid_at,
                    paid_at_label: formatDateTime(a.paid_at),
                    payment_memo: a.payment_memo,
                    receipt_no: a.receipt_no,
                    reject_code: a.reject_code,
                    reject_note: a.reject_note,
                    cancelled_at: a.cancelled_at,
                    cancel_reason: a.cancel_reason,
                    exam_number: a.exam_number,
                    photo_file_id: a.photo_file_id ? Number(a.photo_file_id) : null,
                    profile_snapshot: a.profile_snapshot,
                    rev: Number(a.rev),
                    created_at: a.created_at,
                },
                user: {
                    id: Number(a.user_id),
                    name_ko: a.name_ko,
                    name_en: a.name_en,
                    birth_date: a.birth_date,
                    gender: a.gender,
                    gender_label: genderLabel(String(a.gender)),
                    nationality: a.nationality,
                    first_language: a.first_language,
                    phone: a.phone,
                    email: a.email,
                    job_label: jobLabel(a.job_code),
                    motive_label: motiveLabel(a.motive_code),
                    purpose_label: purposeLabel(a.purpose_code),
                    preferred_lang: a.preferred_lang,
                },
                round: {
                    round_no: Number(a.round_no),
                    title: a.round_title,
                    exam_date: a.exam_date,
                    exam_number_visible_at: a.exam_number_visible_at,
                },
                venue: {
                    id: Number(a.venue_id),
                    venue_code: a.venue_code,
                    name_ko: a.venue_name,
                },
                submission: {
                    submitted_at: a.submitted_at,
                    terms_snapshot: a.terms_snapshot,
                },
                audit_logs: auditRes.rows.map((l) => ({
                    action: l.action,
                    status_before: l.status_before,
                    status_after: l.status_after,
                    memo: l.memo,
                    created_at: l.created_at,
                    created_at_label: formatDateTime(l.created_at),
                    admin_email: l.admin_email,
                    admin_name: l.admin_name,
                })),
                memos: memoRes.rows.map((m) => ({
                    id: Number(m.id),
                    body: m.body,
                    created_at: m.created_at,
                    created_at_label: formatDateTime(m.created_at),
                    admin_email: m.admin_email,
                    admin_name: m.admin_name,
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
    // GET /api/v1/admin/applications/:id/memos — 접수 건 관리자 메모 이력
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/applications/:id/memos", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT m.id, m.body, m.created_at,
                  au.email AS admin_email, au.name AS admin_name
           FROM application_memos m
           LEFT JOIN admin_users au ON au.id = m.admin_user_id
           WHERE m.application_id = $1
           ORDER BY m.created_at DESC
           LIMIT 100`, [appId]);
            return {
                items: rows.map((m) => ({
                    id: Number(m.id),
                    body: m.body,
                    created_at: m.created_at,
                    created_at_label: formatDateTime(m.created_at),
                    admin_email: m.admin_email,
                    admin_name: m.admin_name,
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
    // POST /api/v1/admin/applications/:id/memos — 접수 건 관리자 메모 추가
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/applications/:id/memos", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        const memoBody = String(req.body?.body ?? "").trim();
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!memoBody) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "메모 내용을 입력해 주세요." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const exists = await client.query(`SELECT id FROM applications WHERE id = $1 LIMIT 1`, [appId]);
            if (exists.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 건을 찾을 수 없습니다." },
                });
            }
            const ins = await client.query(`INSERT INTO application_memos (application_id, admin_user_id, body)
           VALUES ($1, $2, $3)
           RETURNING id, body, created_at`, [appId, req.authAdmin.id, memoBody.slice(0, 5000)]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "memo_add",
                memo: memoBody.slice(0, 200),
            });
            await client.query("COMMIT");
            const m = ins.rows[0];
            return reply.status(201).send({
                memo: {
                    id: Number(m.id),
                    body: m.body,
                    created_at: m.created_at,
                    created_at_label: formatDateTime(m.created_at),
                    admin_email: req.authAdmin.email,
                    admin_name: null,
                },
            });
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
    // POST /api/v1/admin/applications/:id/payment — 오프라인 수납 완료
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/applications/:id/payment", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const receiptNo = String(req.body?.receipt_no ?? "").trim() || null;
        const memo = String(req.body?.payment_memo ?? "").trim() || null;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, photo_review_status, payment_status, exam_round_id,
                  exam_venue_id, rev
           FROM applications WHERE id = $1 FOR UPDATE`, [appId]);
            if (lock.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 건을 찾을 수 없습니다." },
                });
            }
            const row = lock.rows[0];
            if (!checkRev(Number(row.rev), req.body?.rev, reply)) {
                await client.query("ROLLBACK");
                return;
            }
            if (["cancelled", "rejected"].includes(row.status)) {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "취소·반려 건은 수납 처리할 수 없습니다.",
                    },
                });
            }
            if (row.payment_status === "paid") {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "ALREADY_PAID",
                        message: "이미 수납 완료된 접수입니다.",
                    },
                });
            }
            let photoStatus = row.photo_review_status;
            if (photoStatus !== "approved") {
                if (req.body?.approve_photo) {
                    await client.query(`UPDATE applications
               SET photo_review_status = 'approved', photo_reject_code = NULL,
                   photo_reject_note = NULL
               WHERE id = $1`, [appId]);
                    photoStatus = "approved";
                    await insertAuditLog(client, {
                        adminId: req.authAdmin.id,
                        targetTable: "applications",
                        targetId: appId,
                        action: "photo_review_approve",
                        statusBefore: `${row.status}/${row.photo_review_status}`,
                        statusAfter: `${row.status}/approved`,
                        memo: "수납 처리와 동시 사진 승인",
                    });
                }
                else {
                    await client.query("ROLLBACK");
                    return reply.status(422).send({
                        error: {
                            code: "PHOTO_NOT_APPROVED",
                            message: "증명사진 심사 승인 후 수납 처리가 가능합니다. (approve_photo로 동시 승인 가능)",
                        },
                    });
                }
            }
            // 정원 초과 가드 (시험장 capacity 기준 — ignore_capacity로 우회)
            if (!req.body?.ignore_capacity) {
                const cap = await client.query(`SELECT v.capacity,
                    (SELECT COUNT(*) FROM applications p
                     WHERE p.exam_round_id = $1 AND p.exam_venue_id = $2
                       AND p.payment_status = 'paid') AS paid_count
             FROM exam_venues v WHERE v.id = $2`, [row.exam_round_id, row.exam_venue_id]);
                const capRow = cap.rows[0];
                if (capRow &&
                    capRow.capacity != null &&
                    Number(capRow.paid_count) >= Number(capRow.capacity)) {
                    await client.query("ROLLBACK");
                    return reply.status(422).send({
                        error: {
                            code: "CAPACITY_EXCEEDED",
                            message: `시험장 정원(${capRow.capacity})을 초과했습니다. 확인 후 ignore_capacity로 강제 처리할 수 있습니다.`,
                        },
                    });
                }
            }
            const statusBefore = `${row.status}/${row.payment_status}`;
            await client.query(`UPDATE applications
           SET payment_status = 'paid', paid_at = NOW(),
               payment_memo = $2, receipt_no = $3,
               status = 'approved', updated_at = NOW(), rev = rev + 1
           WHERE id = $1`, [appId, memo, receiptNo]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "payment_complete",
                statusBefore,
                statusAfter: "approved/paid",
                memo,
                payload: { receipt_no: receiptNo },
            });
            await client.query("COMMIT");
            return {
                application_id: appId,
                payment_status: "paid",
                status: "approved",
                photo_review_status: photoStatus,
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
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/applications/:id/payment/cancel — 수납 취소(환불자)
    //   환불 시 payment_status='refunded'. 수험번호는 유지(회수하지 않음).
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/applications/:id/payment/cancel", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        const reason = String(req.body?.reason ?? "").trim();
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!reason) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "취소(환불) 사유를 입력해 주세요." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, payment_status, exam_number, rev
           FROM applications WHERE id = $1 FOR UPDATE`, [appId]);
            if (lock.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 건을 찾을 수 없습니다." },
                });
            }
            const row = lock.rows[0];
            if (!checkRev(Number(row.rev), req.body?.rev, reply)) {
                await client.query("ROLLBACK");
                return;
            }
            if (row.payment_status !== "paid") {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "수납 완료 건만 취소(환불)할 수 있습니다.",
                    },
                });
            }
            const statusBefore = `${row.status}/${row.payment_status}`;
            await client.query(`UPDATE applications
           SET payment_status = 'refunded', cancel_reason = $2,
               updated_at = NOW(), rev = rev + 1
           WHERE id = $1`, [appId, reason]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "payment_cancel",
                statusBefore,
                statusAfter: `${row.status}/refunded`,
                memo: reason,
                payload: { exam_number_kept: row.exam_number ?? null },
            });
            await client.query("COMMIT");
            return {
                application_id: appId,
                payment_status: "refunded",
                exam_number: row.exam_number ?? null,
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
}
