import { pool } from "../db.js";
const CAT_LABEL = {
    account: "계정",
    apply: "접수",
    exam: "시험",
    result: "결과",
    other: "기타",
};
export async function faqRoutes(app) {
    app.get("/api/v1/faq", async (req, reply) => {
        const lang = (req.query.lang || "ko").toLowerCase();
        const q = req.query.q?.trim().toLowerCase();
        try {
            const { rows } = await pool.query(`SELECT id, category, sort_order,
                  question_ko, question_my, question_en,
                  answer_ko, answer_my, answer_en
           FROM faq_items
           WHERE is_active = true
           ORDER BY category, sort_order, id`);
            const pick = (ko, my, en) => {
                if (lang === "my" && my)
                    return my;
                if (lang === "en" && en)
                    return en;
                return ko;
            };
            let items = rows.map((row) => ({
                id: Number(row.id),
                category: row.category,
                category_label: CAT_LABEL[row.category] ?? row.category,
                sort_order: row.sort_order,
                question: pick(row.question_ko, row.question_my, row.question_en),
                answer: pick(row.answer_ko, row.answer_my, row.answer_en),
            }));
            if (q) {
                items = items.filter((i) => i.question.toLowerCase().includes(q) ||
                    i.answer.toLowerCase().includes(q));
            }
            const groups = {};
            for (const item of items) {
                if (!groups[item.category]) {
                    groups[item.category] = {
                        category: item.category,
                        category_label: item.category_label,
                        items: [],
                    };
                }
                groups[item.category].items.push(item);
            }
            return {
                items,
                groups: Object.values(groups),
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
