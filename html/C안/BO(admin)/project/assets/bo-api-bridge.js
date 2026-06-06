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
  };
  var STATUS_TO_API = { planned: "scheduled", open: "open", closed: "closed" };

  function isoDate(v) {
    if (!v) return "";
    return String(v).slice(0, 10);
  }

  function isoLocal(v) {
    if (!v) return "";
    return String(v).replace("T", " ").slice(0, 16);
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
    if (row.status === "approved" || row.status === "exam_number_assigned") return "approved";
    if (row.photo_review_status === "pending" || row.status === "photo_review") return row.status === "submitted" ? "applied" : "photo";
    if (row.status === "payment_pending" || (row.photo_review_status === "approved" && row.payment_status !== "paid")) return "pay";
    if (row.status === "submitted") return "applied";
    return row.status || "applied";
  }

  function mapApplicant(row, idx) {
    var photoOk = row.photo_review_status === "approved";
    var paid = row.payment_status === "paid";
    return {
      id: String(row.id),
      sessionId: String(row.exam_round_id),
      no: idx + 1,
      nameKo: row.name_ko || "—",
      nameEn: row.name_en || "—",
      dob: row.birth_date || "",
      sx: row.gender === "2" ? 2 : 1,
      nation: "미얀마",
      l1: "미얀마어",
      job: "미상",
      motive: "미상",
      purpose: "미상",
      level: levelUi(row.exam_level),
      venueId: String(row.exam_venue_id),
      photoOk: photoOk,
      photoStatus: row.photo_review_status || "pending",
      paid: paid,
      paidAt: isoLocal(row.paid_at),
      receipt: row.payment_receipt_no || "",
      exam: row.exam_number || "",
      status: mapApplicantStatus(row),
      appliedAt: isoLocal(row.created_at),
      rejectReason: row.reject_reason || "",
      memo: "",
      email: row.email || "",
      tel: row.phone || "",
      accommodation: false,
    };
  }

  function mapSession(row, applicantCounts) {
    var st = STATUS_MAP[row.registration_status] || "planned";
    return {
      id: String(row.id),
      no: row.round_no,
      name: row.title,
      applyStart: isoDate(row.registration_start_at),
      applyEnd: isoDate(row.registration_end_at),
      examDate: isoDate(row.exam_date),
      resultDate: isoDate(row.result_date),
      cap: row.capacity,
      feeI: row.fee_level_i,
      feeII: row.fee_level_ii,
      venues: (row.venue_ids || []).map(String),
      status: st,
      applicants: applicantCounts[row.id] || 0,
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
      address: row.address || "",
      cap: row.capacity,
      active: row.is_active !== false,
      memo: row.memo || "",
    };
  }

  function mapNotice(row, idx, author) {
    return {
      id: String(row.id),
      no: idx + 1,
      cat: row.category,
      title: row.title,
      body: row.body_html || "",
      author: author || "admin",
      createdAt: isoLocal(row.created_at || row.published_at),
      views: row.view_count || 0,
      public: !!row.is_published,
      pin: !!row.is_pinned,
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
    user_update: "수정", user_reset_password: "비밀번호초기화",
    admin_create: "생성", admin_update: "수정", admin_reset_password: "비밀번호초기화",
    exam_round_create: "생성", exam_venue_update: "수정", exam_number_assign: "수험번호부여",
    photo_review_approve: "승인", photo_review_reject: "반려",
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
  function memberStatusUi(s) {
    return s === "suspended" ? "inactive" : s;
  }
  function memberStatusApi(s) {
    return s === "inactive" ? "suspended" : s;
  }

  function mapRefund(row, idx) {
    return {
      id: String(row.id),
      no: idx + 1,
      type: row.category || row.post_type || "환불",
      title: row.title,
      author: row.author_email || row.author_name || ("user" + row.user_id),
      createdAt: isoLocal(row.created_at),
      status: REFUND_STATUS_UI[row.workflow_status] || "접수",
      hasAnswer: !!row.has_admin_reply || !!row.admin_reply,
      assignee: row.admin_replier_id ? String(row.admin_replier_id) : "",
      body: row.body || "",
      attachments: [],
      comments: row.admin_reply ? [{
        author: String(row.admin_replier_id || "admin"),
        body: row.admin_reply,
        public: false,
        ts: isoLocal(row.admin_replied_at),
        kind: "reply",
      }] : [],
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
      createdAt: isoLocal(row.created_at),
      status: done ? "done" : "wait",
      assignee: row.admin_replier_id ? String(row.admin_replier_id) : "",
      body: row.body || "",
      comments: row.admin_reply ? [{
        author: String(row.admin_replier_id || "admin"),
        body: row.admin_reply,
        public: !row.is_secret,
        ts: isoLocal(row.admin_replied_at),
        kind: "reply",
      }] : [],
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
      lastLogin: isoLocal(row.last_login_at) || "—",
      status: memberStatusUi(row.status || "active"),
      marketing: !!row.marketing_opt_in,
      reason: "",
    };
  }

  function mapTerm(row) {
    return {
      id: String(row.id),
      kind: TERM_KIND_UI[row.term_type] || row.term_type,
      version: row.version,
      body: row.body_ko || "",
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
      lastLogin: isoLocal(row.last_login_at) || "—",
      lastIp: "—",
      note: "",
    };
  }

  function mapAudit(row) {
    return {
      id: "log" + row.id,
      ts: isoLocal(row.created_at),
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

  function fail(msg) {
    DS.state.apiError = msg;
    DS.state.applicants = [];
    DS.state.sessions = [];
    DS.state.venues = [];
    DS.state.notices = [];
    DS.state.faqs = [];
    DS.state.refunds = [];
    DS.state.inquiries = [];
    DS.state.members = [];
    DS.state.terms = [];
    DS.state.admins = [];
    DS.state.audit = [];
    DS.notify();
    return false;
  }

  function clearLists() {
    DS.state.applicants = [];
    DS.state.sessions = [];
    DS.state.venues = [];
    DS.state.notices = [];
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
      DS.state.refunds = ((refRes.body && refRes.body.items) || []).map(mapRefund);
      DS.state.inquiries = ((inqRes.body && inqRes.body.items) || []).map(mapInquiry);
      DS.state.members = ((memRes.body && memRes.body.items) || []).map(mapMember);
      DS.state.terms = ((termRes.body && termRes.body.items) || []).map(mapTerm);
      DS.state.admins = ((admRes.body && admRes.body.items) || []).map(mapAdmin);

      if (audRes.ok && audRes.body && audRes.body.items) {
        DS.state.audit = audRes.body.items.map(mapAudit);
      } else {
        DS.state.audit = [];
      }

      if (DS.state.sessions.length) {
        var open = DS.state.sessions.find(function (s) { return s.status === "open"; });
        DS.state.activeSessionId = (open || DS.state.sessions[0]).id;
      }

      DS.apiLoading = false;
      DS.state.apiError = null;
      DS.notify();
      return true;
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
    return Api.photoReview(id, { action: "approve" }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      applyLocalApplicant(id, { photoStatus: "approved", photoOk: true, status: "pay" });
      return true;
    });
  };

  DS.apiPhotoReject = function (id, reason) {
    return Api.photoReview(id, { action: "reject", photo_reject_note: reason }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      applyLocalApplicant(id, { photoStatus: "rejected", photoOk: false, status: "rejected", rejectReason: reason });
      return true;
    });
  };

  DS.apiApprove = function (ids) {
    return Promise.all(ids.map(function (id) { return Api.approveApplication(id); })).then(function (ress) {
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      ids.forEach(function (id) { applyLocalApplicant(id, { status: "approved" }); });
      return ids.length;
    });
  };

  DS.apiReject = function (ids, reason) {
    return Promise.all(ids.map(function (id) { return Api.rejectApplication(id, { reject_reason: reason }); })).then(function (ress) {
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      ids.forEach(function (id) { applyLocalApplicant(id, { status: "rejected", rejectReason: reason }); });
      return ids.length;
    });
  };

  DS.apiPay = function (ids, info) {
    return Promise.all(ids.map(function (id) {
      return Api.paymentApplication(id, { receipt_no: info.receipt, payment_memo: info.memo });
    })).then(function (ress) {
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      ids.forEach(function (id) {
        applyLocalApplicant(id, {
          paid: true,
          paidAt: new Date().toISOString().replace("T", " ").slice(0, 16),
          receipt: info.receipt || "",
          status: "approved",
        });
      });
      return ids.length;
    });
  };

  DS.apiCancelPay = function (ids) {
    return Promise.all(ids.map(function (id) { return Api.cancelPayment(id); })).then(function (ress) {
      var bad = ress.find(function (r) { return !r.ok; });
      if (bad) { toastErr(TopikBoApi.parseError(bad)); return 0; }
      ids.forEach(function (id) { applyLocalApplicant(id, { paid: false, status: "refund" }); });
      return ids.length;
    });
  };

  DS.apiAssignExamNumbers = function (sessionId, preview) {
    return Api.assignExamNumbers(sessionId, { dry_run: !!preview }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return null; }
      if (!preview && res.body) {
        return DS.reloadApplicants(sessionId).then(function () { return res.body; });
      }
      return res.body;
    });
  };

  DS.apiSaveSession = function (data) {
    var payload = {
      round_no: data.no,
      title: data.name,
      exam_date: data.examDate,
      registration_start_at: data.applyStart + "T00:00:00",
      registration_end_at: data.applyEnd + "T23:59:59",
      fee_level_i: data.feeI,
      fee_level_ii: data.feeII,
      capacity: data.cap,
      venue_ids: (data.venues || []).map(function (v) { return parseInt(v, 10); }).filter(Boolean),
    };
    var p;
    if (data.id && !data._isNew) {
      p = Api.updateExamRound(data.id, payload).then(function (res) {
        if (!res.ok) return res;
        return Api.setExamRoundStatus(data.id, STATUS_TO_API[data.status] || "scheduled");
      });
    } else {
      p = Api.createExamRound(payload).then(function (res) {
        if (!res.ok || !res.body || !res.body.id) return res;
        if (data.status && data.status !== "planned") {
          return Api.setExamRoundStatus(res.body.id, STATUS_TO_API[data.status] || "scheduled");
        }
        return res;
      });
    }
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

  DS.apiSaveNotice = function (data) {
    var payload = {
      category: data.cat,
      title: data.title,
      body_html: data.body || "",
      is_pinned: !!data.pin,
      is_published: !!data.public,
    };
    var p = data.id && !data._isNew
      ? Api.updateNotice(data.id, payload)
      : Api.createNotice(payload);
    return p.then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiDeleteNotice = function (id) {
    return Api.updateNotice(id, { is_published: false }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      DS.state.notices = DS.state.notices.filter(function (n) { return n.id !== String(id); });
      DS.notify();
      return true;
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
        row.comments = row.comments || [];
        row.comments.push({
          author: DS.state.me && DS.state.me.id ? String(DS.state.me.id) : "admin",
          body: body,
          public: !!opts.public,
          ts: new Date().toISOString().slice(0, 16).replace("T", " "),
          kind: "reply",
        });
        if (boardKind === "inquiry" && opts.markDone) row.status = "done";
        if (boardKind === "refund" && opts.status) row.status = opts.status;
        row.assignee = DS.state.me && DS.state.me.id ? String(DS.state.me.id) : "admin";
      }
      DS.notify();
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

  DS.apiSaveMember = function (id, data) {
    return Api.updateUser(id, {
      name_ko: data.nameKo,
      name_en: data.nameEn,
      email: data.email,
      phone: data.tel,
      nationality: data.nation,
      marketing_opt_in: data.marketing,
    }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      return DS.initFromApi();
    });
  };

  DS.apiMemberStatus = function (id, status, reason) {
    return Api.updateUser(id, {
      status: memberStatusApi(status),
    }).then(function (res) {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return false; }
      var m = DS.state.members.find(function (x) { return x.id === String(id); });
      if (m) { m.status = status; m.reason = reason || m.reason; }
      DS.notify();
      return true;
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

  DS.staticPermissions = true;

  var origSetSession = DS.setSession;
  DS.setSession = function (sessionId) {
    origSetSession(sessionId);
    if (DS.isApiMode()) DS.reloadApplicants(sessionId);
  };
})(typeof window !== "undefined" ? window : globalThis);
