import crypto from "node:crypto";
const PHOTO_REJECT_CODES = new Set([
    "not_frontal",
    "hat_glasses",
    "bw_photo",
    "blurry",
    "not_self",
    "other",
]);
const PHOTO_REJECT_LABEL = {
    not_frontal: "정면 아님",
    hat_glasses: "모자·안경",
    bw_photo: "흑백 사진",
    blurry: "흐림",
    not_self: "본인 아님",
    other: "기타",
};
const APP_REJECT_LABEL = {
    photo_invalid: "사진 부적합",
    info_mismatch: "정보 불일치",
    duplicate: "중복 접수",
    other: "기타",
};
export function photoRejectLabel(code) {
    return PHOTO_REJECT_LABEL[code] ?? code;
}
export function appRejectLabel(code) {
    return APP_REJECT_LABEL[code] ?? code;
}
export function isValidPhotoRejectCode(code) {
    return PHOTO_REJECT_CODES.has(code);
}
export function levelLabel(level) {
    return level === "II" ? "TOPIK Ⅱ" : "TOPIK Ⅰ";
}
export function genderLabel(g) {
    return g === "1" ? "남" : g === "2" ? "여" : String(g ?? "");
}
// 연명부 양식 코드 (canonical: html/shared/roster-codes.js) — server-side labels.
const JOB_LABELS = {
    "1": "학생", "2": "회사원", "3": "공무원", "4": "자영업", "5": "전문직",
    "6": "주부", "7": "무직", "8": "교사", "9": "군인", "10": "농업·어업",
    "11": "기타", "12": "미상",
};
const MOTIVE_LABELS = {
    "1": "유학 및 진학", "2": "취업 및 이민", "3": "자격 취득", "4": "개인적 관심",
    "5": "학업 요건", "6": "장학금 신청", "7": "비자 발급", "8": "기업 요구",
    "9": "한국 문화 관심", "10": "기타", "11": "미상",
};
const PURPOSE_LABELS = {
    "1": "대학 입학", "2": "대학원 입학", "3": "취업", "4": "비자 발급", "5": "장학금",
    "6": "자격증", "7": "개인 학습", "8": "기업 요구", "9": "유학", "10": "이민",
    "11": "한국어 교육", "12": "연구", "13": "교환학생", "14": "기타", "15": "미상",
};
export function jobLabel(code) {
    return code == null ? "" : JOB_LABELS[String(code)] ?? "";
}
export function motiveLabel(code) {
    return code == null ? "" : MOTIVE_LABELS[String(code)] ?? "";
}
export function purposeLabel(code) {
    return code == null ? "" : PURPOSE_LABELS[String(code)] ?? "";
}
/**
 * Build the 13-digit exam number.
 * 기능정의서 BO/02_접수관리 §3 부여 원칙:
 *   13자리 = ① 국가코드(3) + ② 지역코드(3) + ③ 수준코드(1) + ④ 시험장코드(2) + ⑤ 응시자코드(4)
 *   - 미얀마=국가코드 025, 양곤=지역코드 001 (exam_venues.country_code/region_code)
 *   - 수준코드: TOPIK Ⅰ→7, TOPIK Ⅱ→8
 *   - 시험장코드: exam_venues.venue_code (01~)
 *   - 응시자코드: 회차×시험장×수준 단위 0001부터 영문성명 알파벳 오름차순 순차 채번
 */
export function buildExamNumber(opts) {
    const country = String(opts.countryCode ?? "025").padStart(3, "0").slice(-3);
    const region = String(opts.regionCode ?? "001").padStart(3, "0").slice(-3);
    const levelCode = opts.level === "II" ? "8" : "7";
    const venue = String(opts.venueCode ?? "01").padStart(2, "0").slice(-2);
    const serial = String(opts.serial).padStart(4, "0").slice(-4);
    return `${country}${region}${levelCode}${venue}${serial}`;
}
export function formatExamDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return String(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${y}.${m}.${day} (${weekdays[d.getDay()]})`;
}
export function formatDateTime(iso) {
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
export function roundDisplayName(roundNo, title) {
    if (title && String(title).trim())
        return String(title).trim();
    return `제${roundNo}회`;
}
export async function loadApplicationForEmail(db, applicationId) {
    const { rows } = await db.query(`SELECT
       a.id AS application_id,
       a.application_no,
       a.exam_level,
       a.status,
       a.photo_review_status,
       a.rev,
       a.user_id,
       u.email AS user_email,
       u.name_ko AS user_name_ko,
       u.preferred_lang,
       r.round_no,
       r.title AS round_title,
       r.exam_date,
       v.name_ko AS venue_name
     FROM applications a
     INNER JOIN users u ON u.id = a.user_id
     INNER JOIN exam_rounds r ON r.id = a.exam_round_id
     INNER JOIN exam_venues v ON v.id = a.exam_venue_id
     WHERE a.id = $1
     LIMIT 1`, [applicationId]);
    return rows.length > 0 ? rows[0] : null;
}
export async function insertAuditLog(db, opts) {
    await db.query(`INSERT INTO admin_audit_logs (
       admin_user_id, target_table, target_id, action,
       status_before, status_after, memo, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        opts.adminId,
        opts.targetTable,
        opts.targetId,
        opts.action,
        opts.statusBefore ?? null,
        opts.statusAfter ?? null,
        opts.memo ?? null,
        opts.payload ? JSON.stringify(opts.payload) : null,
    ]);
}
export function adminDisplayName(admin) {
    const local = admin.email.split("@")[0] ?? "admin";
    return `관리자(${local})`;
}
export function generateTempPassword(length = 12) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const special = "!@#$%";
    const all = upper + lower + digits + special;
    const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
    const required = [pick(upper), pick(lower), pick(digits), pick(special)];
    const rest = [];
    const bytes = crypto.randomBytes(length - required.length);
    for (const b of bytes)
        rest.push(all[b % all.length]);
    const combined = [...required, ...rest];
    for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined.join("");
}
