import { renderEmail, TEMPLATE_KEYS, templateSupportsLocale } from "./render-html.js";
import { buildEmailDefaults } from "./defaults.js";
/** Legacy / spec alias → canonical template_key */
const TEMPLATE_ALIASES = {
    inquiry_answered: "board_reply",
};
const ALLOWED_KEYS = new Set(TEMPLATE_KEYS);
export function resolveTemplateKey(raw) {
    const key = raw.trim();
    if (!key)
        return null;
    const aliased = TEMPLATE_ALIASES[key] ?? key;
    return ALLOWED_KEYS.has(aliased) ? aliased : null;
}
export function listAllowedTemplateKeys() {
    return [...TEMPLATE_KEYS];
}
function normalizeLocale(locale) {
    const loc = (locale ?? "ko").toLowerCase();
    return loc === "my" || loc === "en" ? loc : "ko";
}
/**
 * Resolve alias, validate template_key, locale, and render (dry-run) before enqueue.
 */
export function validateEnqueuePayload(opts) {
    const resolved = resolveTemplateKey(opts.templateKey);
    if (!resolved) {
        return {
            ok: false,
            code: "INVALID_TEMPLATE_KEY",
            message: `Unknown template_key "${opts.templateKey}". Must be one of the 14 transactional keys (inquiry_answered aliases to board_reply).`,
            allowed_keys: listAllowedTemplateKeys(),
        };
    }
    const locale = normalizeLocale(opts.locale);
    if (!templateSupportsLocale(resolved, locale)) {
        return {
            ok: false,
            code: "UNSUPPORTED_LOCALE",
            message: `Template "${resolved}" does not support locale "${locale}".`,
        };
    }
    const variables = buildEmailDefaults(opts.variables ?? {});
    try {
        const { subject } = renderEmail(resolved, locale, variables);
        return { ok: true, templateKey: resolved, locale, variables, subject };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            code: "RENDER_FAILED",
            message: `Failed to render template "${resolved}": ${msg}`,
        };
    }
}
