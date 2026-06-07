/**
 * 연명부 코드 — 「연명부 양식.xlsx」 / 「수험번호 부여 안내.xlsx」 권위 기준
 *  · 직업코드 (1–8)   : 1 학생 2 공무원(군인) 3 회사원 4 자영업 5 주부 6 교사 7 무직 8 기타
 *  · 응시동기코드 (1–11): 1 방송 2 신문 3 잡지 4 교육기관 5 포스터 6 친지 7 친구 8 인터넷 9 기타 10 지인 11 토픽홈페이지
 *  · 응시목적코드 (1–10,15): 1 유학 2 취업 3 관광 4 학술연구 5 한국어실력확인 6 한국문화이해
 *                            7 기타 8 비자(VISA·영주권) 9 학점취득 10 사회통합프로그램 15 체류자격관리
 * FO signup · register · mypage-profile 에서 공통 사용. 코드값은 연명부/백엔드 저장값과 동일.
 */
(function (g) {
  "use strict";

  var CODES = {
    job: [
      { code: 1, ko: "학생", en: "Student", my: "ကျောင်းသား" },
      { code: 2, ko: "공무원(군인)", en: "Civil servant (military)", my: "နိုင်ငံ့ဝန်ထမ်း (စစ်သား)" },
      { code: 3, ko: "회사원", en: "Office worker", my: "ကုမ္ပဏီဝန်ထမ်း" },
      { code: 4, ko: "자영업", en: "Self-employed", my: "ကိုယ်ပိုင်လုပ်ငန်း" },
      { code: 5, ko: "주부", en: "Homemaker", my: "အိမ်ရှင်မ" },
      { code: 6, ko: "교사", en: "Teacher", my: "ဆရာ/ဆရာမ" },
      { code: 7, ko: "무직", en: "Unemployed", my: "အလုပ်အကိုင်မရှိသူ" },
      { code: 8, ko: "기타", en: "Other", my: "အခြား" },
    ],
    motive: [
      { code: 1, ko: "방송", en: "Broadcast (TV/Radio)", my: "ရုပ်သံ/ရေဒီယို" },
      { code: 2, ko: "신문", en: "Newspaper", my: "သတင်းစာ" },
      { code: 3, ko: "잡지", en: "Magazine", my: "မဂ္ဂဇင်း" },
      { code: 4, ko: "교육기관", en: "Educational institution", my: "ပညာရေးအဖွဲ့အစည်း" },
      { code: 5, ko: "포스터", en: "Poster", my: "ပိုစတာ" },
      { code: 6, ko: "친지", en: "Relatives", my: "ဆွေမျိုး" },
      { code: 7, ko: "친구", en: "Friend", my: "သူငယ်ချင်း" },
      { code: 8, ko: "인터넷", en: "Internet", my: "အင်တာနက်" },
      { code: 9, ko: "기타", en: "Other", my: "အခြား" },
      { code: 10, ko: "지인(가족·친구 등)", en: "Acquaintance (family/friends)", my: "အသိမိတ်ဆွေ (မိသားစု၊ သူငယ်ချင်း)" },
      { code: 11, ko: "토픽 홈페이지", en: "TOPIK website", my: "TOPIK ဝက်ဘ်ဆိုက်" },
    ],
    purpose: [
      { code: 1, ko: "유학", en: "Study abroad", my: "ပညာတော်သင်" },
      { code: 2, ko: "취업", en: "Employment", my: "အလုပ်အကိုင်" },
      { code: 3, ko: "관광", en: "Tourism", my: "ခရီးသွားလာရေး" },
      { code: 4, ko: "학술연구", en: "Academic research", my: "ပညာရပ်ဆိုင်ရာ သုတေသန" },
      { code: 5, ko: "한국어 실력 확인", en: "Korean proficiency check", my: "ကိုရီးယားစာ အရည်အချင်း စစ်ဆေးခြင်း" },
      { code: 6, ko: "한국 문화 이해", en: "Understanding Korean culture", my: "ကိုရီးယားယဉ်ကျေးမှု နားလည်ရန်" },
      { code: 7, ko: "기타", en: "Other", my: "အခြား" },
      { code: 8, ko: "비자(VISA·영주권)", en: "Visa (VISA / permanent residency)", my: "ဗီဇာ (VISA · အမြဲတမ်းနေထိုင်ခွင့်)" },
      { code: 9, ko: "학점 취득", en: "Credit acquisition", my: "ဘွဲ့ရမှတ် ရယူရန်" },
      { code: 10, ko: "사회통합프로그램", en: "Social integration program (KIIP)", my: "လူမှုပေါင်းစည်းရေး အစီအစဉ်" },
      { code: 15, ko: "체류자격 관리", en: "Residence status management", my: "နေထိုင်ခွင့် အခြေအနေ စီမံခန့်ခွဲမှု" },
    ],
  };

  function currentLang() {
    var l = "ko";
    try {
      if (g.TPKMLang && g.TPKMLang.get) l = g.TPKMLang.get();
      else l = g.localStorage.getItem("tpkm_lang") || "KO";
    } catch (e) { /* private mode */ }
    l = String(l).toLowerCase();
    if (l === "kr" || l === "ko") return "ko";
    if (l === "mm" || l === "my") return "my";
    if (l === "en") return "en";
    return "ko";
  }

  function pick(item, lang) {
    if (!item) return "";
    lang = lang || currentLang();
    return item[lang] || item.ko || item.en || item.my || "";
  }

  function list(kind) {
    return CODES[kind] || [];
  }

  function label(kind, code, lang) {
    var n = Number(code);
    var items = list(kind);
    for (var i = 0; i < items.length; i++) {
      if (items[i].code === n) return pick(items[i], lang);
    }
    return "";
  }

  function fillSelect(selectEl, kind, lang) {
    if (!selectEl) return;
    lang = lang || currentLang();
    var prevValue = selectEl.value;
    var items = list(kind);
    var keepFirst = selectEl.options.length > 0 ? selectEl.options[0].outerHTML : "";
    selectEl.innerHTML = keepFirst;
    selectEl.setAttribute("data-roster-kind", kind);
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = String(item.code);
      opt.textContent = pick(item, lang);
      selectEl.appendChild(opt);
    });
    if (prevValue) selectEl.value = prevValue;
  }

  /**
   * Re-localize all roster selects ([data-roster-kind]) and any read-only
   * roster labels ([data-roster-kind][data-roster-code]) for the given lang.
   * Wired to the central i18n applier via the `tpkm:langchange` event.
   */
  function relocalizeAll(lang) {
    lang = lang || currentLang();
    if (typeof document === "undefined") return;
    document.querySelectorAll("select[data-roster-kind]").forEach(function (sel) {
      fillSelect(sel, sel.getAttribute("data-roster-kind"), lang);
    });
    document.querySelectorAll("[data-roster-kind][data-roster-code]").forEach(function (el) {
      var kind = el.getAttribute("data-roster-kind");
      var code = el.getAttribute("data-roster-code");
      if (code === "" || code == null) return;
      var txt = label(kind, code, lang);
      if (txt) el.textContent = txt;
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("tpkm:langchange", function (ev) {
      relocalizeAll(ev && ev.detail && ev.detail.lang);
    });
  }

  g.TPKM_ROSTER_CODES = {
    codes: CODES,
    list: list,
    label: label,
    fillSelect: fillSelect,
    relocalizeAll: relocalizeAll,
    currentLang: currentLang,
  };
})(typeof window !== "undefined" ? window : globalThis);
