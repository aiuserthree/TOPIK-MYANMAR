import { config } from "../config.js";
import { buildEmailDefaults, enqueueEmail, } from "./email-templates/enqueue-notification.js";
const EXPIRY_DAYS = 180;
const REMINDER_COOLDOWN_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function formatDateKo(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
}
async function wasReminderSentRecently(db, userId) {
    const { rows } = await db.query(`SELECT 1 FROM email_outbox
     WHERE template_key = 'password_expiry_reminder'
       AND user_id = $1
       AND status IN ('sent', 'queued')
       AND COALESCE(sent_at, created_at) > NOW() - ($2 || ' days')::interval
     LIMIT 1`, [userId, String(REMINDER_COOLDOWN_DAYS)]);
    return rows.length > 0;
}
export function daysSincePasswordChange(row) {
    const anchor = row.password_changed_at ?? row.created_at;
    const ms = Date.now() - new Date(anchor).getTime();
    return Math.floor(ms / MS_PER_DAY);
}
export function shouldSendPasswordExpiryReminder(row) {
    if (!row.password_hash)
        return false;
    return daysSincePasswordChange(row) >= EXPIRY_DAYS;
}
/**
 * Enqueue password_expiry_reminder if the user is past the 6-month threshold
 * and has not received one in the last 30 days.
 */
export async function maybeEnqueuePasswordExpiryReminder(db, userId) {
    const { rows } = await db.query(`SELECT id, email, name_ko, preferred_lang, password_hash,
            password_changed_at, created_at
     FROM users
     WHERE id = $1 AND status = 'active'
     LIMIT 1`, [userId]);
    if (rows.length === 0) {
        return { queued: false, reason: "user_not_found" };
    }
    const row = rows[0];
    if (!shouldSendPasswordExpiryReminder(row)) {
        return { queued: false, reason: "not_due" };
    }
    if (await wasReminderSentRecently(db, userId)) {
        return { queued: false, reason: "cooldown" };
    }
    const days = daysSincePasswordChange(row);
    const lastChange = row.password_changed_at ?? row.created_at;
    const locale = String(row.preferred_lang ?? "ko");
    await enqueueEmail(db, {
        templateKey: "password_expiry_reminder",
        toEmail: String(row.email),
        userId,
        locale,
        variables: buildEmailDefaults({
            userName: String(row.name_ko ?? row.email),
            lastPasswordChange: formatDateKo(new Date(lastChange)),
            daysSincePwChange: String(days),
            passwordChangeUrl: `${config.publicFoBase}/mypage-profile.html#password`,
            loginUrl: `${config.publicFoBase}/login.html`,
        }),
    });
    return { queued: true };
}
/** Fire-and-forget helper for login handlers. */
export function schedulePasswordExpiryReminder(db, userId, logError) {
    void maybeEnqueuePasswordExpiryReminder(db, userId).catch(logError);
}
/**
 * Daily batch scan (optional — ENABLE_PASSWORD_EXPIRY_CRON=true).
 * Catches users who have not logged in recently.
 */
export async function runPasswordExpiryBatch(db) {
    const { rows } = await db.query(`SELECT id FROM users
     WHERE status = 'active'
       AND password_hash IS NOT NULL
       AND COALESCE(password_changed_at, created_at)
           <= NOW() - ($1 || ' days')::interval`, [String(EXPIRY_DAYS)]);
    let queued = 0;
    for (const row of rows) {
        const result = await maybeEnqueuePasswordExpiryReminder(db, Number(row.id));
        if (result.queued)
            queued += 1;
    }
    return queued;
}
