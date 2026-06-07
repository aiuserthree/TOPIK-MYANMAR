/**
 * 연명부 xlsx 실제 파일 생성 (SheetJS + JSZip) · CSV 내보내기
 * ※ 사진 zip은 서버 엔드포인트(GET /api/v1/admin/applications/photos.zip)에서 생성한다.
 *   (클라이언트 더미 1×1 JPEG 생성 로직 제거됨 — 계약서 4절)
 */
(function (g) {
  'use strict';

  // 「연명부 양식.xlsx」 헤더 2행 기준(B~K, 총 10열). 순번 컬럼 없음.
  var ROSTER_HEADERS = [
    '한글성명', '영문성명', '생년월일', '성별', '국적',
    '제1언어', '직업', '응시동기', '응시목적', '수험번호'
  ];

  // 「연명부 양식.xlsx」 1행 안내문(작성 가이드) — 업로드 양식과 동일하게 1행에 배치
  var ROSTER_GUIDE = [
    '한글성명이 없는 경우,\n영문성명 입력',
    '영문성명 입력\n(신분증 상 영문성명 기재)',
    '숫자 8자리만 입력\n예시) 19991231',
    '성별코드\n\n1:남자\n2:여자',
    '국가 선택',
    '제1언어 선택',
    '직업코드\n1 : 학생\n2 : 공무원(군인)\n3 : 회사원\n4 : 자영업\n5 : 주부\n6 : 교사\n7 : 무직\n8 : 기타',
    '응시동기코드\n1 : 방송\n2 : 신문\n3 : 잡지\n4 : 교육기관\n5 : 포스터\n6 : 친지\n7 : 친구\n8 : 인터넷\n9 : 기타\n10 : 지인(가족, 친구등)\n11 : 토픽홈페이지',
    '응시목적코드\n1 : 유학\n2 : 취업\n3 : 관광\n4 : 학술연구\n5 : 한국어 실력확인\n6 : 한국문화이해\n7 : 기타\n8 : 비자 VISA 영주권\n9 : 학점취득\n10: 사회통합프로그램\n15: 체류자격 관리',
    "수험번호(13자리 숫자만 입력)\n*사진파일명과 동일하게 입력(.jpg 제외)\n*지역별/시험장별/시험수준별 개별 파일"
  ];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /**
   * 연명부 양식과 동일한 시트 구성으로 작성:
   *   - A열은 비움(원본 양식에서 '예시' 라벨 자리)
   *   - 1행: 작성 안내문(가이드), 2행: 헤더(한글성명…수험번호), 3행~: 데이터
   *   - 각 파일은 단일 시트(여러 시트 작성 시 등록 불가)
   */
  function writeRosterBlob(headers, rows, sheetName) {
    headers = headers || ROSTER_HEADERS;
    var aoa = [];
    aoa.push([''].concat(ROSTER_GUIDE.slice(0, headers.length)));
    aoa.push([''].concat(headers));
    (rows || []).forEach(function (r) {
      aoa.push([''].concat(headers.map(function (_, i) { return r[i] != null ? r[i] : ''; })));
    });
    var ws = g.XLSX.utils.aoa_to_sheet(aoa);
    var wb = g.XLSX.utils.book_new();
    g.XLSX.utils.book_append_sheet(wb, ws, sheetName || '연명부');
    var buf = g.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function ensureName(name, ext) {
    if (!name) return 'download.' + ext;
    return name.toLowerCase().endsWith('.' + ext) ? name : name + '.' + ext;
  }

  /** 단일 연명부 xlsx 다운로드 */
  function downloadRosterXlsx(opts) {
    opts = opts || {};
    return g.TOPIKLibLoader.loadXLSX().then(function () {
      var headers = opts.headers || ROSTER_HEADERS;
      var blob = writeRosterBlob(headers, opts.rows || [], opts.sheetName || '연명부');
      triggerDownload(blob, ensureName(opts.filename || '연명부.xlsx', 'xlsx'));
    });
  }

  /** 여러 xlsx를 zip으로 묶어 다운로드 (지역·시험장·수준별 개별 파일/단일 시트) */
  function downloadRosterXlsxZip(opts) {
    opts = opts || {};
    return g.TOPIKLibLoader.loadBoth().then(function () {
      var zip = new g.JSZip();
      (opts.files || []).forEach(function (f) {
        var headers = f.headers || ROSTER_HEADERS;
        var blob = writeRosterBlob(headers, f.rows || [], f.sheetName || '연명부');
        zip.file(ensureName(f.filename || '연명부.xlsx', 'xlsx'), blob);
      });
      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        triggerDownload(blob, ensureName(opts.zipName || '연명부_일괄.zip', 'zip'));
      });
    });
  }

  /** CSV 셀 이스케이프 */
  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** 실제 CSV 파일 다운로드 (UTF-8 BOM — Excel 한글 호환) */
  function downloadCsv(filename, headers, rows) {
    var lines = [];
    if (headers && headers.length) lines.push(headers.map(csvCell).join(','));
    (rows || []).forEach(function (r) { lines.push(r.map(csvCell).join(',')); });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, ensureName(filename || 'export.csv', 'csv'));
    return Promise.resolve(true);
  }

  g.TOPIKExport = {
    ROSTER_HEADERS: ROSTER_HEADERS,
    downloadRosterXlsx: downloadRosterXlsx,
    downloadRosterXlsxZip: downloadRosterXlsxZip,
    downloadCsv: downloadCsv
  };
})(typeof window !== 'undefined' ? window : this);
