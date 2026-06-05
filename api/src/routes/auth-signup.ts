import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { pool } from "../db.js";
import { isMailerLive } from "../lib/mailer.js";
import {
  buildEmailDefaults,
  enqueueEmail,
  formatVerificationCode,
} from "../lib/email-templates/enqueue-notification.js";
import { signAuthTokens as signTokens } from "../lib/auth.js";
import { savePhoto, StorageError } from "../lib/storage.js";
import {
  genderToCode,
  isUnderMinimumAge,
  isValidEmail,
  isValidPassword,
  MIN_SIGNUP_AGE_YEARS,
  normalizeBirthDate,
} from "../lib/validation.js";

function signVerificationToken(email: string): string {
  return jwt.sign(
    { typ: "email_verify", email },
    config.jwtSecret,
    { expiresIn: "30m" }
  );
}

function verifyVerificationToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      typ?: string;
      email?: string;
    };
    if (decoded.typ !== "email_verify" || !decoded.email) return null;
    return decoded.email;
  } catch {
    return null;
  }
}

function randomCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

interface RegisterBody {
  verification_token?: string;
  email?: string;
  password?: string;
  password_confirm?: string;
  name_ko?: string;
  name_en?: string;
  birth_date?: string;
  gender?: string;
  nationality?: string;
  first_language?: string;
  phone?: string;
  job_code?: number;
  motive_code?: number;
  purpose_code?: number;
  photo_base64?: string | null;
  marketing_opt_in?: boolean;
  terms_agreed?: number[];
  preferred_lang?: string;
}

export async function authSignupRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; preferred_lang?: string } }>(
    "/api/v1/auth/send-verification-code",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      const langRaw = String(req.body?.preferred_lang ?? "ko");
      const locale = ["ko", "my", "en"].includes(langRaw) ? langRaw : "ko";
      if (!isValidEmail(email)) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "유효한 이메일을 입력해 주세요." },
        });
      }

      try {
        const exists = await pool.query(
          `SELECT id FROM users WHERE email = $1 LIMIT 1`,
          [email]
        );
        if (exists.rows.length > 0) {
          return reply.status(409).send({
            error: {
              code: "EMAIL_ALREADY_REGISTERED",
              message: "이미 가입된 이메일입니다. 로그인 페이지를 이용해 주세요.",
            },
          });
        }

        const recent = await pool.query(
          `SELECT id FROM email_verification_codes
           WHERE email = $1 AND created_at > NOW() - INTERVAL '60 seconds'
           ORDER BY id DESC LIMIT 1`,
          [email]
        );
        if (recent.rows.length > 0) {
          return reply.status(429).send({
            error: {
              code: "RATE_LIMITED",
              message: "잠시 후 다시 요청해 주세요. (1분 간격)",
            },
          });
        }

        const code = randomCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await pool.query(
          `INSERT INTO email_verification_codes (email, code, expires_at)
           VALUES ($1, $2, $3)`,
          [email, code, expiresAt]
        );

        const mailResult = await enqueueEmail(pool, {
          templateKey: "signup_verify_code",
          locale,
          toEmail: email,
          variables: buildEmailDefaults({
            userName: email.split("@")[0],
            verificationCode: formatVerificationCode(code),
            expiresMinutes: "5",
          }),
        });

        const mailDelivered = isMailerLive() && mailResult.sent;
        const payload: Record<string, unknown> = {
          message: mailDelivered
            ? "인증코드가 발송되었습니다."
            : "인증 요청이 접수되었습니다. 이메일 발송이 지연되거나 설정 중일 수 있습니다. 메일이 오지 않으면 스팸함을 확인하거나 잠시 후 재발송해 주세요.",
          mail_delivered: mailDelivered,
          expires_in_seconds: 300,
        };
        if (config.appEnv === "development") {
          payload.dev_code = code;
        }

        return payload;
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
        });
      }
    }
  );

  app.post<{ Body: { email?: string; code?: string } }>(
    "/api/v1/auth/verify-email",
    async (req, reply) => {
      const email = String(req.body?.email ?? "")
        .trim()
        .toLowerCase();
      const code = String(req.body?.code ?? "").trim();
      if (!isValidEmail(email) || code.length !== 6) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "이메일과 6자리 인증코드를 입력해 주세요.",
          },
        });
      }

      try {
        const { rows } = await pool.query(
          `SELECT id, code, expires_at, consumed_at
           FROM email_verification_codes
           WHERE email = $1 AND consumed_at IS NULL
           ORDER BY id DESC
           LIMIT 5`,
          [email]
        );
        const match = rows.find(
          (r) =>
            r.code === code &&
            new Date(r.expires_at) > new Date() &&
            !r.consumed_at
        );
        if (!match) {
          return reply.status(400).send({
            error: {
              code: "INVALID_CODE",
              message: "인증코드가 올바르지 않거나 만료되었습니다.",
            },
          });
        }
        await pool.query(
          `UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = $1`,
          [match.id]
        );

        return {
          verified: true,
          email,
          verification_token: signVerificationToken(email),
        };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." },
        });
      }
    }
  );

  app.post<{ Body: RegisterBody }>(
    "/api/v1/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const body = req.body ?? {};
    const emailFromToken = body.verification_token
      ? verifyVerificationToken(body.verification_token)
      : null;
    const email = (emailFromToken || String(body.email ?? "").trim().toLowerCase());

    if (!emailFromToken || !email) {
      return reply.status(400).send({
        error: {
          code: "VERIFICATION_REQUIRED",
          message: "이메일 인증을 먼저 완료해 주세요.",
        },
      });
    }

    const password = String(body.password ?? "");
    const passwordConfirm = String(body.password_confirm ?? "");
    if (!isValidPassword(password)) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "비밀번호는 8자 이상, 영문·숫자·특수문자를 각각 포함해야 합니다.",
        },
      });
    }
    if (password !== passwordConfirm) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "비밀번호 확인이 일치하지 않습니다.",
        },
      });
    }

    const birth = normalizeBirthDate(String(body.birth_date ?? ""));
    const gender = genderToCode(String(body.gender ?? ""));
    const jobCode = Number(body.job_code);
    const motiveCode = Number(body.motive_code);
    const purposeCode = Number(body.purpose_code);

    if (birth && isUnderMinimumAge(birth)) {
      return reply.status(422).send({
        error: {
          code: "AGE_RESTRICTED",
          message: `만 ${MIN_SIGNUP_AGE_YEARS}세 미만은 회원가입할 수 없습니다.`,
        },
      });
    }

    if (
      !body.name_ko?.trim() ||
      !body.name_en?.trim() ||
      !birth ||
      !gender ||
      !body.nationality?.trim() ||
      !body.first_language?.trim() ||
      !body.phone?.trim() ||
      !Number.isFinite(jobCode) ||
      !Number.isFinite(motiveCode) ||
      !Number.isFinite(purposeCode)
    ) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "필수 항목을 모두 입력해 주세요.",
        },
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const dup = await client.query(`SELECT id FROM users WHERE email = $1`, [
        email,
      ]);
      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        return reply.status(409).send({
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "이미 가입된 이메일입니다.",
          },
        });
      }

      let photoFileId: number | null = null;
      if (body.photo_base64 && body.photo_base64.length > 100) {
        try {
          const saved = await savePhoto(client, {
            ownerType: "user_photo",
            ownerId: 0, // updated to the new user id after insert
            base64: body.photo_base64,
            filename: "signup-photo.jpg",
          });
          photoFileId = saved.fileId;
        } catch (err) {
          await client.query("ROLLBACK");
          if (err instanceof StorageError) {
            return reply.status(400).send({
              error: { code: err.code, message: err.message },
            });
          }
          throw err;
        }
      }

      const hash = await bcrypt.hash(password, 10);
      const langRaw = String(body.preferred_lang ?? "ko");
      const lang = ["ko", "my", "en"].includes(langRaw) ? langRaw : "ko";

      const userRes = await client.query(
        `INSERT INTO users (
           email, password_hash, signup_provider, name_ko, name_en,
           birth_date, gender, nationality, first_language, phone,
           job_code, motive_code, purpose_code,
           photo_file_id, preferred_lang, marketing_opt_in, status,
           password_changed_at
         ) VALUES (
           $1, $2, 'email', $3, $4,
           $5, $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15, 'active', NOW()
         )
         RETURNING id, email, name_ko, name_en`,
        [
          email,
          hash,
          body.name_ko.trim(),
          body.name_en.trim(),
          birth,
          gender,
          body.nationality.trim(),
          body.first_language.trim(),
          body.phone.trim(),
          jobCode,
          motiveCode,
          purposeCode,
          photoFileId,
          lang,
          !!body.marketing_opt_in,
        ]
      );
      const user = userRes.rows[0];
      const userId = Number(user.id);

      if (photoFileId) {
        await client.query(
          `UPDATE file_attachments SET owner_id = $1 WHERE id = $2`,
          [userId, photoFileId]
        );
      }

      const termIds: number[] = Array.isArray(body.terms_agreed)
        ? body.terms_agreed.map(Number).filter(Boolean)
        : [];
      if (termIds.length === 0) {
        const termsRes = await client.query(
          `SELECT id FROM terms
           WHERE status = 'published' AND term_type IN ('service', 'privacy')
           ORDER BY term_type`
        );
        for (const row of termsRes.rows) {
          await client.query(
            `INSERT INTO term_agreements (user_id, term_id)
             VALUES ($1, $2) ON CONFLICT (user_id, term_id) DO NOTHING`,
            [userId, row.id]
          );
        }
      } else {
        for (const tid of termIds) {
          await client.query(
            `INSERT INTO term_agreements (user_id, term_id)
             VALUES ($1, $2) ON CONFLICT (user_id, term_id) DO NOTHING`,
            [userId, tid]
          );
        }
      }

      if (body.marketing_opt_in) {
        const m = await client.query(
          `SELECT id FROM terms WHERE term_type = 'marketing' AND status = 'published' LIMIT 1`
        );
        if (m.rows[0]) {
          await client.query(
            `INSERT INTO term_agreements (user_id, term_id)
             VALUES ($1, $2) ON CONFLICT (user_id, term_id) DO NOTHING`,
            [userId, m.rows[0].id]
          );
        }
      }

      await client.query("COMMIT");

      const tokens = signTokens({
        sub: String(userId),
        email: user.email,
        role: "user",
      });

      return reply.status(201).send({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer",
        user: {
          id: userId,
          email: user.email,
          name_ko: user.name_ko,
          name_en: user.name_en,
          role: "user",
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      app.log.error(err);
      return reply.status(503).send({
        error: { code: "INTERNAL_ERROR", message: "회원가입 처리 중 오류가 발생했습니다." },
      });
    } finally {
      client.release();
    }
  });
}
