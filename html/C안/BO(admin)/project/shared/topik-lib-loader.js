/**
 * 라이브러리 동적 로더 (SheetJS, JSZip)
 *
 * 자체 호스팅(vendor/) 에서 받는다. 외부 CDN 은 미얀마 현장에서 느리거나
 * 막히면 수납 명단 다운로드가 그대로 실패한다.
 * 경로는 문서 기준 상대경로 — BO 페이지는 모두 루트에 있다(/admin, /admin-login).
 */
(function (g) {
  'use strict';
  var cache = {};

  function loadScript(url, check) {
    if (check && check()) return Promise.resolve(true);
    if (cache[url]) return cache[url];
    cache[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('Failed to load: ' + url)); };
      document.head.appendChild(s);
    });
    return cache[url];
  }

  g.TOPIKLibLoader = {
    loadXLSX: function () {
      return loadScript(
        'vendor/xlsx-0.20.3.full.min.js',
        function () { return !!g.XLSX; }
      );
    },
    loadJSZip: function () {
      return loadScript(
        'vendor/jszip-3.10.1.min.js',
        function () { return !!g.JSZip; }
      );
    },
    loadBoth: function () {
      var self = this;
      return Promise.all([self.loadXLSX(), self.loadJSZip()]);
    }
  };
})(typeof window !== 'undefined' ? window : this);
