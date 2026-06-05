import { pool } from "../db.js";
import { sendMail } from "./mailer.js";
/** Default rows processed per drain pass. */
const DEFAULT_BATCH_SIZE = 25;
/** A 'failed' row stops being retried once retry_count reaches this (dead-letter). */
const DEFAULT_MAX_RETRY = 5;
/** Drain interval (ms). */
const DEFAULT_INTERVAL_MS = 30 * 1000;
/**
 * Drain one batch of the email_outbox: pick up rows that are still 'queued',
 * plus 'failed' rows under the retry ceiling, attempt delivery via the mailer,
 * and update status / sent_at / retry_count / last_error accordingly.
 *
 * Single-instance safe (the caller serializes passes). For multi-instance use
 * this should switch to SELECT ... FOR UPDATE SKIP LOCKED or a Redis queue —
 * see TODO in startEmailWorker.
 */
export async function drainEmailOutbox(db, opts = {}) {
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxRetry = opts.maxRetry ?? DEFAULT_MAX_RETRY;
    const { rows } = await db.query(`SELECT id, to_email, subject, body_html
     FROM email_outbox
     WHERE status = 'queued'
        OR (status = 'failed' AND retry_count < $1)
     ORDER BY id ASC
     LIMIT $2`, [maxRetry, batchSize]);
    const result = { processed: 0, sent: 0, failed: 0 };
    for (const row of rows) {
        const id = Number(row.id);
        result.processed += 1;
        // eslint-disable-next-line no-await-in-loop
        const sendResult = await sendMail({
            to: String(row.to_email),
            subject: String(row.subject),
            html: String(row.body_html),
        });
        if (sendResult.ok) {
            // eslint-disable-next-line no-await-in-loop
            await db.query(`UPDATE email_outbox
         SET status = 'sent', sent_at = NOW(), last_error = NULL
         WHERE id = $1`, [id]);
            result.sent += 1;
        }
        else {
            // eslint-disable-next-line no-await-in-loop
            await db.query(`UPDATE email_outbox
         SET status = 'failed', retry_count = retry_count + 1, last_error = $1
         WHERE id = $2`, [(sendResult.error ?? "send_failed").slice(0, 1000), id]);
            result.failed += 1;
        }
    }
    return result;
}
/**
 * Start the periodic email_outbox drain worker. Returns a stop() handle.
 * Gate the call behind ENABLE_EMAIL_WORKER (see config.enableEmailWorker) so
 * the default behavior is unchanged.
 */
export function startEmailWorker(app, opts = {}) {
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    let running = false;
    const tick = async () => {
        if (running)
            return; // never overlap passes
        running = true;
        try {
            const r = await drainEmailOutbox(pool, opts);
            if (r.processed > 0) {
                app.log.info({ processed: r.processed, sent: r.sent, failed: r.failed }, "email_worker drain");
            }
        }
        catch (err) {
            app.log.error(err, "email_worker drain failed");
        }
        finally {
            running = false;
        }
    };
    void tick();
    const handle = setInterval(() => void tick(), intervalMs);
    // Don't keep the event loop alive solely for this timer.
    if (typeof handle.unref === "function")
        handle.unref();
    return {
        stop: () => clearInterval(handle),
    };
}
