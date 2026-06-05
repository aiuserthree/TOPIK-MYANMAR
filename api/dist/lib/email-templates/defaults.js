import { config } from "../../config.js";
/** Format 6-digit code as continuous digits for display in email. */
export function formatVerificationCode(code) {
    const digits = code.replace(/\D/g, "");
    if (digits.length === 6)
        return digits;
    return code;
}
function hostnameFromBase(base) {
    try {
        return new URL(base).hostname;
    }
    catch {
        return base.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
}
/** Shared URL + footer placeholders for all transactional emails. */
export function buildEmailDefaults(overrides = {}) {
    const fo = config.publicFoBase;
    const bo = config.publicBoBase || `${fo}/admin`;
    const year = String(new Date().getFullYear());
    return {
        siteUrl: hostnameFromBase(fo),
        siteUrlFull: fo,
        supportEmail: config.mail.supportEmail,
        supportBoardUrl: `${fo}/qna.html`,
        year,
        signupUrl: `${fo}/register.html`,
        loginUrl: `${fo}/login.html`,
        myPageUrl: `${fo}/mypage.html`,
        noticeUrl: `${fo}/notice.html`,
        refundUrl: `${fo}/refund-correction.html`,
        editProfileUrl: `${fo}/mypage-profile.html`,
        passwordChangeUrl: `${fo}/mypage-profile.html#password`,
        boLoginUrl: `${bo}/login.html`,
        boPostUrl: `${bo}/board`,
        postUrl: fo,
        unsubscribeUrl: `${fo}/unsubscribe`,
        expiresMinutes: "5",
        ...overrides,
    };
}
export function maskEmail(email) {
    const [local, domain] = String(email).split("@");
    if (!domain)
        return email;
    const visible = local.slice(0, Math.min(2, local.length));
    const stars = "*".repeat(Math.max(2, local.length - visible.length));
    return `${visible}${stars}@${domain}`;
}
