import { pool } from "../db.js";
import { requireFoUser } from "../lib/auth.js";
function displayStatus(status, photoReview, paymentStatus) {
    if (status === "cancelled")
        return "cancelled";
    if (status === "rejected")
        return "rejected";
    if (status === "exam_number_assigned")
        return "exam_number_assigned";
    if (status === "approved")
        return "approved";
    if (status === "payment_pending")
        return "payment_pending";
    if (status === "photo_review")
        return "photo_review";
    if (status === "submitted") {
        if (photoReview === "rejected")
            return "rejected";
        if (photoReview === "approved" && paymentStatus === "unpaid")
            return "payment_pending";
        if (photoReview === "pending")
            return "submitted";
        return "submitted";
    }
    return status;
}
function foCardStatus(display) {
    const map = {
        submitted: "applied",
        photo_review: "photo",
        payment_pending: "pay",
        approved: "approved",
        exam_number_assigned: "number",
        rejected: "rejected",
        cancelled: "cancel",
    };
    return map[display] ?? "applied";
}
function statusLabelKo(display) {
    const labels = {
        submitted: "접수완료",
        photo_review: "사진 심사 중",
        payment_pending: "수납대기",
        approved: "승인완료",
        exam_number_assigned: "수험번호 부여",
        rejected: "반려",
        cancelled: "취소됨",
    };
    return labels[display] ?? display;
}
function levelLabel(level) {
    return level === "II" ? "TOPIK Ⅱ" : "TOPIK Ⅰ";
}
function formatExamDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return String(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${y}.${m}.${day} (${weekdays[d.getDay()]})`;
}
function formatDateShort(iso) {
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
function photoRejectLabel(code) {
    const map = {
        not_frontal: "정면 아님",
        hat_glasses: "모자·안경",
        bw_photo: "흑백 사진",
        blurry: "흐림",
        not_self: "본인 아님",
        other: "기타",
    };
    return code ? map[code] ?? code : "반려";
}
function pickCardDisplay(levels) {
    const priority = [
        "rejected",
        "cancelled",
        "submitted",
        "photo_review",
        "payment_pending",
        "approved",
        "exam_number_assigned",
    ];
    for (const p of priority) {
        if (levels.some((l) => l.display_status === p))
            return p;
    }
    return levels[0]?.display_status ?? "submitted";
}
function isPastExam(examDate) {
    const d = new Date(examDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
}
export async function applicationsRoutes(app) {
    app.get("/api/v1/applications", { preHandler: requireFoUser }, async (req, reply) => {
        const userId = req.authUser.id;
        try {
            const { rows } = await pool.query(`SELECT
             a.id AS application_id,
             a.submission_id,
             a.exam_level,
             a.application_no,
             a.exam_number,
             a.status,
             a.photo_review_status,
             a.photo_reject_code,
             a.photo_reject_note,
             a.payment_status,
             a.paid_at,
             a.cancelled_at,
             a.cancel_reason,
             a.created_at AS application_created_at,
             s.submitted_at,
             r.id AS round_id,
             r.round_no,
             r.title AS round_title,
             r.exam_date,
             r.exam_number_visible_at,
             v.id AS venue_id,
             v.venue_code,
             v.name_ko AS venue_name
           FROM applications a
           INNER JOIN application_submissions s ON s.id = a.submission_id
           INNER JOIN exam_rounds r ON r.id = a.exam_round_id
           INNER JOIN exam_venues v ON v.id = a.exam_venue_id
           WHERE a.user_id = $1
           ORDER BY s.submitted_at DESC, a.exam_level`, [userId]);
            const now = new Date();
            const bySubmission = new Map();
            for (const row of rows) {
                const subId = Number(row.submission_id);
                const disp = displayStatus(row.status, row.photo_review_status, row.payment_status);
                const visibleAt = row.exam_number_visible_at
                    ? new Date(row.exam_number_visible_at)
                    : null;
                const examNumberVisible = !!row.exam_number &&
                    (!visibleAt || visibleAt <= now);
                const canCancel = ["submitted", "photo_review", "payment_pending"].includes(row.status) && row.payment_status === "unpaid";
                const levelItem = {
                    application_id: Number(row.application_id),
                    exam_level: row.exam_level,
                    application_no: row.application_no,
                    display_status: disp,
                    fo_card_status: foCardStatus(disp),
                    status_label: statusLabelKo(disp),
                    photo_review_status: row.photo_review_status,
                    photo_reject_code: row.photo_reject_code,
                    photo_reject_note: row.photo_reject_note,
                    payment_status: row.payment_status,
                    exam_number: examNumberVisible ? row.exam_number : null,
                    exam_number_visible: examNumberVisible,
                    can_cancel: canCancel,
                    submitted_at: row.submitted_at,
                    application_created_at: row.application_created_at,
                    cancelled_at: row.cancelled_at,
                    cancel_reason: row.cancel_reason,
                };
                if (!bySubmission.has(subId)) {
                    bySubmission.set(subId, {
                        submission_id: subId,
                        submitted_at: row.submitted_at,
                        exam_round: {
                            id: Number(row.round_id),
                            round_no: Number(row.round_no),
                            title: row.round_title,
                            exam_date: row.exam_date instanceof Date
                                ? row.exam_date.toISOString().slice(0, 10)
                                : String(row.exam_date).slice(0, 10),
                        },
                        venue: {
                            id: Number(row.venue_id),
                            venue_code: row.venue_code,
                            name_ko: row.venue_name,
                        },
                        levels: [],
                    });
                }
                bySubmission.get(subId).levels.push(levelItem);
            }
            const items = Array.from(bySubmission.values()).map((item) => {
                const cardDisplay = pickCardDisplay(item.levels);
                const allCancelled = item.levels.every((l) => l.display_status === "cancelled");
                const tab = allCancelled || isPastExam(item.exam_round.exam_date)
                    ? "past"
                    : "active";
                const levelLabels = item.levels.map((l) => levelLabel(l.exam_level));
                const levelsText = levelLabels.length > 1
                    ? levelLabels.join(" · ") + " (동시 접수)"
                    : levelLabels[0] ?? "";
                return {
                    ...item,
                    tab,
                    fo_card_status: foCardStatus(cardDisplay),
                    card_display_status: cardDisplay,
                    card_status_label: statusLabelKo(cardDisplay),
                    levels_text: levelsText,
                    exam_date_formatted: formatExamDate(item.exam_round.exam_date),
                    submitted_at_formatted: formatDateShort(item.submitted_at),
                };
            });
            const active = items.filter((i) => i.tab === "active");
            const past = items.filter((i) => i.tab === "past");
            return {
                items,
                active,
                past,
                pagination: {
                    page: 1,
                    page_size: 100,
                    total_items: items.length,
                    total_pages: 1,
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
    app.post("/api/v1/application-submissions/:submissionId/cancel", { preHandler: requireFoUser }, async (req, reply) => {
        const userId = req.authUser.id;
        const submissionId = Number(req.params.submissionId);
        const reason = String(req.body?.reason ?? "").trim() || "사용자 취소";
        if (!Number.isFinite(submissionId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const subRes = await client.query(`SELECT id, user_id FROM application_submissions
           WHERE id = $1 FOR UPDATE`, [submissionId]);
            if (subRes.rows.length === 0 || Number(subRes.rows[0].user_id) !== userId) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 내역을 찾을 수 없습니다." },
                });
            }
            const appsRes = await client.query(`SELECT id, status, payment_status
           FROM applications
           WHERE submission_id = $1 AND user_id = $2
           FOR UPDATE`, [submissionId, userId]);
            if (appsRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "접수 건이 없습니다." },
                });
            }
            for (const app of appsRes.rows) {
                if (app.status === "cancelled")
                    continue;
                if (app.payment_status === "paid") {
                    await client.query("ROLLBACK");
                    return reply.status(422).send({
                        error: {
                            code: "BUSINESS_RULE_VIOLATION",
                            message: "오프라인 수납이 완료된 접수는 취소할 수 없습니다. 환불·정보정정신청 게시판을 이용해 주세요.",
                        },
                    });
                }
                if (!["submitted", "photo_review", "payment_pending"].includes(app.status)) {
                    await client.query("ROLLBACK");
                    return reply.status(422).send({
                        error: {
                            code: "BUSINESS_RULE_VIOLATION",
                            message: "현재 상태에서는 접수를 취소할 수 없습니다.",
                        },
                    });
                }
            }
            const now = new Date();
            for (const app of appsRes.rows) {
                if (app.status === "cancelled")
                    continue;
                await client.query(`UPDATE applications
             SET status = 'cancelled', cancelled_at = $1, cancel_reason = $2,
                 updated_at = NOW(), rev = rev + 1
             WHERE id = $3`, [now, reason, app.id]);
            }
            await client.query("COMMIT");
            return {
                submission_id: submissionId,
                cancelled: true,
                message: "접수가 취소되었습니다.",
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
