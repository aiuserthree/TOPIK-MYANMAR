import { queueAndSend } from "../mailer.js";
import { buildEmailDefaults } from "./defaults.js";
import { renderEmail } from "./render-html.js";
function normalizeLocale(locale) {
    const loc = (locale ?? "ko").toLowerCase();
    return loc === "my" || loc === "en" ? loc : "ko";
}
/**
 * Render a 시안 C안 template and queue it in email_outbox + send via mailer.
 */
export async function enqueueEmail(db, opts) {
    const locale = normalizeLocale(opts.locale);
    const vars = buildEmailDefaults(opts.variables ?? {});
    const { subject, html } = renderEmail(opts.templateKey, locale, vars);
    const result = await queueAndSend(db, {
        templateKey: opts.templateKey,
        locale,
        toEmail: opts.toEmail,
        userId: opts.userId ?? null,
        subject,
        html,
        deferSend: opts.deferSend,
    });
    return { ...result, subject };
}
export { renderEmail, TEMPLATE_KEYS } from "./render-html.js";
export { buildEmailDefaults, formatVerificationCode, maskEmail } from "./defaults.js";
