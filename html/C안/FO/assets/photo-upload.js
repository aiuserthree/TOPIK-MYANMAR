/* TOPIK Myanmar — 증명사진 업로드 · 규격 안내 (프로토타입) */
(function () {
  'use strict';

  var MAX_BYTES = 2 * 1024 * 1024;
  var ACCEPT = ['image/jpeg', 'image/jpg', 'image/png'];
  var SPEC_MODAL_ID = 'modalPhotoSpec';

  var SPEC_HTML =
    '<ul class="photo-spec-list">' +
      '<li>여권용 · 정면 촬영 · JPG·PNG 형식</li>' +
      '<li>3:4 비율 (35×45mm 권장), 최대 2MB</li>' +
      '<li>6개월 이내 촬영한 컬러 사진 (흑백 불가)</li>' +
      '<li>흰 배경, 표정 자연스럽게, 상반신 정면</li>' +
      '<li>모자·선글라스·앞머리로 얼굴이 가려지지 않음</li>' +
      '<li>연예인·타인 사진이 아닌 본인 사진</li>' +
      '<li>시험 당일 신분증과 동일인 식별 가능</li>' +
    '</ul>' +
    '<p class="photo-spec-note">부적합 사진은 사진 심사에서 반려될 수 있습니다. 접수 단계에서는 사진 변경이 불가하므로 가입·수정 시 신중히 등록해 주세요.</p>';

  function ensureSpecModal() {
    if (document.getElementById(SPEC_MODAL_ID)) return;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = SPEC_MODAL_ID;
    wrap.innerHTML =
      '<div class="modal modal-photo-spec" role="dialog" aria-modal="true" aria-labelledby="photoSpecTitle">' +
        '<div class="modal-head"><h3 id="photoSpecTitle">증명사진 규격 안내</h3></div>' +
        '<div class="modal-body">' + SPEC_HTML + '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn btn-primary" data-photo-spec-close>확인</button>' +
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
    if (!file) return '파일을 선택해 주세요.';
    var type = (file.type || '').toLowerCase();
    if (ACCEPT.indexOf(type) === -1 && !/\.(jpe?g|png)$/i.test(file.name || '')) {
      return 'JPG·PNG 형식만 업로드할 수 있습니다.';
    }
    if (file.size > MAX_BYTES) return '파일 크기는 2MB 이하여야 합니다.';
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
      '<img src="' + dataUrl + '" alt="증명사진 미리보기">' +
      (fileName ? '<span class="photo-file-meta">' + fileName + ' · ' + formatSize(fileSize) + '</span>' : '');
  }

  function clearPreview(previewEl, placeholder) {
    if (!previewEl) return;
    previewEl.classList.remove('has-photo');
    previewEl.innerHTML = placeholder || '사진<br>미리보기';
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
      previewEl.title = '클릭하여 파일 선택';
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
