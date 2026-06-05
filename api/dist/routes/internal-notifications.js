import { config } from "../config.js";
import { pool } from "../db.js";
import { enqueueEmail } from "../lib/email-templates/enqueue-notification.js";
import { listAllowedTemplateKeys, validateEnqueuePayload, } from "../lib/email-templates/validate-enqueue.js";
function authorizeInternal(req) {
    const key = config.internalApiKey;
    if (!key)
        return config.appEnv === "development";
    const header = req.headers["x-internal-api-key"];
    return typeof header === "string" && header === key;
}
function parseEnqueueBody(body) {
    const templateKey = String(body?.template_key ?? "").trim();
    const toEmail = String(body?.to_email ?? "")
        .trim()
        .toLowerCase();
    return { templateKey, toEmail };
}
async function handleEnqueue(app, body, reply) {
    const { templateKey, toEmail } = parseEnqueueBody(body);
    if (!toEmail) {
        return reply.status(400).send({
            error: { code: "VALIDATION_ERROR", message: "to_email is required." },
        });
    }
    const validated = validateEnqueuePayload({
        templateKey,
        locale: body?.locale,
        variables: (body?.variables ?? {}),
    });
    if (!validated.ok) {
        return reply.status(400).send({
            error: {
                code: validated.code,
                message: validated.message,
                allowed_keys: validated.allowed_keys,
            },
        });
    }
    try {
        const result = await enqueueEmail(pool, {
            templateKey: validated.templateKey,
            toEmail,
            userId: body?.user_id ?? null,
            locale: validated.locale,
            variables: validated.variables,
        });
        return {
            queued: true,
            template_key: validated.templateKey,
            outbox_id: result.outboxId,
            sent: result.sent,
            subject: result.subject,
        };
    }
    catch (err) {
        app.log.error(err);
        return reply.status(500).send({
            error: { code: "INTERNAL_ERROR", message: "Failed to enqueue email." },
        });
    }
}
/**
 * Internal enqueue endpoint for BO/cron workers (spec §4.8 option B).
 * Protected by INTERNAL_API_KEY (or open in development when unset).
 */
export async function internalNotificationRoutes(app) {
    app.get("/internal/notifications/template-keys", async (req, reply) => {
        if (!authorizeInternal(req)) {
            return reply.status(401).send({
                error: { code: "UNAUTHORIZED", message: "Invalid internal API key." },
            });
        }
        return {
            template_keys: listAllowedTemplateKeys(),
            aliases: { inquiry_answered: "board_reply" },
        };
    });
    app.post("/internal/notifications/enqueue", async (req, reply) => {
        if (!authorizeInternal(req)) {
            return reply.status(401).send({
                error: { code: "UNAUTHORIZED", message: "Invalid internal API key." },
            });
        }
        return handleEnqueue(app, req.body, reply);
    });
    app.post("/internal/notifications/enqueue-batch", async (req, reply) => {
        if (!authorizeInternal(req)) {
            return reply.status(401).send({
                error: { code: "UNAUTHORIZED", message: "Invalid internal API key." },
            });
        }
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!items.length) {
            return reply.status(400).send({
                error: { code: "VALIDATION_ERROR", message: "items array is required." },
            });
        }
        if (items.length > 100) {
            return reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Maximum 100 items per batch.",
                },
            });
        }
        const results = [];
        for (const item of items) {
            const { templateKey, toEmail } = parseEnqueueBody(item);
            const validated = validateEnqueuePayload({
                templateKey,
                locale: item.locale,
                variables: (item.variables ?? {}),
            });
            if (!toEmail) {
                results.push({
                    ok: false,
                    error: { code: "VALIDATION_ERROR", message: "to_email is required." },
                });
                continue;
            }
            if (!validated.ok) {
                results.push({
                    ok: false,
                    to_email: toEmail,
                    error: {
                        code: validated.code,
                        message: validated.message,
                    },
                });
                continue;
            }
            try {
                const result = await enqueueEmail(pool, {
                    templateKey: validated.templateKey,
                    toEmail,
                    userId: item.user_id ?? null,
                    locale: validated.locale,
                    variables: validated.variables,
                });
                results.push({
                    ok: true,
                    template_key: validated.templateKey,
                    to_email: toEmail,
                    outbox_id: result.outboxId,
                    sent: result.sent,
                });
            }
            catch (err) {
                app.log.error(err);
                results.push({
                    ok: false,
                    to_email: toEmail,
                    error: { code: "INTERNAL_ERROR", message: "Failed to enqueue email." },
                });
            }
        }
        const succeeded = results.filter((r) => r.ok).length;
        return {
            batch_size: items.length,
            succeeded,
            failed: items.length - succeeded,
            results,
        };
    });
}
