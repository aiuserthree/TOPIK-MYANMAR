import { pool } from "../db.js";
const TERM_TYPES = new Set(["service", "privacy", "marketing"]);
const TERM_TYPE_LABEL = {
    service: "서비스 이용약관",
    privacy: "개인정보처리방침",
    marketing: "마케팅 수신 동의",
};
function pickBody(lang, ko, my, en) {
    if (lang === "my" && my)
        return my;
    if (lang === "en" && en)
        return en;
    return ko;
}
export async function termsRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/v1/terms — 게시 중인 약관(종류별 최신본) 목록 (본문 제외)
    // -------------------------------------------------------------------------
    app.get("/api/v1/terms", async (_req, reply) => {
        try {
            const { rows } = await pool.query(`SELECT DISTINCT ON (term_type)
                id, term_type, version, effective_at
         FROM terms
         WHERE status = 'published'
         ORDER BY term_type, effective_at DESC NULLS LAST, id DESC`);
            return {
                items: rows.map((r) => ({
                    id: Number(r.id),
                    term_type: r.term_type,
                    term_type_label: TERM_TYPE_LABEL[r.term_type] ?? r.term_type,
                    version: r.version,
                    effective_at: r.effective_at,
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
    // GET /api/v1/terms/:type — 종류별 최신 게시본 (본문 포함, ?lang=ko|my|en)
    // -------------------------------------------------------------------------
    app.get("/api/v1/terms/:type", async (req, reply) => {
        const type = String(req.params.type ?? "").trim();
        if (!TERM_TYPES.has(type)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "유효하지 않은 약관 종류입니다." },
            });
        }
        const lang = (req.query.lang || "ko").toLowerCase();
        try {
            const { rows } = await pool.query(`SELECT id, term_type, version, body_ko, body_my, body_en, effective_at
           FROM terms
           WHERE term_type = $1 AND status = 'published'
           ORDER BY effective_at DESC NULLS LAST, id DESC
           LIMIT 1`, [type]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "게시된 약관이 없습니다." },
                });
            }
            const r = rows[0];
            return {
                id: Number(r.id),
                term_type: r.term_type,
                term_type_label: TERM_TYPE_LABEL[r.term_type] ?? r.term_type,
                version: r.version,
                effective_at: r.effective_at,
                body: pickBody(lang, r.body_ko, r.body_my, r.body_en),
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
