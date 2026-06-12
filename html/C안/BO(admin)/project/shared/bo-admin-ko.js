/**
 * BO 관리자 화면 전용 — 국적·제1언어 등 FO 다국어 저장값을 한글 표시로 변환.
 * DB/메일 발송 로직에는 사용하지 않음 (상세보기·연명부 엑셀 export 에만 적용).
 */
(function (g) {
  'use strict';

  var NATIONALITY_KO = {
    '미얀마': '미얀마',
    'မြန်မာ': '미얀마',
    'Myanmar': '미얀마',
    '미얀마 (Myanmar)': '미얀마',
    '대한민국': '대한민국',
    '한국': '대한민국',
    'ကိုရီးယား': '대한민국',
    'Republic of Korea': '대한민국',
    'South Korea': '대한민국',
    'Korea': '대한민국',
    '기타': '기타',
    'အခြား': '기타',
    'Other': '기타',
  };

  var FIRST_LANGUAGE_KO = {
    '미얀마어': '미얀마어',
    '버마어': '버마어',
    'မြန်မာဘာသာ': '미얀마어',
    'Burmese': '미얀마어',
    '미얀마어 (Burmese)': '미얀마어',
    '한국어': '한국어',
    'ကိုရီးယားဘာသာ': '한국어',
    'Korean': '한국어',
    '영어': '영어',
    'အင်္ဂလိပ်ဘာသာ': '영어',
    'English': '영어',
    '샨어': '샨어',
    '카렌어': '카렌어',
    '중국어': '중국어',
    '기타': '기타',
    'အခြား': '기타',
    'Other': '기타',
  };

  function trim(v) {
    return String(v == null ? '' : v).trim();
  }

  function nationalityKo(value, fallback) {
    var v = trim(value);
    if (!v) return fallback != null ? fallback : '미얀마';
    return NATIONALITY_KO[v] || v;
  }

  function firstLanguageKo(value, fallback) {
    var v = trim(value);
    if (!v) return fallback != null ? fallback : '';
    return FIRST_LANGUAGE_KO[v] || v;
  }

  g.TOPIKBoAdminKo = {
    nationalityKo: nationalityKo,
    firstLanguageKo: firstLanguageKo,
  };
})(typeof window !== 'undefined' ? window : this);
