/**
 * BO 클라이언트 코어 — RBAC 강제 · 낙관적 잠금 · 멀티탭 세션 하트비트
 */
(function (g) {
  'use strict';

  var LOCK_KEY = 'topik_mm_record_locks_v1';
  var HEARTBEAT_KEY = 'topik_mm_admin_heartbeat_v1';
  var PERM_KEY = 'topik_mm_perm_matrix_v2';
  var LOCK_TTL_MS = 5 * 60 * 1000;
  var HEARTBEAT_MS = 15 * 1000;
  var SESSION_WARN_MS = 30 * 1000;

  var ROLE_DEFAULTS = {
    super: { label: '최고관리자', level: 3 },
    normal: { label: '일반관리자', level: 2 },
    viewer: { label: '조회전용', level: 1 }
  };

  var _heartbeatTimer = null;
  var _sessionUser = null;

  function normRole(role) {
    role = (role || 'normal').toLowerCase();
    if (role === 'admin' || role === 'super') return 'super';
    if (role === 'view' || role === 'viewer' || role === 'readonly') return 'viewer';
    return 'normal';
  }

  function loadLocks() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveLocks(m) {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function purgeExpiredLocks(m) {
    var now = Date.now();
    Object.keys(m).forEach(function (k) {
      if (!m[k] || now - (m[k].at || 0) > LOCK_TTL_MS) delete m[k];
    });
    return m;
  }

  /** @returns {{ ok: boolean, conflict?: string, version?: number }} */
  function acquireRecordLock(recordId, userId, userName) {
    if (!recordId) return { ok: true, version: 1 };
    var m = purgeExpiredLocks(loadLocks());
    var cur = m[recordId];
    var uid = userId || 'admin';
    if (cur && cur.userId !== uid && Date.now() - cur.at < LOCK_TTL_MS) {
      return { ok: false, conflict: cur.userName || cur.userId, version: cur.version || 1 };
    }
    var ver = (cur && cur.userId === uid) ? (cur.version || 1) : ((cur && cur.version) || 0) + 1;
    m[recordId] = { userId: uid, userName: userName || uid, at: Date.now(), version: ver };
    saveLocks(m);
    return { ok: true, version: ver };
  }

  function releaseRecordLock(recordId, userId) {
    if (!recordId) return;
    var m = purgeExpiredLocks(loadLocks());
    var cur = m[recordId];
    if (cur && (!userId || cur.userId === userId)) {
      delete m[recordId];
      saveLocks(m);
    }
  }

  function touchRecordLock(recordId, userId) {
    var m = purgeExpiredLocks(loadLocks());
    var cur = m[recordId];
    if (cur && cur.userId === userId) {
      cur.at = Date.now();
      saveLocks(m);
    }
  }

  /**
   * 낙관적 잠금 충돌 검사 — 저장 시 version 불일치면 false
   */
  function checkRecordVersion(recordId, expectedVersion) {
    var m = purgeExpiredLocks(loadLocks());
    var cur = m[recordId];
    if (!cur) return { ok: true };
    if (expectedVersion != null && cur.version !== expectedVersion) {
      return { ok: false, conflict: cur.userName || cur.userId, currentVersion: cur.version };
    }
    return { ok: true, version: cur.version };
  }

  function loadPermMatrix() {
    try {
      var raw = localStorage.getItem(PERM_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /**
   * @param {string} role - super|normal|viewer
   * @param {string} menuKey - "접수 관리|접수자 목록" 형식
   * @param {string} action - view|execute|pay|...
   */
  function can(role, menuKey, action) {
    role = normRole(role);
    if (role === 'super') return true;
    var matrix = loadPermMatrix();
    if (!matrix || !matrix[role]) {
      /* 매트릭스 미설정 시 viewer=조회만, normal=대부분 허용(데모) */
      if (role === 'viewer') {
        return action === 'view' || action === 'viewMine';
      }
      return action !== 'disable' && action !== 'update' || menuKey.indexOf('권한') === -1;
    }
    var row = matrix[role][menuKey];
    if (!row) return role !== 'viewer';
    if (typeof row === 'object' && row.actions) {
      return !!row.actions[action];
    }
    return !!row[action];
  }

  function enforce(role, menuKey, action, silent) {
    var ok = can(role, menuKey, action);
    if (!ok && !silent) {
      alert(
        '권한이 없습니다.\n\n' +
        '역할: ' + (ROLE_DEFAULTS[normRole(role)] || {}).label + '\n' +
        '메뉴: ' + menuKey + '\n' +
        '액션: ' + action + '\n\n' +
        '관리자 권한 매트릭스에서 권한을 확인하세요.'
      );
    }
    return ok;
  }

  /** 멀티탭 세션 — 다른 탭에서 동일 계정 활성 시 경고 */
  function startSessionHeartbeat(userId, userName) {
    _sessionUser = userId || 'admin';
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    function beat() {
      var now = Date.now();
      var data = { userId: _sessionUser, userName: userName || _sessionUser, at: now, tab: Math.random().toString(36).slice(2) };
      try {
        var prev = JSON.parse(localStorage.getItem(HEARTBEAT_KEY) || 'null');
        if (prev && prev.userId === _sessionUser && prev.tab !== data.tab && now - prev.at < SESSION_WARN_MS) {
          /* 다른 탭 활성 — 0526 동시작업 안내 */
          if (!g.__topikSessionWarned) {
            g.__topikSessionWarned = true;
            console.warn('[TOPIK BO] 동일 관리자 계정이 다른 탭에서 활성 상태입니다. 동시 수정 시 충돌이 발생할 수 있습니다.');
          }
        }
        localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(data));
      } catch (e) {}
    }
    beat();
    _heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }

  function stopSessionHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }

  function notifyMailSent(item) {
    /* 처리 이력 후크 — 각 BO에서 pushAudit/DataStore.addAudit 과 병행 */
    g.__topikLastMail = item;
  }

  g.TOPIKBoCore = {
    acquireRecordLock: acquireRecordLock,
    releaseRecordLock: releaseRecordLock,
    touchRecordLock: touchRecordLock,
    checkRecordVersion: checkRecordVersion,
    can: can,
    enforce: enforce,
    normRole: normRole,
    startSessionHeartbeat: startSessionHeartbeat,
    stopSessionHeartbeat: stopSessionHeartbeat,
    notifyMailSent: notifyMailSent,
    PERM_KEY: PERM_KEY
  };
})(typeof window !== 'undefined' ? window : this);
