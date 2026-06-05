import { pool } from "../db.js";
export async function examVenuesRoutes(app) {
    app.get("/api/v1/exam-venues", async (_req, reply) => {
        try {
            const { rows } = await pool.query(`SELECT id, venue_code, name_ko, name_en, address,
                country_code, region_code, capacity, note,
                is_active, rev, created_at, updated_at
         FROM exam_venues
         WHERE is_active = true
         ORDER BY venue_code`);
            return { items: rows };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({ error: "database_unavailable" });
        }
    });
}
