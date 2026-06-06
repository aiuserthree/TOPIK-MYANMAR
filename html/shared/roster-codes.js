/**
 * 연명부 코드 — 직업(1–12) / 응시동기(1–11) / 응시목적(1–15)
 * FO signup · register · mypage-profile
 */
(function (g) {
  "use strict";

  var CODES = {
    job: [
      { code: 1, ko: "학생", en: "Student" },
      { code: 2, ko: "교사", en: "Teacher" },
      { code: 3, ko: "공무원", en: "Civil servant" },
      { code: 4, ko: "회사원", en: "Office worker" },
      { code: 5, ko: "자영업", en: "Self-employed" },
      { code: 6, ko: "전문직", en: "Professional" },
      { code: 7, ko: "무직", en: "Unemployed" },
      { code: 8, ko: "주부", en: "Homemaker" },
      { code: 9, ko: "군인", en: "Military" },
      { code: 10, ko: "농업·어업", en: "Agriculture/Fishery" },
      { code: 11, ko: "예술·스포츠", en: "Arts/Sports" },
      { code: 12, ko: "기타", en: "Other" },
    ],
    motive: [
      { code: 1, ko: "유학", en: "Study abroad" },
      { code: 2, ko: "취업", en: "Employment" },
      { code: 3, ko: "이민", en: "Immigration" },
      { code: 4, ko: "결혼이민", en: "Marriage immigration" },
      { code: 5, ko: "한국어 학습", en: "Korean language study" },
      { code: 6, ko: "자격증 취득", en: "Certification" },
      { code: 7, ko: "입학", en: "University admission" },
      { code: 8, ko: "교환학생", en: "Exchange student" },
      { code: 9, ko: "개인적 관심", en: "Personal interest" },
      { code: 10, ko: "기관·단체 추천", en: "Institution recommendation" },
      { code: 11, ko: "기타", en: "Other" },
    ],
    purpose: [
      { code: 1, ko: "대학 입학", en: "University admission" },
      { code: 2, ko: "대학원 입학", en: "Graduate admission" },
      { code: 3, ko: "취업", en: "Employment" },
      { code: 4, ko: "승진", en: "Promotion" },
      { code: 5, ko: "유학", en: "Study abroad" },
      { code: 6, ko: "이민", en: "Immigration" },
      { code: 7, ko: "결혼이민", en: "Marriage immigration" },
      { code: 8, ko: "한국어 교육", en: "Korean education" },
      { code: 9, ko: "자격·면허", en: "License/Certification" },
      { code: 10, ko: "교환학생", en: "Exchange student" },
      { code: 11, ko: "연구", en: "Research" },
      { code: 12, ko: "봉사활동", en: "Volunteer" },
      { code: 13, ko: "개인적 목적", en: "Personal" },
      { code: 14, ko: "기관 요구", en: "Institutional requirement" },
      { code: 15, ko: "기타", en: "Other" },
    ],
  };

  function list(kind) {
    return CODES[kind] || [];
  }

  function label(kind, code) {
    var n = Number(code);
    var items = list(kind);
    for (var i = 0; i < items.length; i++) {
      if (items[i].code === n) return items[i].ko;
    }
    return "";
  }

  function fillSelect(selectEl, kind) {
    if (!selectEl) return;
    var items = list(kind);
    var keepFirst = selectEl.options.length > 0 ? selectEl.options[0].outerHTML : "";
    selectEl.innerHTML = keepFirst;
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = String(item.code);
      opt.textContent = item.ko;
      selectEl.appendChild(opt);
    });
  }

  g.TPKM_ROSTER_CODES = {
    codes: CODES,
    list: list,
    label: label,
    fillSelect: fillSelect,
  };
})(typeof window !== "undefined" ? window : globalThis);
