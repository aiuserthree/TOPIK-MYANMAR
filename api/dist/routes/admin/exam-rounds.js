import { createRequire } from "node:module";
import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { buildExamNumber, insertAuditLog, jobLabel, motiveLabel, purposeLabel, } from "../../lib/admin-helpers.js";
import { readFileBuffer } from "../../lib/storage.js";
import { cleanString, parseDateOrNull, parseIntInRange, } from "../../lib/validation.js";
const ROUND_STATUSES = new Set(["scheduled", "open", "closed"]);
/** YYYY-MM-DD only (DATE columns). */
function parseDateOnly(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return null;
    const d = new Date(s + "T00:00:00Z");
    return Number.isNaN(d.getTime()) ? null : s;
}
function parseFee(raw) {
    if (raw === undefined)
        return undefined;
    if (raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0)
        return undefined;
    return n;
}
/**
 * Replace a round's venue mapping. Removals are skipped for venues that already
 * have applications in the round (avoids orphaning applicants); returns skipped.
 */
async function syncRoundVenues(client, roundId, venueIds) {
    const desired = Array.from(new Set(venueIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
    const existingRes = await client.query(`SELECT exam_venue_id FROM exam_round_venues WHERE exam_round_id = $1`, [roundId]);
    const existing = existingRes.rows.map((r) => Number(r.exam_venue_id));
    const toAdd = desired.filter((v) => !existing.includes(v));
    const toRemove = existing.filter((v) => !desired.includes(v));
    const skipped = [];
    for (const v of toAdd) {
        await client.query(`INSERT INTO exam_round_venues (exam_round_id, exam_venue_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`, [roundId, v]);
    }
    for (const v of toRemove) {
        const used = await client.query(`SELECT 1 FROM applications WHERE exam_round_id = $1 AND exam_venue_id = $2 LIMIT 1`, [roundId, v]);
        if (used.rows.length > 0) {
            skipped.push(v);
            continue;
        }
        await client.query(`DELETE FROM exam_round_venues WHERE exam_round_id = $1 AND exam_venue_id = $2`, [roundId, v]);
    }
    return { skipped };
}
// 연명부 양식 컬럼 (기능정의서 BO/02 §2 — 연락처/이메일 제외)
const ROSTER_COLUMNS = [
    { header: "연번", key: "seq", width: 6 },
    { header: "한글성명", key: "name_ko", width: 14 },
    { header: "영문성명", key: "name_en", width: 22 },
    { header: "생년월일", key: "birth", width: 12 },
    { header: "성별", key: "gender", width: 6 },
    { header: "국적", key: "nationality", width: 12 },
    { header: "제1언어", key: "first_language", width: 12 },
    { header: "직업", key: "job", width: 12 },
    { header: "응시동기", key: "motive", width: 14 },
    { header: "응시목적", key: "purpose", width: 14 },
    { header: "수험번호", key: "exam_number", width: 16 },
];
function contentDispositionUtf8(filename) {
    const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
// Optional deps loaded via createRequire so CJS exports resolve deterministically
// (dynamic `import()` interop for archiver/exceljs is inconsistent across versions).
const nodeRequire = createRequire(import.meta.url);
function loadExcelJS() {
    try {
        const ExcelJS = nodeRequire("exceljs");
        return (ExcelJS.Workbook ?? ExcelJS.default?.Workbook);
    }
    catch {
        return null;
    }
}
function loadArchiver() {
    try {
        const mod = nodeRequire("archiver");
        return (typeof mod === "function" ? mod : mod.default);
    }
    catch {
        return null;
    }
}
/** Eligible roster rows for a round (paid + photo approved + not cancelled/rejected). */
async function loadRosterRows(roundId, filter) {
    const where = [
        "a.exam_round_id = $1",
        "a.status NOT IN ('cancelled','rejected')",
    ];
    const params = [roundId];
    let i = 2;
    if (filter?.includeRefunded) {
        where.push("a.payment_status IN ('paid','refunded')");
    }
    else {
        where.push("a.payment_status = 'paid'");
    }
    if (filter?.venueId) {
        where.push(`a.exam_venue_id = $${i++}`);
        params.push(filter.venueId);
    }
    if (filter?.level) {
        where.push(`a.exam_level = $${i++}`);
        params.push(filter.level);
    }
    const { rows } = await pool.query(`SELECT a.id AS application_id, a.exam_level, a.exam_number, a.photo_file_id,
            a.photo_review_status, a.payment_status, a.status,
            v.id AS venue_id, v.venue_code, v.name_ko AS venue_name,
            v.region_code, v.country_code,
            cr.name_ko AS region_name,
            u.name_ko, u.name_en, u.birth_date, u.gender, u.nationality,
            u.first_language, u.job_code, u.motive_code, u.purpose_code
     FROM applications a
     INNER JOIN users u ON u.id = a.user_id
     INNER JOIN exam_venues v ON v.id = a.exam_venue_id
     LEFT JOIN country_region_codes cr
       ON cr.country_code = v.country_code AND cr.region_code = v.region_code
     WHERE ${where.join(" AND ")}
     ORDER BY a.exam_number ASC NULLS LAST, u.name_en ASC, a.id ASC`, params);
    return rows.map((r) => ({
        application_id: Number(r.application_id),
        exam_level: String(r.exam_level),
        venue_id: Number(r.venue_id),
        venue_code: String(r.venue_code),
        venue_name: String(r.venue_name),
        region_code: String(r.region_code),
        region_name: String(r.region_name ?? r.region_code),
        country_code: String(r.country_code),
        name_ko: String(r.name_ko ?? ""),
        name_en: String(r.name_en ?? ""),
        birth_date: String(r.birth_date ?? ""),
        gender: String(r.gender ?? ""),
        nationality: String(r.nationality ?? ""),
        first_language: String(r.first_language ?? ""),
        job_code: Number(r.job_code),
        motive_code: Number(r.motive_code),
        purpose_code: Number(r.purpose_code),
        exam_number: r.exam_number ? String(r.exam_number) : null,
        photo_file_id: r.photo_file_id ? Number(r.photo_file_id) : null,
        photo_review_status: String(r.photo_review_status),
        payment_status: String(r.payment_status),
        status: String(r.status),
    }));
}
export async function adminExamRoundsRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/exam-rounds — 회차 컨텍스트 셀렉터(읽기 전용, 통계 포함)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-rounds", { preHandler: requireAnyAdmin }, async (req, reply) => {
        try {
            const includeInactive = req.query.include_inactive === "1" ||
                req.query.include_inactive === "true";
            const { rows } = await pool.query(`SELECT r.id, r.round_no, r.title, r.exam_date,
                  r.registration_start_at, r.registration_end_at,
                  r.payment_start_at, r.payment_end_at,
                  r.result_announcement_date, r.fee_level_i, r.fee_level_ii,
                  r.registration_status, r.exam_number_visible_at, r.capacity,
                  r.is_active,
                  COUNT(a.id) FILTER (WHERE a.status NOT IN ('cancelled','rejected')) AS active_count,
                  COUNT(a.id) FILTER (WHERE a.payment_status = 'paid') AS paid_count,
                  COUNT(a.id) FILTER (WHERE a.exam_number IS NOT NULL) AS assigned_count
           FROM exam_rounds r
           LEFT JOIN applications a ON a.exam_round_id = r.id
           ${includeInactive ? "" : "WHERE r.is_active = true"}
           GROUP BY r.id
           ORDER BY r.round_no DESC`);
            const roundIds = rows.map((r) => Number(r.id));
            let venuesByRound = {};
            if (roundIds.length) {
                const venueRes = await pool.query(`SELECT rv.exam_round_id, v.id, v.venue_code, v.name_ko, v.capacity,
                    v.region_code
             FROM exam_round_venues rv
             INNER JOIN exam_venues v ON v.id = rv.exam_venue_id
             WHERE rv.exam_round_id = ANY($1::bigint[])
             ORDER BY v.venue_code`, [roundIds]);
                venuesByRound = venueRes.rows.reduce((acc, v) => {
                    const rid = Number(v.exam_round_id);
                    (acc[rid] = acc[rid] || []).push({
                        id: Number(v.id),
                        venue_code: v.venue_code,
                        name_ko: v.name_ko,
                        capacity: v.capacity != null ? Number(v.capacity) : null,
                        region_code: v.region_code,
                    });
                    return acc;
                }, {});
            }
            return {
                rounds: rows.map((r) => ({
                    id: Number(r.id),
                    round_no: Number(r.round_no),
                    title: r.title,
                    exam_date: r.exam_date,
                    registration_start_at: r.registration_start_at,
                    registration_end_at: r.registration_end_at,
                    payment_start_at: r.payment_start_at,
                    payment_end_at: r.payment_end_at,
                    result_announcement_date: r.result_announcement_date,
                    fee_level_i: r.fee_level_i,
                    fee_level_ii: r.fee_level_ii,
                    registration_status: r.registration_status,
                    exam_number_visible_at: r.exam_number_visible_at,
                    capacity: r.capacity != null ? Number(r.capacity) : null,
                    is_active: r.is_active,
                    stats: {
                        active: Number(r.active_count),
                        paid: Number(r.paid_count),
                        assigned: Number(r.assigned_count),
                    },
                    venues: venuesByRound[Number(r.id)] ?? [],
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
    // GET /api/v1/admin/exam-rounds/:roundId — 회차 상세 (수정 화면용)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-rounds/:roundId", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT id, round_no, title, exam_date, registration_start_at,
                  registration_end_at, payment_start_at, payment_end_at,
                  result_announcement_date,
                  fee_level_i, fee_level_ii, capacity, registration_status,
                  exam_number_visible_at, is_active, rev, created_at, updated_at
           FROM exam_rounds WHERE id = $1 LIMIT 1`, [roundId]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
                });
            }
            const venueRes = await pool.query(`SELECT v.id, v.venue_code, v.name_ko
           FROM exam_round_venues rv
           INNER JOIN exam_venues v ON v.id = rv.exam_venue_id
           WHERE rv.exam_round_id = $1
           ORDER BY v.venue_code`, [roundId]);
            return {
                round: rows[0],
                venues: venueRes.rows.map((v) => ({
                    id: Number(v.id),
                    venue_code: v.venue_code,
                    name_ko: v.name_ko,
                })),
                venue_ids: venueRes.rows.map((v) => Number(v.id)),
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
    // POST /api/v1/admin/exam-rounds — 회차 생성 (운영자가 DB 접근 없이 신규 회차 개설)
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/exam-rounds", { preHandler: requireAdmin }, async (req, reply) => {
        const body = req.body ?? {};
        const roundNo = parseIntInRange(body.round_no, 1, 32767);
        const title = cleanString(body.title, 100);
        const examDate = parseDateOnly(body.exam_date);
        const regStart = parseDateOrNull(body.registration_start_at);
        const regEnd = parseDateOrNull(body.registration_end_at);
        const status = ROUND_STATUSES.has(String(body.registration_status))
            ? String(body.registration_status)
            : "scheduled";
        if (roundNo === null) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "회차 번호(1~32767)를 입력해 주세요." },
            });
        }
        if (!title) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "회차 제목을 입력해 주세요." },
            });
        }
        if (!examDate) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "시험일(YYYY-MM-DD)을 입력해 주세요." },
            });
        }
        if (!regStart || !regEnd) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "접수 시작/종료 일시를 입력해 주세요." },
            });
        }
        if (regEnd <= regStart) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "접수 종료는 시작 이후여야 합니다." },
            });
        }
        const feeI = parseFee(body.fee_level_i);
        const feeII = parseFee(body.fee_level_ii);
        const capacity = body.capacity == null ? null : parseIntInRange(body.capacity, 0, 1000000);
        const resultDate = parseDateOnly(body.result_announcement_date);
        const visibleAt = parseDateOrNull(body.exam_number_visible_at);
        const payStart = parseDateOrNull(body.payment_start_at);
        const payEnd = parseDateOrNull(body.payment_end_at);
        const isActive = body.is_active === undefined ? true : !!body.is_active;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const ins = await client.query(`INSERT INTO exam_rounds (
             round_no, title, exam_date, registration_start_at, registration_end_at,
             payment_start_at, payment_end_at,
             result_announcement_date, fee_level_i, fee_level_ii, capacity,
             registration_status, exam_number_visible_at, is_active
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id`, [
                roundNo,
                title,
                examDate,
                regStart,
                regEnd,
                payStart,
                payEnd,
                resultDate,
                feeI === undefined ? null : feeI,
                feeII === undefined ? null : feeII,
                capacity,
                status,
                visibleAt,
                isActive,
            ]);
            const roundId = Number(ins.rows[0].id);
            let skipped = [];
            if (Array.isArray(body.venue_ids) && body.venue_ids.length > 0) {
                ({ skipped } = await syncRoundVenues(client, roundId, body.venue_ids));
            }
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "exam_rounds",
                targetId: roundId,
                action: "round_create",
                statusAfter: status,
                payload: { round_no: roundNo, title },
            });
            await client.query("COMMIT");
            return reply.status(201).send({ id: roundId, created: true, venue_skipped: skipped });
        }
        catch (err) {
            await client.query("ROLLBACK");
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_ROUND_NO", message: "이미 존재하는 회차 번호입니다." },
                });
            }
            if (err?.code === "23503") {
                return reply.status(400).send({
                    error: { code: "INVALID_VENUE", message: "존재하지 않는 시험장이 포함되어 있습니다." },
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
    // PATCH /api/v1/admin/exam-rounds/:roundId — 회차 수정 (기간·정원·응시료·시험장 매핑)
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/exam-rounds/:roundId", { preHandler: requireAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        const body = req.body ?? {};
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const cur = await client.query(`SELECT id, registration_start_at, registration_end_at
           FROM exam_rounds WHERE id = $1 FOR UPDATE`, [roundId]);
            if (cur.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
                });
            }
            const sets = [];
            const params = [];
            let idx = 1;
            const setField = (col, val) => {
                sets.push(`${col} = $${idx++}`);
                params.push(val);
            };
            if (body.title !== undefined) {
                const t = cleanString(body.title, 100);
                if (!t) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "회차 제목을 입력해 주세요." },
                    });
                }
                setField("title", t);
            }
            if (body.exam_date !== undefined) {
                const d = parseDateOnly(body.exam_date);
                if (!d) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "시험일 형식이 올바르지 않습니다." },
                    });
                }
                setField("exam_date", d);
            }
            if (body.registration_start_at !== undefined) {
                const d = parseDateOrNull(body.registration_start_at);
                if (!d) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "접수 시작 일시가 올바르지 않습니다." },
                    });
                }
                setField("registration_start_at", d);
            }
            if (body.registration_end_at !== undefined) {
                const d = parseDateOrNull(body.registration_end_at);
                if (!d) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "접수 종료 일시가 올바르지 않습니다." },
                    });
                }
                setField("registration_end_at", d);
            }
            if (body.payment_start_at !== undefined) {
                if (body.payment_start_at === null || body.payment_start_at === "") {
                    setField("payment_start_at", null);
                }
                else {
                    const d = parseDateOrNull(body.payment_start_at);
                    if (!d) {
                        await client.query("ROLLBACK");
                        return reply.status(400).send({
                            error: { code: "VALIDATION_ERROR", message: "납부 시작 일시가 올바르지 않습니다." },
                        });
                    }
                    setField("payment_start_at", d);
                }
            }
            if (body.payment_end_at !== undefined) {
                if (body.payment_end_at === null || body.payment_end_at === "") {
                    setField("payment_end_at", null);
                }
                else {
                    const d = parseDateOrNull(body.payment_end_at);
                    if (!d) {
                        await client.query("ROLLBACK");
                        return reply.status(400).send({
                            error: { code: "VALIDATION_ERROR", message: "납부 종료 일시가 올바르지 않습니다." },
                        });
                    }
                    setField("payment_end_at", d);
                }
            }
            if (body.result_announcement_date !== undefined) {
                if (body.result_announcement_date === null || body.result_announcement_date === "") {
                    setField("result_announcement_date", null);
                }
                else {
                    const d = parseDateOnly(body.result_announcement_date);
                    if (!d) {
                        await client.query("ROLLBACK");
                        return reply.status(400).send({
                            error: { code: "VALIDATION_ERROR", message: "결과 발표일 형식이 올바르지 않습니다." },
                        });
                    }
                    setField("result_announcement_date", d);
                }
            }
            if (body.fee_level_i !== undefined) {
                const f = parseFee(body.fee_level_i);
                if (f === undefined) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "응시료(Ⅰ) 값이 올바르지 않습니다." },
                    });
                }
                setField("fee_level_i", f);
            }
            if (body.fee_level_ii !== undefined) {
                const f = parseFee(body.fee_level_ii);
                if (f === undefined) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "응시료(Ⅱ) 값이 올바르지 않습니다." },
                    });
                }
                setField("fee_level_ii", f);
            }
            if (body.capacity !== undefined) {
                if (body.capacity === null) {
                    setField("capacity", null);
                }
                else {
                    const c = parseIntInRange(body.capacity, 0, 1000000);
                    if (c === null) {
                        await client.query("ROLLBACK");
                        return reply.status(400).send({
                            error: { code: "VALIDATION_ERROR", message: "정원 값이 올바르지 않습니다." },
                        });
                    }
                    setField("capacity", c);
                }
            }
            if (body.registration_status !== undefined) {
                const st = String(body.registration_status);
                if (!ROUND_STATUSES.has(st)) {
                    await client.query("ROLLBACK");
                    return reply.status(400).send({
                        error: { code: "VALIDATION_ERROR", message: "유효하지 않은 접수 상태입니다." },
                    });
                }
                setField("registration_status", st);
            }
            if (body.exam_number_visible_at !== undefined) {
                if (body.exam_number_visible_at === null || body.exam_number_visible_at === "") {
                    setField("exam_number_visible_at", null);
                }
                else {
                    const d = parseDateOrNull(body.exam_number_visible_at);
                    if (!d) {
                        await client.query("ROLLBACK");
                        return reply.status(400).send({
                            error: { code: "VALIDATION_ERROR", message: "수험번호 노출 일시가 올바르지 않습니다." },
                        });
                    }
                    setField("exam_number_visible_at", d);
                }
            }
            if (body.is_active !== undefined)
                setField("is_active", !!body.is_active);
            let skipped = [];
            if (Array.isArray(body.venue_ids)) {
                ({ skipped } = await syncRoundVenues(client, roundId, body.venue_ids));
            }
            if (sets.length === 0 && !Array.isArray(body.venue_ids)) {
                await client.query("ROLLBACK");
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
                });
            }
            if (sets.length > 0) {
                sets.push(`updated_at = NOW()`, `rev = rev + 1`);
                params.push(roundId);
                await client.query(`UPDATE exam_rounds SET ${sets.join(", ")} WHERE id = $${idx}`, params);
            }
            await insertAuditLog(client, {
                adminId: req.authAdmin.id,
                targetTable: "exam_rounds",
                targetId: roundId,
                action: "round_update",
            });
            await client.query("COMMIT");
            return { id: roundId, updated: true, venue_skipped: skipped };
        }
        catch (err) {
            await client.query("ROLLBACK");
            if (err?.code === "23503") {
                return reply.status(400).send({
                    error: { code: "INVALID_VENUE", message: "존재하지 않는 시험장이 포함되어 있습니다." },
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
    // POST /api/v1/admin/exam-rounds/:roundId/status — 접수 상태 전환(open/close/scheduled)
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/exam-rounds/:roundId/status", { preHandler: requireAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        const status = String(req.body?.registration_status ?? "");
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!ROUND_STATUSES.has(status)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 접수 상태입니다." },
            });
        }
        try {
            const cur = await pool.query(`SELECT registration_status FROM exam_rounds WHERE id = $1`, [roundId]);
            if (cur.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
                });
            }
            const before = String(cur.rows[0].registration_status);
            await pool.query(`UPDATE exam_rounds
           SET registration_status = $2, updated_at = NOW(), rev = rev + 1
           WHERE id = $1`, [roundId, status]);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "exam_rounds",
                targetId: roundId,
                action: "round_status_change",
                statusBefore: before,
                statusAfter: status,
            });
            return { id: roundId, registration_status: status };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/exam-rounds/:roundId/assign-exam-numbers
    //   수납 마감 후 일괄 13자리 채번. 영문성명 알파벳순. Idempotent.
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/exam-rounds/:roundId/assign-exam-numbers", { preHandler: requireAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        const dryRun = !!req.body?.dry_run;
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Round-level lock prevents concurrent bulk assignment.
            const roundRes = await client.query(`SELECT id, round_no FROM exam_rounds WHERE id = $1 FOR UPDATE`, [roundId]);
            if (roundRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
                });
            }
            const eligible = await client.query(`SELECT a.id, a.exam_level, a.exam_venue_id,
                  v.venue_code, v.country_code, v.region_code
           FROM applications a
           INNER JOIN users u ON u.id = a.user_id
           INNER JOIN exam_venues v ON v.id = a.exam_venue_id
           WHERE a.exam_round_id = $1
             AND a.payment_status = 'paid'
             AND a.photo_review_status = 'approved'
             AND a.status NOT IN ('cancelled','rejected')
             AND a.exam_number IS NULL
           ORDER BY u.name_en ASC, a.id ASC
           FOR UPDATE OF a`, [roundId]);
            // Starting serial per (venue, level): max(seq.last_serial, existing max).
            const seqRes = await client.query(`SELECT exam_venue_id, exam_level, last_serial
           FROM exam_number_sequences WHERE exam_round_id = $1 FOR UPDATE`, [roundId]);
            const existingRes = await client.query(`SELECT exam_venue_id, exam_level,
                  MAX(RIGHT(exam_number, 4)::int) AS max_serial
           FROM applications
           WHERE exam_round_id = $1 AND exam_number IS NOT NULL
           GROUP BY exam_venue_id, exam_level`, [roundId]);
            const serialMap = new Map();
            for (const s of seqRes.rows) {
                serialMap.set(`${s.exam_venue_id}_${s.exam_level}`, Number(s.last_serial));
            }
            for (const e of existingRes.rows) {
                const key = `${e.exam_venue_id}_${e.exam_level}`;
                const cur = serialMap.get(key) ?? 0;
                serialMap.set(key, Math.max(cur, Number(e.max_serial ?? 0)));
            }
            const assignments = [];
            for (const row of eligible.rows) {
                const key = `${row.exam_venue_id}_${row.exam_level}`;
                const next = (serialMap.get(key) ?? 0) + 1;
                serialMap.set(key, next);
                const examNumber = buildExamNumber({
                    countryCode: String(row.country_code),
                    regionCode: String(row.region_code),
                    level: String(row.exam_level),
                    venueCode: String(row.venue_code),
                    serial: next,
                });
                assignments.push({
                    application_id: Number(row.id),
                    exam_number: examNumber,
                    exam_level: String(row.exam_level),
                    venue_code: String(row.venue_code),
                });
                if (!dryRun) {
                    await client.query(`UPDATE applications
               SET exam_number = $2, status = 'exam_number_assigned',
                   updated_at = NOW(), rev = rev + 1
               WHERE id = $1`, [row.id, examNumber]);
                }
            }
            if (!dryRun) {
                // Persist last_serial per (venue, level).
                for (const [key, serial] of serialMap.entries()) {
                    const [venueId, level] = key.split("_");
                    await client.query(`INSERT INTO exam_number_sequences (exam_round_id, exam_venue_id, exam_level, last_serial)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (exam_round_id, exam_venue_id, exam_level)
               DO UPDATE SET last_serial = EXCLUDED.last_serial`, [roundId, Number(venueId), level, serial]);
                }
                if (req.body?.visible_at) {
                    const d = new Date(req.body.visible_at);
                    if (!Number.isNaN(d.getTime())) {
                        await client.query(`UPDATE exam_rounds SET exam_number_visible_at = $2, updated_at = NOW() WHERE id = $1`, [roundId, d]);
                    }
                }
                await insertAuditLog(client, {
                    adminId: req.authAdmin.id,
                    targetTable: "exam_rounds",
                    targetId: roundId,
                    action: "exam_number_assign",
                    statusAfter: `assigned:${assignments.length}`,
                    payload: { assigned: assignments.length },
                });
            }
            // Count already-assigned (for reporting).
            const assignedTotal = await client.query(`SELECT COUNT(*)::int AS n FROM applications
           WHERE exam_round_id = $1 AND exam_number IS NOT NULL`, [roundId]);
            if (dryRun) {
                await client.query("ROLLBACK");
            }
            else {
                await client.query("COMMIT");
            }
            return {
                round_id: roundId,
                dry_run: dryRun,
                assigned_now: assignments.length,
                total_assigned: dryRun
                    ? Number(assignedTotal.rows[0].n) + assignments.length
                    : Number(assignedTotal.rows[0].n),
                samples: assignments.slice(0, 10),
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
    // GET /api/v1/admin/exam-rounds/:roundId/roster.xlsx — 연명부 양식 엑셀
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-rounds/:roundId/roster.xlsx", { preHandler: requireAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const Workbook = await loadExcelJS();
        if (!Workbook) {
            return reply.status(501).send({
                error: { code: "DEP_MISSING", message: "exceljs 미설치 — npm install exceljs 후 사용하세요." },
            });
        }
        try {
            const roundRes = await pool.query(`SELECT round_no, title FROM exam_rounds WHERE id = $1`, [roundId]);
            if (roundRes.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
                });
            }
            const roundNo = Number(roundRes.rows[0].round_no);
            const venueId = req.query.exam_venue_id ? Number(req.query.exam_venue_id) : undefined;
            const level = req.query.level && ["I", "II"].includes(String(req.query.level).toUpperCase())
                ? String(req.query.level).toUpperCase()
                : undefined;
            const rows = await loadRosterRows(roundId, { venueId, level });
            // Group rows by (venue, level) → one worksheet each (연명부 분할 원칙).
            const groups = new Map();
            for (const r of rows) {
                const key = `${r.venue_code}_${r.exam_level}`;
                (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
            }
            const wb = new Workbook();
            wb.creator = "TOPIK Myanmar BO";
            if (groups.size === 0) {
                const ws = wb.addWorksheet("연명부");
                ws.columns = ROSTER_COLUMNS;
            }
            else {
                for (const [, list] of groups) {
                    const first = list[0];
                    const sheetName = `TOPIK${first.exam_level === "II" ? "II" : "I"}_${first.venue_name}`
                        .replace(/[\\/*?:[\]]/g, " ")
                        .slice(0, 31);
                    const ws = wb.addWorksheet(sheetName);
                    ws.columns = ROSTER_COLUMNS;
                    ws.getRow(1).font = { bold: true };
                    list.forEach((r, idx) => {
                        ws.addRow({
                            seq: idx + 1,
                            name_ko: r.name_ko,
                            name_en: r.name_en,
                            birth: r.birth_date,
                            gender: r.gender,
                            nationality: r.nationality,
                            first_language: r.first_language,
                            job: jobLabel(r.job_code),
                            motive: motiveLabel(r.motive_code),
                            purpose: purposeLabel(r.purpose_code),
                            exam_number: r.exam_number ?? "",
                        });
                    });
                }
            }
            const buffer = await wb.xlsx.writeBuffer();
            const filename = `제${roundNo}회 TOPIK 지원자 연명부.xlsx`;
            reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            reply.header("Content-Disposition", contentDispositionUtf8(filename));
            return reply.send(Buffer.from(buffer));
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/exam-rounds/:roundId/photos.zip — 사진 일괄 다운로드
    //   {지역}/{시험장}/TOPIK_Ⅰ|Ⅱ/{수험번호}.jpg + 누락_리포트.xlsx
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-rounds/:roundId/photos.zip", { preHandler: requireAdmin }, async (req, reply) => {
        const roundId = Number(req.params.roundId);
        if (!Number.isFinite(roundId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        const archiverFn = await loadArchiver();
        if (!archiverFn) {
            return reply.status(501).send({
                error: { code: "DEP_MISSING", message: "archiver 미설치 — npm install archiver 후 사용하세요." },
            });
        }
        const roundRes = await pool.query(`SELECT round_no FROM exam_rounds WHERE id = $1`, [roundId]);
        if (roundRes.rows.length === 0) {
            return reply.status(404).send({
                error: { code: "NOT_FOUND", message: "회차를 찾을 수 없습니다." },
            });
        }
        const roundNo = Number(roundRes.rows[0].round_no);
        const venueId = req.query.exam_venue_id ? Number(req.query.exam_venue_id) : undefined;
        const level = req.query.level && ["I", "II"].includes(String(req.query.level).toUpperCase())
            ? String(req.query.level).toUpperCase()
            : undefined;
        // includeRefunded: 환불자도 사진 폴더 포함(수험번호 유지)
        const rows = await loadRosterRows(roundId, {
            venueId,
            level,
            includeRefunded: true,
        });
        const archive = archiverFn("zip", { zlib: { level: 9 } });
        reply.hijack();
        reply.raw.setHeader("Content-Type", "application/zip");
        reply.raw.setHeader("Content-Disposition", contentDispositionUtf8(`제${roundNo}회 TOPIK 사진.zip`));
        archive.on("error", (e) => app.log.error(e));
        archive.pipe(reply.raw);
        const missing = [];
        for (const r of rows) {
            const levelFolder = r.exam_level === "II" ? "TOPIK_II" : "TOPIK_I";
            const folder = `${r.region_name}/${r.venue_name}/${levelFolder}`;
            if (!r.exam_number) {
                missing.push({ name_ko: r.name_ko, name_en: r.name_en, exam_number: "", reason: "수험번호 미부여" });
                continue;
            }
            if (r.photo_review_status !== "approved") {
                missing.push({ name_ko: r.name_ko, name_en: r.name_en, exam_number: r.exam_number, reason: "사진 미승인/반려" });
                continue;
            }
            if (!r.photo_file_id) {
                missing.push({ name_ko: r.name_ko, name_en: r.name_en, exam_number: r.exam_number, reason: "사진 누락" });
                continue;
            }
            const fileRes = await pool.query(`SELECT id, owner_type, owner_id, storage_key, original_filename, mime_type, size_bytes
           FROM file_attachments WHERE id = $1`, [r.photo_file_id]);
            const buf = fileRes.rows.length > 0
                ? await readFileBuffer(fileRes.rows[0])
                : null;
            if (!buf) {
                missing.push({ name_ko: r.name_ko, name_en: r.name_en, exam_number: r.exam_number, reason: "사진 파일 없음(레거시/누락)" });
                continue;
            }
            archive.append(buf, { name: `${folder}/${r.exam_number}.jpg` });
        }
        // 누락 리포트 (xlsx) — exceljs 있을 때만
        if (missing.length > 0) {
            const Workbook = await loadExcelJS();
            if (Workbook) {
                const wb = new Workbook();
                const ws = wb.addWorksheet("누락_리포트");
                ws.columns = [
                    { header: "한글성명", key: "name_ko", width: 14 },
                    { header: "영문성명", key: "name_en", width: 22 },
                    { header: "수험번호", key: "exam_number", width: 16 },
                    { header: "사유", key: "reason", width: 22 },
                ];
                ws.getRow(1).font = { bold: true };
                missing.forEach((m) => ws.addRow(m));
                const buffer = await wb.xlsx.writeBuffer();
                archive.append(Buffer.from(buffer), { name: "누락_리포트.xlsx" });
            }
        }
        await archive.finalize();
        return reply;
    });
}
