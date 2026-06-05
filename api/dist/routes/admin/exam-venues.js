import { pool } from "../../db.js";
import { requireAdmin, requireAnyAdmin } from "../../lib/auth.js";
import { insertAuditLog } from "../../lib/admin-helpers.js";
import { cleanString, parseIntInRange } from "../../lib/validation.js";
/** venue_code 는 CHAR(2) — 1~2자 입력을 2자리(앞 0 패딩)로 정규화. */
function normalizeVenueCode(raw) {
    const s = cleanString(raw, 2);
    if (!s)
        return null;
    if (s.length === 1)
        return "0" + s;
    if (s.length === 2)
        return s;
    return null;
}
function normalizeCode3(raw, fallback) {
    if ((raw === undefined || raw === null || raw === "") && fallback)
        return fallback;
    const s = cleanString(raw, 3);
    if (!s)
        return null;
    if (!/^\d{3}$/.test(s))
        return null;
    return s;
}
function mapVenueRow(r) {
    return {
        id: Number(r.id),
        venue_code: r.venue_code,
        name_ko: r.name_ko,
        name_en: r.name_en,
        address: r.address,
        country_code: r.country_code,
        region_code: r.region_code,
        region_name: r.region_name ?? null,
        capacity: r.capacity != null ? Number(r.capacity) : null,
        note: r.note,
        is_active: r.is_active,
        rev: Number(r.rev),
    };
}
export async function adminExamVenuesRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/region-codes — 시험장 등록용 국가/지역 코드 (13자리 수험번호 기준)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/region-codes", { preHandler: requireAnyAdmin }, async (_req, reply) => {
        try {
            const { rows } = await pool.query(`SELECT country_code, region_code, name_ko, name_en
           FROM country_region_codes
           ORDER BY country_code, region_code`);
            return {
                items: rows.map((r) => ({
                    country_code: r.country_code,
                    region_code: r.region_code,
                    name_ko: r.name_ko,
                    name_en: r.name_en,
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
    // GET /api/v1/admin/exam-venues — 시험장 목록 (비활성 포함)
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-venues", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const conditions = [];
        if (req.query.active === "1" || req.query.active === "true") {
            conditions.push(`v.is_active = true`);
        }
        else if (req.query.active === "0" || req.query.active === "false") {
            conditions.push(`v.is_active = false`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        try {
            const { rows } = await pool.query(`SELECT v.id, v.venue_code, v.name_ko, v.name_en, v.address,
                  v.country_code, v.region_code, v.capacity, v.note,
                  v.is_active, v.rev, cr.name_ko AS region_name
           FROM exam_venues v
           LEFT JOIN country_region_codes cr
             ON cr.country_code = v.country_code AND cr.region_code = v.region_code
           ${where}
           ORDER BY v.venue_code`);
            return { items: rows.map(mapVenueRow) };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // GET /api/v1/admin/exam-venues/:id — 시험장 상세
    // -------------------------------------------------------------------------
    app.get("/api/v1/admin/exam-venues/:id", { preHandler: requireAnyAdmin }, async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT v.id, v.venue_code, v.name_ko, v.name_en, v.address,
                  v.country_code, v.region_code, v.capacity, v.note,
                  v.is_active, v.rev, cr.name_ko AS region_name
           FROM exam_venues v
           LEFT JOIN country_region_codes cr
             ON cr.country_code = v.country_code AND cr.region_code = v.region_code
           WHERE v.id = $1 LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "시험장을 찾을 수 없습니다." },
                });
            }
            return mapVenueRow(rows[0]);
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/exam-venues — 시험장 생성
    // -------------------------------------------------------------------------
    app.post("/api/v1/admin/exam-venues", { preHandler: requireAdmin }, async (req, reply) => {
        const body = req.body ?? {};
        const venueCode = normalizeVenueCode(body.venue_code);
        const nameKo = cleanString(body.name_ko, 100);
        const countryCode = normalizeCode3(body.country_code, "025");
        const regionCode = normalizeCode3(body.region_code);
        const capacity = parseIntInRange(body.capacity, 0, 1000000);
        if (!venueCode) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "시험장 코드(2자리)를 입력해 주세요." },
            });
        }
        if (!nameKo) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "시험장명(한국어)을 입력해 주세요." },
            });
        }
        if (!countryCode || !regionCode) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "국가/지역 코드(각 3자리)를 입력해 주세요." },
            });
        }
        if (capacity === null) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "수용 인원(정원)을 입력해 주세요." },
            });
        }
        try {
            const ins = await pool.query(`INSERT INTO exam_venues (
             venue_code, name_ko, name_en, address, country_code, region_code,
             capacity, note, is_active
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`, [
                venueCode,
                nameKo,
                cleanString(body.name_en, 120),
                cleanString(body.address, 2000),
                countryCode,
                regionCode,
                capacity,
                cleanString(body.note, 2000),
                body.is_active === undefined ? true : !!body.is_active,
            ]);
            const venueId = Number(ins.rows[0].id);
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "exam_venues",
                targetId: venueId,
                action: "venue_create",
                payload: { venue_code: venueCode, name_ko: nameKo },
            });
            return reply.status(201).send({ id: venueId, created: true });
        }
        catch (err) {
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_CODE", message: "이미 존재하는 시험장 코드입니다." },
                });
            }
            if (err?.code === "23503") {
                return reply.status(400).send({
                    error: {
                        code: "INVALID_REGION",
                        message: "등록되지 않은 국가/지역 코드입니다. 지역 코드를 먼저 등록해 주세요.",
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
    // PATCH /api/v1/admin/exam-venues/:id — 시험장 수정
    //   venue_code 는 13자리 수험번호의 일부 → 접수 이력이 있으면 변경 차단.
    // -------------------------------------------------------------------------
    app.patch("/api/v1/admin/exam-venues/:id", { preHandler: requireAdmin }, async (req, reply) => {
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
        if (body.venue_code !== undefined) {
            const vc = normalizeVenueCode(body.venue_code);
            if (!vc) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "시험장 코드(2자리)가 올바르지 않습니다." },
                });
            }
            // 접수 이력이 있으면 코드 변경 금지 (수험번호 일관성)
            const used = await pool.query(`SELECT 1 FROM applications WHERE exam_venue_id = $1 LIMIT 1`, [id]);
            if (used.rows.length > 0) {
                return reply.status(409).send({
                    error: {
                        code: "CODE_LOCKED",
                        message: "접수 이력이 있는 시험장의 코드는 변경할 수 없습니다.",
                    },
                });
            }
            setField("venue_code", vc);
        }
        if (body.name_ko !== undefined) {
            const v = cleanString(body.name_ko, 100);
            if (!v) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "시험장명(한국어)은 비울 수 없습니다." },
                });
            }
            setField("name_ko", v);
        }
        if (body.name_en !== undefined)
            setField("name_en", cleanString(body.name_en, 120));
        if (body.address !== undefined)
            setField("address", cleanString(body.address, 2000));
        if (body.country_code !== undefined) {
            const c = normalizeCode3(body.country_code);
            if (!c) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "국가 코드(3자리)가 올바르지 않습니다." },
                });
            }
            setField("country_code", c);
        }
        if (body.region_code !== undefined) {
            const c = normalizeCode3(body.region_code);
            if (!c) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "지역 코드(3자리)가 올바르지 않습니다." },
                });
            }
            setField("region_code", c);
        }
        if (body.capacity !== undefined) {
            const c = parseIntInRange(body.capacity, 0, 1000000);
            if (c === null) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "정원 값이 올바르지 않습니다." },
                });
            }
            setField("capacity", c);
        }
        if (body.note !== undefined)
            setField("note", cleanString(body.note, 2000));
        if (body.is_active !== undefined)
            setField("is_active", !!body.is_active);
        if (sets.length === 0) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "변경할 항목이 없습니다." },
            });
        }
        sets.push(`updated_at = NOW()`, `rev = rev + 1`);
        params.push(id);
        try {
            const upd = await pool.query(`UPDATE exam_venues SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`, params);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "시험장을 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "exam_venues",
                targetId: id,
                action: "venue_update",
            });
            return { id, updated: true };
        }
        catch (err) {
            if (err?.code === "23505") {
                return reply.status(409).send({
                    error: { code: "DUPLICATE_CODE", message: "이미 존재하는 시험장 코드입니다." },
                });
            }
            if (err?.code === "23503") {
                return reply.status(400).send({
                    error: { code: "INVALID_REGION", message: "등록되지 않은 국가/지역 코드입니다." },
                });
            }
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/admin/exam-venues/:id/deactivate | /activate — 사용 여부 토글
    // -------------------------------------------------------------------------
    const setActive = (active) => async (req, reply) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const upd = await pool.query(`UPDATE exam_venues
           SET is_active = $2, updated_at = NOW(), rev = rev + 1
           WHERE id = $1 RETURNING id, is_active`, [id, active]);
            if (upd.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "시험장을 찾을 수 없습니다." },
                });
            }
            await insertAuditLog(pool, {
                adminId: req.authAdmin.id,
                targetTable: "exam_venues",
                targetId: id,
                action: active ? "venue_activate" : "venue_deactivate",
                statusAfter: active ? "active" : "inactive",
            });
            return { id, is_active: upd.rows[0].is_active };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    };
    app.post("/api/v1/admin/exam-venues/:id/deactivate", { preHandler: requireAdmin }, setActive(false));
    app.post("/api/v1/admin/exam-venues/:id/activate", { preHandler: requireAdmin }, setActive(true));
}
