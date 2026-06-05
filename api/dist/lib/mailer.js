import { config } from "../config.js";
export function mailerMode() {
    const p = config.mail.provider;
    if (p === "resend" && config.mail.resendApiKey)
        return "resend";
    if (p === "smtp" && config.mail.smtp.host)
        return "smtp";
    return "console";
}
/** True when a real provider (not the dev console fallback) is configured. */
export function isMailerLive() {
    return mailerMode() !== "console";
}
export async function sendMail(input) {
    const mode = mailerMode();
    try {
        if (mode === "resend") {
            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${config.mail.resendApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: config.mail.from,
                    to: [input.to],
                    subject: input.subject,
                    html: input.html,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                return { ok: false, error: `resend_${res.status}:${text.slice(0, 200)}` };
            }
            return { ok: true };
        }
        if (mode === "smtp") {
            // Optional dependency — degrade gracefully if not installed.
            // Non-literal specifier so TS doesn't require nodemailer types at build time.
            const specifier = "nodemailer";
            const mod = await import(specifier).catch(() => null);
            const nodemailer = mod ? (mod.default ?? mod) : null;
            if (!nodemailer) {
                return { ok: false, error: "nodemailer_not_installed" };
            }
            const transport = nodemailer.createTransport({
                host: config.mail.smtp.host,
                port: config.mail.smtp.port,
                secure: config.mail.smtp.secure,
                auth: config.mail.smtp.user
                    ? { user: config.mail.smtp.user, pass: config.mail.smtp.pass }
                    : undefined,
            });
            await transport.sendMail({
                from: config.mail.from,
                to: input.to,
                subject: input.subject,
                html: input.html,
            });
            return { ok: true };
        }
        // console fallback (dev)
        // eslint-disable-next-line no-console
        console.log(`[mailer:console] (not delivered) to=${input.to} subject="${input.subject}"`);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/**
 * Persist an email to email_outbox and (unless deferred) attempt delivery,
 * then update the row status. Returns whether the message was actually sent
 * (false in console/dev mode is still "queued").
 *
 * When `deferSend` is true the row is left in status 'queued' and NOT sent
 * inline — the background email worker (ENABLE_EMAIL_WORKER) drains it. This is
 * used by bulk sends to avoid request-time timeouts.
 */
export async function queueAndSend(db, opts) {
    const locale = ["ko", "my", "en"].includes(opts.locale ?? "ko")
        ? opts.locale
        : "ko";
    const ins = await db.query(`INSERT INTO email_outbox (
       template_key, locale, to_email, user_id, subject, body_html, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'queued')
     RETURNING id`, [opts.templateKey, locale, opts.toEmail, opts.userId ?? null, opts.subject, opts.html]);
    const outboxId = Number(ins.rows[0].id);
    // Deferred: leave it queued for the worker to deliver + retry.
    if (opts.deferSend) {
        return { outboxId, sent: false };
    }
    const result = await sendMail({
        to: opts.toEmail,
        subject: opts.subject,
        html: opts.html,
    });
    if (result.ok) {
        await db.query(`UPDATE email_outbox
       SET status = 'sent', sent_at = NOW(), last_error = NULL
       WHERE id = $1`, [outboxId]);
    }
    else {
        // Mark failed and bump retry_count so the worker can pick it up later.
        await db.query(`UPDATE email_outbox
       SET status = 'failed', retry_count = retry_count + 1, last_error = $1
       WHERE id = $2`, [(result.error ?? "send_failed").slice(0, 1000), outboxId]);
    }
    return { outboxId, sent: result.ok };
}
