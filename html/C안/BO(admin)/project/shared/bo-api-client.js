/**
 * BO API client — admin endpoints via same-origin /api or meta topik-api-base.
 */
(function (global) {
  "use strict";

  var STORAGE = { access: "bo_access_token", refresh: "bo_refresh_token", admin: "bo_admin_user" };
  var ACTIVITY_KEY = "bo_last_activity";
  var IDLE_MS = 30 * 60 * 1000;
  var ACCESS_REFRESH_LEAD_MS = 5 * 60 * 1000;
  var refreshInFlight = null;
  var idleInterval = null;
  var idleExpireHandled = false;
  var idleOnExpired = null;

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

  function getRefreshToken() {
    try {
      return global.sessionStorage.getItem(STORAGE.refresh) || global.localStorage.getItem(STORAGE.refresh);
    } catch (e) {
      return null;
    }
  }

  function tokenStore() {
    try {
      if (global.localStorage.getItem(STORAGE.access) || global.localStorage.getItem(STORAGE.refresh)) {
        return global.localStorage;
      }
      if (global.sessionStorage.getItem(STORAGE.access) || global.sessionStorage.getItem(STORAGE.refresh)) {
        return global.sessionStorage;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function touchActivity() {
    try {
      global.sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    } catch (e) { /* ignore */ }
  }

  function getLastActivity() {
    try {
      var v = global.sessionStorage.getItem(ACTIVITY_KEY);
      if (v) return parseInt(v, 10) || Date.now();
    } catch (e) { /* ignore */ }
    return Date.now();
  }

  function isIdleExpired() {
    // 로그인 페이지 등: 세션 없이 남은 activity 타임스탬프만으로 유휴 판정하지 않음
    if (!getSessionRaw()) return false;
    return Date.now() - getLastActivity() > IDLE_MS;
  }

  function getSessionRaw() {
    try {
      return global.sessionStorage.getItem("bo_session");
    } catch (e) {
      return null;
    }
  }

  function tokenExpiresAtMs(token) {
    if (!token) return null;
    try {
      var parts = token.split(".");
      if (parts.length < 2) return null;
      var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var data = JSON.parse(atob(payload));
      return data.exp ? data.exp * 1000 : null;
    } catch (e) {
      return null;
    }
  }

  function accessNeedsRefresh() {
    var token = getAccessToken();
    if (!token) return true;
    if (isTokenExpired(token)) return true;
    var exp = tokenExpiresAtMs(token);
    if (!exp) return false;
    return exp - Date.now() <= ACCESS_REFRESH_LEAD_MS;
  }

  function refreshSession() {
    if (refreshInFlight) return refreshInFlight;
    var rt = getRefreshToken();
    if (!rt || !canUseApi()) {
      return Promise.resolve(false);
    }
    refreshInFlight = fetch(apiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body || !body.access_token) return false;
        var store = tokenStore() || global.sessionStorage;
        try {
          store.setItem(STORAGE.access, body.access_token);
          if (body.refresh_token) store.setItem(STORAGE.refresh, body.refresh_token);
        } catch (e) { return false; }
        touchActivity();
        return true;
      });
    }).catch(function () {
      return false;
    }).then(function (ok) {
      refreshInFlight = null;
      return ok;
    });
    return refreshInFlight;
  }

  function ensureSession() {
    if (!getSessionRaw()) {
      try { global.sessionStorage.removeItem(ACTIVITY_KEY); } catch (e) { /* ignore */ }
      return Promise.resolve(false);
    }
    if (isIdleExpired()) {
      clearSession();
      return Promise.resolve(false);
    }
    var access = getAccessToken();
    if (access && !isTokenExpired(access)) {
      return Promise.resolve(true);
    }
    if (!getRefreshToken()) {
      clearSession();
      return Promise.resolve(false);
    }
    return refreshSession().then(function (ok) {
      if (!ok) clearSession();
      return ok;
    });
  }

  function handleSessionExpired() {
    if (idleExpireHandled) return;
    idleExpireHandled = true;
    stopIdleWatch();
    clearAuthStorage();
    if (typeof idleOnExpired === "function") idleOnExpired();
  }

  function expireIdleSession() {
    handleSessionExpired();
  }

  /** 로그인 페이지 진입 시 — 유휴 만료 잔여 상태·감시 정리 */
  function prepareLoginPage() {
    stopIdleWatch();
    idleExpireHandled = false;
    idleOnExpired = null;
    clearAuthStorage();
  }

  function initLoginPage(onReady) {
    stopIdleWatch();
    idleExpireHandled = false;
    idleOnExpired = null;
    if (getSessionRaw() && !isIdleExpired()) {
      return ensureSession().then(function (ok) {
        if (typeof onReady === "function") onReady(!!ok);
        return ok;
      });
    }
    clearAuthStorage();
    if (typeof onReady === "function") onReady(false);
    return Promise.resolve(false);
  }

  function stopIdleWatch() {
    if (idleInterval) {
      global.clearInterval(idleInterval);
      idleInterval = null;
    }
    var h = global._boIdleHandlers;
    if (h && global.document) {
      h.events.forEach(function (ev) {
        global.document.removeEventListener(ev, h.onUserActivity, true);
      });
    }
    global._boIdleHandlers = null;
  }

  function startIdleWatch(onExpired) {
    stopIdleWatch();
    idleExpireHandled = false;
    idleOnExpired = onExpired;
    touchActivity();
    function onUserActivity(ev) {
      if (isIdleExpired()) {
        if (ev && ev.preventDefault) {
          ev.preventDefault();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        }
        handleSessionExpired();
        return;
      }
      touchActivity();
    }
    var events = ["click", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(function (ev) {
      global.document.addEventListener(ev, onUserActivity, { passive: false, capture: true });
    });
    global._boIdleHandlers = { onUserActivity: onUserActivity, events: events };
    idleInterval = global.setInterval(function () {
      if (isIdleExpired()) handleSessionExpired();
    }, 10000);
  }

  function isTokenExpired(token) {
    if (!token) return true;
    try {
      var parts = token.split(".");
      if (parts.length < 2) return true;
      var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      var data = JSON.parse(atob(payload));
      if (!data.exp) return false;
      return data.exp * 1000 <= Date.now();
    } catch (e) {
      return true;
    }
  }

  function isAuthenticated() {
    if (!getSessionRaw() || isIdleExpired()) return false;
    var token = getAccessToken();
    if (token && !isTokenExpired(token)) return true;
    return !!getRefreshToken();
  }

  function clearAuthStorage() {
    try {
      [global.sessionStorage, global.localStorage].forEach(function (store) {
        store.removeItem(STORAGE.access);
        store.removeItem(STORAGE.refresh);
        store.removeItem(STORAGE.admin);
      });
      global.sessionStorage.removeItem("bo_session");
      global.sessionStorage.removeItem(ACTIVITY_KEY);
    } catch (e) { /* ignore */ }
  }

  function roleUi(r) {
    if (r === "admin" || r === "standard") return "general";
    if (r === "readonly") return "viewer";
    return r || "general";
  }

  function persistSession(body, persist) {
    var account = body.user || body.admin || {};
    clearAuthStorage();
    var store = persist ? global.localStorage : global.sessionStorage;
    try {
      store.setItem(STORAGE.access, body.access_token);
      if (body.refresh_token) store.setItem(STORAGE.refresh, body.refresh_token);
      store.setItem(STORAGE.admin, JSON.stringify(account));
      global.sessionStorage.setItem("bo_session", JSON.stringify({
        id: account.email,
        email: account.email,
        name: account.name,
        role: roleUi(account.role),
        must_change_password: !!account.must_change_password,
        loginAt: new Date().toISOString(),
      }));
      touchActivity();
      idleExpireHandled = false;
      return isAuthenticated();
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    stopIdleWatch();
    clearAuthStorage();
  }

  function doApiFetch(path, options, isRetry) {
    options = options || {};
    if (!canUseApi()) {
      return Promise.resolve({ ok: false, status: 0, body: { error: { message: "API not configured" } } });
    }
    var useAuth = options.auth !== false;

    function runFetch() {
      var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
      var token = getAccessToken();
      if (token && useAuth) headers.Authorization = "Bearer " + token;
      var isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      if (options.body && !headers["Content-Type"] && !isFormData) headers["Content-Type"] = "application/json";
      return fetch(apiUrl(path), {
        method: options.method || "GET",
        headers: headers,
        body: options.body,
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.status === 401 && useAuth && !isRetry && getRefreshToken()) {
            return refreshSession().then(function (ok) {
              if (ok) return doApiFetch(path, options, true);
              clearSession();
              return { ok: false, status: 401, body: body };
            });
          }
          return { ok: res.ok, status: res.status, body: body };
        });
      });
    }

    if (!useAuth) return runFetch();

    if (getSessionRaw() && isIdleExpired()) {
      clearSession();
      return Promise.resolve({
        ok: false,
        status: 401,
        body: { error: { message: "30분간 활동이 없어 세션이 만료되었습니다. 다시 로그인해 주세요." } },
      });
    }
    touchActivity();

    if (accessNeedsRefresh() && getRefreshToken()) {
      return refreshSession().then(function (ok) {
        if (!ok && (!getAccessToken() || isTokenExpired(getAccessToken()))) {
          clearSession();
          return { ok: false, status: 401, body: { error: { message: "세션이 만료되었습니다." } } };
        }
        return runFetch();
      });
    }
    return runFetch();
  }

  function apiFetch(path, options) {
    return doApiFetch(path, options, false);
  }

  function authBlobFetch(url, headers, isRetry) {
    if (getSessionRaw() && isIdleExpired()) {
      clearSession();
      return Promise.resolve({ ok: false, status: 401, body: { error: { message: "세션이 만료되었습니다." } } });
    }
    touchActivity();
    var token = getAccessToken();
    var h = Object.assign({}, headers || {});
    if (token) h.Authorization = "Bearer " + token;

    function run() {
      return fetch(url, { headers: h }).then(function (res) {
        if (res.status === 401 && !isRetry && getRefreshToken()) {
          return refreshSession().then(function (ok) {
            if (ok) return authBlobFetch(url, headers, true);
            clearSession();
            return { ok: false, status: 401, body: {} };
          });
        }
        return { ok: res.ok, status: res.status, res: res };
      });
    }

    if (accessNeedsRefresh() && getRefreshToken()) {
      return refreshSession().then(function (ok) {
        if (!ok && (!getAccessToken() || isTokenExpired(getAccessToken()))) {
          clearSession();
          return { ok: false, status: 401, body: {} };
        }
        token = getAccessToken();
        if (token) h.Authorization = "Bearer " + token;
        return run();
      });
    }
    return run();
  }

  function isAdminRole(role) {
    return !!role && role !== "user";
  }

  function login(email, password, options) {
    options = options || {};
    return apiFetch("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, password: password, portal: "bo" }),
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

  function isConflict(res) {
    return !!(res && res.status === 409);
  }

  /** rev/If-Match 낙관적 잠금 — opts.rev 또는 payload.rev */
  function withRevFetch(path, method, payload, opts) {
    opts = opts || {};
    var body = Object.assign({}, payload || {});
    var rev = opts.rev != null ? opts.rev : body.rev;
    var headers = {};
    if (rev != null) {
      headers["If-Match"] = String(rev);
      body.rev = rev;
    }
    return apiFetch(path, {
      method: method,
      headers: headers,
      body: JSON.stringify(body),
    });
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
    return authBlobFetch(
      apiUrl("/api/v1/admin/applications/photos.zip" + qs),
      { Accept: "application/zip,application/octet-stream,*/*" }
    ).then(function (result) {
        if (!result.ok || !result.res) {
          if (result.res) {
            return result.res.json().catch(function () { return {}; }).then(function (body) {
              return { ok: false, status: result.status, body: body };
            });
          }
          return { ok: false, status: result.status || 0, body: result.body || {} };
        }
        var res = result.res;
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
    ensureSession: ensureSession,
    refreshSession: refreshSession,
    startIdleWatch: startIdleWatch,
    stopIdleWatch: stopIdleWatch,
    isIdleExpired: isIdleExpired,
    expireIdleSession: expireIdleSession,
    prepareLoginPage: prepareLoginPage,
    initLoginPage: initLoginPage,
    touchActivity: touchActivity,
    apiFetch: apiFetch,
    parseError: parseError,
    isConflict: isConflict,
    fileUrl: fileUrl,
    downloadFile: downloadFile,
    downloadPhotosZip: downloadPhotosZip,
    changeMyPassword: function (currentPassword, newPassword, newPasswordConfirm) {
      return apiFetch("/api/v1/admin/me/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirm: newPasswordConfirm != null ? newPasswordConfirm : newPassword,
        }),
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
    approveApplication: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/applications/" + encodeURIComponent(id) + "/approve",
        "POST",
        payload || {},
        opts
      );
    },
    rejectApplication: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/applications/" + encodeURIComponent(id) + "/reject",
        "POST",
        payload || {},
        opts
      );
    },
    paymentApplication: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/applications/" + encodeURIComponent(id) + "/payment",
        "POST",
        payload || {},
        opts
      );
    },
    photoReview: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/applications/" + encodeURIComponent(id) + "/photo-review",
        "POST",
        payload || {},
        opts
      );
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
    translateText: function (payload) {
      return apiFetch("/api/v1/admin/translate", {
        method: "POST",
        body: JSON.stringify(payload || {}),
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
    uploadNoticeAttachment: function (file) {
      var fd = new FormData();
      fd.append("file", file);
      return apiFetch("/api/v1/admin/notices/attachments", {
        method: "POST",
        body: fd,
      });
    },
    downloadRosterZip: function (roundId) {
      if (!canUseApi()) {
        return Promise.resolve({ ok: false, status: 0, body: { error: { message: "API not configured" } } });
      }
      return authBlobFetch(
        apiUrl("/api/v1/admin/exam-rounds/" + encodeURIComponent(roundId) + "/roster.xlsx"),
        { Accept: "application/zip,application/octet-stream,*/*" }
      ).then(function (result) {
          if (!result.ok || !result.res) {
            return { ok: false, status: result.status || 0, body: result.body || {} };
          }
          var res = result.res;
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
    cancelPayment: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/applications/" + encodeURIComponent(id) + "/payment/cancel",
        "POST",
        payload || {},
        opts
      );
    },
    getNotices: function (q) {
      var parts = [];
      Object.keys(q || {}).forEach(function (k) {
        if (q[k] != null && q[k] !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
      });
      return apiFetch("/api/v1/admin/notices" + (parts.length ? "?" + parts.join("&") : ""));
    },
    deleteNotice: function (id) {
      return apiFetch("/api/v1/admin/notices/" + encodeURIComponent(id), { method: "DELETE" });
    },
    restoreNotice: function (id) {
      return apiFetch("/api/v1/admin/notices/" + encodeURIComponent(id) + "/restore", {
        method: "POST",
        body: "{}",
      });
    },
    getAuditLogs: function () { return apiFetch("/api/v1/admin/audit-logs"); },
    getPermissionMatrix: function () { return apiFetch("/api/v1/admin/permissions/matrix"); },
    putPermissionMatrix: function (payload) {
      return apiFetch("/api/v1/admin/permissions/matrix", {
        method: "PUT",
        body: JSON.stringify(payload || {}),
      });
    },
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
    updateUser: function (id, payload, opts) {
      return withRevFetch(
        "/api/v1/admin/users/" + encodeURIComponent(id),
        "PATCH",
        payload || {},
        opts
      );
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
