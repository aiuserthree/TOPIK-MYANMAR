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

  function rosterSexCode(a) {
    var raw = a.genderCode;
    if (raw === '' || raw == null) {
      raw = (a.gender !== '' && a.gender != null) ? a.gender : a.sx;
    }
    return sexCode(raw);
  }

  function birth8(v) {
    return String(v || '').replace(/[^0-9]/g, '').slice(0, 8);
  }

  // 「연명부 양식.xlsx」 B~K 컬럼 순서(총 10열, 순번 없음)
  // 한글성명|영문성명|생년월일|성별|국적|제1언어|직업코드|응시동기코드|응시목적코드|수험번호
  function rosterRow(a) {
    var ko = g.TOPIKBoAdminKo || {};
    var natKo = ko.nationalityKo ? ko.nationalityKo(a.nationality || a.nation, '미얀마') : (a.nationality || a.nation || '미얀마');
    var langKo = ko.firstLanguageKo ? ko.firstLanguageKo(a.firstLang || a.l1, '') : (a.firstLang || a.l1 || '');
    return [
      a.nameKo && a.nameKo !== '—' ? a.nameKo : (a.name || a.nameEn || ''),  // 한글성명(없으면 영문)
      a.name || a.nameEn || '',                                                // 영문성명
      birth8(a.birth || a.dob),                                                // 생년월일 8자리
      rosterSexCode(a),                                                        // 성별 1/2
      natKo,                                                                   // 국적(BO 한글 표시)
      langKo,                                                                  // 제1언어(BO 한글 표시)
      a.jobCode != null && a.jobCode !== '' ? a.jobCode : '',                  // 직업코드
      a.motiveCode != null && a.motiveCode !== '' ? a.motiveCode : '',         // 응시동기코드
      a.purposeCode != null && a.purposeCode !== '' ? a.purposeCode : '',      // 응시목적코드
      a.exam || a.examNo || ''                                                 // 수험번호(13자리)
    ];
  }

  // 수험번호(=영문명 정렬) 순. 미부여자는 영문명 보조 정렬.
  function sortByExam(rows) {
    return rows.slice().sort(function (x, y) {
      var ea = (x.exam || x.examNo || '');
      var eb = (y.exam || y.examNo || '');
      if (ea && eb) return ea < eb ? -1 : ea > eb ? 1 : 0;
      if (ea && !eb) return -1;
      if (!ea && eb) return 1;
      var na = (x.nameEn || x.name || '').toLowerCase();
      var nb = (y.nameEn || y.name || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  }

  function levelPrefix(level) {
    var l = String(level || '');
    if (l.indexOf('동시') >= 0) return 'TOPIK Ⅰ·Ⅱ';
    if (l.indexOf('Ⅱ') >= 0 || l.toUpperCase().indexOf('II') >= 0) return 'TOPIK Ⅱ';
    return 'TOPIK Ⅰ';
  }

  // 지역·시험장·시험수준별 그룹화(각 그룹 = 개별 파일/단일 시트)
  function buildGroups(rows, state) {
    var groups = {};
    rows.forEach(function (a) {
      var venue = (state.venues || []).find(function (v) { return v.id === a.venueId; });
      var region = venue ? (venue.region || '미얀마') : '미지정';
      var vname = venue ? venue.nameKo : '미지정';
      var lp = levelPrefix(a.level);
      var key = lp + '|' + region + '|' + vname;
      if (!groups[key]) groups[key] = { level: lp, region: region, venue: vname, list: [] };
      groups[key].list.push(a);
    });
    return groups;
  }

  var ROSTER_COUNTRY = '미얀마';

  function safeFilenameSeg(value, fallback) {
    var v = String(value || '').trim() || fallback;
    return v.replace(/[\\/:*?"<>|]+/g, '_');
  }

  // 제{회차}회 TOPIK 지원자 연명부({국가}_{시험장})
  function rosterExportBasename(roundNo, venueName) {
    var roundPart = roundNo ? ('제' + roundNo + '회 ') : '';
    var venue = safeFilenameSeg(venueName, '시험장');
    return roundPart + 'TOPIK 지원자 연명부(' + ROSTER_COUNTRY + '_' + venue + ')';
  }

  function rosterExportFilename(roundNo, venueName, levelPfx, multiLevelAtVenue) {
    var base = rosterExportBasename(roundNo, venueName);
    if (multiLevelAtVenue && levelPfx) return base + '_' + levelPfx + '.xlsx';
    return base + '.xlsx';
  }

  function rosterExportZipName(roundNo, groups) {
    var keys = Object.keys(groups || {});
    var venues = {};
    keys.forEach(function (k) { venues[groups[k].venue] = true; });
    var venueNames = Object.keys(venues);
    if (venueNames.length === 1) {
      return rosterExportBasename(roundNo, venueNames[0]) + '.zip';
    }
    return (roundNo ? ('제' + roundNo + '회 ') : '') + 'TOPIK 지원자 연명부.zip';
  }

  function exportRosterExcel(opts) {
    opts = opts || {};
    if (!g.TOPIKExport) return Promise.reject(new Error('TOPIKExport not loaded'));
    var state = opts.state || {};
    var session = state.sessions && state.sessions.find(function (s) { return s.id === state.activeSessionId; });
    var sessionNo = session ? session.no : '';
    var headers = g.TOPIKExport.ROSTER_HEADERS;

    // full=회차 전체, current=전달된 필터 행
    var baseRows = opts.mode === 'full'
      ? (state.applicants || []).filter(function (a) { return a.sessionId === state.activeSessionId; })
      : (opts.rows || []);
    var rows = sortByExam(baseRows);

    var groups = buildGroups(rows, state);
    var levelsByVenue = {};
    Object.keys(groups).forEach(function (k) {
      var grp = groups[k];
      if (!levelsByVenue[grp.venue]) levelsByVenue[grp.venue] = {};
      levelsByVenue[grp.venue][grp.level] = true;
    });
    var files = Object.keys(groups).map(function (k) {
      var grp = groups[k];
      var list = sortByExam(grp.list);
      return {
        filename: rosterExportFilename(
          sessionNo,
          grp.venue,
          grp.level,
          Object.keys(levelsByVenue[grp.venue]).length > 1
        ),
        rows: list.map(function (a) { return rosterRow(a); }),
        headers: headers
      };
    });

    if (files.length === 0) {
      return Promise.reject(new Error('내보낼 대상이 없습니다.'));
    }
    if (files.length === 1) {
      return g.TOPIKExport.downloadRosterXlsx({
        filename: files[0].filename, headers: headers, rows: files[0].rows
      });
    }
    return g.TOPIKExport.downloadRosterXlsxZip({
      zipName: rosterExportZipName(sessionNo, groups),
      files: files
    });
  }

  /**
   * 사진 zip — 서버 엔드포인트(GET /api/v1/admin/applications/photos.zip)에서 실제 사진으로 생성.
   * 클라이언트 더미(1×1 JPEG) 생성 제거. (계약서 4절)
   */
  function exportPhotosZip(opts) {
    opts = opts || {};
    var DS = g.DataStore;
    if (!DS || !DS.isApiMode || !DS.isApiMode()) {
      return Promise.reject(new Error('사진 zip 다운로드는 서버 연결(API)이 필요합니다.'));
    }
    var query = { round_id: opts.roundId || (DS.state && DS.state.activeSessionId) };
    if (opts.venueId && opts.venueId !== 'all') query.venue_id = opts.venueId;
    if (opts.level && opts.level !== 'all') query.level = opts.level;
    return DS.apiDownloadPhotosZip(query).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.body && res.body.error && res.body.error.message) || '사진 zip 다운로드에 실패했습니다.');
      }
      return true;
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

  /** API payment_status 와 동일 — 수납 명단 대상(unpaid) 판별 */
  function applicantPaymentStatus(a) {
    if (!a) return 'unpaid';
    if (a.paymentStatus) return a.paymentStatus;
    if (a.paid) return 'paid';
    if (a.status === 'refund') return 'refunded';
    return 'unpaid';
  }

  function isUnpaidRosterApplicant(a) {
    if (!a || a.status === 'cancel' || a.status === 'cancelled') return false;
    return applicantPaymentStatus(a) === 'unpaid';
  }

  function sameApplicantSession(a, sessionId) {
    return String(a.sessionId) === String(sessionId);
  }

  function paymentRow(a, state) {
    var venue = (state.venues || []).find(function (v) { return v.id === a.venueId; });
    var exp = g.TOPIKExport || {};
    return [
      a.applicationNo || '',
      a.id || '',
      a.nameKo && a.nameKo !== '—' ? a.nameKo : '',
      a.nameEn && a.nameEn !== '—' ? a.nameEn : '',
      birth8(a.birth || a.dob),
      venue ? venue.nameKo : '',
      a.level || '',
      exp.photoStatusLabel ? exp.photoStatusLabel(a.photoStatus) : (a.photoStatus || ''),
      '미수납'
    ];
  }

  function paymentExportFilename(roundNo) {
    var roundPart = roundNo ? ('제' + roundNo + '회 ') : '';
    return roundPart + 'TOPIK 수납대상자 명단(미얀마).xlsx';
  }

  function exportPaymentExcel(opts) {
    opts = opts || {};
    if (!g.TOPIKExport) return Promise.reject(new Error('TOPIKExport not loaded'));
    var state = opts.state || {};
    var session = state.sessions && state.sessions.find(function (s) { return s.id === state.activeSessionId; });
    var sessionNo = session ? session.no : '';
    var rows = (opts.rows || []).filter(isUnpaidRosterApplicant);
    rows = sortByExam(rows);
    if (!rows.length) return Promise.reject(new Error('미수납 대상자가 없습니다.'));
    return g.TOPIKExport.downloadPaymentXlsx({
      filename: paymentExportFilename(sessionNo),
      rows: rows.map(function (a) { return paymentRow(a, state); })
    });
  }

  function importPaymentExcelLocal(opts) {
    opts = opts || {};
    var state = opts.state || {};
    var items = opts.items || [];
    var applicants = state.applicants || [];
    var byId = {};
    var byNo = {};
    applicants.forEach(function (a) {
      if (a.id) byId[String(a.id)] = a;
      var no = String(a.applicationNo || '').replace(/\s+/g, '').toLowerCase();
      if (no) byNo[no] = a;
    });

    var updated = 0;
    var skippedUnchanged = 0;
    var skippedPhotoNotApproved = [];
    var skippedNotFound = [];

    items.forEach(function (item) {
      var app = null;
      var id = String(item.applicationId || '').trim();
      if (id && byId[id]) app = byId[id];
      if (!app) {
        var no = String(item.applicationNo || '').replace(/\s+/g, '').toLowerCase();
        if (no && byNo[no]) app = byNo[no];
      }
      if (!app) {
        skippedNotFound.push(item);
        return;
      }
      if (item.paymentStatus === 'paid') {
        if (app.paid) { skippedUnchanged++; return; }
        if (app.photoStatus !== 'approved') {
          skippedPhotoNotApproved.push({
            applicationNo: app.applicationNo,
            nameKo: app.nameKo,
            nameEn: app.nameEn,
            photoStatus: app.photoStatus
          });
          return;
        }
        app.paid = true;
        app.paymentStatus = 'paid';
        app.paidAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
        app.paymentMemo = (app.paymentMemo || '') + '[엑셀 일괄 업로드]';
        if (app.status === 'pay' || app.status === 'photo') app.status = 'applied';
        else if (app.status === 'applied' && !app.photoOk) app.status = 'photo';
        if (g.DataStore) {
          g.DataStore.addAudit({
            type: '접수자', targetId: app.id, action: '수납',
            before: { paid: false }, after: { paid: true, status: app.status },
            memo: '수납 명단 엑셀 일괄 업로드'
          });
        }
        updated++;
      } else if (item.paymentStatus === 'unpaid') {
        if (!app.paid) skippedUnchanged++;
      }
    });

    if (updated && g.DataStore) g.DataStore.notify();
    return Promise.resolve({
      updated: updated,
      skipped_unchanged: skippedUnchanged,
      skipped_photo_not_approved: skippedPhotoNotApproved,
      skipped_not_found: skippedNotFound
    });
  }

  g.TOPIKBoBridge = {
    exportRosterExcel: exportRosterExcel,
    exportPhotosZip: exportPhotosZip,
    exportPaymentExcel: exportPaymentExcel,
    importPaymentExcelLocal: importPaymentExcelLocal,
    paymentExportFilename: paymentExportFilename,
    paymentRow: paymentRow,
    applicantPaymentStatus: applicantPaymentStatus,
    isUnpaidRosterApplicant: isUnpaidRosterApplicant,
    sameApplicantSession: sameApplicantSession,
    sendMail: sendMail,
    enforcePerm: enforcePerm,
    withApplicantLock: withApplicantLock,
    rosterRow: rosterRow,
    rosterExportBasename: rosterExportBasename,
    rosterExportFilename: rosterExportFilename
  };
})(typeof window !== 'undefined' ? window : this);
