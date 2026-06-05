import { pool } from "../../db.js";
import { requireAdmin } from "../../lib/auth.js";
import { appRejectLabel, formatExamDate, insertAuditLog, isValidPhotoRejectCode, levelLabel, loadApplicationForEmail, photoRejectLabel, roundDisplayName, } from "../../lib/admin-helpers.js";
import { buildEmailDefaults, enqueueEmail, } from "../../lib/email-templates/enqueue-notification.js";
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
async function sendApplicationApprovedEmail(row) {
    if (!row)
        return;
    const locale = String(row.preferred_lang ?? "ko");
    await enqueueEmail(pool, {
        templateKey: "application_approved",
        toEmail: row.user_email,
        userId: row.user_id,
        locale,
        variables: buildEmailDefaults({
            userName: row.user_name_ko,
            applicantNo: row.application_no,
            roundName: roundDisplayName(Number(row.round_no), row.round_title),
            level: levelLabel(row.exam_level),
            examDate: formatExamDate(row.exam_date),
            venueName: row.venue_name,
        }),
    });
}
export async function adminApplicationsRoutes(app) {
    app.post("/api/v1/admin/applications/:id/approve", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, photo_review_status, rev
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
            if (["rejected", "cancelled", "exam_number_assigned"].includes(row.status)) {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "현재 상태에서는 승인할 수 없습니다.",
                    },
                });
            }
            if (row.photo_review_status !== "approved") {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "증명사진 심사 승인 후 접수 승인이 가능합니다.",
                    },
                });
            }
            const statusBefore = row.status;
            await client.query(`UPDATE applications
           SET status = 'payment_pending', updated_at = NOW(), rev = rev + 1
           WHERE id = $1`, [appId]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "application_approve",
                statusBefore,
                statusAfter: "payment_pending",
            });
            await client.query("COMMIT");
            const emailRow = await loadApplicationForEmail(pool, appId);
            void sendApplicationApprovedEmail(emailRow).catch((err) => app.log.error(err));
            return {
                application_id: appId,
                status: "payment_pending",
                email_queued: true,
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
    app.post("/api/v1/admin/applications/:id/reject", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        const rejectCode = String(req.body?.reject_code ?? "other").trim();
        const rejectNote = String(req.body?.reject_note ?? "").trim();
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!rejectNote) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "반려 사유를 입력해 주세요." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, application_no, rev, user_id
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
            if (["rejected", "cancelled", "exam_number_assigned"].includes(row.status)) {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "현재 상태에서는 반려할 수 없습니다.",
                    },
                });
            }
            const statusBefore = row.status;
            await client.query(`UPDATE applications
           SET status = 'rejected',
               reject_code = $2,
               reject_note = $3,
               updated_at = NOW(),
               rev = rev + 1
           WHERE id = $1`, [appId, rejectCode, rejectNote]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "application_reject",
                statusBefore,
                statusAfter: "rejected",
                memo: rejectNote,
                payload: { reject_code: rejectCode },
            });
            await client.query("COMMIT");
            const emailRow = await loadApplicationForEmail(pool, appId);
            if (emailRow) {
                const locale = String(emailRow.preferred_lang ?? "ko");
                void enqueueEmail(pool, {
                    templateKey: "application_rejected",
                    toEmail: emailRow.user_email,
                    userId: emailRow.user_id,
                    locale,
                    variables: buildEmailDefaults({
                        userName: emailRow.user_name_ko,
                        applicantNo: emailRow.application_no,
                        roundName: roundDisplayName(Number(emailRow.round_no), emailRow.round_title),
                        rejectCode: appRejectLabel(rejectCode),
                        rejectReason: rejectNote,
                    }),
                }).catch((err) => app.log.error(err));
            }
            return {
                application_id: appId,
                status: "rejected",
                email_queued: true,
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
    async function handlePhotoReject(req, reply) {
        const appId = Number(req.params.id);
        const code = String(req.body?.photo_reject_code ?? "other").trim();
        const note = String(req.body?.photo_reject_note ?? "").trim() ||
            photoRejectLabel(code);
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!isValidPhotoRejectCode(code)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 사진 반려 코드입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, photo_review_status, rev, user_id
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
            if (["rejected", "cancelled"].includes(row.status)) {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "현재 상태에서는 사진 심사를 반려할 수 없습니다.",
                    },
                });
            }
            const statusBefore = `${row.status}/${row.photo_review_status}`;
            await client.query(`UPDATE applications
         SET photo_review_status = 'rejected',
             photo_reject_code = $2,
             photo_reject_note = $3,
             status = 'submitted',
             updated_at = NOW(),
             rev = rev + 1
         WHERE id = $1`, [appId, code, note]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "photo_review_reject",
                statusBefore,
                statusAfter: "submitted/rejected",
                memo: note,
                payload: { photo_reject_code: code },
            });
            await client.query("COMMIT");
            const emailRow = await loadApplicationForEmail(pool, appId);
            if (emailRow) {
                const locale = String(emailRow.preferred_lang ?? "ko");
                void enqueueEmail(pool, {
                    templateKey: "photo_rejected",
                    toEmail: emailRow.user_email,
                    userId: emailRow.user_id,
                    locale,
                    variables: buildEmailDefaults({
                        userName: emailRow.user_name_ko,
                        photoRejectCode: photoRejectLabel(code),
                        photoRejectReason: note,
                    }),
                }).catch((err) => app.log.error(err));
            }
            return {
                application_id: appId,
                photo_review_status: "rejected",
                status: "submitted",
                email_queued: true,
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
    }
    app.post("/api/v1/admin/applications/:id/photo-review", { preHandler: requireAdmin }, async (req, reply) => {
        const appId = Number(req.params.id);
        const action = String(req.body?.action ?? "").trim().toLowerCase();
        if (!Number.isFinite(appId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (action === "reject") {
            return handlePhotoReject(req, reply);
        }
        if (action !== "approve") {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: 'action은 "approve" 또는 "reject" 이어야 합니다.',
                },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const lock = await client.query(`SELECT id, status, photo_review_status, rev
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
            if (["rejected", "cancelled"].includes(row.status)) {
                await client.query("ROLLBACK");
                return reply.status(422).send({
                    error: {
                        code: "BUSINESS_RULE_VIOLATION",
                        message: "현재 상태에서는 사진 심사를 승인할 수 없습니다.",
                    },
                });
            }
            const statusBefore = `${row.status}/${row.photo_review_status}`;
            await client.query(`UPDATE applications
           SET photo_review_status = 'approved',
               photo_reject_code = NULL,
               photo_reject_note = NULL,
               status = 'payment_pending',
               updated_at = NOW(),
               rev = rev + 1
           WHERE id = $1`, [appId]);
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "applications",
                targetId: appId,
                action: "photo_review_approve",
                statusBefore,
                statusAfter: "payment_pending/approved",
            });
            await client.query("COMMIT");
            return {
                application_id: appId,
                photo_review_status: "approved",
                status: "payment_pending",
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
    app.post("/api/v1/admin/applications/:id/reject-photo", { preHandler: requireAdmin }, async (req, reply) => handlePhotoReject(req, reply));
}
