import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireFoUser } from "../lib/auth.js";

const DRAFT_TTL_DAYS = 30; // Policy §2.13 NO.466

interface DraftPayload {
  step?: number;
  roundId?: number | null;
  venueId?: number | string | null;
  round?: number;
  lvl1?: boolean;
  lvl2?: boolean;
  photoChecks?: boolean[];
  agree?: boolean;
  savedAt?: string;
  [key: string]: unknown;
}

async function purgeExpiredDrafts(userId: number): Promise<void> {
  await pool.query(
    `DELETE FROM application_drafts
     WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId]
  );
}

export async function applicationDraftsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/application-draft",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      try {
        await purgeExpiredDrafts(userId);
        const { rows } = await pool.query(
          `SELECT payload, updated_at, expires_at
           FROM application_drafts
           WHERE user_id = $1 AND expires_at > NOW()
           LIMIT 1`,
          [userId]
        );
        if (rows.length === 0) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "임시 저장된 접수 정보가 없습니다." },
          });
        }
        return {
          payload: rows[0].payload as DraftPayload,
          updated_at: rows[0].updated_at,
          expires_at: rows[0].expires_at,
        };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      }
    }
  );

  app.put<{ Body: { payload?: DraftPayload } }>(
    "/api/v1/application-draft",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      const payload = req.body?.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "저장할 접수 정보가 없습니다." },
        });
      }

      const safePayload: DraftPayload = {
        ...payload,
        savedAt: payload.savedAt || new Date().toISOString(),
      };

      try {
        await purgeExpiredDrafts(userId);
        const { rows } = await pool.query(
          `INSERT INTO application_drafts (user_id, payload, updated_at, expires_at)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days')
           ON CONFLICT (user_id) DO UPDATE
             SET payload = EXCLUDED.payload,
                 updated_at = NOW(),
                 expires_at = NOW() + INTERVAL '30 days'
           RETURNING payload, updated_at, expires_at`,
          [userId, JSON.stringify(safePayload)]
        );
        return {
          saved: true,
          payload: rows[0].payload as DraftPayload,
          updated_at: rows[0].updated_at,
          expires_at: rows[0].expires_at,
        };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      }
    }
  );

  app.delete(
    "/api/v1/application-draft",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      try {
        await pool.query(`DELETE FROM application_drafts WHERE user_id = $1`, [userId]);
        return { deleted: true };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      }
    }
  );
}
