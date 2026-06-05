import { config } from "../config.js";
import { pool } from "../db.js";
import { requireFoUser } from "../lib/auth.js";
import { buildEmailDefaults, enqueueEmail, } from "../lib/email-templates/enqueue-notification.js";
import { canReadBoardPost, fetchThreadedComments, validateParentComment, } from "../lib/board-comments.js";
const BOARD_TYPES = new Set(["refund_correction", "inquiry"]);
const STATUS_LABEL = {
    received: "접수",
    in_review: "검토중",
    completed: "처리완료",
    rejected: "반려",
    awaiting_reply: "답변대기",
    answered: "답변완료",
};
function formatDateTime(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${h}:${min}`;
}
function formatDate(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
}
const BOARD_NAME = {
    refund_correction: "환불·정보정정신청",
    inquiry: "문의게시판",
};
// 목록에 다른 회원 글이 노출되므로 작성자 이름은 첫 글자만 남기고 마스킹한다.
function maskName(name) {
    const s = String(name ?? "").trim();
    if (!s)
        return "—";
    if (s.length === 1)
        return s;
    return s[0] + "*".repeat(s.length - 1);
}
function postDetailUrl(boardType, postId) {
    const base = config.publicFoBase;
    if (boardType === "refund_correction") {
        return `${base}/refund-correction.html?id=${postId}`;
    }
    return `${base}/qna.html?id=${postId}`;
}
async function notifyBoardEmails(opts) {
    const userRes = await pool.query(`SELECT email, name_ko, preferred_lang FROM users WHERE id = $1 LIMIT 1`, [opts.userId]);
    const user = userRes.rows[0];
    if (!user)
        return;
    const locale = String(user.preferred_lang ?? "ko");
    const userName = String(user.name_ko ?? user.email);
    const submittedAt = formatDateTime(opts.submittedAt);
    const postUrl = postDetailUrl(opts.boardType, opts.postId);
    const boardName = BOARD_NAME[opts.boardType] ?? opts.boardType;
    const postIdLabel = opts.boardType === "refund_correction"
        ? `R-${new Date().getFullYear()}-${String(opts.postId).padStart(4, "0")}`
        : `Q-${opts.postId}`;
    if (opts.boardType === "refund_correction") {
        await enqueueEmail(pool, {
            templateKey: "board_refund_received",
            toEmail: String(user.email),
            userId: opts.userId,
            locale,
            variables: buildEmailDefaults({
                userName,
                boardName,
                postTitle: opts.title,
                postId: postIdLabel,
                submittedAt,
                postUrl,
            }),
        }).catch(() => undefined);
    }
    const adminTo = config.mail.adminNotifyTo;
    if (adminTo) {
        await enqueueEmail(pool, {
            templateKey: "board_admin_new_post",
            toEmail: adminTo,
            userId: null,
            locale: "ko",
            variables: buildEmailDefaults({
                userName,
                boardName,
                category: opts.category ?? "—",
                postTitle: opts.title,
                submittedAt,
                secretFlag: opts.isSecret ? "예 (비밀글)" : "아니오",
                boPostUrl: `${config.publicBoBase || config.publicFoBase + "/admin"}/board/${opts.postId}`,
            }),
        }).catch(() => undefined);
    }
}
export async function boardRoutes(app) {
    app.get("/api/v1/board/posts", { preHandler: requireFoUser }, async (req, reply) => {
        const boardType = req.query.board_type?.trim();
        if (!boardType || !BOARD_TYPES.has(boardType)) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "board_type이 필요합니다 (inquiry | refund_correction).",
                },
            });
        }
        const userId = req.authUser.id;
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size) || 20));
        const offset = (page - 1) * pageSize;
        try {
            // 목록은 로그인 필요(requireFoUser)는 유지하되, 범위는 "내 글"에서
            // "해당 게시판 전체 글"로 넓힌다. 각 행의 열람 가능 여부(locked)는
            // canReadBoardPost 로 판정한다.
            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM board_posts
           WHERE board_type = $1`, [boardType]);
            const total = countRes.rows[0]?.total ?? 0;
            const { rows } = await pool.query(`SELECT p.id, p.user_id, p.board_type, p.category, p.post_type, p.title,
                  p.workflow_status, p.is_secret, p.admin_reply, p.admin_replied_at,
                  p.created_at, u.name_ko AS author_name
           FROM board_posts p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.board_type = $1
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT $2 OFFSET $3`, [boardType, pageSize, offset]);
            const items = rows.map((row) => {
                const isMine = Number(row.user_id) === Number(userId);
                const canRead = canReadBoardPost({
                    user_id: row.user_id,
                    board_type: row.board_type,
                    is_secret: row.is_secret,
                }, { id: userId });
                return {
                    id: Number(row.id),
                    category: row.category,
                    post_type: row.post_type,
                    title: row.title,
                    workflow_status: row.workflow_status,
                    status_label: STATUS_LABEL[row.workflow_status] ?? row.workflow_status,
                    is_secret: row.is_secret,
                    locked: !canRead,
                    is_secret_to_viewer: !canRead,
                    is_mine: isMine,
                    author_name: isMine ? row.author_name : maskName(row.author_name),
                    has_reply: !!row.admin_reply,
                    admin_replied_at: row.admin_replied_at,
                    date_formatted: formatDate(row.created_at),
                };
            });
            return {
                items,
                pagination: {
                    page,
                    page_size: pageSize,
                    total_items: total,
                    total_pages: Math.ceil(total / pageSize) || 1,
                },
            };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    app.get("/api/v1/board/posts/:id", { preHandler: requireFoUser }, async (req, reply) => {
        const id = Number(req.params.id);
        const userId = req.authUser.id;
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const { rows } = await pool.query(`SELECT p.*, u.name_ko AS author_name
           FROM board_posts p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = $1
           LIMIT 1`, [id]);
            if (rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "게시글을 찾을 수 없습니다." },
                });
            }
            const row = rows[0];
            const isMine = Number(row.user_id) === Number(userId);
            const canRead = canReadBoardPost({
                user_id: row.user_id,
                board_type: row.board_type,
                is_secret: row.is_secret,
            }, { id: userId });
            // 열람 권한이 없으면 본문/관리자답변/댓글을 제외한 잠금 스텁만 반환한다.
            if (!canRead) {
                return {
                    id: Number(row.id),
                    board_type: row.board_type,
                    title: row.title,
                    is_secret: true,
                    locked: true,
                    is_mine: false,
                    author_name: maskName(row.author_name),
                    date_formatted: formatDate(row.created_at),
                };
            }
            return {
                id: Number(row.id),
                board_type: row.board_type,
                category: row.category,
                post_type: row.post_type,
                title: row.title,
                body: row.body,
                is_secret: row.is_secret,
                locked: false,
                is_mine: isMine,
                workflow_status: row.workflow_status,
                status_label: STATUS_LABEL[row.workflow_status] ?? row.workflow_status,
                admin_reply: row.admin_reply,
                admin_replied_at: row.admin_replied_at,
                author_name: row.author_name,
                date_formatted: formatDate(row.created_at),
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
    // GET /api/v1/board/posts/:id/comments — 댓글/대댓글 (상세 열람 권한과 동일)
    // -------------------------------------------------------------------------
    app.get("/api/v1/board/posts/:id/comments", { preHandler: requireFoUser }, async (req, reply) => {
        const id = Number(req.params.id);
        const userId = req.authUser.id;
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            // 상세 본문과 동일한 접근 규칙(canReadBoardPost)으로 댓글 열람을 통제한다.
            const postRes = await pool.query(`SELECT id, user_id, board_type, is_secret FROM board_posts WHERE id = $1 LIMIT 1`, [id]);
            if (postRes.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "게시글을 찾을 수 없습니다." },
                });
            }
            if (!canReadBoardPost(postRes.rows[0], { id: userId })) {
                return reply.status(403).send({
                    error: {
                        code: "FORBIDDEN",
                        message: "비밀글입니다. 작성자와 관리자만 열람할 수 있습니다.",
                    },
                });
            }
            const comments = await fetchThreadedComments(pool, id);
            return { comments };
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    // -------------------------------------------------------------------------
    // POST /api/v1/board/posts/:id/comments — 댓글/대댓글 작성 (상세 열람 권한 보유자)
    // -------------------------------------------------------------------------
    app.post("/api/v1/board/posts/:id/comments", { preHandler: requireFoUser }, async (req, reply) => {
        const id = Number(req.params.id);
        const userId = req.authUser.id;
        const text = String(req.body?.body ?? "").trim();
        const rawParent = req.body?.parent_comment_id;
        const parentId = rawParent === null || rawParent === undefined || rawParent === ""
            ? null
            : Number(rawParent);
        if (!Number.isFinite(id)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        if (!text) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "댓글 내용을 입력해 주세요." },
            });
        }
        if (text.length > 1000) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "댓글은 1000자 이내로 입력해 주세요." },
            });
        }
        if (parentId !== null && !Number.isFinite(parentId)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "잘못된 요청입니다." },
            });
        }
        try {
            const postRes = await pool.query(`SELECT id, user_id, board_type, is_secret FROM board_posts WHERE id = $1 LIMIT 1`, [id]);
            if (postRes.rows.length === 0) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "게시글을 찾을 수 없습니다." },
                });
            }
            // 상세를 열람할 수 있는 사용자만 댓글을 작성할 수 있다.
            if (!canReadBoardPost(postRes.rows[0], { id: userId })) {
                return reply.status(403).send({
                    error: {
                        code: "FORBIDDEN",
                        message: "비밀글입니다. 댓글을 작성할 수 없습니다.",
                    },
                });
            }
            if (parentId !== null) {
                const check = await validateParentComment(pool, id, parentId);
                if (!check.ok) {
                    return reply.status(400).send({
                        error: { code: check.code, message: check.message },
                    });
                }
            }
            // 댓글 비밀 여부는 게시글의 실제 비밀 여부를 그대로 따른다.
            const isSecret = !!postRes.rows[0].is_secret;
            const ins = await pool.query(`INSERT INTO board_comments
             (board_post_id, parent_comment_id, author_user_id, body, is_secret)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at`, [id, parentId, userId, text, isSecret]);
            return reply.status(201).send({
                id: Number(ins.rows[0].id),
                parent_comment_id: parentId,
                created: true,
            });
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
    app.post("/api/v1/board/posts", { preHandler: requireFoUser }, async (req, reply) => {
        const userId = req.authUser.id;
        const body = req.body ?? {};
        const boardType = body.board_type?.trim();
        const title = body.title?.trim();
        const text = body.body?.trim();
        if (!boardType || !BOARD_TYPES.has(boardType)) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "게시판 유형이 올바르지 않습니다." },
            });
        }
        if (!title || title.length > 100) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "제목을 100자 이내로 입력해 주세요." },
            });
        }
        if (!text || text.length < 10) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "내용을 10자 이상 입력해 주세요.",
                },
            });
        }
        // 환불·정보정정 글은 항상 비밀글로 강제(클라이언트 값 신뢰하지 않음).
        // 문의는 작성자가 선택한 일반/비밀을 따른다. 비밀 여부는 작성자/관리자
        // 신원 기반으로 통제하므로 별도 비밀번호는 사용하지 않는다.
        const isSecret = boardType === "refund_correction" ? true : !!body.is_secret;
        try {
            const ins = await pool.query(`INSERT INTO board_posts (
             board_type, user_id, category, post_type, title, body,
             is_secret, secret_password_hash, workflow_status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'received')
           RETURNING id, created_at`, [
                boardType,
                userId,
                body.category?.trim() || null,
                body.post_type?.trim() || null,
                title,
                text,
                isSecret,
            ]);
            const postId = Number(ins.rows[0].id);
            const createdAt = ins.rows[0].created_at;
            void notifyBoardEmails({
                boardType,
                postId,
                title,
                category: body.category?.trim() || null,
                isSecret,
                submittedAt: createdAt,
                userId,
            });
            return reply.status(201).send({
                id: postId,
                message: "신청이 접수되었습니다.",
                date_formatted: formatDate(ins.rows[0].created_at),
            });
        }
        catch (err) {
            app.log.error(err);
            return reply.status(503).send({
                error: { code: "INTERNAL_ERROR", message: "database_unavailable" },
            });
        }
    });
}
