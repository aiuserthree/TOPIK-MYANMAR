/* BO 공지사항 — 리치 텍스트 에디터(Quill) + 첨부파일 업로드 */
(function (global) {
  "use strict";

  var MAX_FILES = 5;
  var MAX_BYTES = 10 * 1024 * 1024;
  var ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|pdf|docx?|xlsx?|pptx?|hwp|hwpx|txt|zip|csv)$/i;
  var INLINE_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;
  var FILE_ID_PATH_RE = /\/api\/v1\/(?:admin\/)?files\/(\d+)/;

  function fmtSize(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function validateAttachment(file) {
    if (!file) return "파일을 선택해 주세요.";
    var name = file.name || "";
    if (!ALLOWED_EXT.test(name)) {
      return "이미지(jpg, png, gif, webp 등) 또는 문서(pdf, doc, docx, xls, xlsx, ppt, pptx, hwp, txt, zip 등)만 첨부할 수 있습니다.";
    }
    if (file.size > MAX_BYTES) {
      return "파일 크기는 10MB 이하여야 합니다.";
    }
    return "";
  }

  function validateInlineImage(file) {
    if (!file) return "이미지를 선택해 주세요.";
    var name = file.name || "";
    if (!INLINE_IMAGE_EXT.test(name)) {
      return "jpg, png, gif, webp, bmp 이미지만 본문에 삽입할 수 있습니다.";
    }
    if (file.size > MAX_BYTES) {
      return "이미지 크기는 10MB 이하여야 합니다.";
    }
    return "";
  }

  function fileIdFromSrc(src) {
    if (!src) return null;
    var m = FILE_ID_PATH_RE.exec(String(src));
    return m ? Number(m[1]) : null;
  }

  /** BO 편집 미리보기용 — 저장된 /files/{id} URL을 인증 가능한 admin URL로 변환 */
  function htmlForEditor(html) {
    if (!html || !global.TopikBoApi || !TopikBoApi.fileUrl) return html || "";
    return String(html).replace(/<img([^>]*?)src=["']([^"']+)["']/gi, function (full, attrs, src) {
      var id = fileIdFromSrc(src);
      if (!id) return full;
      var url = TopikBoApi.fileUrl(id);
      return '<img' + attrs + 'src="' + url + '" data-file-id="' + id + '"';
    });
  }

  /** 저장용 — admin/token URL을 안정적인 /api/v1/files/{id} 상대 경로로 정규화 */
  function htmlForSave(html) {
    if (!html) return "";
    return String(html).replace(/<img([^>]*?)src=["']([^"']+)["']/gi, function (full, attrs, src) {
      var id = fileIdFromSrc(src);
      if (!id) return full;
      var cleanAttrs = String(attrs).replace(/\s*data-file-id=["'][^"']*["']/gi, "");
      return '<img' + cleanAttrs + 'src="/api/v1/files/' + id + '"';
    });
  }

  function collectInlineFileIds(html) {
    var ids = [];
    if (!html) return ids;
    String(html).replace(/<img[^>]+>/gi, function (tag) {
      var srcM = /src=["']([^"']+)["']/i.exec(tag);
      var dataM = /data-file-id=["'](\d+)["']/i.exec(tag);
      var id = dataM ? Number(dataM[1]) : fileIdFromSrc(srcM && srcM[1]);
      if (id && ids.indexOf(id) === -1) ids.push(id);
      return tag;
    });
    return ids;
  }

  function clearQuillHost(container) {
    if (!container) return;
    var parent = container.parentNode;
    container.innerHTML = "";
    if (parent) {
      Array.prototype.slice.call(parent.childNodes).forEach(function (node) {
        if (node !== container && node.nodeType === 1 && node.classList && node.classList.contains("ql-toolbar")) {
          parent.removeChild(node);
        }
      });
    }
  }

  /**
   * Quill 에디터 마운트 (한 번만 호출 — 언어 탭 전환 시 setHtml 사용).
   * opts: { uploadImageFn }
   * @returns {{ getHtml, setHtml, destroy, getInlineImageFileIds }}
   */
  function mountRichEditor(container, initialHtml, opts) {
    opts = opts || {};
    if (!container) return null;
    if (!global.Quill) {
      container.innerHTML = '<p style="color:var(--text-3);font-size:12.5px">에디터를 불러오지 못했습니다.</p>';
      return null;
    }
    clearQuillHost(container);
    var quill = new global.Quill(container, {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          ["blockquote"],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["link", "image"],
          ["clean"],
        ],
      },
      placeholder: "본문을 입력하세요.",
    });

    var toolbar = quill.getModule("toolbar");
    if (toolbar) {
      toolbar.addHandler("image", function () {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".jpg,.jpeg,.png,.gif,.webp,.bmp,image/jpeg,image/png,image/gif,image/webp,image/bmp";
        input.onchange = function () {
          var file = input.files && input.files[0];
          input.value = "";
          if (!file) return;
          var err = validateInlineImage(file);
          if (err) {
            alert(err);
            return;
          }
          var range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
          if (opts.uploadImageFn) {
            opts.uploadImageFn(file).then(function (res) {
              if (!res.ok || !res.body || res.body.file_id == null) {
                alert((global.TopikBoApi && TopikBoApi.parseError(res)) || "이미지 업로드에 실패했습니다.");
                return;
              }
              var fileId = res.body.file_id;
              var url = global.TopikBoApi && TopikBoApi.fileUrl
                ? TopikBoApi.fileUrl(fileId)
                : "/api/v1/files/" + fileId;
              quill.insertEmbed(range.index, "image", url);
              var imgs = quill.root.querySelectorAll("img");
              var img = imgs.length ? imgs[imgs.length - 1] : null;
              if (img) img.setAttribute("data-file-id", String(fileId));
              quill.setSelection(range.index + 1);
            }).catch(function () {
              alert("네트워크 오류입니다.");
            });
            return;
          }
          var blobUrl = URL.createObjectURL(file);
          quill.insertEmbed(range.index, "image", blobUrl);
          quill.setSelection(range.index + 1);
        };
        input.click();
      });
    }

    if (initialHtml) {
      quill.clipboard.dangerouslyPasteHTML(htmlForEditor(initialHtml));
    }
    return {
      getHtml: function () {
        var html = quill.root.innerHTML;
        if (html === "<p><br></p>") return "";
        return htmlForSave(html);
      },
      setHtml: function (html) {
        quill.clipboard.dangerouslyPasteHTML(htmlForEditor(html || ""));
      },
      getInlineImageFileIds: function () {
        return collectInlineFileIds(quill.root.innerHTML);
      },
      destroy: function () {
        clearQuillHost(container);
      },
    };
  }

  /**
   * 첨부파일 UI 바인딩.
   * opts: { input, listEl, existing, uploadFn, max }
   * @returns {{ getNewFileIds, getRemoveFileIds, hasPending, count, reset }}
   */
  function bindNoticeAttachments(opts) {
    opts = opts || {};
    var input = opts.input;
    var listEl = opts.listEl;
    var max = opts.max || MAX_FILES;
    var uploadFn = opts.uploadFn;
    if (!input || !listEl) return null;

    var seq = 0;
    var items = [];

    (opts.existing || []).forEach(function (a) {
      items.push({
        id: ++seq,
        fileId: a.file_id || a.fileId,
        name: a.filename || a.name || "file",
        size: a.size || 0,
        status: "done",
        existing: true,
        removed: false,
        error: "",
      });
    });

    function activeCount() {
      return items.filter(function (it) { return !it.removed; }).length;
    }

    function render() {
      var visible = items.filter(function (it) { return !it.removed; });
      if (!visible.length) {
        listEl.innerHTML = '<div class="bo-att-hint">첨부파일 없음 (최대 ' + max + '개 · 파일당 10MB)</div>';
        return;
      }
      listEl.innerHTML = visible.map(function (it) {
        var statusHtml = "";
        if (it.status === "uploading") {
          statusHtml = '<span class="bo-att-status uploading">업로드 중…</span>';
        } else if (it.status === "error") {
          statusHtml = '<span class="bo-att-status error">' + esc(it.error || "업로드 실패") + "</span>";
        } else {
          statusHtml = '<span class="bo-att-status done">✓</span>';
        }
        var dl = "";
        if (it.existing && it.fileId && global.TopikBoApi && TopikBoApi.downloadFile) {
          dl = '<button type="button" class="bo-att-dl" data-att-dl="' + it.id + '" title="다운로드">↓</button>';
        }
        return (
          '<div class="bo-att-chip" data-att-id="' + it.id + '">' +
            '<span class="bo-att-name" title="' + esc(it.name) + '">' + esc(it.name) + "</span>" +
            '<span class="bo-att-size">' + esc(fmtSize(it.size)) + "</span>" +
            statusHtml +
            dl +
            '<button type="button" class="bo-att-remove" data-att-remove="' + it.id + '" aria-label="삭제">×</button>' +
          "</div>"
        );
      }).join("");

      listEl.querySelectorAll("[data-att-remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.getAttribute("data-att-remove"));
          items = items.map(function (it) {
            if (it.id !== id) return it;
            return Object.assign({}, it, { removed: true });
          });
          render();
        });
      });

      listEl.querySelectorAll("[data-att-dl]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.getAttribute("data-att-dl"));
          var it = items.find(function (x) { return x.id === id; });
          if (it && it.fileId && global.TopikBoApi) {
            TopikBoApi.downloadFile(it.fileId, it.name);
          }
        });
      });
    }

    function uploadOne(it) {
      if (!uploadFn) {
        it.status = "done";
        it.fileId = "local-" + it.id;
        render();
        return;
      }
      uploadFn(it.file).then(function (res) {
        if (res.ok && res.body && res.body.file_id != null) {
          it.status = "done";
          it.fileId = res.body.file_id;
        } else {
          it.status = "error";
          it.error = (global.TopikBoApi && TopikBoApi.parseError(res)) || "업로드 실패";
        }
        render();
      }).catch(function () {
        it.status = "error";
        it.error = "네트워크 오류입니다.";
        render();
      });
    }

    input.addEventListener("change", function () {
      var files = input.files ? Array.prototype.slice.call(input.files) : [];
      files.forEach(function (file) {
        if (activeCount() >= max) {
          alert("첨부파일은 최대 " + max + "개까지 가능합니다.");
          return;
        }
        var err = validateAttachment(file);
        if (err) {
          alert(err);
          return;
        }
        var it = {
          id: ++seq,
          file: file,
          fileId: null,
          name: file.name || "file",
          size: file.size,
          status: uploadFn ? "uploading" : "done",
          existing: false,
          removed: false,
          error: "",
        };
        items.push(it);
        render();
        uploadOne(it);
      });
      input.value = "";
    });

    render();

    return {
      getNewFileIds: function () {
        return items
          .filter(function (it) { return !it.removed && !it.existing && it.status === "done" && it.fileId != null; })
          .map(function (it) { return it.fileId; })
          .filter(function (id) { return typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id)); })
          .map(function (id) { return Number(id); });
      },
      getRemoveFileIds: function () {
        return items
          .filter(function (it) { return it.removed && it.existing && it.fileId != null; })
          .map(function (it) { return Number(it.fileId); });
      },
      hasPending: function () {
        return items.some(function (it) { return !it.removed && it.status === "uploading"; });
      },
      count: function () { return activeCount(); },
      reset: function () { items = []; render(); },
    };
  }

  global.BoNoticeEditor = {
    MAX_FILES: MAX_FILES,
    MAX_BYTES: MAX_BYTES,
    fmtSize: fmtSize,
    validateAttachment: validateAttachment,
    validateInlineImage: validateInlineImage,
    collectInlineFileIds: collectInlineFileIds,
    mountRichEditor: mountRichEditor,
    bindNoticeAttachments: bindNoticeAttachments,
  };
})(window);
