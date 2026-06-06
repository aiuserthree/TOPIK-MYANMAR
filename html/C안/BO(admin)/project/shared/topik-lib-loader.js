/**
 * CDN 라이브러리 동적 로더 (SheetJS, JSZip)
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
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        function () { return !!g.XLSX; }
      );
    },
    loadJSZip: function () {
      return loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        function () { return !!g.JSZip; }
      );
    },
    loadBoth: function () {
      var self = this;
      return Promise.all([self.loadXLSX(), self.loadJSZip()]);
    }
  };
})(typeof window !== 'undefined' ? window : this);
