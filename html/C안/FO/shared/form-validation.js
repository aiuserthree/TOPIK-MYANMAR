/* FO 폼 공통 검증 — API validation.py / auth 정책과 맞춤 */
(function () {
  'use strict';

  var MIN_SIGNUP_AGE_YEARS = 14;

  function i18n(key, fallback, vars) {
    var fn = (typeof window !== 'undefined' && window.TPKMBt) ? window.TPKMBt : null;
    if (!fn) return fallback;
    if (vars && fn.btf) return fn.btf(key, fallback, vars);
    if (fn.bt) return fn.bt(key, fallback);
    return fallback;
  }

  function bindDigitsOnlyInput(inputEl, maxLen) {
    if (!inputEl) return;
    function strip() {
      var digits = String(inputEl.value || '').replace(/\D/g, '');
      if (maxLen) digits = digits.slice(0, maxLen);
      if (inputEl.value !== digits) inputEl.value = digits;
    }
    inputEl.addEventListener('input', strip);
    inputEl.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      var digits = text.replace(/\D/g, '');
      if (maxLen) digits = digits.slice(0, maxLen);
      inputEl.value = digits;
      strip();
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** 영문 성명 — 입력·붙여넣기 시 대문자 (여권 표기) */
  function bindUppercaseInput(inputEl) {
    if (!inputEl) return;
    function toUpper() {
      var upper = String(inputEl.value || '').toUpperCase();
      if (inputEl.value !== upper) inputEl.value = upper;
    }
    inputEl.addEventListener('input', toUpper);
    inputEl.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      inputEl.value = text.toUpperCase();
      toUpper();
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function normalizeBirthYmd(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length !== 8) return null;
    var y = Number(d.slice(0, 4));
    var m = Number(d.slice(4, 6));
    var day = Number(d.slice(6, 8));
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31) return null;
    return d;
  }

  function isUnderMinimumAge(birthYmd, minAge, asOf) {
    minAge = minAge == null ? MIN_SIGNUP_AGE_YEARS : minAge;
    asOf = asOf || new Date();
    if (!birthYmd || birthYmd.length !== 8) return false;
    var y = Number(birthYmd.slice(0, 4));
    var m = Number(birthYmd.slice(4, 6));
    var day = Number(birthYmd.slice(6, 8));
    if (!isFinite(y) || !isFinite(m) || !isFinite(day)) return false;
    var ref = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    var birth = new Date(y, m - 1, day);
    var age = ref.getFullYear() - birth.getFullYear();
    var md = ref.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && ref.getDate() < birth.getDate())) age -= 1;
    return age < minAge;
  }

  function validateBirthYmd(raw) {
    var birth = normalizeBirthYmd(raw);
    if (!birth) {
      return {
        ok: false,
        message: i18n('val.birth_format', '생년월일을 YYYYMMDD 8자리로 입력해 주세요.')
      };
    }
    if (isUnderMinimumAge(birth)) {
      return {
        ok: false,
        message: i18n('val.birth_age', '만 ' + MIN_SIGNUP_AGE_YEARS + '세 미만은 회원가입할 수 없습니다.', { age: MIN_SIGNUP_AGE_YEARS })
      };
    }
    return { ok: true, value: birth };
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function isValidPassword(pw) {
    if (!pw || pw.length < 8) return false;
    if (!/[A-Za-z]/.test(pw)) return false;
    if (!/\d/.test(pw)) return false;
    if (!/[^A-Za-z0-9]/.test(pw)) return false;
    return true;
  }

  function validateRosterCodes(job, motive, purpose) {
    var j = Number(job);
    var m = Number(motive);
    var p = Number(purpose);
    if (!j || !m || !p) {
      return i18n('val.roster_codes', '직업·응시동기·응시목적을 선택해 주세요.');
    }
    return null;
  }

  /* ------------------------------------------------------------------
     한글 성명 — 한글 외 문자 입력 제한
     연명부(한글성명 컬럼)·BO 표시 정합을 위해 한글 음절/자모와 공백만 허용.
     ------------------------------------------------------------------ */
  var HANGUL_ONLY_RE = /[^가-힣ᄀ-ᇿ㄰-㆏\s]/g;

  /** 한글 외 문자를 제거하고 공백을 정리한 값 */
  function sanitizeKoreanName(raw) {
    return String(raw == null ? '' : raw)
      .replace(HANGUL_ONLY_RE, '')
      .replace(/\s{2,}/g, ' ');
  }

  function hasNonKorean(raw) {
    return sanitizeKoreanName(raw) !== String(raw == null ? '' : raw);
  }

  /** 입력·붙여넣기 시 한글 외 문자를 즉시 제거 (커서 위치 보존) */
  function bindKoreanNameInput(inputEl) {
    if (!inputEl) return;
    function strip() {
      var before = inputEl.value || '';
      var cleaned = sanitizeKoreanName(before);
      if (before === cleaned) return;
      var pos = inputEl.selectionStart;
      var removed = before.length - cleaned.length;
      inputEl.value = cleaned;
      if (pos != null) {
        try { inputEl.setSelectionRange(Math.max(0, pos - removed), Math.max(0, pos - removed)); }
        catch (e) { /* number/date 등 selection 미지원 입력 */ }
      }
    }
    // 한글 IME 조합 중에는 건드리지 않는다(조합 문자가 깨짐).
    var composing = false;
    inputEl.addEventListener('compositionstart', function () { composing = true; });
    inputEl.addEventListener('compositionend', function () { composing = false; strip(); });
    inputEl.addEventListener('input', function () { if (!composing) strip(); });
    inputEl.addEventListener('blur', function () {
      strip();
      var trimmed = (inputEl.value || '').trim();
      if (inputEl.value !== trimmed) inputEl.value = trimmed;
    });
    inputEl.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      inputEl.value = sanitizeKoreanName((inputEl.value || '') + text);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** 한글 성명 검증 — { ok, value, message } */
  function validateKoreanName(raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) {
      return { ok: false, message: i18n('su.err_name_ko', '한글 성명을 입력해 주세요.') };
    }
    if (hasNonKorean(v)) {
      return {
        ok: false,
        message: i18n('val.name_ko_hangul', '한글 성명은 한글만 입력할 수 있습니다.')
      };
    }
    return { ok: true, value: sanitizeKoreanName(v).trim() };
  }

  /* ------------------------------------------------------------------
     국적 / 제1언어 — 저장 표준값(한국어) 정규화
     화면 언어(ko/my/en)와 무관하게 동일한 값이 저장되도록 하고,
     과거에 번역 라벨 그대로 저장된 값도 표준값으로 되돌려
     선택 목록에 중복 항목이 생기지 않게 한다.
     ------------------------------------------------------------------ */
  var NATIONALITY_VALUES = ['미얀마', '대한민국', '기타'];
  var FIRST_LANGUAGE_VALUES = ['미얀마어', '한국어', '영어', '기타'];

  var NATIONALITY_ALIASES = {
    '미얀마': ['미얀마', '미얀마 (Myanmar)', 'မြန်မာ', 'မြန်မာနိုင်ငံသား', 'မြန်မာလူမျိုး', 'ဗမာ', 'ဗမာလူမျိုး', 'Myanmar', 'Burma', 'Burmese'],
    '대한민국': ['대한민국', '한국', 'ကိုရီးယား', 'ကိုရီးယားနိုင်ငံသား', 'ကိုရီးယားလူမျိုး', 'Republic of Korea', 'South Korea', 'Korea'],
    '기타': ['기타', 'အခြား', 'Other', 'Etc']
  };

  var FIRST_LANGUAGE_ALIASES = {
    '미얀마어': ['미얀마어', '미얀마어 (Burmese)', '버마어', 'မြန်မာ', 'မြန်မာဘာသာ', 'မြန်မာစာ', 'မြန်မာစကား', 'မြန်မာလူမျိုး', 'ဗမာဘာသာ', 'ဗမာစကား', 'ဗမာလူမျိုး', 'Burmese', 'Myanmar'],
    '한국어': ['한국어', 'ကိုရီးယား', 'ကိုရီးယားဘာသာ', 'ကိုရီးယားစကား', 'Korean'],
    '영어': ['영어', 'အင်္ဂလိပ်ဘာသာ', 'အင်္ဂလိပ်စကား', 'English'],
    '기타': ['기타', 'အခြား', 'Other', 'Etc']
  };

  function buildAliasIndex(table) {
    var index = {};
    Object.keys(table).forEach(function (canonical) {
      table[canonical].forEach(function (alias) {
        index[String(alias).trim().toLowerCase()] = canonical;
      });
    });
    return index;
  }

  var NATIONALITY_INDEX = buildAliasIndex(NATIONALITY_ALIASES);
  var FIRST_LANGUAGE_INDEX = buildAliasIndex(FIRST_LANGUAGE_ALIASES);

  /** 표준값을 찾지 못하면 '' 반환 (호출부에서 원본 유지 여부 결정) */
  function normalizeFromIndex(index, value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return '';
    return index[v.toLowerCase()] || '';
  }

  function normalizeNationality(value) {
    return normalizeFromIndex(NATIONALITY_INDEX, value);
  }

  function normalizeFirstLanguage(value) {
    return normalizeFromIndex(FIRST_LANGUAGE_INDEX, value);
  }

  window.TPKMValidate = {
    MIN_SIGNUP_AGE_YEARS: MIN_SIGNUP_AGE_YEARS,
    bindDigitsOnlyInput: bindDigitsOnlyInput,
    bindUppercaseInput: bindUppercaseInput,
    bindKoreanNameInput: bindKoreanNameInput,
    sanitizeKoreanName: sanitizeKoreanName,
    validateKoreanName: validateKoreanName,
    normalizeBirthYmd: normalizeBirthYmd,
    validateBirthYmd: validateBirthYmd,
    isValidEmail: isValidEmail,
    isValidPassword: isValidPassword,
    validateRosterCodes: validateRosterCodes,
    NATIONALITY_VALUES: NATIONALITY_VALUES,
    FIRST_LANGUAGE_VALUES: FIRST_LANGUAGE_VALUES,
    normalizeNationality: normalizeNationality,
    normalizeFirstLanguage: normalizeFirstLanguage
  };
})();
