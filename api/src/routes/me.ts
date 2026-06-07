import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { requireFoUser } from "../lib/auth.js";
import { resolveFile, savePhoto, StorageError, type FileRow } from "../lib/storage.js";
import {
  buildEmailDefaults,
  enqueueEmail,
} from "../lib/email-templates/enqueue-notification.js";
import {
  genderToCode,
  isValidPassword,
  normalizeBirthDate,
} from "../lib/validation.js";

interface UpdateMeBody {
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
  marketing_opt_in?: boolean;
  photo_base64?: string | null;
}

/** True when users.photo_file_id points at a missing/stub/unreachable blob. */
async function isPhotoUnavailable(photoFileId: number | null): Promise<boolean> {
  if (!photoFileId) return false;
  const { rows } = await pool.query(
    `SELECT id, owner_type, owner_id, storage_key, original_filename,
            mime_type, size_bytes
     FROM file_attachments WHERE id = $1 LIMIT 1`,
    [photoFileId]
  );
  if (rows.length === 0) return true;
  const resolved = await resolveFile(rows[0] as unknown as FileRow);
  return !resolved;
}

export async function meRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/me",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      try {
        const { rows } = await pool.query(
          `SELECT id, email, name_ko, name_en, birth_date, gender, nationality,
                  first_language, phone, job_code, motive_code,
                  purpose_code, photo_file_id, preferred_lang, marketing_opt_in,
                  password_changed_at, status, rev, created_at, updated_at
           FROM users
           WHERE id = $1 AND status = 'active'
           LIMIT 1`,
          [userId]
        );
        if (rows.length === 0) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다." },
          });
        }
        const u = rows[0];
        const photoUnavailable = await isPhotoUnavailable(
          u.photo_file_id != null ? Number(u.photo_file_id) : null
        );
        return {
          user: {
            id: u.id,
            email: u.email,
            name_ko: u.name_ko,
            name_en: u.name_en,
            birth_date: u.birth_date,
            gender: u.gender,
            nationality: u.nationality,
            first_language: u.first_language,
            phone: u.phone,
            job_code: u.job_code,
            motive_code: u.motive_code,
            purpose_code: u.purpose_code,
            photo_file_id: u.photo_file_id,
            photo_unavailable: photoUnavailable,
            preferred_lang: u.preferred_lang,
            marketing_opt_in: u.marketing_opt_in,
            password_changed_at: u.password_changed_at
              ? new Date(u.password_changed_at).toISOString()
              : null,
            rev: u.rev,
          },
        };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // PATCH /me — update profile (basic info + photo)
  // --------------------------------------------------------------------------
  app.patch<{ Body: UpdateMeBody }>(
    "/api/v1/me",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      const body = req.body ?? {};

      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      function setField(col: string, value: unknown) {
        sets.push(`${col} = $${idx++}`);
        params.push(value);
      }

      if (body.name_ko !== undefined) {
        if (!String(body.name_ko).trim()) {
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "한글 성명을 입력해 주세요." },
          });
        }
        setField("name_ko", String(body.name_ko).trim());
      }
      if (body.name_en !== undefined) {
        if (!String(body.name_en).trim()) {
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "영문 성명을 입력해 주세요." },
          });
        }
        setField("name_en", String(body.name_en).trim());
      }
      if (body.birth_date !== undefined) {
        const birth = normalizeBirthDate(String(body.birth_date));
        if (!birth) {
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "생년월일을 YYYYMMDD 형식으로 입력해 주세요." },
          });
        }
        setField("birth_date", birth);
      }
      if (body.gender !== undefined) {
        const g = genderToCode(String(body.gender));
        if (!g) {
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "성별을 선택해 주세요." },
          });
        }
        setField("gender", g);
      }
      if (body.nationality !== undefined) setField("nationality", String(body.nationality).trim());
      if (body.first_language !== undefined) setField("first_language", String(body.first_language).trim());
      if (body.phone !== undefined) {
        if (!String(body.phone).trim()) {
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "연락처를 입력해 주세요." },
          });
        }
        setField("phone", String(body.phone).trim());
      }
      if (body.job_code !== undefined && Number.isFinite(Number(body.job_code))) {
        setField("job_code", Number(body.job_code));
      }
      if (body.motive_code !== undefined && Number.isFinite(Number(body.motive_code))) {
        setField("motive_code", Number(body.motive_code));
      }
      if (body.purpose_code !== undefined && Number.isFinite(Number(body.purpose_code))) {
        setField("purpose_code", Number(body.purpose_code));
      }
      if (body.marketing_opt_in !== undefined) {
        setField("marketing_opt_in", !!body.marketing_opt_in);
      }

      let client: PoolClient | null = null;
      let began = false;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        began = true;

        let newPhotoFileId: number | null = null;
        let photoError: { code: string; message: string; detail: string } | null =
          null;
        if (body.photo_base64 && body.photo_base64.length > 100) {
          try {
            const saved = await savePhoto(client, {
              ownerType: "user_photo",
              ownerId: userId,
              base64: body.photo_base64,
              filename: "profile-photo.jpg",
            });
            newPhotoFileId = saved.fileId;
            setField("photo_file_id", saved.fileId);
          } catch (err) {
            if (err instanceof StorageError) {
              // Client-side validation failure (empty / oversized / bad type) —
              // the user must fix the file, so abort with a clear 400.
              if (began) {
                await client.query("ROLLBACK");
                began = false;
              }
              return reply.status(400).send({
                error: { code: err.code, message: err.message },
              });
            }
            // Anything else here is an object-storage / infra failure (e.g. S3
            // PutObject denied, wrong region, missing credentials, network).
            // Previously this propagated to the outer catch and surfaced as a
            // misleading 503 "database_unavailable", masking the real cause AND
            // discarding the user's text edits. Instead: log the real error and
            // keep going so the non-photo fields still save. The S3 upload throws
            // before any SQL runs inside savePhoto, so the open transaction stays
            // usable for the user/applications updates below.
            const e = err as {
              name?: string;
              code?: string;
              message?: string;
              $metadata?: { httpStatusCode?: number };
            };
            app.log.error(
              {
                err,
                awsErrorName: e?.name,
                awsErrorCode: e?.code,
                awsHttpStatus: e?.$metadata?.httpStatusCode,
                where: "savePhoto",
                userId,
              },
              "profile photo upload to object storage failed"
            );
            photoError = {
              code: "PHOTO_UPLOAD_FAILED",
              message:
                "사진 업로드에 실패했습니다. 사진을 제외한 정보는 저장되었습니다. 잠시 후 다시 시도해 주세요.",
              // AWS/SDK error class name only (e.g. AccessDenied,
              // AuthorizationHeaderMalformed, PermanentRedirect, NoSuchBucket).
              // Diagnostic, contains no secrets.
              detail: String(e?.name || e?.code || "UploadError"),
            };
          }
        }

        if (sets.length === 0) {
          if (began) {
            await client.query("ROLLBACK");
            began = false;
          }
          // Photo-only request whose upload failed: surface the storage error
          // (502 upstream failure) rather than "no changes".
          if (photoError) {
            return reply.status(502).send({ error: photoError });
          }
          return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "변경할 내용이 없습니다." },
          });
        }

        params.push(userId);
        await client.query(
          `UPDATE users SET ${sets.join(", ")}, updated_at = NOW(), rev = rev + 1
           WHERE id = $${idx} AND status = 'active'`,
          params
        );

        if (newPhotoFileId) {
          await client.query(
            `UPDATE applications
             SET photo_file_id = $1,
                 photo_review_status = 'pending',
                 photo_reject_code = NULL,
                 photo_reject_note = NULL,
                 updated_at = NOW(),
                 rev = rev + 1
             WHERE user_id = $2
               AND status NOT IN ('cancelled', 'rejected')`,
            [newPhotoFileId, userId]
          );
        }

        const { rows } = await client.query(
          `SELECT id, email, name_ko, name_en, birth_date, gender, nationality,
                  first_language, phone, job_code, motive_code,
                  purpose_code, photo_file_id, preferred_lang, marketing_opt_in, rev
           FROM users WHERE id = $1`,
          [userId]
        );
        await client.query("COMMIT");
        began = false;

        const u = rows[0];
        const photoUnavailable = await isPhotoUnavailable(
          u.photo_file_id != null ? Number(u.photo_file_id) : null
        );
        // Only report upload failure when this request did not persist a new photo.
        const reportPhotoError = photoError != null && newPhotoFileId == null;
        return {
          user: {
            id: u.id,
            email: u.email,
            name_ko: u.name_ko,
            name_en: u.name_en,
            birth_date: u.birth_date,
            gender: u.gender,
            nationality: u.nationality,
            first_language: u.first_language,
            phone: u.phone,
            job_code: u.job_code,
            motive_code: u.motive_code,
            purpose_code: u.purpose_code,
            photo_file_id: u.photo_file_id,
            photo_unavailable: photoUnavailable,
            preferred_lang: u.preferred_lang,
            marketing_opt_in: u.marketing_opt_in,
            rev: u.rev,
          },
          message: reportPhotoError
            ? "기본정보가 저장되었습니다. 다만 사진 업로드에 실패하여 사진은 반영되지 않았습니다."
            : "회원정보가 수정되었습니다.",
          ...(reportPhotoError ? { photo_error: photoError! } : {}),
        };
      } catch (err) {
        if (client && began) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* connection may already be dead */
          }
        }
        // Log the error class/pg code so a genuine failure here is diagnosable
        // from server logs instead of only ever showing "database_unavailable".
        const e = err as { name?: string; code?: string };
        app.log.error(
          { err, errName: e?.name, pgCode: e?.code, where: "PATCH /api/v1/me" },
          "profile update failed"
        );
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      } finally {
        client?.release();
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /me/change-password
  // --------------------------------------------------------------------------
  app.post<{
    Body: {
      current_password?: string;
      new_password?: string;
      new_password_confirm?: string;
    };
  }>(
    "/api/v1/me/change-password",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      const current = String(req.body?.current_password ?? "");
      const next = String(req.body?.new_password ?? "");
      const confirm = String(req.body?.new_password_confirm ?? "");

      if (!isValidPassword(next)) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "새 비밀번호는 8자 이상, 영문·숫자·특수문자를 각각 포함해야 합니다.",
          },
        });
      }
      if (next !== confirm) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "새 비밀번호 확인이 일치하지 않습니다." },
        });
      }

      try {
        const { rows } = await pool.query(
          `SELECT password_hash FROM users WHERE id = $1 AND status = 'active'`,
          [userId]
        );
        if (rows.length === 0) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다." },
          });
        }
        const hash = rows[0].password_hash as string | null;
        if (!hash) {
          return reply.status(422).send({
            error: {
              code: "BUSINESS_RULE_VIOLATION",
              message: "Google 계정은 비밀번호를 변경할 수 없습니다.",
            },
          });
        }
        const ok = await bcrypt.compare(current, hash);
        if (!ok) {
          return reply.status(400).send({
            error: { code: "INVALID_PASSWORD", message: "현재 비밀번호가 일치하지 않습니다." },
          });
        }
        const newHash = await bcrypt.hash(next, 10);
        await pool.query(
          `UPDATE users SET password_hash = $1, password_changed_at = NOW(),
                 updated_at = NOW(), rev = rev + 1
           WHERE id = $2`,
          [newHash, userId]
        );
        return { message: "비밀번호가 변경되었습니다." };
      } catch (err) {
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /me/withdraw — withdraw account, cancel unpaid applications
  // --------------------------------------------------------------------------
  app.post<{ Body: { password?: string } }>(
    "/api/v1/me/withdraw",
    { preHandler: requireFoUser },
    async (req, reply) => {
      const userId = req.authUser!.id;
      const password = String(req.body?.password ?? "");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `SELECT password_hash, email, name_ko, preferred_lang
           FROM users WHERE id = $1 AND status = 'active' FOR UPDATE`,
          [userId]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다." },
          });
        }
        const hash = rows[0].password_hash as string | null;
        // If the account has a password, require it to confirm withdrawal.
        if (hash) {
          if (!password) {
            await client.query("ROLLBACK");
            return reply.status(400).send({
              error: { code: "PASSWORD_REQUIRED", message: "비밀번호를 입력해 주세요." },
            });
          }
          const ok = await bcrypt.compare(password, hash);
          if (!ok) {
            await client.query("ROLLBACK");
            return reply.status(400).send({
              error: { code: "INVALID_PASSWORD", message: "비밀번호가 일치하지 않습니다." },
            });
          }
        }

        // Cancel still-cancellable (unpaid) applications.
        const cancelRes = await client.query(
          `UPDATE applications
           SET status = 'cancelled', cancelled_at = NOW(),
               cancel_reason = '회원 탈퇴', updated_at = NOW(), rev = rev + 1
           WHERE user_id = $1
             AND status IN ('submitted', 'photo_review', 'payment_pending')
             AND payment_status = 'unpaid'
           RETURNING id`,
          [userId]
        );
        const canceledCount = cancelRes.rowCount ?? 0;

        await client.query(
          `UPDATE users
           SET status = 'withdrawn', withdrawn_at = NOW(),
               updated_at = NOW(), rev = rev + 1
           WHERE id = $1`,
          [userId]
        );
        await client.query("COMMIT");

        const user = rows[0];
        void enqueueEmail(pool, {
          templateKey: "account_status",
          toEmail: String(user.email),
          userId,
          locale: String(user.preferred_lang ?? "ko"),
          variables: buildEmailDefaults({
            userName: String(user.name_ko ?? user.email),
            accountAction: "withdrawn",
            accountStatusLabel: "탈퇴",
            statusReason: "회원 본인 요청에 의한 탈퇴",
            statusUntil: "—",
            canceledApplications: String(canceledCount),
          }),
        }).catch(() => undefined);

        return { withdrawn: true, message: "회원 탈퇴가 완료되었습니다." };
      } catch (err) {
        await client.query("ROLLBACK");
        app.log.error(err);
        return reply.status(503).send({
          error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
      } finally {
        client.release();
      }
    }
  );
}
