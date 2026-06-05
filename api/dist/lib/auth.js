import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
/**
 * Issue the access + refresh JWT pair used across all FO/admin auth routes
 * (login, register, Google sign-in). Single source of truth for signing —
 * do not re-implement this in individual routes.
 */
export function signAuthTokens(payload) {
    const accessOpts = { expiresIn: config.jwtAccessExpires };
    const refreshOpts = { expiresIn: config.jwtRefreshExpires };
    const accessToken = jwt.sign(payload, config.jwtSecret, accessOpts);
    const refreshToken = jwt.sign({ sub: payload.sub, type: "refresh" }, config.jwtRefreshSecret, refreshOpts);
    return { accessToken, refreshToken };
}
function parseBearer(header) {
    if (!header)
        return null;
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    return m ? m[1] : null;
}
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (!decoded?.sub || decoded.role !== "user")
            return null;
        if (decoded.sub.startsWith("admin:"))
            return null;
        return decoded;
    }
    catch {
        return null;
    }
}
export function verifyAdminAccessToken(token) {
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (!decoded?.sub?.startsWith("admin:"))
            return null;
        if (decoded.role !== "admin")
            return null;
        return decoded;
    }
    catch {
        return null;
    }
}
/** BO routes: JWT from admin login; blocks readonly role. */
export async function requireAdmin(req, reply) {
    const token = parseBearer(req.headers.authorization);
    if (!token) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "관리자 로그인이 필요합니다." },
        });
    }
    const payload = verifyAdminAccessToken(token);
    if (!payload) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않거나 만료된 토큰입니다." },
        });
    }
    const adminId = Number(payload.sub.replace(/^admin:/, ""));
    if (!Number.isFinite(adminId) || adminId <= 0) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않은 관리자입니다." },
        });
    }
    try {
        const { rows } = await pool.query(`SELECT id, email, role, is_active FROM admin_users WHERE id = $1 LIMIT 1`, [adminId]);
        if (rows.length === 0 || !rows[0].is_active) {
            return reply.status(401).send({
                error: { code: "UNAUTHORIZED", message: "비활성화된 관리자 계정입니다." },
            });
        }
        const dbRole = rows[0].role;
        if (dbRole === "readonly") {
            return reply.status(403).send({
                error: { code: "FORBIDDEN", message: "읽기 전용 계정은 변경할 수 없습니다." },
            });
        }
        req.authAdmin = {
            id: adminId,
            email: String(rows[0].email),
            dbRole,
        };
    }
    catch {
        return reply.status(503).send({
            error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
    }
}
/**
 * Read-only-friendly admin guard for BO GET endpoints (list / detail / export
 * preview). Unlike {@link requireAdmin} this does NOT block the `readonly` role
 * (조회자: 보기 가능 — 기능정의서 BO/02 권한). Mutations + downloads keep using
 * {@link requireAdmin}.
 */
export async function requireAnyAdmin(req, reply) {
    const token = parseBearer(req.headers.authorization);
    if (!token) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "관리자 로그인이 필요합니다." },
        });
    }
    const payload = verifyAdminAccessToken(token);
    if (!payload) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않거나 만료된 토큰입니다." },
        });
    }
    const adminId = Number(payload.sub.replace(/^admin:/, ""));
    if (!Number.isFinite(adminId) || adminId <= 0) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않은 관리자입니다." },
        });
    }
    try {
        const { rows } = await pool.query(`SELECT id, email, role, is_active FROM admin_users WHERE id = $1 LIMIT 1`, [adminId]);
        if (rows.length === 0 || !rows[0].is_active) {
            return reply.status(401).send({
                error: { code: "UNAUTHORIZED", message: "비활성화된 관리자 계정입니다." },
            });
        }
        req.authAdmin = {
            id: adminId,
            email: String(rows[0].email),
            dbRole: rows[0].role,
        };
    }
    catch {
        return reply.status(503).send({
            error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
        });
    }
}
export async function requireFoUser(req, reply) {
    const token = parseBearer(req.headers.authorization);
    if (!token) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
        });
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않거나 만료된 토큰입니다." },
        });
    }
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
        return reply.status(401).send({
            error: { code: "UNAUTHORIZED", message: "유효하지 않은 사용자입니다." },
        });
    }
    req.authUser = { id: userId, email: payload.email, role: "user" };
}
