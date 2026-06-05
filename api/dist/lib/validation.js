export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function isValidPassword(pw) {
    if (pw.length < 8)
        return false;
    if (!/[A-Za-z]/.test(pw))
        return false;
    if (!/\d/.test(pw))
        return false;
    if (!/[^A-Za-z0-9]/.test(pw))
        return false;
    return true;
}
export function normalizeBirthDate(raw) {
    const d = String(raw).replace(/\D/g, "");
    if (d.length !== 8)
        return null;
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31)
        return null;
    return d;
}
/** Policy: 정책_합의_워크시트 §2.9 — 만 14세 미만 가입 차단 (임시 TBD). */
export const MIN_SIGNUP_AGE_YEARS = 14;
/** Returns true when birth YYYYMMDD is under minAge years old (KST-agnostic calendar age). */
export function isUnderMinimumAge(birthYmd, minAge = MIN_SIGNUP_AGE_YEARS, asOf = new Date()) {
    if (!birthYmd || birthYmd.length !== 8)
        return false;
    const y = Number(birthYmd.slice(0, 4));
    const m = Number(birthYmd.slice(4, 6));
    const day = Number(birthYmd.slice(6, 8));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day))
        return false;
    const ref = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    const birth = new Date(y, m - 1, day);
    let age = ref.getFullYear() - birth.getFullYear();
    const md = ref.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && ref.getDate() < birth.getDate()))
        age -= 1;
    return age < minAge;
}
export function genderToCode(raw) {
    const v = String(raw).trim();
    if (v === "1" || v === "남")
        return "1";
    if (v === "2" || v === "여")
        return "2";
    return null;
}
/** Parse a date/datetime string into a Date, or null if absent/invalid. */
export function parseDateOrNull(raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d;
}
/** Coerce to a finite integer within [min, max], or null if not parseable. */
export function parseIntInRange(raw, min, max) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n))
        return null;
    if (n < min || n > max)
        return null;
    return n;
}
/** Trimmed non-empty string capped at maxLen, or null. */
export function cleanString(raw, maxLen) {
    if (raw === undefined || raw === null)
        return null;
    const s = String(raw).trim();
    if (!s)
        return null;
    return s.slice(0, maxLen);
}
