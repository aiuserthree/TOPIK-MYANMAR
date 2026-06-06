/**
 * C안 BO — 연명부 xlsx / 사진 zip / 메일 / RBAC 브리지
 */
(function (g) {
  'use strict';

  function sexCode(s) {
    if (s === '남' || s === 1 || s === '1') return '1';
    if (s === '여' || s === 2 || s === '2') return '2';
    return '';
  }

  function rosterRow(a, i, venueName) {
    return [
      i + 1,
      a.nameKo || '',
      a.name || a.nameEn || '',
      (a.birth || a.dob || '').replace(/\./g, ''),
      sexCode(a.gender || a.sex),
      a.nationality || a.nation || '미얀마',
      a.firstLang || '',
      a.job || '',
      a.motive || '',
      a.purpose || '',
      a.exam || a.examNo || ''
    ];
  }

  function sortByExam(rows) {
    return rows.slice().sort(function (x, y) {
      var ea = (x.exam || x.examNo || '');
      var eb = (y.exam || y.examNo || '');
      return ea < eb ? -1 : ea > eb ? 1 : 0;
    });
  }

  function exportRosterExcel(opts) {
    opts = opts || {};
    if (!g.TOPIKExport) return Promise.reject(new Error('TOPIKExport not loaded'));
    var state = opts.state || {};
    var rows = sortByExam(opts.rows || []);
    var session = state.sessions && state.sessions.find(function (s) { return s.id === state.activeSessionId; });
    var sessionNo = session ? session.no : '00';
    var headers = g.TOPIKExport.ROSTER_HEADERS;

    if (opts.mode === 'full') {
      var groups = {};
      rows.forEach(function (a) {
        var venue = (state.venues || []).find(function (v) { return v.id === a.venueId; });
        var key = (a.level || 'TOPIK') + '_미얀마_' + (venue ? venue.nameKo : '미지정');
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
      });
      var files = Object.keys(groups).map(function (k) {
        var list = groups[k];
        return {
          filename: '제' + sessionNo + '회 TOPIK 지원자 연명부(TOPIK_' + k + ').xlsx',
          rows: list.map(function (a, i) { return rosterRow(a, i, k); }),
          headers: headers
        };
      });
      return g.TOPIKExport.downloadRosterXlsxZip({
        zipName: '제' + sessionNo + '회_TOPIK_연명부_일괄.zip',
        files: files
      });
    }

    return g.TOPIKExport.downloadRosterXlsx({
      filename: '제' + sessionNo + '회 TOPIK 지원자 연명부(미얀마_혼합).xlsx',
      headers: headers,
      rows: rows.map(function (a, i) { return rosterRow(a, i); })
    });
  }

  function exportPhotosZip(opts) {
    opts = opts || {};
    if (!g.TOPIKExport) return Promise.reject(new Error('TOPIKExport not loaded'));
    var state = opts.state || {};
    var rows = opts.rows || [];
    var entries = [];
    var missing = [];
    rows.forEach(function (a) {
      var exam = (a.exam || a.examNo || '').trim();
      var venue = (state.venues || []).find(function (v) { return v.id === a.venueId; });
      var region = venue ? (venue.region || '미얀마') : '미얀마';
      var vname = venue ? venue.nameKo : '미지정';
      var lvl = (a.level || '').indexOf('Ⅱ') >= 0 ? 'Ⅱ' : 'Ⅰ';
      if (a.photoOk && exam && a.status !== 'rejected' && a.status !== 'cancelled') {
        entries.push({
          path: region + '/' + vname + '/TOPIK_' + lvl + '/' + exam + '.jpg',
          dataUrl: a.photoUrl || null
        });
      } else {
        missing.push([exam || '—', a.nameKo || '', !a.photoOk ? '사진 미승인' : '수험번호 미부여']);
      }
    });
    var session = state.sessions && state.sessions.find(function (s) { return s.id === state.activeSessionId; });
    return g.TOPIKExport.downloadPhotosZip({
      zipName: 'TOPIK_제' + (session ? session.no : '') + '회_사진.zip',
      entries: entries,
      report: missing.length ? { headers: ['수험번호', '한글성명', '사유'], rows: missing } : null
    });
  }

  function sendMail(opts) {
    if (g.TOPIKMail) return g.TOPIKMail.send(opts);
    return null;
  }

  function enforcePerm(role, menuKey, action) {
    if (!g.TOPIKBoCore) return true;
    return g.TOPIKBoCore.enforce(role || 'normal', menuKey, action);
  }

  function withApplicantLock(id, userId, userName, fn) {
    if (!g.TOPIKBoCore || !id) return fn();
    var lock = g.TOPIKBoCore.acquireRecordLock(id, userId, userName);
    if (!lock.ok) {
      alert('다른 관리자(' + lock.conflict + ')가 해당 접수 건을 처리 중입니다.\n동시 작업이 감지되어 처리할 수 없습니다.');
      return false;
    }
    try { return fn(lock); }
    finally { g.TOPIKBoCore.releaseRecordLock(id, userId); }
  }

  g.TOPIKBoBridge = {
    exportRosterExcel: exportRosterExcel,
    exportPhotosZip: exportPhotosZip,
    sendMail: sendMail,
    enforcePerm: enforcePerm,
    withApplicantLock: withApplicantLock,
    rosterRow: rosterRow
  };
})(typeof window !== 'undefined' ? window : this);
