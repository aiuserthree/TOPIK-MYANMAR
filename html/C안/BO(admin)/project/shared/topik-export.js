/**
 * 연명부 xlsx · 사진 zip 실제 파일 생성 (SheetJS + JSZip)
 */
(function (g) {
  'use strict';

  var ROSTER_HEADERS = [
    '순번', '한글성명', '영문성명', '생년월일', '성별', '국적',
    '제1언어', '직업', '응시동기', '응시목적', '수험번호'
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

  function rowsToAoa(headers, rows) {
    return [headers].concat(rows.map(function (r) {
      return headers.map(function (_, i) { return r[i] != null ? r[i] : ''; });
    }));
  }

  function writeXlsxBlob(headers, rows, sheetName) {
    var aoa = rowsToAoa(headers, rows);
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
      var blob = writeXlsxBlob(headers, opts.rows || [], opts.sheetName || '연명부');
      triggerDownload(blob, ensureName(opts.filename || '연명부.xlsx', 'xlsx'));
    });
  }

  /** 여러 xlsx를 zip으로 묶어 다운로드 */
  function downloadRosterXlsxZip(opts) {
    opts = opts || {};
    return g.TOPIKLibLoader.loadBoth().then(function () {
      var zip = new g.JSZip();
      (opts.files || []).forEach(function (f) {
        var headers = f.headers || ROSTER_HEADERS;
        var blob = writeXlsxBlob(headers, f.rows || [], f.sheetName || '연명부');
        zip.file(ensureName(f.filename || '연명부.xlsx', 'xlsx'), blob);
      });
      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        triggerDownload(blob, ensureName(opts.zipName || '연명부_일괄.zip', 'zip'));
      });
    });
  }

  /** 1×1 placeholder JPEG (데모 사진) */
  var PLACEHOLDER_JPG = (function () {
    var bin = atob(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=='
    );
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  })();

  function photoBytes(entry) {
    if (entry.blob) return Promise.resolve(entry.blob);
    if (entry.dataUrl && entry.dataUrl.indexOf('base64,') > -1) {
      var b64 = entry.dataUrl.split('base64,')[1];
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return Promise.resolve(arr);
    }
    return Promise.resolve(PLACEHOLDER_JPG);
  }

  /**
   * 사진 zip — entries: [{ path: '미얀마/양곤/TOPIK_Ⅰ/0250017010001.jpg', dataUrl?, blob? }]
   * report: { headers, rows } → 누락_리포트.xlsx
   */
  function downloadPhotosZip(opts) {
    opts = opts || {};
    return g.TOPIKLibLoader.loadBoth().then(function () {
      var zip = new g.JSZip();
      var entries = opts.entries || [];
      var chain = Promise.resolve();
      entries.forEach(function (e) {
        chain = chain.then(function () {
          return photoBytes(e).then(function (bytes) {
            zip.file(e.path, bytes, { binary: true });
          });
        });
      });
      return chain.then(function () {
        if (opts.report && opts.report.rows && opts.report.rows.length) {
          var repHeaders = opts.report.headers || ['수험번호', '한글성명', '사유'];
          var repBlob = writeXlsxBlob(repHeaders, opts.report.rows, '누락리포트');
          zip.file('누락_리포트.xlsx', repBlob);
        }
        return zip.generateAsync({ type: 'blob' });
      }).then(function (blob) {
        triggerDownload(blob, ensureName(opts.zipName || 'TOPIK_사진.zip', 'zip'));
      });
    });
  }

  g.TOPIKExport = {
    ROSTER_HEADERS: ROSTER_HEADERS,
    downloadRosterXlsx: downloadRosterXlsx,
    downloadRosterXlsxZip: downloadRosterXlsxZip,
    downloadPhotosZip: downloadPhotosZip
  };
})(typeof window !== 'undefined' ? window : this);
