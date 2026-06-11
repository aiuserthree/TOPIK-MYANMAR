/* TOPIK Myanmar — 증명사진 업로드 · 규격 안내 (프로토타입) */
(function () {
  'use strict';

  var MAX_BYTES = 2 * 1024 * 1024;
  var ACCEPT = ['image/jpeg', 'image/jpg', 'image/png'];
  var SPEC_MODAL_ID = 'modalPhotoSpec';

  // i18n 헬퍼 — 중앙 사전(TPKMLang.t) 사용, 미정의 시 KO 폴백
  function pt(key, fallback) {
    try {
      if (window.TPKMBt && typeof TPKMBt.bt === 'function') {
        var btVal = TPKMBt.bt(key, fallback);
        if (btVal) return btVal;
      }
      if (window.TPKMLang && typeof TPKMLang.t === 'function') {
        var v = TPKMLang.t(key);
        if (v) return v;
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  // 「연명부 및 사진제출 안내.xlsx」 기준 규격 — 여권용 정면 jpg, 금지사진 안내
  function specHtml() {
    var lines = [
      pt('photo.spec_1', '여권용 정면 컬러 사진 (JPG) · 흰색·단색 배경'),
      pt('photo.spec_2', '최근 6개월 이내 촬영한 사진'),
      pt('photo.spec_3', '모자·학사모·선글라스·이어폰 착용 금지'),
      pt('photo.spec_4', '앞머리로 얼굴(눈썹·눈)을 가리지 않음'),
      pt('photo.spec_5', '위·아래·좌·우가 아닌 정면 사진'),
      pt('photo.spec_6', '흑백·흐릿·불분명한 사진 불가'),
      pt('photo.spec_7', '연예인·타인 등 본인이 아닌 사진 불가'),
      pt('photo.spec_filename', '파일명은 접수 후 시스템이 수험번호로 자동 관리합니다.')
    ];
    return '<ul class="photo-spec-list">' +
      lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') +
      '</ul>' +
      '<p class="photo-spec-note">' +
      pt('photo.spec_note', '부적합 사진은 사진 심사에서 반려되어 응시·성적 처리가 불가할 수 있습니다. 접수 단계에서는 사진 변경이 불가하므로 가입·수정 시 신중히 등록해 주세요.') +
      '</p>';
  }

  function ensureSpecModal() {
    var existing = document.getElementById(SPEC_MODAL_ID);
    if (existing) {
      // 언어 전환 후 재오픈 시 내용 갱신
      var head = existing.querySelector('#photoSpecTitle');
      var body = existing.querySelector('.modal-body');
      if (head) head.textContent = pt('photo.spec_title', '증명사진 규격 안내');
      if (body) body.innerHTML = specHtml();
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = SPEC_MODAL_ID;
    wrap.innerHTML =
      '<div class="modal modal-photo-spec" role="dialog" aria-modal="true" aria-labelledby="photoSpecTitle">' +
        '<div class="modal-head"><h3 id="photoSpecTitle">' + pt('photo.spec_title', '증명사진 규격 안내') + '</h3></div>' +
        '<div class="modal-body">' + specHtml() + '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn btn-primary" data-photo-spec-close>' + pt('btn.confirm', '확인') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-photo-spec-close]')) {
        window.TPKM.closeModal(SPEC_MODAL_ID);
      }
    });
  }

  function openSpecModal() {
    ensureSpecModal();
    window.TPKM.openModal(SPEC_MODAL_ID);
  }

  function validateFile(file) {
    if (!file) return pt('photo.err_select', '파일을 선택해 주세요.');
    var type = (file.type || '').toLowerCase();
    if (ACCEPT.indexOf(type) === -1 && !/\.(jpe?g|png)$/i.test(file.name || '')) {
      return pt('photo.err_type', 'JPG·PNG 형식만 업로드할 수 있습니다.');
    }
    if (file.size > MAX_BYTES) return pt('photo.err_size', '파일 크기는 2MB 이하여야 합니다.');
    return '';
  }

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  function setPreview(previewEl, dataUrl, fileName, fileSize) {
    if (!previewEl) return;
    previewEl.classList.add('has-photo');
    previewEl.innerHTML =
      '<img src="' + dataUrl + '" alt="' + pt('photo.preview_alt', '증명사진 미리보기') + '">' +
      (fileName ? '<span class="photo-file-meta">' + fileName + ' · ' + formatSize(fileSize) + '</span>' : '');
  }

  function clearPreview(previewEl, placeholder) {
    if (!previewEl) return;
    previewEl.classList.remove('has-photo');
    previewEl.innerHTML = placeholder || pt('photo.preview', '사진<br>미리보기');
  }

  function showError(zone, msg) {
    var err = zone.querySelector('.photo-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'photo-error';
      zone.appendChild(err);
    }
    err.textContent = msg;
    err.hidden = !msg;
  }

  function bind(opts) {
    var zone = opts.zone;
    var previewEl = zone.querySelector(opts.previewSelector || '.photo-preview, .ph-prev');
    var selectBtn = zone.querySelector(opts.selectSelector || '[data-photo-select]');
    var specBtn = zone.querySelector(opts.specSelector || '[data-photo-spec]');
    var placeholder = opts.placeholder || previewEl.innerHTML;
    var input = zone.querySelector('input[type="file"]');
    var state = { dataUrl: '', file: null };

    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/jpg';
      input.hidden = true;
      zone.appendChild(input);
    }

    if (selectBtn) {
      selectBtn.addEventListener('click', function () { input.click(); });
    }
    if (previewEl) {
      previewEl.style.cursor = 'pointer';
      previewEl.title = pt('photo.click_select', '클릭하여 파일 선택');
      previewEl.addEventListener('click', function () { input.click(); });
    }
    if (specBtn) {
      specBtn.addEventListener('click', openSpecModal);
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var err = validateFile(file);
      if (err) {
        showError(zone, err);
        input.value = '';
        if (typeof opts.onError === 'function') opts.onError(err);
        return;
      }
      showError(zone, '');
      var reader = new FileReader();
      reader.onload = function (ev) {
        state.dataUrl = String(ev.target.result || '');
        state.file = file;
        setPreview(previewEl, state.dataUrl, file.name, file.size);
        if (typeof opts.onChange === 'function') opts.onChange(state);
      };
      reader.readAsDataURL(file);
    });

    function restorePreviewFromState() {
      if (!state.dataUrl) return;
      var file = state.file;
      setPreview(previewEl, state.dataUrl, file && file.name, file && file.size);
    }

    document.addEventListener('tpkm:langchange', restorePreviewFromState);

    return {
      getState: function () { return state; },
      reset: function () {
        state = { dataUrl: '', file: null };
        input.value = '';
        clearPreview(previewEl, placeholder);
        showError(zone, '');
      },
      setDataUrl: function (url) {
        if (!url) { this.reset(); return; }
        state.dataUrl = url;
        state.file = null;
        setPreview(previewEl, url);
      }
    };
  }

  window.TPKMPhoto = {
    openSpecModal: openSpecModal,
    validateFile: validateFile,
    bind: bind
  };
})();
