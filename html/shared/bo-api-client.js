/**
 * BO API client — admin endpoints via same-origin /api or meta topik-api-base.
 */
(function (global) {
  "use strict";

  var STORAGE = { access: "bo_access_token", admin: "bo_admin_user" };

  function readMetaApiBase() {
    if (typeof document === "undefined") return null;
    var meta = document.querySelector('meta[name="topik-api-base"]');
    if (!meta || !meta.content || !meta.content.trim()) return null;
    var val = meta.content.trim();
    var loc = global.location;
    if (loc && loc.hostname) {
      var host = loc.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") {
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(val)) return null;
      }
    }
    return val;
  }

  function resolveBaseUrl() {
    // 우선순위: window.TOPIK_API_BASE > <meta topik-api-base> > localhost:8000 > 동일 오리진("")
    // 운영(nginx /api 프록시): meta·TOPIK_API_BASE 미설정 시 same-origin.
    // 로컬 개발(API :8000): localhost/127.0.0.1 자동 연결 또는 meta·TOPIK_API_BASE 주입.
    if (typeof global.TOPIK_API_BASE === "string" && global.TOPIK_API_BASE.trim()) {
      return global.TOPIK_API_BASE.trim();
    }
    var metaBase = readMetaApiBase();
    if (metaBase) return metaBase;
    var loc = global.location;
    if (!loc || !loc.hostname) return "http://127.0.0.1:8000";
    var host = loc.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
    return "";
  }

  var API_BASE_URL = resolveBaseUrl();
  var SAME_ORIGIN = API_BASE_URL === "";

  function apiUrl(path) {
    return API_BASE_URL.replace(/\/$/, "") + path;
  }

  function canUseApi() {
    return SAME_ORIGIN || !!API_BASE_URL;
  }

  function getAccessToken() {
    try {
      return global.sessionStorage.getItem(STORAGE.access) || global.localStorage.getItem(STORAGE.access);
    } catch (e) {
      return null;
    }
  }

  function getSessionRaw() {
    try {
      return global.sessionStorage.getItem("bo_session");
    } catch (e) {
      return null;
    }
  }

  function isAuthenticated() {
    return !!(getAccessToken() && getSessionRaw());
  }

  function clearAuthStorage() {
    try {
      global.sessionStorage.removeItem(STORAGE.access);
      global.localStorage.removeItem(STORAGE.access);
      global.sessionStorage.removeItem(STORAGE.admin);
      global.localStorage.removeItem(STORAGE.admin);
      global.sessionStorage.removeItem("bo_session");
    } catch (e) { /* ignore */ }
  }

  function persistSession(body, persist) {
    var account = body.user || body.admin || {};
    clearAuthStorage();
    var store = persist ? global.localStorage : global.sessionStorage;
    try {
      store.setItem(STORAGE.access, body.access_token);
      store.setItem(STORAGE.admin, JSON.stringify(account));
      global.sessionStorage.setItem("bo_session", JSON.stringify({
        id: account.email,
        email: account.email,
        name: account.name,
        role: account.role,
        must_change_password: !!account.must_change_password,
        loginAt: new Date().toISOString(),
      }));
      return isAuthenticated();
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    clearAuthStorage();
  }

  function apiFetch(path, options) {
    options = options || {};
    if (!canUseApi()) {
      return Promise.resolve({ ok: false, status: 0, body: { error: { message: "API not configured" } } });
    }
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    var token = getAccessToken();
    if (token && options.auth !== false) headers.Authorization = "Bearer " + token;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    return fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function isAdminRole(role) {
    return !!role && role !== "user";
  }

  function login(email, password, options) {
    options = options || {};
    return apiFetch("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (res) {
      var account = (res.body && (res.body.user || res.body.admin)) || null;
      if (res.ok && res.body && res.body.access_token && account && isAdminRole(account.role)) {
        if (!persistSession(res.body, !!options.persist)) {
          return {
            ok: false,
            status: 0,
            body: { error: { message: "세션 저장에 실패했습니다. 브라우저 저장소 설정을 확인해 주세요." } },
          };
        }
        return res;
      }
      if (res.ok && account && account.role === "user") {
        clearAuthStorage();
        return {
          ok: false,
          status: 403,
          body: { error: { message: "관리자 계정이 아닙니다." } },
        };
      }
      if (res.ok) {
        clearAuthStorage();
      }
      return res;
    });
  }

  function parseError(res) {
    var b = (res && res.body) || {};
    if (b.error && b.error.message) return b.error.message;
    return "요청을 처리할 수 없습니다.";
  }

  /**
   * 관리자 첨부/증명사진의 <img src> URL.
   * <img>는 Authorization 헤더를 못 보내므로 토큰을 query(?token=)로 전달한다.
   * (files 라우트가 이 용도로 ?token= 을 허용함)
   */
  function fileUrl(fileId) {
    if (fileId == null || fileId === "" || !canUseApi()) return "";
    var token = getAccessToken();
    return apiUrl("/api/v1/admin/files/" + encodeURIComponent(fileId)) +
      (token ? "?token=" + encodeURIComponent(token) : "");
  }

  function triggerBlobDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function filenameFromDisposition(res, fallback) {
    var cd = (res.headers && res.headers.get && res.headers.get("Content-Disposition")) || "";
    var m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1].replace(/"/g, "")); } catch (e) { return m[1].replace(/"/g, ""); }
    }
    return fallback;
  }

  /** 사진 원본 다운로드 (관리자 파일). 동일 오리진이면 download 속성, 아니면 새 탭. */
  function downloadFile(fileId, filename) {
    var url = fileUrl(fileId);
    if (!url) return false;
    var a = document.createElement("a");
    a.href = url;
    if (filename) a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  /**
   * 사진 zip 서버 다운로드 — GET /api/v1/admin/applications/photos.zip
   * 서버가 {지역}/{시험장}/{수준}/{수험번호}.jpg 구조로 스트리밍한다(클라 더미 제거).
   */
  function downloadPhotosZip(query) {
    if (!canUseApi()) {
      return Promise.resolve({ ok: false, status: 0, body: { error: { message: "API not configured" } } });
    }
    var parts = [];
    Object.keys(query || {}).forEach(function (k) {
      if (query[k] != null && query[k] !== "" && query[k] !== "all") {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(query[k]));
      }
    });
    var qs = parts.length ? "?" + parts.join("&") : "";
    var headers = { Accept: "application/zip,application/octet-stream,*/*" };
    var token = getAccessToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(apiUrl("/api/v1/admin/applications/photos.zip" + qs), { headers: headers })
      .then(function (res) {
        var ct = (res.headers && res.headers.get && res.headers.get("Content-Type")) || "";
        if (!res.ok || ct.indexOf("application/json") > -1) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: false, status: res.status, body: body };
          });
        }
        return res.blob().then(function (blob) {
          triggerBlobDownload(blob, filenameFromDisposition(res, "TOPIK_사진.zip"));
          return { ok: true, status: res.status };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, body: { error: { message: "사진 zip 다운로드에 실패했습니다." } } };
      });
  }

  global.TopikBoApi = {
    baseUrl: API_BASE_URL,
    canUseApi: canUseApi,
    login: login,
    logout: clearSession,
    getAccessToken: getAccessToken,
    getSessionRaw: getSessionRaw,
    isAuthenticated: isAuthenticated,
    apiFetch: apiFetch,
    parseError: parseError,
    fileUrl: fileUrl,
    downloadFile: downloadFile,
    downloadPhotosZip: downloadPhotosZip,
    changeMyPassword: function (currentPassword, newPassword) {
      return apiFetch("/api/v1/admin/me/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
    },
    getTermsConsents: function (q) {
      var parts = [];
      Object.keys(q || {}).forEach(function (k) {
        if (q[k] != null && q[k] !== "" && q[k] !== "all") {
          parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
        }
      });
      return apiFetch("/api/v1/admin/terms/consents" + (parts.length ? "?" + parts.join("&") : ""));
    },
    getBoardComments: function (postId) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(postId) + "/comments");
    },
    createBoardComment: function (postId, payload) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(postId) + "/comments", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    setExamNumberVisibility: function (roundId, visibleAt) {
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(roundId), {
        method: "PATCH",
        body: JSON.stringify({ exam_number_visible_at: visibleAt || null }),
      });
    },
    getApplications: function (q) {
      var parts = [];
      Object.keys(q || {}).forEach(function (k) {
        if (q[k] != null && q[k] !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
      });
      var qs = parts.length ? "?" + parts.join("&") : "";
      return apiFetch("/api/v1/admin/applications" + qs);
    },
    getApplication: function (id) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id));
    },
    approveApplication: function (id) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id) + "/approve", { method: "POST", body: "{}" });
    },
    rejectApplication: function (id, payload) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id) + "/reject", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    paymentApplication: function (id, payload) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id) + "/payment", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    photoReview: function (id, payload) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id) + "/photo-review", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    assignExamNumbers: function (roundId, payload) {
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(roundId) + "/assign-exam-numbers", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    getExamRounds: function () { return apiFetch("/api/v1/admin/exam-rounds"); },
    createExamRound: function (payload) {
      return apiFetch("/api/v1/admin/exam-rounds", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateExamRound: function (id, payload) {
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    setExamRoundStatus: function (id, registrationStatus) {
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(id) + "/status", {
        method: "POST",
        body: JSON.stringify({ registration_status: registrationStatus }),
      });
    },
    revokeExamRound: function (id) {
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(id) + "/revoke", {
        method: "POST",
        body: "{}",
      });
    },
    restoreExamRound: function (id, registrationStatus) {
      var body = registrationStatus ? { registration_status: registrationStatus } : {};
      return apiFetch("/api/v1/admin/exam-rounds/" + encodeURIComponent(id) + "/restore", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getExamVenues: function () { return apiFetch("/api/v1/admin/exam-venues"); },
    createExamVenue: function (payload) {
      return apiFetch("/api/v1/admin/exam-venues", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateExamVenue: function (id, payload) {
      return apiFetch("/api/v1/admin/exam-venues/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    getRegionCodes: function () { return apiFetch("/api/v1/admin/region-codes"); },
    createNotice: function (payload) {
      return apiFetch("/api/v1/admin/notices", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateNotice: function (id, payload) {
      return apiFetch("/api/v1/admin/notices/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    sendMarketingNotice: function (noticeId) {
      return apiFetch("/api/v1/admin/notices/" + encodeURIComponent(noticeId) + "/send-marketing", {
        method: "POST",
        body: "{}",
      });
    },
    downloadRosterZip: function (roundId) {
      if (!canUseApi()) {
        return Promise.resolve({ ok: false, status: 0, body: { error: { message: "API not configured" } } });
      }
      var headers = { Accept: "application/zip,application/octet-stream,*/*" };
      var token = getAccessToken();
      if (token) headers.Authorization = "Bearer " + token;
      return fetch(apiUrl("/api/v1/admin/exam-rounds/" + encodeURIComponent(roundId) + "/roster.xlsx"), { headers: headers })
        .then(function (res) {
          var ct = (res.headers && res.headers.get && res.headers.get("Content-Type")) || "";
          if (!res.ok || ct.indexOf("application/json") > -1) {
            return res.json().catch(function () { return {}; }).then(function (body) {
              return { ok: false, status: res.status, body: body };
            });
          }
          return res.blob().then(function (blob) {
            triggerBlobDownload(blob, filenameFromDisposition(res, "TOPIK_연명부.zip"));
            return { ok: true, status: res.status };
          });
        })
        .catch(function () {
          return { ok: false, status: 0, body: { error: { message: "연명부 다운로드에 실패했습니다." } } };
        });
    },
    getFaq: function () { return apiFetch("/api/v1/admin/faq"); },
    createFaq: function (payload) {
      return apiFetch("/api/v1/admin/faq", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateFaq: function (id, payload) {
      return apiFetch("/api/v1/admin/faq/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    cancelPayment: function (id) {
      return apiFetch("/api/v1/admin/applications/" + encodeURIComponent(id) + "/payment/cancel", {
        method: "POST",
        body: "{}",
      });
    },
    getNotices: function (q) {
      var parts = [];
      Object.keys(q || {}).forEach(function (k) {
        if (q[k] != null) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
      });
      return apiFetch("/api/v1/admin/notices" + (parts.length ? "?" + parts.join("&") : ""));
    },
    getAuditLogs: function () { return apiFetch("/api/v1/admin/audit-logs"); },
    getBoardPosts: function (boardType, q) {
      var parts = ["board_type=" + encodeURIComponent(boardType)];
      Object.keys(q || {}).forEach(function (k) {
        if (q[k] != null) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
      });
      return apiFetch("/api/v1/admin/board/posts?" + parts.join("&"));
    },
    getBoardPost: function (id) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(id));
    },
    replyBoardPost: function (id, payload) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(id) + "/reply", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    deleteBoardPost: function (id) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(id), { method: "DELETE" });
    },
    setBoardWorkflow: function (id, workflowStatus) {
      return apiFetch("/api/v1/admin/board/posts/" + encodeURIComponent(id) + "/workflow", {
        method: "PATCH",
        body: JSON.stringify({ workflow_status: workflowStatus }),
      });
    },
    getUsers: function () { return apiFetch("/api/v1/admin/users"); },
    updateUser: function (id, payload) {
      return apiFetch("/api/v1/admin/users/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    resetUserPassword: function (id) {
      return apiFetch("/api/v1/admin/users/" + encodeURIComponent(id) + "/reset-password", {
        method: "POST",
        body: "{}",
      });
    },
    getTerms: function () { return apiFetch("/api/v1/admin/terms"); },
    getTerm: function (id) { return apiFetch("/api/v1/admin/terms/" + encodeURIComponent(id)); },
    createTerm: function (payload) {
      return apiFetch("/api/v1/admin/terms", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateTerm: function (id, payload) {
      return apiFetch("/api/v1/admin/terms/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    publishTerm: function (id) {
      return apiFetch("/api/v1/admin/terms/" + encodeURIComponent(id) + "/publish", {
        method: "POST",
        body: "{}",
      });
    },
    retireTerm: function (id) {
      return apiFetch("/api/v1/admin/terms/" + encodeURIComponent(id) + "/retire", {
        method: "POST",
        body: "{}",
      });
    },
    getAdminUsers: function () { return apiFetch("/api/v1/admin/admin-users"); },
    createAdminUser: function (payload) {
      return apiFetch("/api/v1/admin/admin-users", { method: "POST", body: JSON.stringify(payload || {}) });
    },
    updateAdminUser: function (id, payload) {
      return apiFetch("/api/v1/admin/admin-users/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify(payload || {}),
      });
    },
    resetAdminPassword: function (id) {
      return apiFetch("/api/v1/admin/admin-users/" + encodeURIComponent(id) + "/reset-password", {
        method: "POST",
        body: "{}",
      });
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
