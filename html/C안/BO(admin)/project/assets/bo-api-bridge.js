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

  /** timestamptz → 달력용 날짜(YYYY-MM-DD, Asia/Yangon). UTC slice 시 접수기간이 하루 밀리는 문제 방지 */
  function isoDateMmt(v) {
    if (!v) return "";
    var raw = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 10);
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Yangon",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch (e) {
      return raw.slice(0, 10);
    }
  }

  function formatApplicationNo(applicationNo, submissionId, examLevel) {
    if (applicationNo) {
      return String(applicationNo).replace(/-(I|II)$/i, function (_, lv) {
        return lv.toUpperCase() === "II" ? "-2" : "-1";
      });
    }
    if (submissionId == null || !examLevel) return "";
    var lv = String(examLevel).toUpperCase();
    return "APP-" + submissionId + "-" + (lv === "II" ? "2" : "1");
  }

  /** BO 회차 접수기간 — 달력에서 고른 날짜를 미얀마 현지(MMT) 자정/말일로 저장 */
  function mmtDayStart(ymd) {
    return ymd + "T00:00:00+06:30";
  }
  function mmtDayEnd(ymd) {
    return ymd + "T23:59:59+06:30";
  }

  /** UTC ISO → BO/FO 표시용 미얀마 현지시각(MMT, UTC+6:30) 'YYYY-MM-DD HH:MM' */
  function fmtMmt(v) {
    if (!v) return "";
    var d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v).replace("T", " ").slice(0, 16);
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Yangon",
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

  /** API max page_size for /admin/applications */
  var APP_PAGE_SIZE = 500;
  /** API max page_size for /admin/users */
  var USER_PAGE_SIZE = 200;

  /** Fetch every page until exhausted (or total_items reached). */
  function fetchAllPaged(getPage, baseQuery, pageSize, maxPages) {
    var page = 1;
    var all = [];
    var totalItems = null;
    var lastMeta = null;
    var size = pageSize || 200;
    var cap = maxPages || 200;

    function next() {
      var q = Object.assign({}, baseQuery || {}, { page: page, page_size: size });
      return getPage(q).then(function (res) {
        if (!res.ok) return res;
        var items = (res.body && res.body.items) || [];
        lastMeta = res.body || {};
        if (totalItems == null && res.body && res.body.total_items != null) {
          totalItems = Number(res.body.total_items) || 0;
        }
        all = all.concat(items);
        var gotAll =
          items.length < size ||
          (totalItems != null && all.length >= totalItems);
        if (gotAll || page >= cap) {
          return {
            ok: true,
            body: {
              items: all,
              page: 1,
              page_size: all.length,
              total_items: totalItems != null ? totalItems : all.length,
              status_counts: lastMeta.status_counts,
              nationalities: lastMeta.nationalities,
            },
          };
        }
        page += 1;
        return next();
      });
    }
    return next();
  }

  function fetchAllApplications(baseQuery) {
    return fetchAllPaged(Api.getApplications, baseQuery, APP_PAGE_SIZE, 200);
  }

  function fetchAllUsers(baseQuery) {
    return fetchAllPaged(Api.getUsers, baseQuery, USER_PAGE_SIZE, 200);
  }

  function buildUsersQuery(opts) {
    opts = opts || {};
    var q = {};
    if (opts.page != null) q.page = opts.page;
    if (opts.page_size != null) q.page_size = opts.page_size;
    if (opts.q) q.q = opts.q;
    if (opts.status && opts.status !== "all") {
      q.status = memberStatusApi(opts.status);
    }
    if (opts.nationality && opts.nationality !== "all") {
      q.nationality = opts.nationality;
    }
    return q;
  }

  function applyMembersMeta(body, pageItems) {
    var sc = (body && body.status_counts) || {};
    DS.state.membersMeta = {
      page: body && body.page != null ? Number(body.page) : 1,
      page_size: body && body.page_size != null ? Number(body.page_size) : (pageItems || []).length,
      total_items: body && body.total_items != null ? Number(body.total_items) : (pageItems || []).length,
      status_counts: {
        all: sc.all != null ? Number(sc.all) : 0,
        active: sc.active != null ? Number(sc.active) : 0,
        suspended: sc.suspended != null ? Number(sc.suspended) : 0,
        withdrawn: sc.withdrawn != null ? Number(sc.withdrawn) : 0,
      },
      nationalities: (body && body.nationalities) || [],
    };
  }

  function mapMembersPage(items, page, pageSize) {
    var offset = Math.max(0, ((page || 1) - 1) * (pageSize || 0));
    return (items || []).map(function (row, idx) {
      var m = mapMember(row, idx);
      m.no = offset + idx + 1;
      return m;
    });
  }

  /**
   * Live API stores concurrent TOPIK I+II as two application rows under one submission_id.
   * Mark those rows as level "동시" (keep levelBase for fee / export / exam level).
   */
  function markConcurrentApplicants(list) {
    var bySub = {};
    (list || []).forEach(function (a) {
      if (!a || !a.submissionId) return;
      if (!bySub[a.submissionId]) bySub[a.submissionId] = [];
      bySub[a.submissionId].push(a);
    });
    Object.keys(bySub).forEach(function (sid) {
      var rows = bySub[sid];
      var hasI = false;
      var hasII = false;
      rows.forEach(function (r) {
        var lv = r.levelBase || r.level;
        if (lv === "Ⅰ") hasI = true;
        if (lv === "Ⅱ") hasII = true;
      });
      if (hasI && hasII) {
        rows.forEach(function (r) {
          if (!r.levelBase) r.levelBase = r.level;
          r.level = "동시";
          r.isConcurrent = true;
        });
      }
    });
    return list || [];
  }

  function mapApplicants(rows) {
    return markConcurrentApplicants((rows || []).map(mapApplicant));
  }

  function mapApplicantStatus(row) {
    if (row.status === "cancelled") return "cancel";
    if (row.payment_status === "refunded") return "refund";
    // 접수 반려 vs 사진/정보 반려 구분 (API status는 유지, review_status만 rejected)
    if (row.status === "rejected") return "rejected";
    if (row.photo_review_status === "rejected") return "photo_rejected";
    if (row.info_review_status === "rejected") return "info_rejected";
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
    1: "학생", 2: "공무원", 3: "회사원", 4: "자영업",
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
    var adminKo = global.TOPIKBoAdminKo;
    var nationRaw = row.nationality || "미얀마";
    var l1Raw = row.first_language || "미얀마어";
    return {
      id: String(row.id),
      sessionId: String(row.exam_round_id),
      no: idx + 1,
      nameKo: row.name_ko || "—",
      nameEn: row.name_en || "—",
      dob: row.birth_date || "",
      sx: String(row.gender) === "2" ? 2 : 1,
      genderCode: row.gender ? (String(row.gender) === "2" ? "2" : "1") : "",
      nation: adminKo && adminKo.nationalityKo ? adminKo.nationalityKo(nationRaw, "미얀마") : nationRaw,
      l1: adminKo && adminKo.firstLanguageKo ? adminKo.firstLanguageKo(l1Raw, "미얀마어") : l1Raw,
      // 코드값(연명부 export 용) + 표시 라벨
      jobCode: row.job_code != null ? row.job_code : "",
      motiveCode: row.motivation_code != null ? row.motivation_code : (row.motive_code != null ? row.motive_code : ""),
      purposeCode: row.purpose_code != null ? row.purpose_code : "",
      job: codeLabel(JOB_LABELS, row.job_code) || "미상",
      motive: codeLabel(MOTIVE_LABELS, row.motivation_code != null ? row.motivation_code : row.motive_code) || "미상",
      purpose: codeLabel(PURPOSE_LABELS, row.purpose_code) || "미상",
      level: levelUi(row.exam_level),
      levelBase: levelUi(row.exam_level),
      submissionId: row.submission_id != null ? String(row.submission_id) : "",
      isConcurrent: false,
      venueId: String(row.exam_venue_id),
      photoFileId: photoFileId,
      photoUrl: photoFileId != null ? Api.fileUrl(photoFileId) : "",
      photoOk: photoOk,
      photoStatus: row.photo_review_status || "pending",
      infoOk: row.info_review_status === "approved" || row.info_review_status == null,
      infoStatus: row.info_review_status || "approved",
      infoRejectReason: [row.info_reject_code, row.info_reject_note].filter(Boolean).join(" — ") || "",
      paid: paid,
      paymentStatus: row.payment_status || (paid ? "paid" : "unpaid"),
      paidAt: fmtMmt(row.paid_at),
      paymentMemo: row.payment_memo || "",
      exam: row.exam_number || "",
      examNumberVisible: !!row.exam_number_visible,
      roundNo: row.round_no != null ? row.round_no : null,
      roundTitle: row.round_title || "",
      applicationNo: formatApplicationNo(row.application_no, row.submission_id, row.exam_level),
      status: mapApplicantStatus(row),
      appliedAt: fmtMmt(row.created_at),
      deletedAt: fmtMmt(row.deleted_at),
      rejectReason: row.reject_reason || "",
      memo: "",
      email: row.email || "",
      tel: row.phone || "",
      accommodation: !!row.accommodation_requested,
      cancelReason: row.cancel_reason || "",
      cancelledAt: fmtMmt(row.cancelled_at),
      exceptionType: row.exception_type || "",
      isDesignated: !!row.is_designated,
      exceptionLabel: row.exception_type_label || "",
      exceptionReason: row.exception_reason || "",
      exceptionAt: fmtMmt(row.exception_at),
      rev: row.rev != null ? row.rev : null,
    };
  }

  // 정원 입력값 → 정수. 빈칸/NaN/음수는 0(무제한)으로 정규화.
  function toCapacity(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function mapSession(row, applicantCounts) {
    var st = STATUS_MAP[row.registration_status] || "planned";
    return {
      id: String(row.id),
      no: row.round_no,
      name: row.title,
      applyStart: isoDateMmt(row.registration_start_at),
      applyEnd: isoDateMmt(row.registration_end_at),
      payStart: isoDateMmt(row.payment_start_at),
      payEnd: isoDateMmt(row.payment_end_at),
      examDate: isoDate(row.exam_date),
      resultDate: isoDate(row.result_date), // null/empty → BO UI에서 '미정'
      cap: row.capacity,
      capI: row.capacity_level_i != null ? row.capacity_level_i : 0,
      capII: row.capacity_level_ii != null ? row.capacity_level_ii : 0,
      feeI: row.fee_level_i,
      feeII: row.fee_level_ii,
      venues: (row.venue_ids || []).map(String),
      status: st,
      applicants: row.registered_count != null
        ? row.registered_count
        : (applicantCounts[row.id] || 0),
      applicantsI: (row.registered_levels && row.registered_levels.I) || 0,
      applicantsII: (row.registered_levels && row.registered_levels.II) || 0,
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
      capI: row.capacity_level_i != null ? row.capacity_level_i : 0,
      capII: row.capacity_level_ii != null ? row.capacity_level_ii : 0,
      active: row.is_active !== false,
      memo: row.memo || "",
    };
  }

  function toDatetimeLocalMmt(iso) {
    if (!iso) return "";
    return fmtMmt(iso).replace(" ", "T");
  }

  function fromDatetimeLocalMmt(local) {
    if (!local || !String(local).trim()) return null;
    return String(local).trim() + ":00+06:30";
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
      createdAt: fmtMmt(row.created_at || row.published_at),
      views: row.view_count || 0,
      public: !!row.is_published,
      pin: !!row.is_pinned,
      showStart: toDatetimeLocalMmt(row.display_start_at),
      showEnd: toDatetimeLocalMmt(row.display_end_at),
      deleted: !!row.is_deleted,
      deletedAt: fmtMmt(row.deleted_at),
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
    var FAQ_CAT_UI = {
      account: '계정',
      apply: '접수',
      registration: '접수',
      payment: '접수',
      photo: '접수',
      exam: '시험',
      result: '결과',
      other: '기타',
      etc: '기타',
      general: '기타',
      '계정': '계정',
      '접수': '접수',
      '시험': '시험',
      '결과': '결과',
      '기타': '기타',
    };
    return {
      id: String(row.id),
      no: idx + 1,
      cat: FAQ_CAT_UI[row.category] || row.category,
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
    board_reply: "답변", board_comment: "댓글", board_delete: "삭제",
    board_workflow: "상태변경",
    term_create: "생성", term_update: "수정", term_publish: "게시", term_retire: "폐지",
    exam_round_revoke: "폐지", exam_round_restore: "복구",
    user_update: "수정", user_reset_password: "비밀번호초기화",
    admin_create: "생성", admin_update: "수정", admin_reset_password: "비밀번호초기화",
    exam_round_create: "생성", exam_venue_update: "수정", exam_number_assign: "수험번호부여",
    // 접수 승인/반려(approve·reject)와 구분한다 — 목록에서 둘 다 "승인"이면 뭘 한 건지 모른다.
    // info_review_* 가 이미 정보승인/정보반려를 쓰므로 같은 규칙.
    photo_review_approve: "사진승인", photo_review_reject: "사진반려",
    info_review_approve: "정보승인", info_review_reject: "정보반려", memo: "메모",
    login: "로그인", logout: "로그아웃",
    permission_matrix_update: "권한변경", admin_change_password: "비밀번호변경",
    // 운영 로그에 실제로 쌓이는데 라벨이 없어 영문 원문이 그대로 보이던 것들
    board_secret_view: "비밀글열람",
    application_delete: "삭제", application_purge: "삭제", application_restore: "복구",
    exam_round_update: "수정", exam_round_status: "상태변경",
    exam_venue_create: "생성", exam_venue_delete: "삭제",
    // 공지 등록 한 번에 notice_create + notice_marketing_send 두 줄이 쌓인다.
    // 관리자가 한 일은 '등록' 하나이므로 둘 다 등록으로 보여 준다 —
    // 메일 몇 건이 나갔는지는 상세의 「메일 발송 예약」에서 확인한다.
    notice_create: "등록", notice_marketing_send: "등록",
    notice_update: "수정", notice_delete: "삭제",
    faq_create: "생성", faq_update: "수정", faq_delete: "삭제",
    photos_export: "내보내기", roster_export: "내보내기",
    payment_roster_export: "내보내기", payment_roster_import: "수납",
    // 예외 접수 처리(제110회~)
    application_level_change: "급수정정", application_reinstate: "접수복원",
    application_designate: "지정접수",
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

  /** UI 한글 라벨 → 서버 action_type 목록. 라벨 하나에 여러 종류가 붙는다(수정·삭제 등). */
  function auditActionTypesFor(label) {
    if (!label || label === "all") return null;
    var out = [];
    Object.keys(AUDIT_ACTION_UI).forEach(function (k) {
      if (AUDIT_ACTION_UI[k] === label) out.push(k);
    });
    return out.length ? out : null;
  }

  /** UI 한글 유형 → 서버 target_type. */
  function auditTargetTypeFor(label) {
    if (!label || label === "all") return null;
    var hit = null;
    Object.keys(AUDIT_TYPE_UI).forEach(function (k) {
      if (AUDIT_TYPE_UI[k] === label) hit = k;
    });
    return hit;
  }

  /** 화면 필터 → 서버 쿼리. loadAuditPage/fetchAuditAll 공용. */
  function auditQuery(o, page, pageSize) {
    var q = { page: page, page_size: pageSize };
    var acts = auditActionTypesFor(o.action);
    if (acts) q.action_types = acts.join(",");
    var tt = auditTargetTypeFor(o.type);
    if (tt) q.target_type = tt;
    if (o.actor && o.actor !== "all") q.admin_user_id = o.actor;
    if (o.days) q.days = o.days;
    if (o.targetId) q.target_id = o.targetId;
    return q;
  }

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

  function mapBoardAttachments(list) {
    return (list || []).map(function (a) {
      if (typeof a === "string") return a;
      return {
        file_id: a.file_id != null ? a.file_id : a.fileId,
        filename: a.filename || a.name || "file",
        size: a.size != null ? a.size : a.size_bytes,
        url: a.url,
      };
    });
  }

  /** 목록 API는 첨부·댓글·상세 본문을 내려주지 않음 — 상세 조회 후 reload 시 유지 */
  function mergeBoardListRow(prev, next) {
    if (!prev) return next;
    var merged = Object.assign({}, next);
    if (!merged.attachments || !merged.attachments.length) {
      merged.attachments = prev.attachments || [];
    }
    if (!merged.comments || !merged.comments.length) {
      merged.comments = prev.comments || [];
    }
    if (!merged.replies || !merged.replies.length) {
      merged.replies = prev.replies || [];
    }
    if (!merged.body && prev.body) merged.body = prev.body;
    return merged;
  }

  function remapBoardList(items, mapFn, prevList) {
    return (items || []).map(function (row, idx) {
      var mapped = mapFn(row, idx);
      var prev = (prevList || []).find(function (x) { return x.id === mapped.id; });
      return mergeBoardListRow(prev, mapped);
    });
  }

  function mapRefund(row, idx) {
    return {
      id: String(row.id),
      no: idx + 1,
      type: row.category || row.post_type || "환불",
      title: row.title,
      author: row.author_email || row.author_name || ("user" + row.user_id),
      // 정보정정 → 회원 관리 딥링크용 (신청 작성자 식별)
      authorEmail: row.author_email || "",
      authorName: row.author_name || "",
      userId: row.user_id != null ? String(row.user_id) : "",
      createdAt: fmtMmt(row.created_at),
      status: REFUND_STATUS_UI[row.workflow_status] || "접수",
      hasAnswer: !!row.has_admin_reply || !!row.admin_reply,
      assignee: resolveAdminLabel(row.admin_replier_id),
      body: row.body || "",
      attachments: mapBoardAttachments(row.attachments),
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
      createdAt: fmtMmt(row.created_at),
      status: done ? "done" : "wait",
      assignee: resolveAdminLabel(row.admin_replier_id),
      body: row.body || "",
      attachments: mapBoardAttachments(row.attachments),
      replies: mapOfficialReplies(row),
      comments: [],
    };
  }

  function mapOfficialReply(r) {
    return {
      id: r.id != null ? String(r.id) : undefined,
      author: r.author || "관리자",
      body: r.body || "",
      ts: r.created_at_label || fmtMmt(r.created_at),
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
        ts: fmtMmt(row.admin_replied_at),
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
      ts: c.created_at_label || fmtMmt(c.created_at),
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
      ts: row.created_at_label || fmtMmt(row.agreed_at || row.created_at),
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
      lastLogin: fmtMmt(row.last_login_at) || "—",
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
      lastLogin: fmtMmt(row.last_login_at) || "—",
      lastIp: "—",
      note: "",
      boardNotifyOptIn: !!row.board_notify_opt_in,
    };
  }

  function mapAudit(row) {
    return {
      id: "log" + row.id,
      ts: fmtMmt(row.created_at),
      actor: row.admin_email || (row.admin_user_id ? String(row.admin_user_id) : "admin"),
      actorName: row.admin_name || "",
      ip: row.ip_address || "—",
      type: AUDIT_TYPE_UI[row.target_type] || row.target_type || "—",
      targetId: String(row.target_id || "—"),
      action: AUDIT_ACTION_UI[row.action_type] || row.action_type || "—",
      actionType: row.action_type || "",   // 상세에서 처리 내용 설명을 찾는 키
      before: row.before_data || null,
      after: row.after_data || null,
      memo: row.memo || "",
    };
  }

  function formatApplicationMemos(memos) {
    if (!memos || !memos.length) return "";
    return memos.map(function (m) {
      var ts = fmtMmt(m.created_at).replace("T", " ").slice(0, 16);
      var who = m.admin_email || (m.admin_user_id != null ? String(m.admin_user_id) : "—");
      return "[" + ts + "/" + who + "] " + (m.body || "");
    }).join("\n") + "\n";
  }

  function syncApplicantMemos(appId, memos) {
    var a = DS.state.applicants.find(function (x) { return x.id === String(appId); });
    if (a) {
      a.memo = formatApplicationMemos(memos || []);
      DS.notify();
    }
  }

  function mapAdminAccessLog(row) {
    return {
      id: "aal" + row.id,
      ts: fmtMmt(row.created_at),
      adminId: row.admin_id || String(row.admin_user_id || "unknown"),
      adminEmail: row.admin_email || "—",
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
      ts: fmtMmt(row.created_at),
      memberId: row.user_id ? String(row.user_id) : null,
      email: row.email || "—",
      nameKo: row.name_ko || "—",
      nameEn: row.name_en || "—",
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
      ts: fmtMmt(row.created_at),
      actor: row.actor || "—",
      actorName: row.actor_name || "",
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
    clearLists();
    DS.state.apiError = msg;
    DS.notify();
    return false;
  }

  /**
   * data.js 의 데모 더미데이터를 state 에서 걷어낸다.
   * API 모드 부팅 첫 렌더는 API 응답보다 먼저 일어나므로, 여기서 비우지 않으면
   * 제107회·응시자 88명 같은 데모 값이 잠깐 보였다가 실데이터로 교체된다.
   * perms/matrix 는 제외한다 — 비우면 super 가 아닌 관리자의 can() 이 전부 false 가 되어
   * 로딩 동안 메뉴가 사라진다.
   */
  function clearLists() {
    DS.state.applicants = [];
    DS.state.sessions = [];
    DS.state.venues = [];
    DS.state.regions = [];
    DS.state.notices = [];
    DS.state.noticeTrash = [];
    DS.state.applicantTrash = [];
    DS.state.faqs = [];
    DS.state.refunds = [];
    DS.state.inquiries = [];
    DS.state.members = [];
    DS.state.membersCatalog = [];
    DS.state.membersMeta = null;
    DS.state.terms = [];
    DS.state.admins = [];
    DS.state.audit = [];
    DS.state.auditTotal = 0;
    DS.state.consents = [];
    DS.state.adminAccessLogs = [];
    DS.state.adminAccessTotal = 0;
    DS.state.memberAccessLogs = [];
    DS.state.memberAccessTotal = 0;
    DS.state.permHistory = [];
    DS.state.permHistoryTotal = 0;
    DS.state.permHistoryTargets = [];
    // null 이 아닌 '' — 헤더 회차 <select value=…> 가 제어 컴포넌트로 유지된다.
    DS.state.activeSessionId = '';
  }

  function toastErr(msg) {
    if (typeof global.toastErr === "function") global.toastErr(msg);
  }

  function applicantRev(id) {
    var a = DS.state.applicants.find(function (x) { return x.id === String(id); });
    return a && a.rev != null ? a.rev : undefined;
  }

  function memberRev(id) {
    var key = String(id);
    var m = DS.state.members.find(function (x) { return x.id === key; });
    if (!m && DS.state.membersCatalog) {
      m = DS.state.membersCatalog.find(function (x) { return x.id === key; });
    }
    return m && m.rev != null ? m.rev : undefined;
  }

  function handleMutation(res, reloadFn, applyFn) {
    if (Api.isConflict && Api.isConflict(res)) {
      toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
      if (reloadFn) return reloadFn().then(function () { return false; });
      return Promise.resolve(false);
    }
    if (!res.ok) {
      toastErr(TopikBoApi.parseError(res));
      return Promise.resolve(false);
    }
    // applyFn 이 갱신 행을 반영했으면 목록 전체를 다시 받지 않는다.
    if (applyFn && applyFn()) return Promise.resolve(true);
    if (reloadFn) return reloadFn().then(function () { return true; });
    return Promise.resolve(true);
  }

  /**
   * 수납·심사 응답에 실려 온 갱신 행만 목록에 반영한다.
   *
   * 예전에는 처리할 때마다 reloadApplicants 로 접수자 목록 전체를 다시 받았다.
   * 500건씩 순차 페이징에 휴지통까지 2세트라, 접수자가 늘수록 처리 1건당 왕복이
   * 함께 늘어 현장(미얀마)에서 체감 지연이 컸다. 서버가 목록과 같은 형태로
   * 바뀐 행(item)을 돌려주므로 그 행만 갈아끼운다.
   *
   * 하나라도 반영할 수 없으면(item 없는 구버전 API, 현재 목록에 없는 행) false 를
   * 돌려주고 호출부가 기존대로 전체 재조회로 물러선다.
   */
  function applyServerRows(ress) {
    var items = [];
    for (var i = 0; i < ress.length; i++) {
      var row = ress[i] && ress[i].body && ress[i].body.item;
      if (!row) return false;
      items.push(row);
    }
    var list = DS.state.applicants;
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var key = String(item.id);
      var idx = list.findIndex(function (x) { return x.id === key; });
      if (idx < 0) return false;
      // no(순번)는 목록에서의 위치로 정해진다 — 같은 자리에 넣어야 번호가 유지된다.
      list[idx] = mapApplicant(item, idx);
    }
    // '동시' 표시는 같은 submission 의 다른 행과 함께 봐야 정해지므로 목록 기준으로 다시 계산.
    markConcurrentApplicants(list);
    DS.notify();
    return true;
  }

  /**
   * 일괄 처리(승인·반려·수납·수납취소) 응답 처리. 반환값은 기존과 같은 '처리 건수'.
   * 충돌(409)은 최신 상태가 필요하므로 그대로 전체 재조회한다.
   */
  function applyBulkMutation(ress, ids, sessionId) {
    var conflict = ress.find(function (r) { return Api.isConflict(r); });
    if (conflict) {
      toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
      return DS.reloadApplicants(sessionId).then(function () { return 0; });
    }
    var bad = ress.find(function (r) { return !r.ok; });
    if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
    if (applyServerRows(ress)) return Promise.resolve(ids.length);
    return DS.reloadApplicants(sessionId).then(function () { return ids.length; });
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

  /** Local UI mock: ?mock=1 (or localStorage tpkm_bo_force_mock=1). Keeps data.js applicants; skips API load. */
  function wantsForceMock() {
    try {
      var q = new URLSearchParams(global.location && global.location.search || "");
      if (q.get("mock") === "1") {
        global.sessionStorage.setItem("tpkm_bo_force_mock", "1");
        return true;
      }
      if (q.get("mock") === "0") {
        global.sessionStorage.removeItem("tpkm_bo_force_mock");
        global.localStorage.removeItem("tpkm_bo_force_mock");
        return false;
      }
      return global.sessionStorage.getItem("tpkm_bo_force_mock") === "1"
        || global.localStorage.getItem("tpkm_bo_force_mock") === "1";
    } catch (e) {
      return false;
    }
  }

  function setApiLoading(on) {
    DS.apiLoading = !!on;
    DS.state.apiLoading = !!on;
  }

  DS.isApiMode = function () {
    return DS.useApi && Api.canUseApi() && !!Api.getAccessToken();
  };

  DS.initFromApi = function () {
    if (wantsForceMock()) {
      DS.useApi = false;
      setApiLoading(false);
      DS.state.apiError = null;
      try {
        console.info("[BO mock] data.js 더미 접수자 사용 중 (?mock=0 또는 localStorage.removeItem('tpkm_bo_force_mock') 로 API 모드 복귀)");
      } catch (e) { /* ignore */ }
      DS.notify();
      return Promise.resolve(false);
    }
    if (!Api.canUseApi() || !Api.getAccessToken()) {
      DS.useApi = false;
      return Promise.resolve(false);
    }
    DS.useApi = true;
    setApiLoading(true);
    DS.state.apiError = null;
    clearLists();
    DS.notify();

    var CRITICAL_NAMES = [
      "region-codes", "exam-venues", "exam-rounds", "applications", "notices", "faq",
      "refund_correction", "inquiry", "users", "terms", "admin-users",
    ];
    return Promise.all([
      Api.getRegionCodes(),
      Api.getExamVenues(),
      Api.getExamRounds(),
      fetchAllApplications({}),
      Api.getNotices(),
      Api.getFaq(),
      Api.getBoardPosts("refund_correction", { page_size: 200 }),
      Api.getBoardPosts("inquiry", { page_size: 200 }),
      fetchAllUsers({}),
      Api.getTerms(),
      Api.getAdminUsers(),
      Api.getAuditLogs({ page: 1, page_size: 25 }),
      Api.getPermissionMatrix(),
      fetchAllApplications({ trash: "true" }),
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
      var trashAppRes = results[13];

      var critical = [regRes, venRes, rndRes, appRes, notRes, faqRes, refRes, inqRes, memRes, termRes, admRes];
      var badIdx = critical.findIndex(function (r) { return !r.ok; });
      if (badIdx >= 0) {
        setApiLoading(false);
        var label = CRITICAL_NAMES[badIdx] || ("#" + badIdx);
        var msg = TopikBoApi.parseError(critical[badIdx]) || "API 데이터를 불러오지 못했습니다.";
        return fail("[" + label + "] " + msg);
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

      DS.state.applicants = mapApplicants(apps);
      DS.state.applicantTrash = (trashAppRes && trashAppRes.ok && trashAppRes.body && trashAppRes.body.items)
        ? mapApplicants(trashAppRes.body.items)
        : [];
      DS.state.notices = ((notRes.body && notRes.body.items) || []).map(function (n, i) {
        return mapNotice(n, i, DS.state.me && DS.state.me.id);
      });
      DS.state.faqs = ((faqRes.body && faqRes.body.items) || [])
        .filter(function (f) { return f.is_active !== false; })
        .map(mapFaq);
      DS.state.membersCatalog = ((memRes.body && memRes.body.items) || []).map(mapMember);
      DS.state.members = DS.state.membersCatalog.slice();
      applyMembersMeta(memRes.body, DS.state.members);
      DS.state.terms = ((termRes.body && termRes.body.items) || []).map(mapTerm);
      DS.state.admins = ((admRes.body && admRes.body.items) || []).map(mapAdmin);
      DS.state.refunds = ((refRes.body && refRes.body.items) || []).map(mapRefund);
      DS.state.inquiries = ((inqRes.body && inqRes.body.items) || []).map(mapInquiry);
      // 약관 동의 이력은 동의 이력 패널 진입 시 실제 API로 지연 로드(목업 제거)
      DS.state.consents = [];

      if (audRes.ok && audRes.body && audRes.body.items) {
        DS.state.audit = audRes.body.items.map(mapAudit);
        DS.state.auditTotal = audRes.body.total_items != null
          ? audRes.body.total_items : DS.state.audit.length;
      } else {
        DS.state.audit = [];
        DS.state.auditTotal = 0;
      }

      if (permRes.ok && permRes.body && permRes.body.matrix) {
        DS.state.perms = mapMatrixToPerms(permRes.body.matrix);
      }

      /* 접근 로그·권한 이력은 부팅 때 건드리지 않는다. 세 화면 모두 진입 시
         자기 페이지를 직접 조회하므로 선조회가 필요 없고(회원 접근 로그는 6만
         건짜리다), 여기서 비우면 먼저 도착한 패널 조회 결과를 덮어쓴다.
         초기화는 부팅 시작의 clearLists() 가 이미 했다. */
      return finishInit();

      function finishInit() {
        if (DS.state.sessions.length) {
          var open = DS.state.sessions.find(function (s) { return s.status === "open"; });
          DS.state.activeSessionId = (open || DS.state.sessions[0]).id;
        } else {
          // 회차 전부 삭제(리셋) 후 mock 기본값(s107)이 API에 전달되면 FastAPI 422 발생
          DS.state.activeSessionId = null;
        }
        setApiLoading(false);
        DS.state.apiError = null;
        DS.notify();
        return true;
      }
    }).catch(function () {
      setApiLoading(false);
      return fail("API 연결에 실패했습니다.");
    });
  };

  function apiExamRoundId(sessionId) {
    if (sessionId == null || sessionId === "") return null;
    var s = String(sessionId).trim();
    // mock ids like s107, or any non-numeric value → omit (avoids FastAPI 422)
    if (!/^\d+$/.test(s)) return null;
    return s;
  }

  /** Keep first occurrence per application id (guards against stale reload races). */
  function dedupeApplicantsById(list) {
    var seen = Object.create(null);
    var out = [];
    (list || []).forEach(function (a) {
      if (!a || a.id == null) return;
      var k = String(a.id);
      if (seen[k]) return;
      seen[k] = true;
      out.push(a);
    });
    return out;
  }

  /**
   * 접수자 목록 전체 조회. 실제 요청은 여기서 낸다 — 합치기는 DS.reloadApplicants 가 한다.
   */
  function reloadApplicantsNow(sessionId, opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    opts = opts || {};

    // sessionId given but still mock/non-API (e.g. s107 before initFromApi finishes):
    // must NOT fetch unfiltered "all rounds" and merge — that duplicates every row and
    // inflates seq numbers into the 2×N / 3000s range after refresh on #applicants.
    if (sessionId != null && sessionId !== "" && !apiExamRoundId(sessionId)) {
      return Promise.resolve();
    }

    function applyTrashItems(items) {
      var mapped = dedupeApplicantsById(items);
      if (sessionId) {
        var sid = String(sessionId);
        var restTrash = DS.state.applicantTrash.filter(function (a) { return a.sessionId !== sid; });
        DS.state.applicantTrash = dedupeApplicantsById(restTrash.concat(mapped));
      } else {
        DS.state.applicantTrash = mapped;
      }
    }

    if (opts.trash) {
      var tq = { trash: "true" };
      var trashRoundId = apiExamRoundId(sessionId);
      if (trashRoundId) tq.exam_round_id = trashRoundId;
      return fetchAllApplications(tq).then(function (res) {
        if (res.ok) {
          applyTrashItems(mapApplicants((res.body && res.body.items) || []));
        }
        DS.notify();
      });
    }

    var q = {};
    var roundId = apiExamRoundId(sessionId);
    if (roundId) q.exam_round_id = roundId;
    if (opts.q) q.q = opts.q;

    var tq = { trash: "true" };
    if (roundId) tq.exam_round_id = roundId;

    return Promise.all([
      fetchAllApplications(q),
      fetchAllApplications(tq),
    ]).then(function (results) {
      var res = results[0];
      var trashRes = results[1];

      if (!res.ok) {
        DS.state.apiError = TopikBoApi.parseError(res);
        if (!sessionId) DS.state.applicants = [];
      } else {
        var items = dedupeApplicantsById(mapApplicants((res.body && res.body.items) || []));
        var totalItems = res.body && res.body.total_items != null
          ? Number(res.body.total_items)
          : items.length;
        if (sessionId) {
          var sid = String(sessionId);
          var rest = DS.state.applicants.filter(function (a) { return a.sessionId !== sid; });
          DS.state.applicants = dedupeApplicantsById(rest.concat(items));
          var sess = DS.state.sessions.find(function (x) { return x.id === sid; });
          if (sess) sess.applicants = totalItems;
        } else {
          DS.state.applicants = items;
          var counts = {};
          items.forEach(function (a) {
            counts[a.sessionId] = (counts[a.sessionId] || 0) + 1;
          });
          DS.state.sessions.forEach(function (s) {
            s.applicants = counts[s.id] || 0;
          });
        }
        DS.state.apiError = null;
      }

      if (trashRes.ok) {
        applyTrashItems(mapApplicants((trashRes.body && trashRes.body.items) || []));
      }

      DS.notify();
    });
  }

  /**
   * 화면을 열 때 패널의 useEffect 와 DS.setSession 이 같은 조회를 동시에 건다.
   * 제19회처럼 접수자가 5,000명대면 한 번이 11페이지(약 7MB)라, 겹치는 만큼 그대로
   * 낭비된다. 실제로 운영 로그에서 같은 페이지 요청이 노트북 한 대당 2~3번씩 겹쳤다.
   *
   * 같은 조회가 이미 떠 있으면 그 약속을 함께 쓴다. 다만 데이터를 바꾼 뒤의 재조회
   * (삭제·복원·예외 처리·충돌)는 변경 전에 출발한 요청에 올라타면 옛 데이터를 보게
   * 되므로 합치지 않는다 — opts.dedupe 를 준 호출만 합친다.
   */
  var inflightApplicants = {};

  function applicantsRequestKey(sessionId, opts) {
    return [
      sessionId == null ? "" : String(sessionId),
      opts.trash ? "trash" : "live",
      opts.q || "",
    ].join("|");
  }

  DS.reloadApplicants = function (sessionId, opts) {
    opts = opts || {};
    if (!opts.dedupe) return reloadApplicantsNow(sessionId, opts);

    var key = applicantsRequestKey(sessionId, opts);
    if (inflightApplicants[key]) return inflightApplicants[key];

    function settled() { delete inflightApplicants[key]; }
    var p = reloadApplicantsNow(sessionId, opts).then(
      function (v) { settled(); return v; },
      function (e) { settled(); throw e; }
    );
    inflightApplicants[key] = p;
    return p;
  };

  DS.apiDeleteApplicant = function (id) {
    return Api.deleteApplication(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadApplicants(DS.state.activeSessionId).then(function () { return true; });
    });
  };

  DS.apiBulkDeleteApplicants = function (ids) {
    return Api.bulkDeleteApplications({ ids: ids.map(function (x) { return parseInt(x, 10); }).filter(Boolean) }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return 0; }
      return DS.reloadApplicants(DS.state.activeSessionId).then(function () {
        return (res.body && res.body.count) || ids.length;
      });
    });
  };

  DS.apiRestoreApplicant = function (id) {
    return Api.restoreApplication(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadApplicants(DS.state.activeSessionId).then(function () { return true; });
    });
  };

  DS.apiPurgeApplicant = function (id) {
    return Api.purgeApplication(id).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadApplicants(DS.state.activeSessionId).then(function () { return true; });
    });
  };

  DS.apiBulkPurgeApplicants = function (ids) {
    return Api.bulkPurgeApplications({ ids: ids.map(function (x) { return parseInt(x, 10); }).filter(Boolean) }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return 0; }
      return DS.reloadApplicants(DS.state.activeSessionId).then(function () {
        return (res.body && res.body.count) || ids.length;
      });
    });
  };

  DS.reloadVenues = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.getRegionCodes().then(function (regRes) {
      return Api.getExamVenues().then(function (venRes) {
        if (!venRes.ok) {
          toastErr(TopikBoApi.parseError(venRes));
          return false;
        }
        var regions = (regRes.ok && regRes.body && regRes.body.items) || [];
        var rmap = regionNameMap(regions);
        DS.state.venues = ((venRes.body && venRes.body.items) || []).map(function (v) {
          return mapVenue(v, rmap[v.region_code]);
        });
        DS.notify();
        return true;
      });
    });
  };

  DS.reloadSessions = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.getExamRounds().then(function (rndRes) {
      if (!rndRes.ok) {
        toastErr(TopikBoApi.parseError(rndRes));
        return false;
      }
      var counts = {};
      (DS.state.applicants || []).forEach(function (a) {
        counts[a.sessionId] = (counts[a.sessionId] || 0) + 1;
      });
      DS.state.sessions = ((rndRes.body && rndRes.body.items) || []).map(function (s) {
        return mapSession(s, counts);
      });
      if (!DS.state.sessions.length) {
        DS.state.activeSessionId = null;
      } else if (!DS.state.sessions.some(function (s) { return s.id === DS.state.activeSessionId; })) {
        var open = DS.state.sessions.find(function (s) { return s.status === "open"; });
        DS.state.activeSessionId = (open || DS.state.sessions[0]).id;
      }
      DS.notify();
      return true;
    });
  };

  DS.reloadRefunds = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.getBoardPosts("refund_correction", { page_size: 200 }).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      DS.state.refunds = remapBoardList(
        (res.body && res.body.items) || [],
        mapRefund,
        DS.state.refunds
      );
      DS.notify();
      return true;
    });
  };

  DS.reloadInquiries = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.getBoardPosts("inquiry", { page_size: 200 }).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      DS.state.inquiries = remapBoardList(
        (res.body && res.body.items) || [],
        mapInquiry,
        DS.state.inquiries
      );
      DS.notify();
      return true;
    });
  };

  /** 사이드바 배지(환불·정정 / 문의) — FO 신규 글 반영용 */
  DS.reloadBoardBadges = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Promise.all([
      Api.getBoardPosts("refund_correction", { page_size: 200 }),
      Api.getBoardPosts("inquiry", { page_size: 200 }),
    ]).then(function (pair) {
      var refRes = pair[0];
      var inqRes = pair[1];
      if (!refRes.ok || !inqRes.ok) {
        if (!refRes.ok) toastErr(TopikBoApi.parseError(refRes));
        else if (!inqRes.ok) toastErr(TopikBoApi.parseError(inqRes));
        return false;
      }
      DS.state.refunds = remapBoardList(
        (refRes.body && refRes.body.items) || [],
        mapRefund,
        DS.state.refunds
      );
      DS.state.inquiries = remapBoardList(
        (inqRes.body && inqRes.body.items) || [],
        mapInquiry,
        DS.state.inquiries
      );
      DS.notify();
      return true;
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
      return handleMutation(
        res,
        function () { return DS.reloadApplicants(sessionId); },
        function () { return applyServerRows([res]); }
      );
    });
  };

  DS.apiPhotoReject = function (id, reason) {
    var sessionId = DS.state.activeSessionId;
    return Api.photoReview(id, { action: "reject", photo_reject_note: reason }, { rev: applicantRev(id) }).then(function (res) {
      return handleMutation(
        res,
        function () { return DS.reloadApplicants(sessionId); },
        function () { return applyServerRows([res]); }
      );
    });
  };

  DS.apiInfoApprove = function (id) {
    var sessionId = DS.state.activeSessionId;
    return Api.infoReview(id, { action: "approve" }, { rev: applicantRev(id) }).then(function (res) {
      return handleMutation(
        res,
        function () { return DS.reloadApplicants(sessionId); },
        function () { return applyServerRows([res]); }
      );
    });
  };

  DS.apiInfoReject = function (id, reason) {
    var sessionId = DS.state.activeSessionId;
    return Api.infoReview(id, { action: "reject", info_reject_note: reason }, { rev: applicantRev(id) }).then(function (res) {
      return handleMutation(
        res,
        function () { return DS.reloadApplicants(sessionId); },
        function () { return applyServerRows([res]); }
      );
    });
  };

  DS.apiApprove = function (ids) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.approveApplication(id, {}, { rev: applicantRev(id) });
    })).then(function (ress) {
      return applyBulkMutation(ress, ids, sessionId);
    });
  };

  DS.apiReject = function (ids, reason) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.rejectApplication(id, { reject_reason: reason }, { rev: applicantRev(id) });
    })).then(function (ress) {
      return applyBulkMutation(ress, ids, sessionId);
    });
  };

  DS.apiPay = function (ids, info) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.paymentApplication(id, { payment_memo: info.memo }, { rev: applicantRev(id) });
    })).then(function (ress) {
      return applyBulkMutation(ress, ids, sessionId);
    });
  };

  DS.apiCancelPay = function (ids, reason) {
    var sessionId = DS.state.activeSessionId;
    return Promise.all(ids.map(function (id) {
      return Api.cancelPayment(id, { payment_cancel_reason: reason }, { rev: applicantRev(id) });
    })).then(function (ress) {
      return applyBulkMutation(ress, ids, sessionId);
    });
  };

  // --- 예외 접수 처리(제110회~) ----------------------------------------
  // 급수 정정 · 취소 복원 · 지정 접수. 셋 다 서버가 정원·중복을 다시 검사하므로
  // 화면은 결과 메시지만 그대로 보여 주고, 성공 시 목록을 다시 읽는다.
  DS.apiChangeApplicantLevel = function (id, level, reason) {
    var sessionId = DS.state.activeSessionId;
    return Api.changeApplicationLevel(
      id,
      { exam_level: level, reason: reason },
      { rev: applicantRev(id) }
    ).then(function (res) {
      if (!res.ok) {
        if (Api.isConflict && Api.isConflict(res)) {
          toastErr("다른 관리자가 먼저 수정했습니다. 최신 데이터로 새로고침합니다.");
          return DS.reloadApplicants(sessionId).then(function () { return null; });
        }
        toastErr(TopikBoApi.parseError(res));
        return null;
      }
      var body = res.body || {};
      return DS.reloadApplicants(sessionId).then(function () { return body; });
    });
  };

  DS.apiReinstateApplicant = function (id, reason) {
    var sessionId = DS.state.activeSessionId;
    return Api.reinstateApplication(id, { reason: reason }, { rev: applicantRev(id) })
      .then(function (res) {
        return handleMutation(res, function () { return DS.reloadApplicants(sessionId); })
          .then(function (ok) {
            if (!ok) return null;
            return res.body || {};
          });
      });
  };

  DS.apiDesignateApplicant = function (payload) {
    var sessionId = DS.state.activeSessionId;
    return Api.designateApplication(payload || {}).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      var body = res.body || {};
      return DS.reloadApplicants(sessionId).then(function () { return body; });
    });
  };

  DS.fetchRoundCapacity = function (roundId) {
    if (!DS.isApiMode() || !roundId || !/^\d+$/.test(String(roundId))) {
      return Promise.resolve(null);
    }
    return Api.getExamRoundCapacity(roundId).then(function (res) {
      return res.ok ? (res.body || null) : null;
    });
  };

  DS.searchMembersForDesignate = function (q) {
    if (!DS.isApiMode()) return Promise.resolve([]);
    return Api.getUsers({ q: q, status: "active", page_size: 20 }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return []; }
      return ((res.body && res.body.items) || []).map(function (u) {
        return {
          id: u.id,
          nameKo: u.name_ko || "—",
          nameEn: u.name_en || "",
          email: u.email || "",
          dob: u.birth_date || "",
          phone: u.phone || "",
          hasPhoto: u.photo_file_id != null,
        };
      });
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
      result_date: data.resultDate || null,
      registration_start_at: mmtDayStart(data.applyStart),
      registration_end_at: mmtDayEnd(data.applyEnd),
      payment_start_at: data.payStart ? mmtDayStart(data.payStart) : null,
      payment_end_at: data.payEnd ? mmtDayEnd(data.payEnd) : null,
      fee_level_i: data.feeI,
      fee_level_ii: data.feeII,
      capacity: data.cap,
      capacity_level_i: toCapacity(data.capI),
      capacity_level_ii: toCapacity(data.capII),
      venue_ids: (data.venues || []).map(function (v) { return parseInt(v, 10); }).filter(Boolean),
    };
    // API round ids are numeric. Mock/local ids (s107, sNaN) must never PATCH.
    var hasApiId = data.id != null && /^\d+$/.test(String(data.id));
    var p = hasApiId && !data._isNew
      ? Api.updateExamRound(data.id, payload)
      : Api.createExamRound(payload);
    return p.then(function (res) {
      if (!res || !res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadSessions();
    }).catch(function () {
      toastErr("회차 저장 중 오류가 발생했습니다.");
      return false;
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
      capacity_level_i: toCapacity(data.capI),
      capacity_level_ii: toCapacity(data.capII),
      memo: data.memo || null,
    };
    var p = data.id && !data._isNew
      ? Api.updateExamVenue(data.id, Object.assign(payload, { is_active: data.active }))
      : Api.createExamVenue(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadVenues();
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
      display_start_at: fromDatetimeLocalMmt(data.showStart),
      display_end_at: fromDatetimeLocalMmt(data.showEnd),
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

  DS.reloadFaqs = function () {
    if (!DS.isApiMode()) return Promise.resolve(false);
    return Api.getFaq({ active: true }).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      DS.state.faqs = ((res.body && res.body.items) || [])
        .filter(function (f) { return f.is_active !== false; })
        .map(mapFaq);
      DS.notify();
      return true;
    });
  };

  DS.apiSaveFaq = function (data) {
    var FAQ_CAT_API = {
      '접수': 'apply',
      '시험': 'exam',
      '결과': 'result',
      '기타': 'other',
      '계정': 'account',
    };
    var payload = {
      category: FAQ_CAT_API[data.cat] || data.cat,
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
      return DS.reloadFaqs();
    });
  };

  DS.apiDeleteFaq = function (id) {
    var del = Api.deleteFaq ? Api.deleteFaq(id) : Api.updateFaq(id, { is_active: false });
    return del.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.reloadFaqs();
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
          ts: fmtMmt(new Date().toISOString()),
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
        var atts = mapBoardAttachments(post.attachments);
        if (atts.length) row.attachments = atts;
        else if (!row.attachments || !row.attachments.length) row.attachments = atts;
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
  DS.apiSetExamVisibility = function (roundId, visibleAtLocal) {
    if (!DS.isApiMode()) return Promise.resolve(false);
    var iso = fromDatetimeLocalMmt(visibleAtLocal);
    return Api.setExamNumberVisibility(roundId, iso).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var s = DS.state.sessions.find(function (x) { return x.id === String(roundId); });
      if (s) s.examNumberVisibleAt = iso || "";
      DS.notify();
      return true;
    });
  };

  // 사진 zip 서버 다운로드 (계약서 4절) — 클라 더미 제거
  DS.apiDownloadPhotosZip = function (query) {
    if (!DS.isApiMode()) return Promise.resolve({ ok: false, body: { error: { message: "API 모드가 아닙니다." } } });
    return Api.downloadPhotosZip(query || {});
  };

  DS.apiDownloadPaymentRoster = function (roundId) {
    if (!DS.isApiMode()) return Promise.resolve({ ok: false, body: { error: { message: "API 모드가 아닙니다." } } });
    return Api.downloadPaymentRoster(roundId);
  };

  DS.apiImportPaymentRoster = function (roundId, file) {
    if (!DS.isApiMode()) return Promise.resolve({ ok: false, body: { error: { message: "API 모드가 아닙니다." } } });
    return Api.importPaymentRoster(roundId, file).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return null;
      }
      return DS.reloadApplicants(roundId).then(function () { return res.body; });
    });
  };

  DS._membersQuery = { page: 1, page_size: 12, status: "all", q: "", nationality: "all" };

  DS.reloadMembers = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    opts = opts || {};
    var query = Object.assign({}, DS._membersQuery || {}, opts);
    DS._membersQuery = {
      page: query.page != null ? query.page : 1,
      page_size: query.page_size != null ? query.page_size : 12,
      status: query.status || "all",
      q: query.q || "",
      nationality: query.nationality || "all",
    };

    var pageQ = buildUsersQuery(DS._membersQuery);
    pageQ.page = DS._membersQuery.page;
    pageQ.page_size = DS._membersQuery.page_size;

    var catalogQ = buildUsersQuery({
      status: "all",
      q: "",
      nationality: "all",
    });

    var catalogPromise = opts.refreshCatalog
      ? fetchAllUsers(catalogQ)
      : Promise.resolve({ ok: true, body: null });

    return Promise.all([Api.getUsers(pageQ), catalogPromise]).then(function (results) {
      var pageRes = results[0];
      var catalogRes = results[1];
      if (!pageRes.ok) {
        DS.state.apiError = TopikBoApi.parseError(pageRes);
        return false;
      }
      var items = (pageRes.body && pageRes.body.items) || [];
      DS.state.members = mapMembersPage(items, pageQ.page, pageQ.page_size);
      applyMembersMeta(pageRes.body, DS.state.members);
      if (catalogRes && catalogRes.ok && catalogRes.body) {
        DS.state.membersCatalog = ((catalogRes.body && catalogRes.body.items) || []).map(mapMember);
      }
      DS.state.apiError = null;
      DS.notify();
      return true;
    });
  };

  /** CSV 등: 현재 필터(상태·검색·국적)로 전체 페이지 수집 */
  DS.fetchMembersForExport = function (opts) {
    if (!DS.isApiMode()) {
      return Promise.resolve((DS.state.members || []).slice());
    }
    var q = buildUsersQuery(opts || DS._membersQuery || {});
    delete q.page;
    delete q.page_size;
    return fetchAllUsers(q).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return [];
      }
      return ((res.body && res.body.items) || []).map(mapMember);
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
      return handleMutation(res, function () { return DS.reloadMembers({ refreshCatalog: true }); }).then(function (ok) {
        if (!ok) return false;
        return true;
      });
    });
  };

  DS.apiMemberStatus = function (id, status, reason) {
    return Api.updateUser(id, {
      status: memberStatusApi(status),
      memo: (reason || "").trim() || undefined,
    }, { rev: memberRev(id) }).then(function (res) {
      return handleMutation(res, function () { return DS.reloadMembers({ refreshCatalog: true }); }).then(function (ok) {
        if (!ok) return false;
        var key = String(id);
        var patch = function (list) {
          var m = (list || []).find(function (x) { return x.id === key; });
          if (m) {
            m.status = status;
            m.reason = reason || m.reason;
            if (res.body && res.body.rev != null) m.rev = res.body.rev;
          }
        };
        patch(DS.state.members);
        patch(DS.state.membersCatalog);
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
        board_notify_opt_in: !!data.boardNotifyOptIn,
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
      board_notify_opt_in: !!data.boardNotifyOptIn,
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

  /** 처리 이력 한 페이지 조회. 필터·페이징 모두 서버가 처리한다. */
  DS.loadAuditPage = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    var o = opts || {};
    DS.state.auditLoading = true;
    DS.notify();
    return Api.getAuditLogs(auditQuery(o, o.page || 1, o.pageSize || 25)).then(function (res) {
      DS.state.auditLoading = false;
      if (!res.ok) {
        DS.state.apiError = TopikBoApi.parseError(res);
        DS.state.audit = [];
        DS.state.auditTotal = 0;
      } else {
        var body = res.body || {};
        DS.state.audit = (body.items || []).map(mapAudit);
        DS.state.auditTotal = body.total_items != null ? body.total_items : DS.state.audit.length;
        DS.state.apiError = null;
      }
      DS.notify();
      return res;
    });
  };

  /** CSV 내보내기용 — 같은 필터로 전량 조회(서버 상한 2000건). */
  DS.fetchAuditAll = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve({ rows: [], total: 0 });
    return Api.getAuditLogs(auditQuery(opts || {}, 1, 2000)).then(function (res) {
      if (!res.ok) return { rows: [], total: 0 };
      var body = res.body || {};
      return { rows: (body.items || []).map(mapAudit), total: body.total_items || 0 };
    });
  };

  DS.reloadAudit = function () {
    return DS.loadAuditPage({ page: 1 });
  };

  /** 한글 액션 라벨 → 서버 action_type 목록. 라벨 하나가 여러 종류에 대응한다
      (회원 '로그인' = login·register·google_login). */
  function reverseActionTypes(map, label) {
    if (!label || label === "all") return null;
    var out = [];
    Object.keys(map).forEach(function (k) { if (map[k] === label) out.push(k); });
    return out.length ? out : null;
  }

  function accessQuery(o, page, pageSize, actionMap) {
    var q = { page: page, page_size: pageSize };
    var acts = reverseActionTypes(actionMap, o.action);
    if (acts) q.action_types = acts.join(",");
    if (o.result === "성공") q.success = true;
    else if (o.result === "실패") q.success = false;
    if (o.days) q.days = o.days;
    return q;
  }

  /* 예전에는 최신 500건만 받아 화면에서 걸렀다. 회원 접근 로그는 6만 건이 넘어
     0.8% 만 보였고, 필터도 그 안에서만 동작했다. 이제 서버가 처리한다. */
  DS.loadAdminAccessPage = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    var o = opts || {};
    var q = accessQuery(o, o.page || 1, o.pageSize || 25, ADMIN_ACCESS_ACTION_UI);
    if (o.adminId && o.adminId !== "all") q.admin_user_id = o.adminId;
    if (o.ip) q.ip = o.ip;
    DS.state.adminAccessLoading = true;
    DS.notify();
    return Api.getAdminAccessLogs(q).then(function (res) {
      DS.state.adminAccessLoading = false;
      var body = (res.ok && res.body) || {};
      DS.state.adminAccessLogs = (body.items || []).map(mapAdminAccessLog);
      DS.state.adminAccessTotal = body.total_items != null ? body.total_items : DS.state.adminAccessLogs.length;
      DS.notify();
      return res;
    });
  };

  DS.fetchAdminAccessAll = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve({ rows: [], total: 0 });
    var o = opts || {};
    var q = accessQuery(o, 1, 2000, ADMIN_ACCESS_ACTION_UI);
    if (o.adminId && o.adminId !== "all") q.admin_user_id = o.adminId;
    if (o.ip) q.ip = o.ip;
    return Api.getAdminAccessLogs(q).then(function (res) {
      if (!res.ok) return { rows: [], total: 0 };
      var body = res.body || {};
      return { rows: (body.items || []).map(mapAdminAccessLog), total: body.total_items || 0 };
    });
  };

  DS.loadMemberAccessPage = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    var o = opts || {};
    var q = accessQuery(o, o.page || 1, o.pageSize || 25, MEMBER_ACCESS_ACTION_UI);
    if (o.q) q.q = o.q;
    DS.state.memberAccessLoading = true;
    DS.notify();
    return Api.getMemberAccessLogs(q).then(function (res) {
      DS.state.memberAccessLoading = false;
      var body = (res.ok && res.body) || {};
      DS.state.memberAccessLogs = (body.items || []).map(mapMemberAccessLog);
      DS.state.memberAccessTotal = body.total_items != null ? body.total_items : DS.state.memberAccessLogs.length;
      DS.notify();
      return res;
    });
  };

  DS.fetchMemberAccessAll = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve({ rows: [], total: 0 });
    var o = opts || {};
    var q = accessQuery(o, 1, 2000, MEMBER_ACCESS_ACTION_UI);
    if (o.q) q.q = o.q;
    return Api.getMemberAccessLogs(q).then(function (res) {
      if (!res.ok) return { rows: [], total: 0 };
      var body = res.body || {};
      return { rows: (body.items || []).map(mapMemberAccessLog), total: body.total_items || 0 };
    });
  };

  DS.reloadAdminAccessLogs = function (q) { return DS.loadAdminAccessPage(q || {}); };
  DS.reloadMemberAccessLogs = function (q) { return DS.loadMemberAccessPage(q || {}); };

  function permHistoryQuery(o, page, pageSize) {
    var q = { page: page, page_size: pageSize };
    if (o.actor && o.actor !== "all") q.admin_user_id = o.actor;
    if (o.changeType && o.changeType !== "all") q.change_type = o.changeType;
    if (o.target && o.target !== "all") q.target = o.target;
    if (o.days) q.days = o.days;
    return q;
  }

  DS.loadPermHistoryPage = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve();
    var o = opts || {};
    DS.state.permHistoryLoading = true;
    DS.notify();
    return Api.getPermissionHistory(permHistoryQuery(o, o.page || 1, o.pageSize || 25)).then(function (res) {
      DS.state.permHistoryLoading = false;
      var body = (res.ok && res.body) || {};
      DS.state.permHistory = (body.items || []).map(mapPermHistory);
      DS.state.permHistoryTotal = body.total_items != null ? body.total_items : DS.state.permHistory.length;
      // '대상' 은 파생값이라 화면에서 목록을 만들 수 없다 — 서버가 준 것을 쓴다.
      if (body.targets) DS.state.permHistoryTargets = body.targets;
      DS.notify();
      return res;
    });
  };

  DS.fetchPermHistoryAll = function (opts) {
    if (!DS.isApiMode()) return Promise.resolve({ rows: [], total: 0 });
    return Api.getPermissionHistory(permHistoryQuery(opts || {}, 1, 2000)).then(function (res) {
      if (!res.ok) return { rows: [], total: 0 };
      var body = res.body || {};
      return { rows: (body.items || []).map(mapPermHistory), total: body.total_items || 0 };
    });
  };

  DS.reloadPermHistory = function (q) { return DS.loadPermHistoryPage(q || {}); };

  /** 접수자 상세 LP — 해당 접수 건(target_type=applications) 처리 이력·메모 조회 */
  DS.fetchApplicantAudit = function (appId) {
    if (!DS.isApiMode()) return Promise.resolve(null);
    var id = String(appId);
    return Api.getApplication(id).then(function (res) {
      if (res.ok && res.body) {
        syncApplicantMemos(id, res.body.memos || []);
        if (res.body.audit_logs) {
          return res.body.audit_logs.map(mapAudit);
        }
      }
      return Api.getAuditLogs({ target_type: "applications", target_id: id, page_size: 200 }).then(function (audRes) {
        if (!audRes.ok) return [];
        return ((audRes.body && audRes.body.items) || []).map(mapAudit);
      });
    });
  };

  DS.apiAddApplicantMemo = function (appId, text) {
    var body = String(text || "").trim();
    if (!body) return Promise.resolve(false);
    return Api.addApplicationMemo(appId, { body: body }).then(function (res) {
      if (!res.ok) {
        toastErr(TopikBoApi.parseError(res));
        return false;
      }
      return Api.getApplication(String(appId)).then(function (det) {
        if (det.ok && det.body) {
          syncApplicantMemos(appId, det.body.memos || []);
        }
        return true;
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

  DS.fmtMmt = fmtMmt;
  DS.fmtKst = fmtMmt;

  var origSetSession = DS.setSession;
  DS.setSession = function (sessionId) {
    origSetSession(sessionId);
    // 접수자 패널의 useEffect 도 같은 조회를 건다 — dedupe 로 한 번만 나가게 한다.
    if (DS.isApiMode()) DS.reloadApplicants(sessionId, { dedupe: true });
  };
})(typeof window !== "undefined" ? window : globalThis);
