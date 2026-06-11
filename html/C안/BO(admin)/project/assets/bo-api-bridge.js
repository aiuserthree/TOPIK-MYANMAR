/**
 * BO API bridge — keeps window.DataStore shape; loads/mutates via TopikBoApi.
 * On API failure: empty lists + state.apiError (no silent mock fallback).
 */
(function (global) {
  "use strict";

  var DS = global.DataStore;
  if (!DS || !global.TopikBoApi) return;

  var Api = global.TopikBoApi;
  var STATUS_MAP = {
    scheduled: "planned",
    open: "open",
    closed: "closed",
    revoked: "revoked",
  };
  var STATUS_TO_API = { planned: "scheduled", open: "open", closed: "closed" };

  function isoDate(v) {
    if (!v) return "";
    return String(v).slice(0, 10);
  }

  /** timestamptz → 달력용 날짜(YYYY-MM-DD, Asia/Seoul). UTC slice 시 접수기간이 하루 밀리는 문제 방지 */
  function isoDateKst(v) {
    if (!v) return "";
    var raw = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 10);
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch (e) {
      return raw.slice(0, 10);
    }
  }

  /** BO 회차 접수기간 — 달력에서 고른 날짜를 KST 자정/말일로 저장 */
  function kstDayStart(ymd) {
    return ymd + "T00:00:00+09:00";
  }
  function kstDayEnd(ymd) {
    return ymd + "T23:59:59+09:00";
  }

  /** UTC ISO → BO 관리자 표시용 한국시간(KST, UTC+9) 'YYYY-MM-DD HH:MM' */
  function fmtKst(v) {
    if (!v) return "";
    var d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v).replace("T", " ").slice(0, 16);
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      var pick = function (t) {
        var p = parts.find(function (x) { return x.type === t; });
        return p ? p.value : "";
      };
      return pick("year") + "-" + pick("month") + "-" + pick("day") + " " + pick("hour") + ":" + pick("minute");
    } catch (e) {
      return String(v).replace("T", " ").slice(0, 16);
    }
  }

  function levelUi(lv) {
    if (!lv) return "Ⅰ";
    var u = String(lv).toUpperCase();
    if (u === "II") return "Ⅱ";
    if (u === "I") return "Ⅰ";
    return lv;
  }

  function levelApi(lv) {
    if (lv === "Ⅱ") return "II";
    if (lv === "Ⅰ") return "I";
    return String(lv || "I").toUpperCase();
  }

  function mapApplicantStatus(row) {
    if (row.status === "cancelled") return "cancel";
    if (row.payment_status === "refunded") return "refund";
    if (row.status === "rejected" || row.photo_review_status === "rejected") return "rejected";
    if (row.status === "exam_number_assigned") return "approved";
    if (row.status === "approved" && row.approved_at) return "approved";
    if (row.status === "approved" && !row.approved_at) return "applied";
    if (row.photo_review_status === "pending" || row.status === "photo_review") {
      return row.status === "submitted" ? "applied" : "photo";
    }
    // 사진 승인 + 수납 완료, 승인처리 전 → 접수완료
    if (row.photo_review_status === "approved" && row.payment_status === "paid") return "applied";
    if (row.status === "payment_pending" || (row.photo_review_status === "approved" && row.payment_status !== "paid")) {
      return "pay";
    }
    if (row.status === "submitted") return "applied";
    return row.status || "applied";
  }

  // 연명부 양식 권위 코드표(「연명부 양식.xlsx」 / 계약서 3절) — 표시용 라벨
  var JOB_LABELS = {
    1: "학생", 2: "공무원(군인)", 3: "회사원", 4: "자영업",
    5: "주부", 6: "교사", 7: "무직", 8: "기타",
  };
  var MOTIVE_LABELS = {
    1: "방송", 2: "신문", 3: "잡지", 4: "교육기관", 5: "포스터", 6: "친지",
    7: "친구", 8: "인터넷", 9: "기타", 10: "지인(가족·친구등)", 11: "토픽홈페이지",
  };
  var PURPOSE_LABELS = {
    1: "유학", 2: "취업", 3: "관광", 4: "학술연구", 5: "한국어실력확인",
    6: "한국문화이해", 7: "기타", 8: "비자(VISA·영주권)", 9: "학점취득",
    10: "사회통합프로그램", 15: "체류자격관리",
  };
  function codeLabel(map, code) {
    if (code == null || code === "") return "";
    var n = Number(code);
    var l = map[n];
    return l ? l + "(" + n + ")" : String(code);
  }

  function mapApplicant(row, idx) {
    var photoOk = row.photo_review_status === "approved";
    var paid = row.payment_status === "paid";
    var photoFileId = row.photo_file_id != null ? row.photo_file_id : null;
    return {
      id: String(row.id),
      sessionId: String(row.exam_round_id),
      no: idx + 1,
      nameKo: row.name_ko || "—",
      nameEn: row.name_en || "—",
      dob: row.birth_date || "",
      sx: String(row.gender) === "2" ? 2 : 1,
      genderCode: row.gender ? (String(row.gender) === "2" ? "2" : "1") : "",
      nation: row.nationality || "미얀마",
      l1: row.first_language || "미얀마어",
      // 코드값(연명부 export 용) + 표시 라벨
      jobCode: row.job_code != null ? row.job_code : "",
      motiveCode: row.motivation_code != null ? row.motivation_code : (row.motive_code != null ? row.motive_code : ""),
      purposeCode: row.purpose_code != null ? row.purpose_code : "",
      job: codeLabel(JOB_LABELS, row.job_code) || "미상",
      motive: codeLabel(MOTIVE_LABELS, row.motivation_code != null ? row.motivation_code : row.motive_code) || "미상",
      purpose: codeLabel(PURPOSE_LABELS, row.purpose_code) || "미상",
      level: levelUi(row.exam_level),
      venueId: String(row.exam_venue_id),
      photoFileId: photoFileId,
      photoUrl: photoFileId != null ? Api.fileUrl(photoFileId) : "",
      photoOk: photoOk,
      photoStatus: row.photo_review_status || "pending",
      paid: paid,
      paidAt: fmtKst(row.paid_at),
      receipt: row.payment_receipt_no || "",
      exam: row.exam_number || "",
      status: mapApplicantStatus(row),
      appliedAt: fmtKst(row.created_at),
      rejectReason: row.reject_reason || "",
      memo: "",
      email: row.email || "",
      tel: row.phone || "",
      accommodation: !!row.accommodation_requested,
      rev: row.rev != null ? row.rev : null,
    };
  }

  function mapSession(row, applicantCounts) {
    var st = STATUS_MAP[row.registration_status] || "planned";
    return {
      id: String(row.id),
      no: row.round_no,
      name: row.title,
      applyStart: isoDateKst(row.registration_start_at),
      applyEnd: isoDateKst(row.registration_end_at),
      examDate: isoDate(row.exam_date),
      resultDate: isoDate(row.result_date), // null/empty → BO UI에서 '미정'
      cap: row.capacity,
      feeI: row.fee_level_i,
      feeII: row.fee_level_ii,
      venues: (row.venue_ids || []).map(String),
      status: st,
      applicants: applicantCounts[row.id] || 0,
      examNumberVisibleAt: row.exam_number_visible_at || "",
    };
  }

  function mapVenue(row, regionName) {
    return {
      id: String(row.id),
      code: row.venue_code,
      regionCode: row.region_code,
      region: regionName || row.region_code,
      nameKo: row.name_ko,
      nameEn: row.name_en || "",
      nameMy: row.name_my || "",
      address: row.address || "",
      cap: row.capacity,
      active: row.is_active !== false,
      memo: row.memo || "",
    };
  }

  function toDatetimeLocalKst(iso) {
    if (!iso) return "";
    return fmtKst(iso).replace(" ", "T");
  }

  function fromDatetimeLocalKst(local) {
    if (!local || !String(local).trim()) return null;
    return String(local).trim() + ":00+09:00";
  }

  function mapNotice(row, idx, author) {
    return {
      id: String(row.id),
      no: idx + 1,
      cat: row.category,
      title: row.title,
      titleMy: row.title_my || "",
      titleEn: row.title_en || "",
      body: row.body_html || "",
      bodyMy: row.body_my || "",
      bodyEn: row.body_en || "",
      author: author || "admin",
      createdAt: fmtKst(row.created_at || row.published_at),
      views: row.view_count || 0,
      public: !!row.is_published,
      pin: !!row.is_pinned,
      showStart: toDatetimeLocalKst(row.display_start_at),
      showEnd: toDatetimeLocalKst(row.display_end_at),
      deleted: !!row.is_deleted,
      deletedAt: fmtKst(row.deleted_at),
      attachments: (row.attachments || []).map(function (a) {
        return {
          file_id: a.file_id,
          filename: a.filename,
          size: a.size,
          url: a.url,
        };
      }),
    };
  }

  function mapFaq(row, idx) {
    return {
      id: String(row.id),
      no: idx + 1,
      cat: row.category,
      order: row.sort_order || idx + 1,
      question: row.question_ko,
      answer: row.answer_ko || "",
      questionMy: row.question_my || "",
      questionEn: row.question_en || "",
      answerMy: row.answer_my || "",
      answerEn: row.answer_en || "",
    };
  }

  var REFUND_STATUS_UI = {
    received: "접수", in_review: "검토중", completed: "처리완료", rejected: "반려",
  };
  var REFUND_STATUS_API = {
    "접수": "received", "검토중": "in_review", "처리완료": "completed", "반려": "rejected",
  };
  var TERM_KIND_UI = { service: "이용약관", privacy: "개인정보", marketing: "마케팅" };
  var TERM_KIND_API = { "이용약관": "service", "개인정보": "privacy", "마케팅": "marketing" };
  var TERM_STATUS_UI = { draft: "draft", published: "pub", retired: "retired" };
  var AUDIT_ACTION_UI = {
    approve: "승인", reject: "반려", payment_complete: "수납", payment_cancel: "수납취소",
    board_reply: "수정", board_delete: "삭제", board_workflow: "수정",
    term_create: "생성", term_update: "수정", term_publish: "게시", term_retire: "폐지",
    exam_round_revoke: "폐지", exam_round_restore: "복구",
    user_update: "수정", user_reset_password: "비밀번호초기화",
    admin_create: "생성", admin_update: "수정", admin_reset_password: "비밀번호초기화",
    exam_round_create: "생성", exam_venue_update: "수정", exam_number_assign: "수험번호부여",
    photo_review_approve: "승인", photo_review_reject: "반려",
    login: "로그인", logout: "로그아웃",
    permission_matrix_update: "수정", admin_change_password: "비밀번호초기화",
  };
  var ADMIN_ACCESS_ACTION_UI = {
    login: "로그인", logout: "로그아웃", login_failed: "로그인실패", session_expired: "세션만료",
  };
  var ADMIN_ACCESS_MEMO_UI = {
    invalid_credentials: "비밀번호 불일치",
    account_locked: "계정 잠금(5회 실패)",
  };
  var MEMBER_ACCESS_ACTION_UI = {
    login: "로그인", logout: "로그아웃", login_failed: "로그인실패",
    register: "로그인", google_login: "로그인", page_view: "페이지접근",
  };
  var MEMBER_ACCESS_MEMO_UI = {
    invalid_credentials: "비밀번호 불일치",
    account_locked: "계정 잠금(5회 실패)",
    profile_incomplete: "프로필 미완료",
    auto_login_after_register: "회원가입 후 자동 로그인",
    google: "Google 로그인",
    google_register: "Google 회원가입",
  };
  var ADMIN_ACCESS_ACTION_API = {
    "로그인": "login", "로그아웃": "logout", "로그인실패": "login_failed", "세션만료": "session_expired",
  };
  var MEMBER_ACCESS_ACTION_API = {
    "로그인": "login", "로그아웃": "logout", "로그인실패": "login_failed", "페이지접근": "page_view",
  };
  var AUDIT_TYPE_UI = {
    applications: "접수자", board_posts: "게시판", users: "회원", terms: "약관",
    admin_users: "관리자계정", exam_rounds: "회차", exam_venues: "시험장",
    notices: "공지", faq_items: "FAQ",
  };

  function roleUi(r) {
    if (r === "admin" || r === "standard") return "general";
    if (r === "readonly") return "viewer";
    return r || "general";
  }
  function roleApi(r) {
    if (r === "general") return "admin";
    if (r === "viewer") return "readonly";
    return r;
  }

  function mapMatrixToPerms(matrix) {
    return {
      super: DS.recommendedPerms("super"),
      general: (matrix && matrix.admin) || DS.recommendedPerms("general"),
      viewer: (matrix && matrix.readonly) || DS.recommendedPerms("viewer"),
    };
  }

  function permsDraftToApi(draft) {
    return {
      admin: draft.general || {},
      readonly: draft.viewer || {},
    };
  }
  function memberStatusUi(s) {
    return s === "suspended" ? "inactive" : s;
  }
  function memberStatusApi(s) {
    return s === "inactive" ? "suspended" : s;
  }

  // admin_replier_id(DB 순번) → 관리자 이름/이메일 표시
  function resolveAdminLabel(adminId) {
    if (adminId == null || adminId === "") return "";
    var key = String(adminId);
    var admins = (DS.state && DS.state.admins) || [];
    var hit = admins.find(function (a) { return a.id === key || a.email === key; });
    if (hit) return hit.name || hit.email || key;
    return key;
  }

  function currentAdminLabel() {
    var me = DS.state && DS.state.me;
    if (!me) return "admin";
    if (me.name) return me.name;
    if (me.email) return me.email;
    if (me.id && String(me.id).indexOf("@") >= 0) return me.id;
    return resolveAdminLabel(me.id) || "admin";
  }

  function mapRefund(row, idx) {
    return {
      id: String(row.id),
      no: idx + 1,
      type: row.category || row.post_type || "환불",
      title: row.title,
      author: row.author_email || row.author_name || ("user" + row.user_id),
      createdAt: fmtKst(row.created_at),
      status: REFUND_STATUS_UI[row.workflow_status] || "접수",
      hasAnswer: !!row.has_admin_reply || !!row.admin_reply,
      assignee: resolveAdminLabel(row.admin_replier_id),
      body: row.body || "",
      attachments: [],
      replies: mapOfficialReplies(row),
      comments: [],
    };
  }

  function mapInquiry(row, idx) {
    var done = row.workflow_status === "answered";
    return {
      id: String(row.id),
      no: idx + 1,
      cat: row.category || "기타",
      secret: !!row.is_secret,
      title: row.title,
      author: row.author_email || row.author_name || ("user" + row.user_id),
      createdAt: fmtKst(row.created_at),
      status: done ? "done" : "wait",
      assignee: resolveAdminLabel(row.admin_replier_id),
      body: row.body || "",
      replies: mapOfficialReplies(row),
      comments: [],
    };
  }

  function mapOfficialReply(r) {
    return {
      id: r.id != null ? String(r.id) : undefined,
      author: r.author || "관리자",
      body: r.body || "",
      ts: r.created_at_label || fmtKst(r.created_at),
      kind: "reply",
    };
  }

  function mapOfficialReplies(row) {
    if (row.admin_replies && row.admin_replies.length) {
      return row.admin_replies.map(mapOfficialReply);
    }
    if (row.admin_reply) {
      return [{
        author: resolveAdminLabel(row.admin_replier_id) || "관리자",
        body: row.admin_reply,
        ts: fmtKst(row.admin_replied_at),
        kind: "reply",
      }];
    }
    return [];
  }

  // 게시판 댓글/대댓글 — FO 응답 계약: comments[]{author,is_admin,replies[]}
  function mapComment(c) {
    return {
      id: c.id != null ? String(c.id) : undefined,
      parentId: c.parent_comment_id != null ? String(c.parent_comment_id)
        : (c.parent_id != null ? String(c.parent_id) : null),
      author: c.author || c.author_name || (c.is_admin ? "관리자" : (c.author_email || "작성자")),
      body: c.content || c.body || "",
      public: c.is_public != null ? !!c.is_public : (c.is_secret != null ? !c.is_secret : true),
      ts: c.created_at_label || fmtKst(c.created_at),
      kind: "comment",
      replies: (c.replies || []).map(mapComment),
    };
  }

  // 중첩(replies) 구조를 BO 표시용 평면 목록으로 — 부모 다음에 자식 배치 (레거시)
  function flattenComments(items) {
    var out = [];
    (items || []).forEach(function (c) {
      out.push(mapComment(c));
      (c.replies || []).forEach(function (r) { out.push(mapComment(r)); });
    });
    return out;
  }

  function mapConsent(row) {
    return {
      id: row.id != null ? String(row.id) : ("c" + Math.random().toString(36).slice(2, 8)),
      memberId: row.user_email || row.member_id || (row.user_id != null ? String(row.user_id) : "—"),
      termsKind: TERM_KIND_UI[row.term_type] || row.term_type || row.terms_kind || "—",
      version: row.version || "",
      ts: row.created_at_label || fmtKst(row.agreed_at || row.created_at),
      ip: row.ip_address || "—",
      method: row.consent_method || row.method || "체크박스",
    };
  }

  function mapMember(row, idx) {
    return {
      id: String(row.id),
      no: idx + 1,
      nameKo: row.name_ko || "—",
      nameEn: row.name_en || "—",
      email: row.email || "",
      tel: row.phone || "",
      nation: row.nationality || "—",
      joinedAt: isoDate(row.created_at),
      lastLogin: fmtKst(row.last_login_at) || "—",
      status: memberStatusUi(row.status || "active"),
      marketing: !!row.marketing_opt_in,
      signupProvider: row.signup_provider || "email",
      reason: "",
      rev: row.rev != null ? row.rev : null,
    };
  }

  function mapTerm(row) {
    return {
      id: String(row.id),
      kind: TERM_KIND_UI[row.term_type] || row.term_type,
      version: row.version,
      body: row.body_ko || "",
      bodyMy: row.body_my || "",
      bodyEn: row.body_en || "",
      publishedAt: row.published_at ? isoDate(row.published_at) : "",
      retiredAt: row.status === "retired" && row.published_at ? isoDate(row.published_at) : "",
      status: TERM_STATUS_UI[row.status] || row.status,
      author: DS.state.me && DS.state.me.id ? String(DS.state.me.id) : "admin",
      scheduledAt: row.effective_at || "",
    };
  }

  function mapAdmin(row) {
    return {
      id: String(row.id),
      name: row.name,
      email: row.email,
      role: roleUi(row.role),
      status: row.status === "inactive" ? "inactive" : "active",
      lastLogin: fmtKst(row.last_login_at) || "—",
      lastIp: "—",
      note: "",
    };
  }

  function mapAudit(row) {
    return {
      id: "log" + row.id,
      ts: fmtKst(row.created_at),
      actor: row.admin_email || (row.admin_user_id ? String(row.admin_user_id) : "admin"),
      ip: row.ip_address || "—",
      type: AUDIT_TYPE_UI[row.target_type] || row.target_type || "—",
      targetId: String(row.target_id || "—"),
      action: AUDIT_ACTION_UI[row.action_type] || row.action_type || "—",
      before: row.before_data || null,
      after: row.after_data || null,
      memo: row.memo || "",
    };
  }

  function mapAdminAccessLog(row) {
    return {
      id: "aal" + row.id,
      ts: fmtKst(row.created_at),
      adminId: row.admin_id || String(row.admin_user_id || "unknown"),
      name: row.admin_name || "—",
      ip: row.ip_address || "—",
      action: ADMIN_ACCESS_ACTION_UI[row.action_type] || row.action_type || "—",
      result: row.success ? "성공" : "실패",
      userAgent: row.user_agent || "",
      memo: ADMIN_ACCESS_MEMO_UI[row.memo] || row.memo || "",
    };
  }

  function mapMemberAccessLog(row) {
    return {
      id: "mal" + row.id,
      ts: fmtKst(row.created_at),
      memberId: row.member_id || (row.user_id ? String(row.user_id) : "—"),
      email: row.email || "—",
      ip: row.ip_address || "—",
      action: MEMBER_ACCESS_ACTION_UI[row.action_type] || row.action_type || "—",
      path: row.path || "—",
      result: row.success ? "성공" : "실패",
      userAgent: row.user_agent || "",
      memo: MEMBER_ACCESS_MEMO_UI[row.memo] || row.memo || "",
    };
  }

  function mapPermHistory(row) {
    var role = row.role;
    if (role === "admin") role = "general";
    if (role === "readonly") role = "viewer";
    return {
      id: "ph" + row.id,
      ts: fmtKst(row.created_at),
      actor: row.actor || "—",
      ip: row.ip_address || "—",
      target: row.target || "—",
      changeType: row.change_type || "—",
      role: role || "—",
      menu: row.menu || "—",
      before: row.before_data || null,
      after: row.after_data || null,
      memo: row.memo || "",
    };
  }

  function fail(msg) {
    DS.state.apiError = msg;
    DS.state.applicants = [];
    DS.state.sessions = [];
    DS.state.venues = [];
    DS.state.notices = [];
    DS.state.noticeTrash = [];
    DS.state.faqs = [];
    DS.state.refunds = [];
    DS.state.inquiries = [];
    DS.state.members = [];
    DS.state.terms = [];
    DS.state.admins = [];
    DS.state.audit = [];
    DS.state.adminAccessLogs = [];
    DS.state.memberAccessLogs = [];
    DS.state.permHistory = [];
    DS.notify();
    return false;
  }

  function clearLists() {
    DS.state.applicants = [];
    DS.state.sessions = [];
    DS.state.venues = [];
    DS.state.notices = [];
    DS.state.noticeTrash = [];
    DS.state.faqs = [];
    DS.state.refunds = [];
    DS.state.inquiries = [];
    DS.state.members = [];
    DS.state.terms = [];
    DS.state.admins = [];
    DS.state.audit = [];
  }

  function toastErr(msg) {
    if (typeof global.toastErr === "function") global.toastErr(msg);
  }

  function applicantRev(id) {
    var a = DS.state.applicants.find(function (x) { return x.id === String(id); });
    return a && a.rev != null ? a.rev : undefined;
  }

  function memberRev(id) {
    var m = DS.state.members.find(function (x) { return x.id === String(id); });
    return m && m.rev != null ? m.rev : undefined;
  }

  function handleMutation(res, reloadFn) {
    if (Api.isConflict && Api.isConflict(res)) {
      toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
      if (reloadFn) return reloadFn().then(function () { return false; });
      return Promise.resolve(false);
    }
    if (!res.ok) {
      toastErr(TopikBoApi.parseError(res));
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  function applyRevFromResponse(id, res) {
    if (res.body && res.body.rev != null) {
      var a = DS.state.applicants.find(function (x) { return x.id === String(id); });
      if (a) a.rev = res.body.rev;
    }
  }

  function regionNameMap(items) {
    var m = {};
    (items || []).forEach(function (r) {
      m[r.region_code] = r.name_ko || r.name_en || r.region_code;
    });
    return m;
  }

  DS.useApi = false;
  DS.apiLoading = false;

  DS.isApiMode = function () {
    return DS.useApi && Api.canUseApi() && !!Api.getAccessToken();
  };

  DS.initFromApi = function () {
    if (!Api.canUseApi() || !Api.getAccessToken()) {
      DS.useApi = false;
      return Promise.resolve(false);
    }
    DS.useApi = true;
    DS.apiLoading = true;
    DS.state.apiError = null;
    DS.notify();

    return Promise.all([
      Api.getRegionCodes(),
      Api.getExamVenues(),
      Api.getExamRounds(),
      Api.getApplications({ page_size: 200 }),
      Api.getNotices(),
      Api.getFaq(),
      Api.getBoardPosts("refund_correction", { page_size: 200 }),
      Api.getBoardPosts("inquiry", { page_size: 200 }),
      Api.getUsers(),
      Api.getTerms(),
      Api.getAdminUsers(),
      Api.getAuditLogs(),
      Api.getPermissionMatrix(),
    ]).then(function (results) {
      var regRes = results[0];
      var venRes = results[1];
      var rndRes = results[2];
      var appRes = results[3];
      var notRes = results[4];
      var faqRes = results[5];
      var refRes = results[6];
      var inqRes = results[7];
      var memRes = results[8];
      var termRes = results[9];
      var admRes = results[10];
      var audRes = results[11];
      var permRes = results[12];

      var critical = [regRes, venRes, rndRes, appRes, notRes, faqRes, refRes, inqRes, memRes, termRes, admRes];
      var bad = critical.find(function (r) { return !r.ok; });
      if (bad) {
        DS.apiLoading = false;
        return fail(TopikBoApi.parseError(bad) || "API 데이터를 불러오지 못했습니다.");
      }

      var regions = (regRes.body && regRes.body.items) || [];
      DS.state.regions = regions.map(function (r) {
        return { code: r.region_code, name: (r.name_ko || r.name_en) + "(" + r.name_en + ")" };
      });
      if (!DS.state.regions.length) {
        DS.state.regions = [
          { code: "001", name: "양곤(Yangon)" },
          { code: "002", name: "만달레이(Mandalay)" },
          { code: "003", name: "네피도(Naypyidaw)" },
          { code: "004", name: "몽유와(Monywa)" },
        ];
      }

      var rmap = regionNameMap(regions);
      DS.state.venues = ((venRes.body && venRes.body.items) || []).map(function (v) {
        return mapVenue(v, rmap[v.region_code]);
      });

      var apps = (appRes.body && appRes.body.items) || [];
      var counts = {};
      apps.forEach(function (a) {
        counts[a.exam_round_id] = (counts[a.exam_round_id] || 0) + 1;
      });

      DS.state.sessions = ((rndRes.body && rndRes.body.items) || []).map(function (s) {
        return mapSession(s, counts);
      });

      DS.state.applicants = apps.map(mapApplicant);
      DS.state.notices = ((notRes.body && notRes.body.items) || []).map(function (n, i) {
        return mapNotice(n, i, DS.state.me && DS.state.me.id);
      });
      DS.state.faqs = ((faqRes.body && faqRes.body.items) || []).map(mapFaq);
      DS.state.members = ((memRes.body && memRes.body.items) || []).map(mapMember);
      DS.state.terms = ((termRes.body && termRes.body.items) || []).map(mapTerm);
      DS.state.admins = ((admRes.body && admRes.body.items) || []).map(mapAdmin);
      DS.state.refunds = ((refRes.body && refRes.body.items) || []).map(mapRefund);
      DS.state.inquiries = ((inqRes.body && inqRes.body.items) || []).map(mapInquiry);
      // 약관 동의 이력은 동의 이력 패널 진입 시 실제 API로 지연 로드(목업 제거)
      DS.state.consents = [];

      if (audRes.ok && audRes.body && audRes.body.items) {
        DS.state.audit = audRes.body.items.map(mapAudit);
      } else {
        DS.state.audit = [];
      }

      if (permRes.ok && permRes.body && permRes.body.matrix) {
        DS.state.perms = mapMatrixToPerms(permRes.body.matrix);
      }

      var isSuper = DS.state.me && (DS.state.me.role === "super");
      if (isSuper) {
        DS.state.adminAccessLogs = [];
        DS.state.memberAccessLogs = [];
        DS.state.permHistory = [];
        return Promise.all([
          Api.getAdminAccessLogs({ page_size: 500 }),
          Api.getMemberAccessLogs({ page_size: 500 }),
          Api.getPermissionHistory({ page_size: 500 }),
        ]).then(function (extra) {
          if (extra[0].ok && extra[0].body && extra[0].body.items) {
            DS.state.adminAccessLogs = extra[0].body.items.map(mapAdminAccessLog);
          }
          if (extra[1].ok && extra[1].body && extra[1].body.items) {
            DS.state.memberAccessLogs = extra[1].body.items.map(mapMemberAccessLog);
          }
          if (extra[2].ok && extra[2].body && extra[2].body.items) {
            DS.state.permHistory = extra[2].body.items.map(mapPermHistory);
          }
          return finishInit();
        });
      }
      DS.state.adminAccessLogs = [];
      DS.state.memberAccessLogs = [];
      DS.state.permHistory = [];
      return finishInit();

      function finishInit() {
        if (DS.state.sessions.length) {
          var open = DS.state.sessions.find(function (s) { return s.status === "open"; });
          DS.state.activeSessionId = (open || DS.state.sessions[0]).id;
        }
        DS.apiLoading = false;
        DS.state.apiError = null;
        DS.notify();
        return true;
      }
    }).catch(function () {
      DS.apiLoading = false;
      return fail("API 연결에 실패했습니다.");
    });
  };

  DS.reloadApplicants = function (sessionId) {
    if (!DS.isApiMode()) return Promise.resolve();
    var q = { page_size: 200 };
    if (sessionId) q.exam_round_id = sessionId;
    return Api.getApplications(q).then(function (res) {
      if (!res.ok) {
        DS.state.apiError = TopikBoApi.parseError(res);
        DS.state.applicants = [];
      } else {
        DS.state.applicants = ((res.body && res.body.items) || []).map(mapApplicant);
        DS.state.apiError = null;
      }
      DS.notify();
    });
  };

  function applyLocalApplicant(id, patch) {
    var a = DS.state.applicants.find(function (x) { return x.id === String(id); });
    if (a) Object.assign(a, patch);
    DS.notify();
  }

  DS.apiPhotoApprove = function (id) {
    var sessionId = DS.state.activeSessionId;
    return Api.photoReview(id, { action: "approve" }, { rev: applicantRev(id) }).then(function (res) {
      return handleMutation(res, function () { return DS.reloadApplicants(sessionId); }).then(function (ok) {
        if (!ok) return false;
        applyRevFromResponse(id, res);
        var a = DS.state.applicants.find(function (x) { return x.id === String(id); });
        applyLocalApplicant(id, {
          photoStatus: "approved",
          photoOk: true,
          status: a && a.paid ? "applied" : "pay",
        });
        return true;
      });
    });
  };

  DS.apiPhotoReject = function (id, reason) {
    var sessionId = DS.state.activeSessionId;
    return Api.photoReview(id, { action: "reject", photo_reject_note: reason }, { rev: applicantRev(id) }).then(function (res) {
      return handleMutation(res, function () { return DS.reloadApplicants(sessionId); }).then(function (ok) {
        if (!ok) return false;
        applyRevFromResponse(id, res);
        applyLocalApplicant(id, { photoStatus: "rejected", photoOk: false, status: "photo", rejectReason: reason });
        return true;
      });
    });
  };

  DS.apiApprove = function (ids) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.approveApplication(id, {}, { rev: applicantRev(id) });
    })).then(function (ress) {
      var conflict = ress.find(function (r) { return Api.isConflict(r); });
      if (conflict) {
        toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
        return DS.reloadApplicants(sessionId).then(function () { return 0; });
      }
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      return DS.reloadApplicants(sessionId).then(function () { return ids.length; });
    });
  };

  DS.apiReject = function (ids, reason) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.rejectApplication(id, { reject_reason: reason }, { rev: applicantRev(id) });
    })).then(function (ress) {
      var conflict = ress.find(function (r) { return Api.isConflict(r); });
      if (conflict) {
        toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
        return DS.reloadApplicants(sessionId).then(function () { return 0; });
      }
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      return DS.reloadApplicants(sessionId).then(function () { return ids.length; });
    });
  };

  DS.apiPay = function (ids, info) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.paymentApplication(id, { receipt_no: info.receipt, payment_memo: info.memo }, { rev: applicantRev(id) });
    })).then(function (ress) {
      var conflict = ress.find(function (r) { return Api.isConflict(r); });
      if (conflict) {
        toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
        return DS.reloadApplicants(sessionId).then(function () { return 0; });
      }
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      return DS.reloadApplicants(sessionId).then(function () { return ids.length; });
    });
  };

  DS.apiCancelPay = function (ids, reason) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.cancelPayment(id, { payment_cancel_reason: reason }, { rev: applicantRev(id) });
    })).then(function (ress) {
      var conflict = ress.find(function (r) { return Api.isConflict(r); });
      if (conflict) {
        toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
        return DS.reloadApplicants(sessionId).then(function () { return 0; });
      }
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      ress.forEach(function (res, i) {
        applyRevFromResponse(ids[i], res);
      });
      ids.forEach(function (id) { applyLocalApplicant(id, { paid: false, status: "refund" }); });
      return ids.length;
    });
  };

  DS.apiAssignExamNumbers = function (sessionId, preview) {
    return Api.assignExamNumbers(sessionId, { dry_run: !!preview }).then(function (res) {
      if (Api.isConflict && Api.isConflict(res)) {
        toastErr("다른 관리자가 먼저 처리 중이거나 이미 부여되었습니다. 새로고침 후 다시 시도해 주세요.");
        return DS.reloadApplicants(sessionId).then(function () { return null; });
      }
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      if (!preview && res.body) {
        return DS.reloadApplicants(sessionId).then(function () { return res.body; });
      }
      return res.body;
    });
  };

  DS.apiRevokeSession = function (id) {
    return Api.revokeExamRound(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiSaveSession = function (data) {
    var payload = {
      round_no: data.no,
      title: data.name,
      exam_date: data.examDate,
      registration_start_at: kstDayStart(data.applyStart),
      registration_end_at: kstDayEnd(data.applyEnd),
      fee_level_i: data.feeI,
      fee_level_ii: data.feeII,
      capacity: data.cap,
      venue_ids: (data.venues || []).map(function (v) { return parseInt(v, 10); }).filter(Boolean),
    };
    var p = data.id && !data._isNew
      ? Api.updateExamRound(data.id, payload)
      : Api.createExamRound(payload);
    return p.then(function (res) {
      if (!res || !res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiSaveVenue = function (data) {
    var payload = {
      venue_code: data.code,
      name_ko: data.nameKo,
      name_en: data.nameEn,
      name_my: data.nameMy || null,
      address: data.address,
      region_code: data.regionCode,
      capacity: data.cap,
      memo: data.memo || null,
    };
    var p = data.id && !data._isNew
      ? Api.updateExamVenue(data.id, Object.assign(payload, { is_active: data.active }))
      : Api.createExamVenue(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.reloadNotices = function (opts) {
    opts = opts || {};
    if (!DS.isApiMode()) return Promise.resolve();
    var q = opts.trash ? { trash: "true" } : {};
    return Api.getNotices(q).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      var list = ((res.body && res.body.items) || []).map(function (n, i) {
        return mapNotice(n, i, currentAdminLabel());
      });
      if (opts.trash) {
        DS.state.noticeTrash = list;
      } else {
        DS.state.notices = list;
      }
      DS.notify();
      return true;
    });
  };

  DS.apiSaveNotice = function (data) {
    var payload = {
      category: data.cat,
      title: data.title,
      title_my: data.titleMy || null,
      title_en: data.titleEn || null,
      body_html: data.body || "",
      body_my: data.bodyMy || null,
      body_en: data.bodyEn || null,
      is_pinned: !!data.pin,
      is_published: !!data.public,
      display_start_at: fromDatetimeLocalKst(data.showStart),
      display_end_at: fromDatetimeLocalKst(data.showEnd),
      attachment_file_ids: data.attachmentFileIds || [],
      remove_attachment_file_ids: data.removeAttachmentFileIds || [],
    };
    var isNew = !data.id || data._isNew;
    var p = !isNew
      ? Api.updateNotice(data.id, payload)
      : Api.createNotice(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var noticeId = !isNew ? data.id : (res.body && (res.body.id || res.body.notice_id));
      var sendP = Promise.resolve({ ok: true, body: { queued: 0 } });
      if (isNew && data.public && noticeId && Api.sendMarketingNotice) {
        sendP = Api.sendMarketingNotice(noticeId);
      }
      return sendP.then(function (mailRes) {
        if (mailRes.ok && mailRes.body && mailRes.body.queued > 0) {
          toastOk("공지 등록 완료 · 마케팅 동의 회원 " + mailRes.body.queued + "명에게 알림을 발송했습니다.");
        }
        return DS.initFromApi();
      });
    });
  };

  DS.apiDeleteNotice = function (id) {
    return Api.deleteNotice(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      DS.state.notices = DS.state.notices.filter(function (n) { return n.id !== String(id); });
      DS.notify();
      return true;
    });
  };

  DS.apiRestoreNotice = function (id) {
    return Api.restoreNotice(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      if (DS.state.noticeTrash) {
        DS.state.noticeTrash = DS.state.noticeTrash.filter(function (n) { return n.id !== String(id); });
      }
      return DS.reloadNotices();
    });
  };

  DS.apiSaveFaq = function (data) {
    var payload = {
      category: data.cat,
      question_ko: data.question,
      answer_ko: data.answer,
      question_my: data.questionMy || null,
      question_en: data.questionEn || null,
      answer_my: data.answerMy || null,
      answer_en: data.answerEn || null,
      sort_order: data.order || 0,
      is_active: true,
    };
    var p = data.id && !data._isNew
      ? Api.updateFaq(data.id, payload)
      : Api.createFaq(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiDeleteFaq = function (id) {
    return Api.updateFaq(id, { is_active: false }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      DS.state.faqs = DS.state.faqs.filter(function (f) { return f.id !== String(id); });
      DS.notify();
      return true;
    });
  };

  DS.apiBoardReply = function (id, body, boardKind, opts) {
    opts = opts || {};
      return Api.replyBoardPost(id, { body: body, mark_complete: opts.markDone !== false }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var list = boardKind === "inquiry" ? DS.state.inquiries : DS.state.refunds;
      var row = list.find(function (x) { return x.id === String(id); });
      if (row) {
        row.hasAnswer = true;
        row.replies = row.replies || [];
        row.replies.push({
          author: currentAdminLabel(),
          body: body,
          ts: new Date().toISOString().slice(0, 16).replace("T", " "),
          kind: "reply",
        });
        if (boardKind === "inquiry" && opts.markDone) row.status = "done";
        if (boardKind === "refund" && opts.status) row.status = opts.status;
        row.assignee = currentAdminLabel();
      }
      DS.notify();
      if (DS.apiLoadBoardDetail) DS.apiLoadBoardDetail(id, boardKind);
      return true;
    });
  };

  DS.apiBoardWorkflow = function (id, statusUi, boardKind) {
    var wf = boardKind === "inquiry"
      ? (statusUi === "done" ? "answered" : "awaiting_reply")
      : REFUND_STATUS_API[statusUi];
    if (!wf) return Promise.resolve(false);
    return Api.setBoardWorkflow(id, wf).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var list = boardKind === "inquiry" ? DS.state.inquiries : DS.state.refunds;
      var row = list.find(function (x) { return x.id === String(id); });
      if (row) {
        if (boardKind === "inquiry") row.status = statusUi === "done" ? "done" : "wait";
        else row.status = statusUi;
      }
      DS.notify();
      return true;
    });
  };

  DS.apiDeleteBoardPost = function (id, boardKind) {
    return Api.deleteBoardPost(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      if (boardKind === "inquiry") {
        DS.state.inquiries = DS.state.inquiries.filter(function (x) { return x.id !== String(id); });
      } else {
        DS.state.refunds = DS.state.refunds.filter(function (x) { return x.id !== String(id); });
      }
      DS.notify();
      return true;
    });
  };

  // 게시판 상세(답변 이력 + 댓글) — 조회
  DS.apiLoadBoardDetail = function (id, boardKind) {
    if (!DS.isApiMode()) return Promise.resolve(null);
    return Api.getBoardPost(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      var post = (res.body && res.body.post) || res.body;
      var list = boardKind === "inquiry" ? DS.state.inquiries : DS.state.refunds;
      var row = list.find(function (x) { return x.id === String(id); });
      if (row && post) {
        row.replies = mapOfficialReplies(post);
        row.comments = (post.comments || []).map(mapComment);
        row.hasAnswer = !!(row.replies && row.replies.length);
        if (post.body) row.body = post.body;
      }
      DS.notify();
      return post;
    });
  };

  // 게시판 댓글/대댓글 — 조회/작성 (계약서 6.3)
  DS.apiLoadComments = function (id, boardKind) {
    if (!DS.isApiMode()) return Promise.resolve(null);
    return Api.getBoardComments(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      var comments = ((res.body && res.body.comments) || (res.body && res.body.items) || []).map(mapComment);
      var list = boardKind === "inquiry" ? DS.state.inquiries : DS.state.refunds;
      var row = list.find(function (x) { return x.id === String(id); });
      if (row) {
        row.comments = comments;
      }
      DS.notify();
      return comments;
    });
  };

  DS.apiAddComment = function (id, content, parentId, boardKind, isPublic) {
    if (!DS.isApiMode()) return Promise.resolve(false);
    var payload = { content: content };
    if (parentId != null && parentId !== "") payload.parent_id = Number(parentId);
    if (isPublic != null) payload.is_public = !!isPublic;
    return Api.createBoardComment(id, payload).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var reload = DS.apiLoadBoardDetail || DS.apiLoadComments;
      return reload(id, boardKind).then(function () { return true; });
    });
  };

  // 약관 동의 이력 (계약서 6.4) — GET /api/v1/admin/terms/consents
  DS.apiLoadConsents = function (query) {
    if (!DS.isApiMode()) return Promise.resolve(null);
    return Api.getTermsConsents(query || {}).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); DS.state.consents = []; DS.notify(); return null; }
      DS.state.consents = ((res.body && (res.body.items || res.body.consents)) || []).map(mapConsent);
      DS.notify();
      return DS.state.consents;
    });
  };

  // 수험번호/수험표 노출 시점 저장 (계약서 5절 — exam_number_visible_at)
  DS.apiSetExamVisibility = function (roundId, visibleAtIso) {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.setExamNumberVisibility(roundId, visibleAtIso).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var s = DS.state.sessions.find(function (x) { return x.id === String(roundId); });
      if (s) s.examNumberVisibleAt = visibleAtIso || "";
      DS.notify();
      return true;
    });
  };

  // 사진 zip 서버 다운로드 (계약서 4절) — 클라 더미 제거
  DS.apiDownloadPhotosZip = function (query) {
    if (!DS.isApiMode()) return Promise.resolve({ ok: false, body: { error: { message: "API 모드가 아닙니다." } } });
    return Api.downloadPhotosZip(query || {});
  };

  DS.reloadMembers = function () {
    if (!DS.isApiMode()) return Promise.resolve();
    return Api.getUsers().then(function (res) {
      if (!res.ok) {
        DS.state.apiError = TopikBoApi.parseError(res);
        return false;
      }
      DS.state.members = ((res.body && res.body.items) || []).map(mapMember);
      DS.notify();
      return true;
    });
  };

  DS.apiSaveMember = function (id, data, memo) {
    return Api.updateUser(id, {
      name_ko: data.nameKo,
      name_en: data.nameEn,
      phone: data.tel,
      nationality: data.nation,
      marketing_opt_in: data.marketing,
      memo: (memo || "").trim() || undefined,
    }, { rev: memberRev(id) }).then(function (res) {
      return handleMutation(res, function () { return DS.reloadMembers(); }).then(function (ok) {
        if (!ok) return false;
        return DS.initFromApi();
      });
    });
  };

  DS.apiMemberStatus = function (id, status, reason) {
    return Api.updateUser(id, {
      status: memberStatusApi(status),
      memo: (reason || "").trim() || undefined,
    }, { rev: memberRev(id) }).then(function (res) {
      return handleMutation(res, function () { return DS.reloadMembers(); }).then(function (ok) {
        if (!ok) return false;
        var m = DS.state.members.find(function (x) { return x.id === String(id); });
        if (m) { m.status = status; m.reason = reason || m.reason; }
        if (res.body && res.body.rev != null && m) m.rev = res.body.rev;
        DS.notify();
        return true;
      });
    });
  };

  DS.apiResetMemberPassword = function (id) {
    return Api.resetUserPassword(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      return (res.body && res.body.temp_password) || null;
    });
  };

  DS.apiSaveTerm = function (data) {
    var payload = {
      term_type: TERM_KIND_API[data.kind] || data.kind,
      version: data.version,
      title: (TERM_KIND_UI[TERM_KIND_API[data.kind]] || data.kind) + " " + data.version,
      body_ko: data.body || "",
      body_my: data.bodyMy || null,
      body_en: data.bodyEn || null,
      effective_at: data.scheduledAt || null,
    };
    var p = data.id && !data._isNew
      ? Api.updateTerm(data.id, payload)
      : Api.createTerm(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiPublishTerm = function (id) {
    return Api.publishTerm(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiRetireTerm = function (id) {
    return Api.retireTerm(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiSaveAdmin = function (data) {
    if (data._isNew) {
      return Api.createAdminUser({
        email: data.email,
        password: data.pw,
        name: data.name,
        role: roleApi(data.role),
      }).then(function (res) {
        if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
        return DS.initFromApi();
      });
    }
    return Api.updateAdminUser(data.id, {
      name: data.name,
      email: data.email,
      role: roleApi(data.role),
      status: data.status,
    }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiToggleAdmin = function (id, status, reason) {
    return Api.updateAdminUser(id, { status: status }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var a = DS.state.admins.find(function (x) { return x.id === String(id); });
      if (a) a.status = status;
      DS.notify();
      return true;
    });
  };

  DS.apiResetAdminPassword = function (id) {
    return Api.resetAdminPassword(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      return (res.body && res.body.temp_password) || null;
    });
  };

  DS.reloadAudit = function () {
    if (!DS.isApiMode()) return Promise.resolve();
    return Api.getAuditLogs().then(function (res) {
      if (!res.ok) {
        DS.state.apiError = TopikBoApi.parseError(res);
        DS.state.audit = [];
      } else {
        DS.state.audit = ((res.body && res.body.items) || []).map(mapAudit);
        DS.state.apiError = null;
      }
      DS.notify();
    });
  };

  DS.reloadAdminAccessLogs = function (q) {
    if (!DS.isApiMode()) return Promise.resolve();
    return Api.getAdminAccessLogs(Object.assign({ page_size: 500 }, q || {})).then(function (res) {
      if (res.ok && res.body && res.body.items) {
        DS.state.adminAccessLogs = res.body.items.map(mapAdminAccessLog);
      }
      DS.notify();
    });
  };

  DS.reloadMemberAccessLogs = function (q) {
    if (!DS.isApiMode()) return Promise.resolve();
    return Api.getMemberAccessLogs(Object.assign({ page_size: 500 }, q || {})).then(function (res) {
      if (res.ok && res.body && res.body.items) {
        DS.state.memberAccessLogs = res.body.items.map(mapMemberAccessLog);
      }
      DS.notify();
    });
  };

  DS.reloadPermHistory = function (q) {
    if (!DS.isApiMode()) return Promise.resolve();
    return Api.getPermissionHistory(Object.assign({ page_size: 500 }, q || {})).then(function (res) {
      if (res.ok && res.body && res.body.items) {
        DS.state.permHistory = res.body.items.map(mapPermHistory);
      }
      DS.notify();
    });
  };

  /** 접수자 상세 LP — 해당 접수 건(target_type=applications) 처리 이력만 조회 */
  DS.fetchApplicantAudit = function (appId) {
    if (!DS.isApiMode()) return Promise.resolve(null);
    var id = String(appId);
    return Api.getApplication(id).then(function (res) {
      if (res.ok && res.body && res.body.audit_logs) {
        return res.body.audit_logs.map(mapAudit);
      }
      return Api.getAuditLogs({ target_type: "applications", target_id: id }).then(function (audRes) {
        if (!audRes.ok) return [];
        return ((audRes.body && audRes.body.items) || []).map(mapAudit);
      });
    });
  };

  DS.apiSavePermissionMatrix = function (draft) {
    return Api.putPermissionMatrix({ matrix: permsDraftToApi(draft) }).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      DS.state.perms = JSON.parse(JSON.stringify(draft));
      if (res.body && res.body.matrix) {
        DS.state.perms = mapMatrixToPerms(res.body.matrix);
      }
      DS.notify();
      return Promise.all([
        DS.reloadAudit(),
        DS.reloadPermHistory(),
      ]).then(function () { return true; });
    });
  };

  DS.fmtKst = fmtKst;

  var origSetSession = DS.setSession;
  DS.setSession = function (sessionId) {
    origSetSession(sessionId);
    if (DS.isApiMode()) DS.reloadApplicants(sessionId);
  };
})(typeof window !== "undefined" ? window : globalThis);
