/**
 * FO API client — Phase 0 (auth/login).
 * Override (priority): window.TOPIK_API_BASE, window.API_BASE_URL, window.USE_API = false.
 * Production (IwinV): meta omitted — same-origin /api via nginx. Override: TOPIK_API_BASE or meta content.
 */
(function (global) {
  "use strict";

  var STORAGE = {
    access: "topik_access_token",
    refresh: "topik_refresh_token",
    user: "topik_user",
  };

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
    if (typeof global.TOPIK_API_BASE === "string" && global.TOPIK_API_BASE.trim()) {
      return global.TOPIK_API_BASE.trim();
    }
    if (typeof global.API_BASE_URL === "string" && global.API_BASE_URL.trim()) {
      return global.API_BASE_URL.trim();
    }
    var metaBase = readMetaApiBase();
    if (metaBase) return metaBase;
    var loc = global.location;
    if (!loc || !loc.hostname) return "http://localhost:8000";
    var host = loc.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000";
    }
    return "";
  }

  var USE_API = global.USE_API !== false;
  var API_BASE_URL = resolveBaseUrl();
  var API_SAME_ORIGIN = API_BASE_URL === "";

  function apiConfigured() {
    return USE_API && (API_SAME_ORIGIN || !!API_BASE_URL);
  }

  function storageFor(persist) {
    return persist ? global.localStorage : global.sessionStorage;
  }

  function clearTokens(store) {
    store.removeItem(STORAGE.access);
    store.removeItem(STORAGE.refresh);
    store.removeItem(STORAGE.user);
  }

  function clearAllTokenStores() {
    try {
      clearTokens(global.sessionStorage);
      clearTokens(global.localStorage);
    } catch (e) { /* private mode */ }
  }

  function readUser() {
    try {
      var raw =
        global.sessionStorage.getItem(STORAGE.user) ||
        global.localStorage.getItem(STORAGE.user);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getAccessToken() {
    try {
      return (
        global.sessionStorage.getItem(STORAGE.access) ||
        global.localStorage.getItem(STORAGE.access) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  function getRefreshToken() {
    try {
      return (
        global.sessionStorage.getItem(STORAGE.refresh) ||
        global.localStorage.getItem(STORAGE.refresh) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  // Returns the storage object that currently holds the session (the one
  // persistSession wrote to), so a refreshed token is written back in place
  // and the persist-vs-session choice is preserved.
  function tokenStore() {
    try {
      if (global.localStorage.getItem(STORAGE.refresh)) return global.localStorage;
      if (global.sessionStorage.getItem(STORAGE.refresh)) return global.sessionStorage;
    } catch (e) { /* private mode */ }
    return null;
  }

  // Single-flight silent refresh: swaps the stored access (and rotated refresh)
  // token using the refresh token. Resolves true on success, false otherwise.
  var refreshInFlight = null;
  function refreshSession() {
    if (refreshInFlight) return refreshInFlight;
    var rt = getRefreshToken();
    if (!rt || !apiConfigured() || rt === "demo-local-refresh") {
      return Promise.resolve(false);
    }
    refreshInFlight = fetch(apiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!res.ok || !body || !body.access_token) return false;
            var store = tokenStore() || global.sessionStorage;
            try {
              store.setItem(STORAGE.access, body.access_token);
              if (body.refresh_token) {
                store.setItem(STORAGE.refresh, body.refresh_token);
              }
            } catch (e) { /* quota / private mode */ }
            return true;
          });
      })
      .catch(function () {
        return false;
      })
      .then(function (ok) {
        refreshInFlight = null;
        return ok;
      });
    return refreshInFlight;
  }

  function persistSession(data, persist) {
    var store = storageFor(!!persist);
    var other = storageFor(!persist);
    clearTokens(other);
    store.setItem(STORAGE.access, data.access_token);
    store.setItem(STORAGE.refresh, data.refresh_token);
    store.setItem(STORAGE.user, JSON.stringify(data.user));
  }

  function syncLegacyUser(user) {
    if (!user || typeof global.localStorage === "undefined") return;
    var displayName =
      user.name_ko || user.name || (user.email || "").split("@")[0] || "User";
    try {
      global.localStorage.setItem(
        "tpkm_user",
        JSON.stringify({
          name: displayName,
          email: user.email,
          id: user.id,
          role: user.role,
        })
      );
    } catch (e) { /* quota */ }
  }

  function readUiLang() {
    var lang = "ko";
    try {
      var stored = (global.localStorage.getItem("tpkm_lang") || "KO").toLowerCase();
      if (stored === "my" || stored === "en") lang = stored;
    } catch (e) { /* private mode */ }
    return lang;
  }

  function apiUrl(path) {
    var base = API_BASE_URL.replace(/\/$/, "");
    return base + path;
  }

  /**
   * Authenticated <img src> URL for the logged-in user's own file (증명사진).
   * Token rides in the query string because <img> can't set an Authorization
   * header; the files route accepts ?token= for exactly this case.
   */
  /** fileIds known missing (stub/legacy blob) — skip repeat GET /files/:id. */
  var unavailableFileIds = {};

  function markFileUnavailable(fileId) {
    if (fileId) unavailableFileIds[String(fileId)] = true;
  }

  function isFileUnavailable(fileId) {
    return !!fileId && !!unavailableFileIds[String(fileId)];
  }

  function fileUrl(fileId) {
    if (!fileId || !apiConfigured()) return "";
    if (isFileUnavailable(fileId)) return "";
    var token = getAccessToken();
    return apiUrl("/api/v1/files/" + encodeURIComponent(fileId)) +
      (token ? "?token=" + encodeURIComponent(token) : "");
  }

  /**
   * fetch() + blob — only safe when GET /files/:id returns bytes on the API origin.
   * Prefer fileUrl() + <img src> for profile photos (S3 presigned redirects break CORS).
   */
  function fetchFileBlob(fileId, isRetry) {
    if (!fileId || !apiConfigured() || isFileUnavailable(fileId)) {
      return Promise.resolve(null);
    }
    var headers = { Accept: "image/*,*/*" };
    var token = getAccessToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(apiUrl("/api/v1/files/" + encodeURIComponent(fileId)), { headers: headers })
      .then(function (res) {
        if (res.status === 401 && !isRetry && getRefreshToken()) {
          return refreshSession().then(function (ok) {
            return ok ? fetchFileBlob(fileId, true) : null;
          });
        }
        if (!res.ok) {
          if (res.status === 404) {
            return res.json().catch(function () { return {}; }).then(function (body) {
              var code = body && body.error && body.error.code;
              if (!code || code === "FILE_UNAVAILABLE" || code === "NOT_FOUND") {
                markFileUnavailable(fileId);
              }
              return null;
            });
          }
          return null;
        }
        return res.blob();
      })
      .catch(function () { return null; });
  }

  function fileObjectUrl(fileId) {
    return fetchFileBlob(fileId, false).then(function (blob) {
      return blob ? URL.createObjectURL(blob) : "";
    });
  }

  function imgFileOnError(fileId, onGiveUp) {
    return function (ev) {
      var img = ev && ev.target;
      if (!img || !fileId) return;
      function giveUp() {
        markFileUnavailable(fileId);
        if (typeof onGiveUp === "function") onGiveUp();
      }
      if (img.dataset.fileAuthRetry === "1") {
        giveUp();
        return;
      }
      img.dataset.fileAuthRetry = "1";
      if (!getRefreshToken()) {
        giveUp();
        return;
      }
      refreshSession().then(function (ok) {
        if (ok) img.src = fileUrl(fileId);
        else giveUp();
      });
    };
  }

  function login(email, password, options) {
    options = options || {};
    var persist = !!options.persist;

    if (!apiConfigured()) {
      return legacyLogin(email, password, persist);
    }

    return fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email, password: password, portal: "fo" }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!res.ok) {
              return {
                ok: false,
                status: res.status,
                error: body.error || "login_failed",
                body: body,
              };
            }
            persistSession(body, persist);
            syncLegacyUser(body.user);
            return { ok: true, status: res.status, user: body.user, body: body };
          });
      })
      .catch(function (err) {
        if (options.fallbackOnError) {
          return legacyLogin(email, password, persist);
        }
        return {
          ok: false,
          status: 0,
          error: "network_error",
          message: err && err.message ? err.message : String(err),
        };
      });
  }

  function legacyLogin(email, password, persist) {
    if (!email || !password) {
      return Promise.resolve({
        ok: false,
        status: 400,
        error: "email_and_password_required",
      });
    }
    var user = {
      email: email,
      name_ko: email.split("@")[0],
      role: "user",
    };
    var fake = {
      access_token: "demo-local",
      refresh_token: "demo-local-refresh",
      user: user,
    };
    persistSession(fake, persist);
    syncLegacyUser(user);
    return Promise.resolve({ ok: true, status: 200, user: user, demo: true });
  }

  function isLoggedIn() {
    return !!getAccessToken();
  }

  function logout() {
    clearAllTokenStores();
    try {
      global.localStorage.removeItem("tpkm_user");
    } catch (e) { /* ignore */ }
  }

  function getUser() {
    return readUser();
  }

  function apiFetch(path, options) {
    return doApiFetch(path, options || {}, false);
  }

  // isRetry guards against loops: we attempt at most one silent refresh + retry.
  function doApiFetch(path, options, isRetry) {
    var useAuth = options.auth !== false;
    var headers = Object.assign(
      { Accept: "application/json" },
      options.headers || {}
    );
    if (useAuth) {
      var token = getAccessToken();
      if (token) headers.Authorization = "Bearer " + token;
    }
    var isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    if (options.body && !headers["Content-Type"] && !isFormData) {
      headers["Content-Type"] = "application/json";
    }
    headers["X-TPKM-Locale"] = readUiLang();
    if (!apiConfigured()) {
      return Promise.resolve({
        ok: false,
        status: 0,
        error: "api_disabled",
        body: {},
      });
    }
    return fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          // Access token likely expired: try one silent refresh, then retry once.
          if (
            res.status === 401 &&
            useAuth &&
            !isRetry &&
            getRefreshToken()
          ) {
            return refreshSession().then(function (ok) {
              if (ok) return doApiFetch(path, options, true);
              clearAllTokenStores();
              return { ok: false, status: 401, body: body };
            });
          }
          return { ok: res.ok, status: res.status, body: body };
        });
    });
  }

  function getMe() {
    return apiFetch("/api/v1/me");
  }

  function getExamRounds(query) {
    var q = query || {};
    var qs = "";
    if (q.registration_status) {
      qs = "?registration_status=" + encodeURIComponent(q.registration_status);
    }
    return apiFetch("/api/v1/exam-rounds" + qs, { auth: false });
  }

  function getExamVenues() {
    return apiFetch("/api/v1/exam-venues", { auth: false });
  }

  function submitApplication(payload) {
    return apiFetch("/api/v1/application-submissions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  function getMyApplications() {
    return apiFetch("/api/v1/applications");
  }

  function cancelSubmission(submissionId, reason) {
    return apiFetch(
      "/api/v1/application-submissions/" + encodeURIComponent(submissionId) + "/cancel",
      {
        method: "POST",
        body: JSON.stringify({ reason: reason || "사용자 취소" }),
      }
    );
  }

  function cancelApplication(applicationId, reason) {
    return apiFetch(
      "/api/v1/applications/" + encodeURIComponent(applicationId) + "/cancel",
      {
        method: "POST",
        body: JSON.stringify({ reason: reason || "사용자 취소" }),
      }
    );
  }

  function getApplicationDraft() {
    return apiFetch("/api/v1/application-draft");
  }

  function saveApplicationDraft(payload) {
    return apiFetch("/api/v1/application-draft", {
      method: "PUT",
      body: JSON.stringify({ payload: payload }),
    });
  }

  function deleteApplicationDraft() {
    return apiFetch("/api/v1/application-draft", { method: "DELETE" });
  }

  function sendVerificationCode(email) {
    return apiFetch("/api/v1/auth/send-verification-code", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, preferred_lang: readUiLang() }),
    });
  }

  function verifyEmail(email, code) {
    return apiFetch("/api/v1/auth/verify-email", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, code: code }),
    });
  }

  function register(payload) {
    return apiFetch("/api/v1/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload),
    });
  }

  function getGoogleConfig() {
    return apiFetch("/api/v1/auth/google/config", { auth: false });
  }

  function loginWithGoogle(idToken) {
    return apiFetch("/api/v1/auth/google", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ id_token: idToken, preferred_lang: readUiLang() }),
    }).then(function (res) {
      if (res.ok && res.body && res.body.access_token) {
        persistSession(res.body, true);
        syncLegacyUser(res.body.user);
      }
      return res;
    });
  }

  function findEmail(payload) {
    return apiFetch("/api/v1/auth/find-email", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload || {}),
    });
  }

  function forgotPassword(email) {
    return apiFetch("/api/v1/auth/forgot-password", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, preferred_lang: readUiLang() }),
    });
  }

  function verifyResetCode(email, code) {
    return apiFetch("/api/v1/auth/verify-reset-code", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email, code: code }),
    });
  }

  function resetPassword(payload) {
    return apiFetch("/api/v1/auth/reset-password", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload || {}),
    });
  }

  function updateProfile(payload) {
    return apiFetch("/api/v1/me", {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  }

  function changePassword(payload) {
    return apiFetch("/api/v1/me/change-password", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  function withdraw(password) {
    return apiFetch("/api/v1/me/withdraw", {
      method: "POST",
      body: JSON.stringify({ password: password || "" }),
    });
  }

  function getNotices(query) {
    var q = query || {};
    var parts = [];
    if (q.category) parts.push("category=" + encodeURIComponent(q.category));
    if (q.q) parts.push("q=" + encodeURIComponent(q.q));
    if (q.page) parts.push("page=" + encodeURIComponent(q.page));
    if (q.page_size) parts.push("page_size=" + encodeURIComponent(q.page_size));
    if (q.home_preview) parts.push("home_preview=1");
    var qs = parts.length ? "?" + parts.join("&") : "";
    return apiFetch("/api/v1/notices" + qs, { auth: false });
  }

  function getNotice(id, sessionKey) {
    var qs = sessionKey
      ? "?session_key=" + encodeURIComponent(sessionKey)
      : "";
    return apiFetch("/api/v1/notices/" + encodeURIComponent(id) + qs, {
      auth: false,
    });
  }

  function getFaq(query) {
    var q = query || {};
    var parts = [];
    if (q.lang) parts.push("lang=" + encodeURIComponent(q.lang));
    if (q.q) parts.push("q=" + encodeURIComponent(q.q));
    var qs = parts.length ? "?" + parts.join("&") : "";
    return apiFetch("/api/v1/faq" + qs, { auth: false });
  }

  function getBoardPosts(boardType, query) {
    var q = query || {};
    var parts = ["board_type=" + encodeURIComponent(boardType)];
    if (q.page) parts.push("page=" + encodeURIComponent(q.page));
    return apiFetch("/api/v1/board/posts?" + parts.join("&"));
  }

  function getBoardPost(id) {
    return apiFetch("/api/v1/board/posts/" + encodeURIComponent(id));
  }

  function createBoardPost(payload) {
    return apiFetch("/api/v1/board/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // 게시판 첨부파일 업로드 (multipart, field `file`) — jpg/png/pdf, ≤5MB (서버 검증)
  // 성공: { ok, status, body: { file_id, filename, size, content_type } }
  function uploadBoardAttachment(file) {
    var fd = new FormData();
    fd.append("file", file);
    return apiFetch("/api/v1/board/attachments", {
      method: "POST",
      body: fd,
    });
  }

  // 비밀글 잠금 해제 — POST /board/posts/{id}/unlock { password }
  // 성공 시 body = 글 본문(상세 응답), 5회 실패 시 423/locked 응답.
  function unlockBoardPost(postId, password) {
    return apiFetch(
      "/api/v1/board/posts/" + encodeURIComponent(postId) + "/unlock",
      {
        method: "POST",
        body: JSON.stringify({ password: password || "" }),
      }
    );
  }

  // 약관 목록(현행 게시 버전) — 가입/접수 동의 이력 작성용 버전 조회
  function getTerms(query) {
    var q = query || {};
    var parts = [];
    if (q.lang) parts.push("lang=" + encodeURIComponent(q.lang));
    if (q.type) parts.push("type=" + encodeURIComponent(q.type));
    var qs = parts.length ? "?" + parts.join("&") : "";
    return apiFetch("/api/v1/terms" + qs, { auth: false });
  }

  function getBoardComments(postId) {
    return apiFetch(
      "/api/v1/board/posts/" + encodeURIComponent(postId) + "/comments"
    );
  }

  function createBoardComment(postId, payload) {
    payload = payload || {};
    return apiFetch(
      "/api/v1/board/posts/" + encodeURIComponent(postId) + "/comments",
      {
        method: "POST",
        body: JSON.stringify({
          body: payload.body || "",
          parent_comment_id:
            payload.parent_comment_id != null ? payload.parent_comment_id : null,
        }),
      }
    );
  }

  function parseError(res) {
    if (!res) return "요청을 처리할 수 없습니다.";
    var b = res.body || {};
    if (b.error && b.error.message) return b.error.message;
    if (b.error && typeof b.error === "string") return b.error;
    if (b.message) return b.message;
    if (res.status === 401) return "로그인이 필요합니다.";
    if (res.status === 409) return "이미 처리된 요청입니다.";
    if (res.status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    if (res.status === 0 || res.error === "network_error") {
      return "네트워크 오류입니다. 연결 상태를 확인해 주세요.";
    }
    if (res.error === "api_disabled") return "API 연결이 설정되지 않았습니다.";
    return "요청을 처리할 수 없습니다. (" + (res.status || "오류") + ")";
  }

  function canUseApi() {
    return apiConfigured();
  }

  global.TopikApi = {
    baseUrl: API_BASE_URL,
    useApi: USE_API,

    health: function () {
      if (!apiConfigured()) {
        return Promise.reject(new Error("API not configured"));
      }
      return fetch(apiUrl("/health")).then(function (r) {
        return r.json();
      });
    },

    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getAccessToken: getAccessToken,
    refreshSession: refreshSession,
    fileUrl: fileUrl,
    fetchFileBlob: fetchFileBlob,
    fileObjectUrl: fileObjectUrl,
    imgFileOnError: imgFileOnError,
    markFileUnavailable: markFileUnavailable,
    isFileUnavailable: isFileUnavailable,
    getUser: getUser,
    syncLegacyUser: syncLegacyUser,
    apiFetch: apiFetch,
    getMe: getMe,
    getExamRounds: getExamRounds,
    getExamVenues: getExamVenues,
    submitApplication: submitApplication,
    getMyApplications: getMyApplications,
    cancelSubmission: cancelSubmission,
    cancelApplication: cancelApplication,
    getApplicationDraft: getApplicationDraft,
    saveApplicationDraft: saveApplicationDraft,
    deleteApplicationDraft: deleteApplicationDraft,
    sendVerificationCode: sendVerificationCode,
    verifyEmail: verifyEmail,
    register: register,
    getGoogleConfig: getGoogleConfig,
    loginWithGoogle: loginWithGoogle,
    findEmail: findEmail,
    forgotPassword: forgotPassword,
    verifyResetCode: verifyResetCode,
    resetPassword: resetPassword,
    updateProfile: updateProfile,
    updateMe: updateProfile,
    changePassword: changePassword,
    withdraw: withdraw,
    getNotices: getNotices,
    getNotice: getNotice,
    getFaq: getFaq,
    getBoardPosts: getBoardPosts,
    getBoardPost: getBoardPost,
    createBoardPost: createBoardPost,
    uploadBoardAttachment: uploadBoardAttachment,
    unlockBoardPost: unlockBoardPost,
    getTerms: getTerms,
    getBoardComments: getBoardComments,
    createBoardComment: createBoardComment,
    parseError: parseError,
    canUseApi: canUseApi,
    persistSession: persistSession,
  };
})(typeof window !== "undefined" ? window : globalThis);
