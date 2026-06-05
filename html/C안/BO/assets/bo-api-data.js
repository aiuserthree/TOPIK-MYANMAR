/* ============================================================
   bo-api-data.js — Shared async data layer for the C안 BO SPA.
   ------------------------------------------------------------
   Bridges the live admin API (window.TopikBoApi) into the existing
   synchronous DataStore.state shape that every panel already renders.

   Responsibilities:
     • Adapters  — map API response shapes → the field names panels expect.
     • Loaders   — fetch + map + write DataStore.state[...] + notify().
     • useBoResource — hook returning {loading,error,reload} for panel gates.
     • LoadingState / ErrorState — styled loading/error UI (BO look & feel).
     • ResourceGate — wraps a panel: shows loader/error, else renders inner.

   Design notes:
     • UI/DOM is unchanged — we only change the *source* of the data.
     • Live API blocks localhost via CORS, so loaders degrade gracefully
       (network errors → ErrorState, never a blank screen / uncaught error).
   ============================================================ */
(function (global) {
  "use strict";

  function Api() { return global.TopikBoApi; }
  function DS() { return global.DataStore; }

  // ---------- code <-> label maps (match backend route source) -------------
  var NOTICE_C2L = { important: "중요", registration: "접수", exam: "시험", result: "결과" };
  var NOTICE_L2C = { "중요": "important", "접수": "registration", "시험": "exam", "결과": "result" };
  var FAQ_C2L = { account: "계정", apply: "접수", exam: "시험", result: "결과", other: "기타" };
  var FAQ_L2C = { "계정": "account", "접수": "apply", "시험": "exam", "결과": "result", "기타": "other" };
  var TERM_C2L = { service: "이용약관", privacy: "개인정보", marketing: "마케팅" };
  var TERM_L2C = { "이용약관": "service", "개인정보": "privacy", "마케팅": "marketing" };

  function dateOnly(s) { return s ? String(s).slice(0, 10) : ""; }
  function levelKo(l) {
    l = String(l || "").toUpperCase();
    return l === "II" ? "Ⅱ" : l === "I" ? "Ⅰ" : l;
  }
  function fail(res) { return { error: Api().parseError(res) }; }

  // ---------- adapters -----------------------------------------------------
  function mapRound(r) {
    return {
      id: String(r.id),
      apiId: r.id,
      no: Number(r.round_no),
      name: r.title,
      examDate: dateOnly(r.exam_date),
      applyStart: dateOnly(r.registration_start_at),
      applyEnd: dateOnly(r.registration_end_at),
      resultDate: dateOnly(r.result_announcement_date),
      cap: r.capacity != null ? Number(r.capacity) : 0,
      feeI: r.fee_level_i != null ? Number(r.fee_level_i) : 0,
      feeII: r.fee_level_ii != null ? Number(r.fee_level_ii) : 0,
      venues: (r.venues || []).map(function (v) { return String(v.id); }),
      status: r.registration_status === "open" ? "open"
        : r.registration_status === "closed" ? "closed" : "planned",
      registration_status: r.registration_status,
      active: r.is_active !== false,
      examVisibleAt: r.exam_number_visible_at || "",
      applicants: (r.stats && r.stats.active) || 0,
      stats: r.stats || { active: 0, paid: 0, assigned: 0 },
    };
  }

  function mapVenue(v) {
    return {
      id: String(v.id), apiId: v.id, code: v.venue_code,
      regionCode: v.region_code, region: v.region_name || v.region_code,
      nameKo: v.name_ko, nameEn: v.name_en || "", address: v.address || "",
      cap: v.capacity != null ? Number(v.capacity) : 0,
      active: !!v.is_active, memo: v.note || "",
      countryCode: v.country_code || "025", rev: v.rev,
    };
  }

  function mapRegion(rc) {
    return { code: rc.region_code, name: rc.name_ko + " (" + (rc.name_en || rc.region_code) + ")" };
  }

  function mapNotice(n) {
    return {
      id: String(n.id), apiId: n.id,
      cat: NOTICE_C2L[n.category] || n.category, catCode: n.category,
      title: n.title, author: n.author_email || "—",
      createdAt: n.created_at_label || dateOnly(n.created_at),
      views: n.view_count || 0, public: !!n.is_published, pin: !!n.is_pinned,
      body: "",
    };
  }

  function mapFaq(f) {
    return {
      id: String(f.id), apiId: f.id, no: f.id,
      cat: FAQ_C2L[f.category] || f.category, catCode: f.category,
      order: Number(f.sort_order) || 0,
      question: f.question_ko || "", answer: f.answer_ko || "",
      questionMy: f.question_my || "", questionEn: f.question_en || "",
      answerMy: f.answer_my || "", answerEn: f.answer_en || "",
      isActive: f.is_active !== false,
      updatedAt: dateOnly(f.updated_at),
    };
  }

  function mapTerm(t) {
    var status = t.status === "published" ? "pub" : t.status === "retired" ? "retired" : "draft";
    return {
      id: String(t.id), apiId: t.id,
      kind: TERM_C2L[t.term_type] || t.term_type, termType: t.term_type,
      version: t.version,
      publishedAt: (t.status === "published" || t.status === "retired") ? dateOnly(t.effective_at) : "",
      retiredAt: "",
      status: status, author: "—", body: t.body_ko || "",
      effectiveAt: dateOnly(t.effective_at),
    };
  }

  function mapApplication(it, sessionId) {
    var u = it.user || {};
    var v = it.venue || {};
    var ps = it.payment_status, st = it.status, prs = it.photo_review_status;
    var status;
    if (ps === "refunded") status = "refund";
    else if (st === "cancelled") status = "cancel";
    else if (st === "rejected") status = "rejected";
    else if (st === "approved" || st === "exam_number_assigned") status = "approved";
    else if (st === "payment_pending") status = "pay";
    else if (prs === "pending" || prs === "rejected") status = "photo";
    else status = "applied";
    return {
      id: String(it.application_id), apiId: it.application_id, rev: it.rev,
      sessionId: sessionId,
      no: it.application_no || it.application_id,
      nameKo: u.name_ko || "", nameEn: u.name_en || "",
      dob: u.birth_date || "", sx: Number(u.gender) || u.gender,
      nation: u.nationality || "", l1: u.first_language || "",
      job: u.job_label || "", motive: u.motive_label || "", purpose: u.purpose_label || "",
      level: levelKo(it.exam_level),
      venueId: v.id != null ? String(v.id) : "",
      photoOk: prs === "approved",
      photoStatus: prs || "pending",
      paid: ps === "paid",
      paidAt: it.paid_at ? dateOnly(it.paid_at) : "",
      receipt: it.receipt_no || "",
      exam: it.exam_number || "",
      status: status,
      appliedAt: it.created_at_label || dateOnly(it.created_at),
      rejectReason: it.reject_note || "",
      memo: "", email: u.email || "", tel: u.phone || "",
      accommodation: false,
      photoFileId: it.photo_file_id || null,
    };
  }

  // ---- 6대 관리 패널 어댑터 (회원/관리자/문의/환불/처리이력) -------------
  var ADMIN_ROLE_C2UI = { super: "super", standard: "general", readonly: "viewer" };
  var REFUND_ST_C2L = {
    received: "접수", in_review: "검토중", completed: "처리완료",
    rejected: "반려", answered: "처리완료", awaiting_reply: "접수",
  };
  // admin_audit_logs.target_table → 처리 이력 패널의 한국어 유형
  var AUDIT_TYPE_C2L = {
    users: "회원", admin_users: "관리자계정", notices: "공지", faq_items: "FAQ",
    exam_rounds: "회차", exam_venues: "시험장", applications: "접수자",
    board_posts: "문의", terms: "약관", file_attachments: "공지",
  };

  function memberStatus(s) { return s === "suspended" ? "inactive" : String(s || ""); }

  function mapMember(u) {
    return {
      id: String(u.id), apiId: u.id, no: u.id,
      nameKo: u.name_ko || "", nameEn: u.name_en || "",
      email: u.email || "", tel: u.phone || "",
      nation: u.nationality || "",
      joinedAt: u.created_at_label || dateOnly(u.created_at),
      lastLogin: u.last_login_label || "—",
      status: memberStatus(u.status),
      marketing: !!u.marketing_opt_in,
      preferredLang: u.preferred_lang || "ko",
      reason: "",
    };
  }

  function mapAdmin(a) {
    return {
      id: a.email || String(a.id), apiId: a.id,
      name: a.name || "", email: a.email || "",
      role: ADMIN_ROLE_C2UI[a.role] || a.role,
      lastLogin: a.last_login_label || "—", lastIp: "—",
      status: a.is_active ? "active" : "inactive",
      note: "",
    };
  }

  function mapInquiry(p) {
    var done = p.workflow_status === "answered" || p.workflow_status === "completed";
    return {
      id: String(p.id), apiId: p.id, no: p.id,
      cat: p.category || "기타", secret: !!p.is_secret,
      title: p.title || "", author: p.author_name || p.author_email || "—",
      createdAt: p.created_at_label || dateOnly(p.created_at),
      status: done ? "done" : "wait",
      assignee: p.assignee_name || p.assignee_email || "",
      workflowStatus: p.workflow_status,
      body: "", comments: [],
    };
  }

  function mapRefund(r) {
    return {
      id: String(r.id), apiId: r.id, no: r.id,
      type: r.category || "환불",
      title: r.title || "", author: r.author_name || r.author_email || "—",
      createdAt: r.created_at_label || dateOnly(r.created_at),
      status: REFUND_ST_C2L[r.workflow_status] || "접수",
      workflowStatus: r.workflow_status,
      hasAnswer: !!r.has_reply,
      assignee: r.assignee_name || r.assignee_email || "",
      body: "", attachments: [], comments: [],
    };
  }

  // ISO → "YYYY-MM-DD HH:MM:SS" (dashes) so the 처리이력 기간 필터 비교가 동작.
  function tsDash(iso) {
    var s = String(iso || "");
    if (!s) return "";
    return s.replace("T", " ").slice(0, 19);
  }

  function auditAction(a) {
    var s = String(a || "");
    if (/create/.test(s)) return "생성";
    if (/delete/.test(s)) return "삭제";
    if (/approve/.test(s)) return "승인";
    if (/reject/.test(s)) return "반려";
    if (/payment.*cancel|cancel.*payment/.test(s)) return "수납취소";
    if (/payment|mark_paid/.test(s)) return "수납";
    if (/unpublish/.test(s)) return "폐지";
    if (/publish|marketing/.test(s)) return "게시";
    if (/reset/.test(s)) return "비밀번호초기화";
    if (/exam_number/.test(s)) return "수험번호부여";
    if (/memo/.test(s)) return "메모";
    if (/update|status|reply|comment/.test(s)) return "수정";
    return s || "수정";
  }

  function mapAuditLog(l) {
    var before = l.status_before != null ? { status: l.status_before } : null;
    var after = null;
    if (l.status_after != null || (l.payload && typeof l.payload === "object")) {
      after = {};
      if (l.status_after != null) after.status = l.status_after;
      if (l.payload && typeof l.payload === "object") Object.assign(after, l.payload);
    }
    return {
      id: String(l.id),
      ts: tsDash(l.created_at) || l.created_at_label || "",
      actor: l.actor_email || ("#" + l.admin_user_id),
      ip: "—",
      type: AUDIT_TYPE_C2L[l.target_table] || l.target_table || "—",
      targetId: l.target_id != null ? String(l.target_id) : "—",
      action: auditAction(l.action),
      rawAction: l.action,
      before: before, after: after,
      memo: l.memo || "",
    };
  }

  function mapConsent(c) {
    return {
      id: String(c.id),
      ts: tsDash(c.agreed_at) || "",
      memberId: c.user_id != null ? String(c.user_id) : "",
      name: c.name_ko || "",
      termsKind: TERM_C2L[c.term_type] || c.term_type || "",
      version: c.version || "",
      ip: c.ip_address || "—",
      method: "온라인",
    };
  }

  // ---------- raw loaders (fetch + map + write + notify) -------------------
  function loadRoundsRaw(opts) {
    var params = opts && opts.includeInactive ? { include_inactive: 1 } : undefined;
    return Api().listExamRounds(params).then(function (res) {
      if (!res.ok) return fail(res);
      var rounds = (res.body.rounds || []).map(mapRound);
      DS().state.sessions = rounds;
      var active = DS().state.activeSessionId;
      if (!active || !rounds.some(function (s) { return s.id === active; })) {
        var pickable = rounds.filter(function (s) { return s.active !== false; });
        var open = pickable.filter(function (s) { return s.status === "open"; })[0];
        DS().state.activeSessionId = (open || pickable[0] || rounds[0] || {}).id || null;
      }
      DS().notify();
      return { ok: true };
    });
  }

  function loadVenuesRaw() {
    return Api().listVenues().then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.venues = (res.body.items || []).map(mapVenue);
      return Api().listRegionCodes().then(function (r2) {
        if (r2.ok && r2.body && r2.body.items) {
          DS().state.regions = r2.body.items.map(mapRegion);
        }
        DS().notify();
        return { ok: true };
      });
    });
  }

  function mergeRoundDetail(roundId) {
    return Api().getExamRound(roundId).then(function (res) {
      if (!res.ok || !res.body || !res.body.round) return;
      var r = res.body.round;
      var s = DS().state.sessions.filter(function (x) { return x.id === String(roundId); })[0];
      if (!s) return;
      s.applyStart = dateOnly(r.registration_start_at);
      s.applyEnd = dateOnly(r.registration_end_at);
      s.resultDate = dateOnly(r.result_announcement_date);
      s.feeI = r.fee_level_i != null ? Number(r.fee_level_i) : 0;
      s.feeII = r.fee_level_ii != null ? Number(r.fee_level_ii) : 0;
      s.cap = r.capacity != null ? Number(r.capacity) : s.cap;
      s.examDate = dateOnly(r.exam_date) || s.examDate;
      s.examVisibleAt = r.exam_number_visible_at || s.examVisibleAt;
      s.rev = r.rev;
      if (Array.isArray(res.body.venue_ids)) s.venues = res.body.venue_ids.map(String);
      DS().notify();
    }).catch(function () { /* non-fatal */ });
  }

  function loadAppsRaw(roundId) {
    var all = [];
    var CAP_PAGES = 60; // safety cap (100/page → up to 6000 rows)
    function page(p) {
      return Api().listApplications({ exam_round_id: roundId, page: p, page_size: 100 }).then(function (res) {
        if (!res.ok) return fail(res);
        all = all.concat(res.body.items || []);
        var pg = res.body.pagination || {};
        if (p < (pg.total_pages || 1) && p < CAP_PAGES) return page(p + 1);
        DS().state.applicants = all.map(function (it) { return mapApplication(it, String(roundId)); });
        DS().notify();
        return { ok: true };
      });
    }
    return page(1);
  }

  function loadNoticesRaw() {
    return Api().listNotices({ page_size: 100 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.notices = (res.body.items || []).map(mapNotice);
      DS().notify();
      return { ok: true };
    });
  }

  function loadFaqRaw() {
    return Api().listFaq().then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.faqs = (res.body.items || []).map(mapFaq);
      DS().notify();
      return { ok: true };
    });
  }

  function loadTermsRaw() {
    return Api().listTerms().then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.terms = (res.body.items || []).map(mapTerm);
      DS().notify();
      return { ok: true };
    });
  }

  function loadMembersRaw() {
    return Api().listMembers({ page_size: 200 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.members = (res.body.items || []).map(mapMember);
      DS().notify();
      return { ok: true };
    });
  }

  function loadAdminsRaw() {
    return Api().listAdminUsers().then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.admins = (res.body.items || []).map(mapAdmin);
      DS().notify();
      return { ok: true };
    });
  }

  function loadInquiriesRaw() {
    return Api().listBoardPosts({ board_type: "inquiry", page_size: 100 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.inquiries = (res.body.items || []).map(mapInquiry);
      DS().notify();
      return { ok: true };
    });
  }

  function loadRefundsRaw() {
    return Api().listBoardPosts({ board_type: "refund_correction", page_size: 100 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.refunds = (res.body.items || []).map(mapRefund);
      DS().notify();
      return { ok: true };
    });
  }

  function loadAuditRaw() {
    return Api().listAuditLogs({ page_size: 200 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.audit = (res.body.items || []).map(mapAuditLog);
      DS().notify();
      // 처리자 드롭다운/표시를 위해 관리자 목록도 함께 로드(실패는 무시).
      return loadAdminsRaw().then(function () { return { ok: true }; }, function () { return { ok: true }; });
    });
  }

  function loadConsentsRaw() {
    return Api().listTermAgreements({ page_size: 500 }).then(function (res) {
      if (!res.ok) return fail(res);
      DS().state.consents = (res.body.items || []).map(mapConsent);
      // 회원 필터 드롭다운을 위해 회원 목록도 함께 로드(실패는 무시).
      return loadMembersRaw().then(
        function () { DS().notify(); return { ok: true }; },
        function () { DS().notify(); return { ok: true }; }
      );
    });
  }

  // ---------- once() cache for shared context (rounds / venues) ------------
  var loadedOnce = {};
  function once(key, fn) {
    if (loadedOnce[key]) return Promise.resolve({ ok: true });
    return Promise.resolve(fn()).then(function (r) {
      if (!(r && r.error)) loadedOnce[key] = true;
      return r;
    });
  }
  function invalidate(key) { loadedOnce[key] = false; }

  // Combined loader for dashboard + applicants (rounds + venues + active round apps)
  function loadRoundContext() {
    return once("rounds", loadRoundsRaw).then(function (r) {
      if (r && r.error) return r;
      return once("venues", loadVenuesRaw);
    }).then(function (r) {
      if (r && r.error) return r;
      var rid = DS().state.activeSessionId;
      if (!rid) { DS().state.applicants = []; DS().notify(); return { ok: true }; }
      return mergeRoundDetail(rid).then(function () { return loadAppsRaw(rid); });
    });
  }

  // Ensure venues are available for panels that need them but aren't round-gated
  function ensureVenues() { return once("venues", loadVenuesRaw); }
  function loadVenuesPanel() { invalidate("venues"); return loadVenuesRaw(); }
  function loadSessionsPanel(includeInactive) {
    invalidate("rounds");
    return loadRoundsRaw({ includeInactive: includeInactive }).then(function (r) {
      if (r && r.error) return r;
      return once("venues", loadVenuesRaw); // sessions edit picks from active venues
    });
  }

  // Named reloaders used by panels after a successful write.
  var RELOADERS = {
    notices: loadNoticesRaw,
    faq: loadFaqRaw,
    terms: loadTermsRaw,
    venues: loadVenuesPanel,
    sessions: function (includeInactive) { invalidate("rounds"); return loadRoundsRaw({ includeInactive: includeInactive }); },
    apps: function () {
      var rid = DS().state.activeSessionId;
      return rid ? loadAppsRaw(rid) : Promise.resolve({ ok: true });
    },
    members: loadMembersRaw,
    admins: loadAdminsRaw,
    inquiries: loadInquiriesRaw,
    refunds: loadRefundsRaw,
    audit: loadAuditRaw,
    consents: loadConsentsRaw,
  };
  function reload(name, arg) {
    var fn = RELOADERS[name];
    return fn ? Promise.resolve(fn(arg)) : Promise.resolve({ ok: true });
  }

  // ---------- hook + gate UI ----------------------------------------------
  function useBoResource(loader, deps) {
    var t = global.useState(0); var tick = t[0], setTick = t[1];
    var s = global.useState({ loading: true, error: null }); var st = s[0], setSt = s[1];
    global.useEffect(function () {
      var alive = true;
      setSt({ loading: true, error: null });
      Promise.resolve(loader()).then(function (r) {
        if (!alive) return;
        setSt({ loading: false, error: (r && r.error) || null });
      }).catch(function (e) {
        if (alive) setSt({ loading: false, error: String((e && e.message) || e) });
      });
      return function () { alive = false; };
    }, (deps || []).concat([tick]));
    return {
      loading: st.loading, error: st.error,
      reload: function () { setTick(function (x) { return x + 1; }); },
    };
  }

  function LoadingState() {
    var h = global.h;
    return h("div", { className: "dg-wrap", style: { marginTop: 16 } },
      h("div", { className: "empty", style: { padding: "60px 24px" } },
        h("div", { className: "spinner-dot", style: {
          width: 28, height: 28, margin: "0 auto 14px", borderRadius: "50%",
          border: "3px solid var(--border)", borderTopColor: "var(--primary)",
          animation: "bo-spin 0.8s linear infinite",
        } }),
        h("div", { className: "ttl" }, "불러오는 중…"),
        h("div", { className: "sub" }, "서버에서 데이터를 가져오고 있습니다."),
        h("style", null, "@keyframes bo-spin{to{transform:rotate(360deg)}}")
      )
    );
  }

  function ErrorState(props) {
    var h = global.h;
    return h("div", { className: "dg-wrap", style: { marginTop: 16 } },
      h("div", { className: "empty", style: { padding: "48px 24px" } },
        h("div", { className: "icon" }, global.I && global.I.X ? h(global.I.X) : "!"),
        h("div", { className: "ttl" }, props.error || "데이터를 불러오지 못했습니다."),
        h("div", { className: "sub", style: { marginBottom: 16 } },
          "API 연결 상태를 확인한 뒤 다시 시도해 주세요. (로컬에서는 CORS 정책으로 호출이 차단될 수 있습니다.)"),
        h("button", { className: "btn btn-secondary", onClick: props.onRetry }, "다시 시도")
      )
    );
  }

  function ResourceGate(props) {
    var h = global.h;
    var res = useBoResource(props.loader, props.deps);
    if (res.error) return h(ErrorState, { error: res.error, onRetry: res.reload });
    if (res.loading) return h(LoadingState);
    return h(props.inner, props.innerProps || null);
  }

  global.BoData = {
    // adapters (exposed for clarity/testing)
    mapRound: mapRound, mapVenue: mapVenue, mapRegion: mapRegion,
    mapNotice: mapNotice, mapFaq: mapFaq, mapTerm: mapTerm, mapApplication: mapApplication,
    mapMember: mapMember, mapAdmin: mapAdmin, mapInquiry: mapInquiry,
    mapRefund: mapRefund, mapAuditLog: mapAuditLog, mapConsent: mapConsent,
    // code/label maps
    NOTICE_L2C: NOTICE_L2C, NOTICE_C2L: NOTICE_C2L,
    FAQ_L2C: FAQ_L2C, FAQ_C2L: FAQ_C2L,
    TERM_L2C: TERM_L2C, TERM_C2L: TERM_C2L,
    REFUND_ST_C2L: REFUND_ST_C2L,
    // loaders
    loadRoundContext: loadRoundContext,
    loadNotices: loadNoticesRaw,
    loadFaq: loadFaqRaw,
    loadTerms: loadTermsRaw,
    loadVenuesPanel: loadVenuesPanel,
    loadSessionsPanel: loadSessionsPanel,
    loadMembers: loadMembersRaw,
    loadAdmins: loadAdminsRaw,
    loadInquiries: loadInquiriesRaw,
    loadRefunds: loadRefundsRaw,
    loadAudit: loadAuditRaw,
    loadConsents: loadConsentsRaw,
    ensureVenues: ensureVenues,
    invalidate: invalidate,
    reload: reload,
  };
  global.useBoResource = useBoResource;
  global.ResourceGate = ResourceGate;
  global.LoadingState = LoadingState;
  global.ErrorState = ErrorState;
})(typeof window !== "undefined" ? window : this);
