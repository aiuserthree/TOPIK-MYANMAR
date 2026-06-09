/* FO 게시판(문의·환불) — API 작성 + 목록 + 상세 + 첨부파일 + 비밀글 잠금해제 */
(function () {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nl2br(s) {
    return esc(s).replace(/\n/g, '<br>');
  }

  // i18n 헬퍼 — TOPIKPageI18n / TPKMLang, 미정의 시 KO 폴백
  function bt(key, fallback) {
    try {
      var lang = (window.TPKMLang && TPKMLang.get) ? TPKMLang.get() : 'KO';
      if (window.TOPIKPageI18n && typeof TOPIKPageI18n.text === 'function') {
        var t1 = TOPIKPageI18n.text(key, lang);
        if (t1) return t1;
      }
      if (window.TPKMLang && typeof TPKMLang.t === 'function') {
        var t2 = TPKMLang.t(key);
        if (t2) return t2;
      }
    } catch (e) { /* ignore */ }
    return fallback;
  }
  function btf(key, fallback, n) {
    return bt(key, fallback).replace('{n}', n);
  }

  var STATUS_CLASS = {
    received: 'status-applied',
    in_review: 'status-photo',
    awaiting_reply: 'status-photo',
    answered: 'status-approved',
    completed: 'status-approved',
    rejected: 'status-rejected',
  };
  function statusClass(ws) {
    return STATUS_CLASS[ws] || 'status-applied';
  }

  function currentUserName() {
    try {
      var u = window.TopikApi && TopikApi.getUser && TopikApi.getUser();
      return (u && (u.name_ko || u.name)) || bt('board.mine', '본인');
    } catch (e) {
      return bt('board.mine', '본인');
    }
  }

  function fmtSize(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
  }

  // -------------------------------------------------------------------------
  // 첨부파일 (jpg/png/pdf, ≤5MB) — 선택 즉시 업로드, 글 작성 시 file_id 전송
  // -------------------------------------------------------------------------
  var ATTACH_MAX_BYTES = 5 * 1024 * 1024;
  var ATTACH_EXT = /\.(jpe?g|png|pdf)$/i;
  var ATTACH_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

  function validateAttachment(file) {
    var type = (file.type || '').toLowerCase();
    if (ATTACH_TYPES.indexOf(type) === -1 && !ATTACH_EXT.test(file.name || '')) {
      return bt('board.file_type', 'jpg, png, pdf 형식만 첨부할 수 있습니다.');
    }
    if (file.size > ATTACH_MAX_BYTES) {
      return bt('board.file_too_big', '파일 크기는 5MB 이하여야 합니다.');
    }
    return '';
  }

  function bindAttachments(opts) {
    opts = opts || {};
    var input = opts.input;
    var listEl = opts.listEl;
    var max = opts.max || 5;
    if (!input || !listEl) return null;
    var items = []; // { id, file, fileId, status: 'uploading'|'done'|'error', name, size, error }
    var seq = 0;

    function render() {
      if (!items.length) { listEl.innerHTML = ''; return; }
      listEl.innerHTML = items.map(function (it) {
        var statusHtml = '';
        if (it.status === 'uploading') {
          statusHtml = '<span class="att-status att-uploading">' + esc(bt('board.uploading', '업로드 중…')) + '</span>';
        } else if (it.status === 'error') {
          statusHtml = '<span class="att-status att-error">' + esc(it.error || bt('board.upload_fail', '업로드 실패')) + '</span>';
        } else {
          statusHtml = '<span class="att-status att-done">✓</span>';
        }
        return (
          '<div class="att-chip" data-att-id="' + it.id + '">' +
            '<span class="att-name">' + esc(it.name) + '</span>' +
            '<span class="att-size">' + esc(fmtSize(it.size)) + '</span>' +
            statusHtml +
            '<button type="button" class="att-remove" data-att-remove="' + it.id +
            '" aria-label="' + esc(bt('board.file_remove', '삭제')) + '">×</button>' +
        '</div>'
        );
      }).join('');
      listEl.querySelectorAll('[data-att-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = Number(b.getAttribute('data-att-remove'));
          items = items.filter(function (x) { return x.id !== id; });
          render();
        });
      });
    }

    function uploadOne(it) {
      if (!window.TopikApi || !TopikApi.uploadBoardAttachment) {
        it.status = 'error';
        it.error = bt('board.server_err', '서버에 연결할 수 없습니다.');
        render();
        return;
      }
      TopikApi.uploadBoardAttachment(it.file).then(function (res) {
        if (res.ok && res.body && (res.body.file_id != null)) {
          it.status = 'done';
          it.fileId = res.body.file_id;
        } else {
          it.status = 'error';
          it.error = TopikApi.parseError(res) || bt('board.upload_fail', '업로드 실패');
        }
        render();
      }).catch(function () {
        it.status = 'error';
        it.error = bt('board.network_err', '네트워크 오류입니다.');
        render();
      });
    }

    input.addEventListener('change', function () {
      var files = input.files ? Array.prototype.slice.call(input.files) : [];
      files.forEach(function (file) {
        if (items.length >= max) {
          alert(btf('board.max_files', '첨부파일은 최대 {n}개까지 가능합니다.', max));
          return;
        }
        var err = validateAttachment(file);
        if (err) { alert(err); return; }
        var it = {
          id: ++seq, file: file, fileId: null, status: 'uploading',
          name: file.name || 'file', size: file.size, error: ''
        };
        items.push(it);
        render();
        uploadOne(it);
      });
      input.value = '';
    });

    return {
      getFileIds: function () {
        return items.filter(function (it) { return it.status === 'done' && it.fileId != null; })
          .map(function (it) { return it.fileId; });
      },
      hasPending: function () {
        return items.some(function (it) { return it.status === 'uploading'; });
      },
      count: function () { return items.length; },
      reset: function () { items = []; render(); }
    };
  }

  function attachmentsDetailHtml(attachments) {
    if (!attachments || !attachments.length) return '';
    var rows = attachments.map(function (a) {
      var url = a.url || (window.TopikApi && TopikApi.fileUrl ? TopikApi.fileUrl(a.file_id) : '');
      var name = esc(a.filename || ('file-' + a.file_id));
      var size = a.size ? ' <span class="att-size">(' + esc(fmtSize(a.size)) + ')</span>' : '';
      if (!url) return '<li><span class="att-name">' + name + '</span>' + size + '</li>';
      return '<li><a href="' + esc(url) + '" target="_blank" rel="noopener" download>' +
        name + '</a>' + size + '</li>';
    }).join('');
    return (
      '<div class="board-attachments">' +
        '<h4>' + esc(bt('board.attachments', '첨부파일')) + '</h4>' +
        '<ul class="att-detail-list">' + rows + '</ul>' +
      '</div>'
    );
  }

  // -------------------------------------------------------------------------
  // 댓글/대댓글 (스레드)
  // -------------------------------------------------------------------------
  function adminBadge(isAdmin) {
    return isAdmin
      ? ' <span class="badge badge-info" style="height:18px; padding:0 6px; font-size:10px;">' +
        esc(bt('board.admin', '관리자')) + '</span>'
      : '';
  }

  function countComments(list) {
    var n = 0;
    (list || []).forEach(function (c) {
      n += 1 + ((c.replies && c.replies.length) || 0);
    });
    return n;
  }

  function commentNodeHtml(c, isReply) {
    var lock = c.is_secret ? '<span class="lock">🔒</span> ' : '';
    var head =
      '<div class="c-head">' + lock +
        '<span class="author">' + esc(c.author) + '</span>' + adminBadge(c.is_admin) +
        '<span>·</span><span>' + esc(c.created_at_label || '') + '</span>' +
      '</div>';
    var bodyHtml = '<div class="c-body">' + nl2br(c.body) + '</div>';
    if (isReply) {
      return '<div class="comment reply" data-id="' + c.id + '">' + head + bodyHtml + '</div>';
    }
    var actions =
      '<div class="c-actions"><a href="javascript:void(0)" data-reply-toggle="' + c.id + '">' +
      esc(bt('board.reply', '답글')) + '</a></div>';
    var html = '<div class="comment" data-id="' + c.id + '">' + head + bodyHtml + actions + '</div>';
    (c.replies || []).forEach(function (r) {
      html += commentNodeHtml(r, true);
    });
    html +=
      '<div class="reply-form-wrap" data-for="' + c.id + '">' +
        '<div class="reply-form-inner">' +
          '<textarea placeholder="' + esc(bt('board.reply_ph', '답글을 입력하세요')) + '"></textarea>' +
          '<div class="btn-wrap">' +
            '<button class="btn btn-primary btn-sm" data-reply-submit="' + c.id + '">' +
              esc(bt('board.post', '등록')) + '</button>' +
            '<button class="btn btn-secondary btn-sm" data-reply-cancel="' + c.id + '">' +
              esc(bt('btn.cancel', '취소')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return html;
  }

  function buildCommentsHtml(list) {
    var canWrite = !!(window.TopikApi && TopikApi.isLoggedIn && TopikApi.isLoggedIn());
    var html =
      '<h4>' + esc(bt('board.comments', '댓글')) + ' <span style="color:var(--text-3);font-weight:500;">' +
      countComments(list) + '</span></h4>';
    if (!list || !list.length) {
      html += '<p style="color:var(--text-3);font-size:13px;padding:8px 0 4px;">' +
        esc(bt('board.no_comments', '아직 등록된 댓글이 없습니다.')) + '</p>';
    } else {
      list.forEach(function (c) { html += commentNodeHtml(c, false); });
    }
    if (canWrite) {
      html +=
        '<div class="comment-write">' +
          '<textarea placeholder="' + esc(bt('board.comment_ph', '댓글을 입력하세요')) +
          '" data-comment-input></textarea>' +
          '<button class="btn btn-primary" data-comment-submit>' + esc(bt('board.post', '등록')) + '</button>' +
        '</div>';
    } else {
      html +=
        '<p style="color:var(--text-3);font-size:13px;padding:8px 0;">' +
        esc(bt('board.login_to_comment', '댓글을 작성하려면 로그인이 필요합니다.')) + '</p>';
    }
    return html;
  }

  function postComment(postId, body, parentId, btn, reload) {
    var text = (body || '').trim();
    if (!text) { alert(bt('board.enter_comment', '댓글 내용을 입력해 주세요.')); return; }
    if (!window.TopikApi || !TopikApi.createBoardComment) return;
    var prev = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = bt('board.posting', '등록 중…'); }
    TopikApi.createBoardComment(postId, {
      body: text,
      parent_comment_id: parentId != null ? parentId : null,
    }).then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = prev; }
      if (!res.ok) { alert(TopikApi.parseError(res)); return; }
      reload();
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = prev; }
      alert(bt('board.network_err', '네트워크 오류입니다.'));
    });
  }

  function wireComments(box, postId, reload) {
    var submitBtn = box.querySelector('[data-comment-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var ta = box.querySelector('[data-comment-input]');
        postComment(postId, ta ? ta.value : '', null, submitBtn, reload);
      });
    }
    box.querySelectorAll('[data-reply-toggle]').forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-reply-toggle');
        var wrap = box.querySelector('.reply-form-wrap[data-for="' + id + '"]');
        if (!wrap) return;
        var opening = !wrap.classList.contains('open');
        box.querySelectorAll('.reply-form-wrap.open').forEach(function (w) { w.classList.remove('open'); });
        if (opening) {
          wrap.classList.add('open');
          var ta = wrap.querySelector('textarea');
          if (ta) ta.focus();
        }
      });
    });
    box.querySelectorAll('[data-reply-cancel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var wrap = b.closest('.reply-form-wrap');
        if (wrap) wrap.classList.remove('open');
      });
    });
    box.querySelectorAll('[data-reply-submit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-reply-submit'));
        var wrap = b.closest('.reply-form-wrap');
        var ta = wrap ? wrap.querySelector('textarea') : null;
        postComment(postId, ta ? ta.value : '', id, b, reload);
      });
    });
  }

  // -------------------------------------------------------------------------
  // 작성(공통)
  // -------------------------------------------------------------------------
  function wireSubmit(opts) {
    var btn = opts.submitBtn;
    if (!btn || !window.TopikApi) return;

    btn.addEventListener('click', function () {
      if (!TopikApi.canUseApi()) {
        alert(bt('board.server_err', '서버에 연결할 수 없습니다.'));
        return;
      }
      if (!TopikApi.isLoggedIn()) {
        location.href =
          'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop());
        return;
      }

      var title = (opts.titleEl && opts.titleEl.value.trim()) || '';
      var body = (opts.bodyEl && opts.bodyEl.value.trim()) || '';
      var category = opts.categoryEl ? opts.categoryEl.value.trim() : '';
      // refund-correction: 유형(환불/정보정정) 라디오를 category 로 사용
      if (!category && typeof opts.resolveCategory === 'function') {
        category = opts.resolveCategory() || '';
      }
      var isSecret = opts.forceSecret
        ? true
        : (opts.secretRadio ? opts.secretRadio.checked : false);

      if (!title || title.length > 100) {
        alert(bt('board.title_len', '제목을 100자 이내로 입력해 주세요.'));
        return;
      }
      if (!body || body.length < 10) {
        alert(bt('board.body_len', '내용을 10자 이상 입력해 주세요.'));
        return;
      }

      // 비밀글 비밀번호 (작성 시) — 페이지가 secretPwEl 을 제공하면 사용
      var secretPassword = '';
      if (isSecret && opts.secretPwEl) {
        secretPassword = (opts.secretPwEl.value || '').trim();
        if (!secretPassword || secretPassword.length < 4) {
          alert(bt('board.write_pw', '비밀글 비밀번호를 4자 이상 입력해 주세요.'));
          return;
        }
      }

      // 첨부파일 업로드 진행 중이면 대기
      var attachmentIds = [];
      if (opts.attachmentCtrl) {
        if (opts.attachmentCtrl.hasPending()) {
          alert(bt('board.upload_wait', '파일 업로드가 끝날 때까지 기다려 주세요.'));
          return;
        }
        attachmentIds = opts.attachmentCtrl.getFileIds();
      }

      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = bt('board.submitting', '제출 중…');

      var payload = {
        board_type: opts.boardType,
        title: title,
        body: body,
        category: category || null,
        is_secret: isSecret,
        attachment_file_ids: attachmentIds,
      };
      if (isSecret && secretPassword) payload.secret_password = secretPassword;

      TopikApi.createBoardPost(payload).then(function (res) {
        btn.disabled = false;
        btn.textContent = prev;
        if (!res.ok) {
          alert(TopikApi.parseError(res));
          return;
        }
        alert((res.body && res.body.message) || bt('board.submitted', '접수되었습니다.'));
        // 입력값 초기화
        if (opts.titleEl) opts.titleEl.value = '';
        if (opts.bodyEl) opts.bodyEl.value = '';
        if (opts.secretPwEl) opts.secretPwEl.value = '';
        if (opts.attachmentCtrl) opts.attachmentCtrl.reset();
        if (opts.onSuccess) opts.onSuccess();
        else if (opts.listPaneId && window.show) window.show(opts.listPaneId);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = prev;
        alert(bt('board.network_err', '네트워크 오류입니다.'));
      });
    });
  }

  function isPostLocked(p) {
    if (!p) return false;
    return (p.locked != null) ? !!p.locked : !!p.is_secret_to_viewer;
  }

  function getDeepLinkPostId() {
    try {
      var id = new URLSearchParams(location.search).get('id');
      if (id) return String(id);
      var hash = (location.hash || '').replace(/^#/, '');
      if (!hash) return null;
      if (/^\d+$/.test(hash)) return hash;
      var m = hash.match(/^(?:post-)?(\d+)$/i);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function clearDetailDeepLink() {
    try {
      if (history.replaceState) {
        var u = new URL(location.href);
        u.searchParams.delete('id');
        var h = u.hash.replace(/^#/, '');
        if (h && (/^\d+$/.test(h) || /^(?:post-)?\d+$/i.test(h))) u.hash = '';
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch (e) { /* ignore */ }
  }

  // 언어 전환 시 상세 댓글 등 동적 영역 갱신용
  var boardInstances = [];
  var langHooked = false;

  function hookLangRefresh() {
    if (langHooked) return;
    langHooked = true;
    function refreshAll() {
      boardInstances.forEach(function (inst) {
        if (inst.isListActive && inst.isListActive() && inst.state.items.length) inst.renderList();
        if (inst.isDetailActive && inst.isDetailActive()) inst.refreshDetailI18n();
      });
    }
    document.addEventListener('tpkm:langchange', refreshAll);
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.lang-toggle button');
      if (!btn) return;
      setTimeout(refreshAll, 0);
    });
  }

  // -------------------------------------------------------------------------
  // 목록 + 상세 + 비밀글 잠금해제
  // -------------------------------------------------------------------------
  function initBoard(opts) {
    hookLangRefresh();
    var listBody = opts.listBody;
    var pager = opts.pager;
    var colspan = opts.colspan || 6;
    var d = opts.detail || {};
    var show = opts.show || window.show || function () {};
    var secretModalId = opts.secretModalId || 'modalSecretLock';

    var state = {
      page: 1,
      items: [],
      pagination: null,
      filter: null,
      activePostId: null,
      activePost: null,
      commentsCache: null,
    };
    var deepLinkConsumed = false;
    var listPaneId = opts.listPaneId || 'listPane';
    var pendingUnlockId = null;

    function findListItem(id) {
      var sid = String(id);
      for (var i = 0; i < state.items.length; i++) {
        if (String(state.items[i].id) === sid) return state.items[i];
      }
      return null;
    }

    function showListPane() {
      state.activePostId = null;
      state.activePost = null;
      state.commentsCache = null;
      show(listPaneId);
    }

    function renderComments(postId) {
      var box = d.comments;
      if (!box) return;
      box.innerHTML =
        '<h4>' + esc(bt('board.comments', '댓글')) + '</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">' +
        esc(bt('board.loading', '불러오는 중…')) + '</p>';
      if (!window.TopikApi || !TopikApi.getBoardComments) { box.innerHTML = ''; return; }
      TopikApi.getBoardComments(postId).then(function (res) {
        if (!res.ok) {
          box.innerHTML =
            '<h4>' + esc(bt('board.comments', '댓글')) + '</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">' +
            esc(TopikApi.parseError(res)) + '</p>';
          return;
        }
        var list = (res.body && res.body.comments) || [];
        state.commentsCache = list;
        box.innerHTML = buildCommentsHtml(list);
        wireComments(box, postId, function () { renderComments(postId); });
      }).catch(function () {
        box.innerHTML =
          '<h4>' + esc(bt('board.comments', '댓글')) + '</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">' +
          esc(bt('board.network_err', '네트워크 오류입니다.')) + '</p>';
      });
    }

    function emptyRow(msg) {
      return (
        '<tr><td colspan="' + colspan +
        '" style="text-align:center;padding:32px;color:var(--text-3);">' +
        esc(msg) + '</td></tr>'
      );
    }

    function visibleItems() {
      if (typeof state.filter === 'function') {
        return state.items.filter(state.filter);
      }
      return state.items;
    }

    function renderList() {
      var items = visibleItems();
      if (!items.length) {
        listBody.innerHTML = emptyRow(bt('board.empty', '등록된 게시글이 없습니다.'));
        return;
      }
      var total = (state.pagination && state.pagination.total_items) || items.length;
      var pageSize = (state.pagination && state.pagination.page_size) || items.length;
      var startNo = total - (state.page - 1) * pageSize;
      var typeCell = opts.typeCell || function () { return '<span class="badge badge-outline">-</span>'; };

      listBody.innerHTML = items.map(function (p, idx) {
        var locked = (p.locked != null) ? p.locked : p.is_secret_to_viewer;
        var lock = locked ? '<span class="lock">🔒</span> ' : '';
        var author = p.is_mine ? bt('board.mine', '본인') : (p.author_name || '—');
        return (
          '<tr data-id="' + p.id + '"' + (locked ? ' data-locked="1"' : '') + '>' +
          '<td class="col-num">' + esc(startNo - idx) + '</td>' +
          '<td class="' + (opts.typeCellClass || 'col-cat') + '">' + typeCell(p) + '</td>' +
          '<td>' + lock + esc(p.title) + '</td>' +
          '<td class="col-author">' + esc(author) + '</td>' +
          '<td class="col-date">' + esc(p.date_formatted) + '</td>' +
          '<td class="col-status"><span class="status ' + statusClass(p.workflow_status) +
          '">' + esc(p.status_label) + '</span></td>' +
          '</tr>'
        );
      }).join('');

      listBody.querySelectorAll('tr[data-id]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          if (tr.getAttribute('data-locked') === '1') {
            openSecretModal(tr.getAttribute('data-id'));
            return;
          }
          openDetail(tr.getAttribute('data-id'));
        });
      });
    }

    function renderPager() {
      if (!pager) return;
      var pg = state.pagination;
      if (!pg || pg.total_pages <= 1) { pager.innerHTML = ''; return; }
      var html = '';
      html += pg.page > 1
        ? '<a href="javascript:void(0)" data-page="' + (pg.page - 1) + '">‹</a>'
        : '<span class="disabled">‹</span>';
      for (var i = 1; i <= pg.total_pages; i++) {
        html += i === pg.page
          ? '<span class="current">' + i + '</span>'
          : '<a href="javascript:void(0)" data-page="' + i + '">' + i + '</a>';
      }
      html += pg.page < pg.total_pages
        ? '<a href="javascript:void(0)" data-page="' + (pg.page + 1) + '">›</a>'
        : '<span class="disabled">›</span>';
      pager.innerHTML = html;
      pager.querySelectorAll('a[data-page]').forEach(function (a) {
        a.addEventListener('click', function () {
          load(Number(a.getAttribute('data-page')));
        });
      });
    }

    function load(page) {
      state.page = page || 1;
      listBody.innerHTML = emptyRow(bt('board.loading', '불러오는 중…'));
      if (pager) pager.innerHTML = '';
      if (!window.TopikApi || !TopikApi.canUseApi()) {
        listBody.innerHTML = emptyRow(bt('board.server_err', '서버에 연결할 수 없습니다.'));
        return;
      }
      TopikApi.getBoardPosts(opts.boardType, { page: state.page }).then(function (res) {
        if (!res.ok) {
          if (res.status === 401) {
            location.href = 'login.html?next=' +
              encodeURIComponent(location.pathname.split('/').pop());
            return;
          }
          listBody.innerHTML = emptyRow(TopikApi.parseError(res));
          return;
        }
        state.items = (res.body && res.body.items) || [];
        state.pagination = (res.body && res.body.pagination) || null;
        renderList();
        renderPager();
        if (!deepLinkConsumed) {
          deepLinkConsumed = true;
          var deepId = getDeepLinkPostId();
          if (deepId) {
            var cached = findListItem(deepId);
            if (cached && isPostLocked(cached)) openSecretModal(deepId);
            else openDetail(deepId);
          }
        }
      }).catch(function () {
        listBody.innerHTML = emptyRow(bt('board.network_err', '네트워크 오류입니다.'));
      });
    }

    function isDetailActive() {
      var pane = document.getElementById(opts.detailPaneId || 'detailPane');
      return pane && pane.classList.contains('active');
    }

    function isListActive() {
      var pane = document.getElementById(listPaneId);
      return pane && pane.classList.contains('active');
    }

    function refreshCommentsI18n() {
      if (!d.comments || state.activePostId == null) return;
      if (state.commentsCache !== null) {
        d.comments.innerHTML = buildCommentsHtml(state.commentsCache);
        wireComments(d.comments, state.activePostId, function () { renderComments(state.activePostId); });
        return;
      }
      if (d.comments.querySelector('h4')) {
        d.comments.innerHTML = buildCommentsHtml([]);
        wireComments(d.comments, state.activePostId, function () { renderComments(state.activePostId); });
      }
    }

    function refreshDetailI18n() {
      if (!isDetailActive()) return;
      var p = state.activePost;
      if (p && d.meta) {
        var secret = (p.is_secret && !p.is_mine)
          ? '<span>·</span><span>🔒 ' + esc(bt('board.secret_label', '비밀글')) + '</span>' : '';
        d.meta.innerHTML =
          '<span>' + esc(p.author_name || currentUserName()) + '</span>' +
          '<span>·</span><span>' + esc(p.date_formatted) + '</span>' + secret;
      }
      refreshCommentsI18n();
    }

    // 상세 렌더 — 글 객체(p)를 받아 상세 영역을 채운다. (조회 / 잠금해제 공용)
    function renderPostDetail(p, id) {
      state.activePostId = id;
      state.activePost = p;
      state.commentsCache = null;
      show(opts.detailPaneId || 'detailPane');
      if (d.title) d.title.textContent = p.title;
      if (d.badge) {
        var label = p.category || p.post_type || bt('board.qna_default', '문의');
        d.badge.textContent = label;
        d.badge.className = opts.detailBadgeClass
          ? opts.detailBadgeClass(p)
          : 'badge badge-outline';
      }
      if (d.status) {
        d.status.className = 'status ' + statusClass(p.workflow_status);
        d.status.textContent = p.status_label || '';
      }
      if (d.meta) {
        var secret = (p.is_secret && !p.is_mine)
          ? '<span>·</span><span>🔒 ' + esc(bt('board.secret_label', '비밀글')) + '</span>' : '';
        d.meta.innerHTML =
          '<span>' + esc(p.author_name || currentUserName()) + '</span>' +
          '<span>·</span><span>' + esc(p.date_formatted) + '</span>' + secret;
      }
      if (d.body) {
        d.body.innerHTML = '<p>' + nl2br(p.body) + '</p>' + attachmentsDetailHtml(p.attachments);
      }
      if (d.reply) {
        if (p.admin_reply) {
          d.reply.style.display = '';
          if (d.replyBody) d.replyBody.innerHTML = nl2br(p.admin_reply);
          if (d.replyWhen) {
            d.replyWhen.textContent = p.admin_replied_at
              ? new Date(p.admin_replied_at).toLocaleDateString('ko-KR')
              : '';
          }
        } else {
          d.reply.style.display = 'none';
        }
      }
      if (d.comments) renderComments(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetDetail() {
      if (d.title) d.title.textContent = bt('board.loading', '불러오는 중…');
      if (d.body) d.body.innerHTML = '<p style="color:var(--text-3);">' + esc(bt('board.loading', '불러오는 중…')) + '</p>';
      if (d.reply) d.reply.style.display = 'none';
      if (d.badge) d.badge.textContent = '';
      if (d.status) { d.status.textContent = ''; d.status.className = 'status'; }
      if (d.meta) d.meta.innerHTML = '';
      if (d.comments) d.comments.innerHTML = '';
    }

    function openDetail(id) {
      var cached = findListItem(id);
      if (cached && isPostLocked(cached)) {
        openSecretModal(id);
        return;
      }
      show(opts.detailPaneId || 'detailPane');
      resetDetail();

      TopikApi.getBoardPost(id).then(function (res) {
        if (!res.ok) {
          if (d.title) d.title.textContent = bt('board.load_fail', '게시글을 불러올 수 없습니다');
          if (d.body) d.body.innerHTML = '<p>' + esc(TopikApi.parseError(res)) + '</p>';
          return;
        }
        var p = res.body;
        if (p.locked) {
          showListPane();
          openSecretModal(id);
          return;
        }
        renderPostDetail(p, id);
      }).catch(function () {
        if (d.title) d.title.textContent = bt('board.load_fail', '게시글을 불러올 수 없습니다');
        if (d.body) d.body.innerHTML = '<p>' + esc(bt('board.network_err', '네트워크 오류입니다.')) + '</p>';
      });
    }

    // ---- 비밀글 잠금해제 모달 ----
    var modal = document.getElementById(secretModalId);
    var pwInput = modal ? modal.querySelector('#secretPw, input[type="password"]') : null;
    var pwErr = modal ? modal.querySelector('#secretPwErr') : null;
    var unlockBtn = modal ? modal.querySelector('#btnSecretUnlock, .modal-foot .btn-primary') : null;

    function setUnlockErr(msg) {
      if (!pwErr) { if (msg) alert(msg); return; }
      pwErr.textContent = msg || '';
      pwErr.style.display = msg ? 'block' : 'none';
    }

    function openSecretModal(id) {
      pendingUnlockId = id;
      clearDetailDeepLink();
      if (!modal) {
        alert(bt('board.locked_msg', '비밀글입니다. 작성자·관리자만 열람할 수 있습니다.'));
        showListPane();
        return;
      }
      if (pwInput) pwInput.value = '';
      setUnlockErr('');
      if (window.TPKM && TPKM.openModal) TPKM.openModal(secretModalId);
      else modal.classList.add('open');
      if (pwInput) setTimeout(function () { pwInput.focus(); }, 50);
    }

    function submitUnlock() {
      if (!pendingUnlockId) { return; }
      var pw = pwInput ? (pwInput.value || '').trim() : '';
      if (!pw) { setUnlockErr(bt('board.unlock_enter_pw', '비밀번호를 입력해 주세요.')); return; }
      if (!window.TopikApi || !TopikApi.unlockBoardPost) {
        setUnlockErr(bt('board.server_err', '서버에 연결할 수 없습니다.'));
        return;
      }
      var prev = unlockBtn ? unlockBtn.textContent : '';
      if (unlockBtn) { unlockBtn.disabled = true; unlockBtn.textContent = bt('board.unlocking', '확인 중…'); }
      TopikApi.unlockBoardPost(pendingUnlockId, pw).then(function (res) {
        if (unlockBtn) { unlockBtn.disabled = false; unlockBtn.textContent = prev; }
        if (res.ok && res.body) {
          var id = pendingUnlockId;
          pendingUnlockId = null;
          if (window.TPKM && TPKM.closeModal) TPKM.closeModal(secretModalId);
          else if (modal) modal.classList.remove('open');
          renderPostDetail(res.body, id);
          return;
        }
        var body = res.body || {};
        var code = (body.error && body.error.code) || '';
        if (res.status === 423 || res.status === 429 || code === 'LOCKED' || body.locked) {
          setUnlockErr(bt('board.unlock_locked', '비밀번호를 여러 번 잘못 입력하여 일시적으로 잠겼습니다. 잠시 후 다시 시도해 주세요.'));
          return;
        }
        var left = (body.attempts_left != null) ? body.attempts_left
          : (body.error && body.error.attempts_left);
        if (left != null) {
          setUnlockErr(btf('board.unlock_wrong_left', '비밀번호가 일치하지 않습니다. (남은 횟수 {n}회)', left));
        } else {
          setUnlockErr(bt('board.unlock_wrong', '비밀번호가 일치하지 않습니다.'));
        }
      }).catch(function () {
        if (unlockBtn) { unlockBtn.disabled = false; unlockBtn.textContent = prev; }
        setUnlockErr(bt('board.network_err', '네트워크 오류입니다.'));
      });
    }

    if (unlockBtn) {
      unlockBtn.addEventListener('click', submitUnlock);
    }
    if (pwInput) {
      pwInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitUnlock(); }
      });
    }

    function setFilter(fn) {
      state.filter = fn;
      renderList();
    }

    boardInstances.push({
      state: state,
      isListActive: isListActive,
      isDetailActive: isDetailActive,
      renderList: renderList,
      refreshDetailI18n: refreshDetailI18n,
    });

    return {
      load: load,
      openDetail: openDetail,
      setFilter: setFilter,
      reload: function () { load(state.page); },
      refreshI18n: refreshDetailI18n,
    };
  }

  window.TPKMBoard = {
    wireSubmit: wireSubmit,
    initBoard: initBoard,
    statusClass: statusClass,
    bindAttachments: bindAttachments,
  };
})();
