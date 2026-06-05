import { pool } from "../db.js";
export async function examRoundsRoutes(app) {
    app.get("/api/v1/exam-rounds", async (req, reply) => {
        try {
            const statusFilter = req.query.registration_status;
            const params = [];
            let where = "WHERE is_active = true";
            if (statusFilter) {
                params.push(statusFilter);
                where += ` AND registration_status = $${params.length}`;
            }
            const { rows } = await pool.query(`SELECT id, round_no, title, exam_date,
                registration_start_at, registration_end_at,
                payment_start_at, payment_end_at,
                result_announcement_date,
                fee_level_i, fee_level_ii, capacity,
                registration_status, exam_number_visible_at,
                is_active, rev, created_at, updated_at
         FROM exam_rounds
         ${where}
         ORDER BY round_no DESC`, params);
            return { items: rows };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({ error: "database_unavailable" });
        }
    });
}
