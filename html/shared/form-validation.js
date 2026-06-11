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

  window.TPKMValidate = {
    MIN_SIGNUP_AGE_YEARS: MIN_SIGNUP_AGE_YEARS,
    bindDigitsOnlyInput: bindDigitsOnlyInput,
    normalizeBirthYmd: normalizeBirthYmd,
    validateBirthYmd: validateBirthYmd,
    isValidEmail: isValidEmail,
    isValidPassword: isValidPassword,
    validateRosterCodes: validateRosterCodes
  };
})();
