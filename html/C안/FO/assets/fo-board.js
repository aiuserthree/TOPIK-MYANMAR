/* FO 게시판(문의·환불) — API 작성 + 목록 + 상세 */
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
      return (u && (u.name_ko || u.name)) || '본인';
    } catch (e) {
      return '본인';
    }
  }

  // -------------------------------------------------------------------------
  // 댓글/대댓글 (스레드)
  // -------------------------------------------------------------------------
  function adminBadge(isAdmin) {
    return isAdmin
      ? ' <span class="badge badge-info" style="height:18px; padding:0 6px; font-size:10px;">관리자</span>'
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
      '<div class="c-actions"><a href="javascript:void(0)" data-reply-toggle="' + c.id + '">답글</a></div>';
    var html = '<div class="comment" data-id="' + c.id + '">' + head + bodyHtml + actions + '</div>';
    (c.replies || []).forEach(function (r) {
      html += commentNodeHtml(r, true);
    });
    html +=
      '<div class="reply-form-wrap" data-for="' + c.id + '">' +
        '<div class="reply-form-inner">' +
          '<textarea placeholder="답글을 입력하세요"></textarea>' +
          '<div class="btn-wrap">' +
            '<button class="btn btn-primary btn-sm" data-reply-submit="' + c.id + '">등록</button>' +
            '<button class="btn btn-secondary btn-sm" data-reply-cancel="' + c.id + '">취소</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return html;
  }

  function buildCommentsHtml(list) {
    var canWrite = !!(window.TopikApi && TopikApi.isLoggedIn && TopikApi.isLoggedIn());
    var html =
      '<h4>댓글 <span style="color:var(--text-3);font-weight:500;">' +
      countComments(list) + '</span></h4>';
    if (!list || !list.length) {
      html += '<p style="color:var(--text-3);font-size:13px;padding:8px 0 4px;">아직 등록된 댓글이 없습니다.</p>';
    } else {
      list.forEach(function (c) { html += commentNodeHtml(c, false); });
    }
    if (canWrite) {
      html +=
        '<div class="comment-write">' +
          '<textarea placeholder="댓글을 입력하세요" data-comment-input></textarea>' +
          '<button class="btn btn-primary" data-comment-submit>등록</button>' +
        '</div>';
    } else {
      html +=
        '<p style="color:var(--text-3);font-size:13px;padding:8px 0;">댓글을 작성하려면 로그인이 필요합니다.</p>';
    }
    return html;
  }

  function postComment(postId, body, parentId, btn, reload) {
    var text = (body || '').trim();
    if (!text) { alert('댓글 내용을 입력해 주세요.'); return; }
    if (!window.TopikApi || !TopikApi.createBoardComment) return;
    var prev = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '등록 중…'; }
    TopikApi.createBoardComment(postId, {
      body: text,
      parent_comment_id: parentId != null ? parentId : null,
    }).then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = prev; }
      if (!res.ok) { alert(TopikApi.parseError(res)); return; }
      reload();
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = prev; }
      alert('네트워크 오류입니다.');
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
        alert('서버에 연결할 수 없습니다.');
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
        alert('제목을 100자 이내로 입력해 주세요.');
        return;
      }
      if (!body || body.length < 10) {
        alert('내용을 10자 이상 입력해 주세요.');
        return;
      }

      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = '제출 중…';

      TopikApi.createBoardPost({
        board_type: opts.boardType,
        title: title,
        body: body,
        category: category || null,
        is_secret: isSecret,
      }).then(function (res) {
        btn.disabled = false;
        btn.textContent = prev;
        if (!res.ok) {
          alert(TopikApi.parseError(res));
          return;
        }
        alert(res.body.message || '접수되었습니다.');
        // 입력값 초기화
        if (opts.titleEl) opts.titleEl.value = '';
        if (opts.bodyEl) opts.bodyEl.value = '';
        if (opts.onSuccess) opts.onSuccess();
        else if (opts.listPaneId && window.show) window.show(opts.listPaneId);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = prev;
        alert('네트워크 오류입니다.');
      });
    });
  }

  var LOCKED_ALERT_MSG = '비밀글입니다. 작성자만 열람할 수 있습니다.';

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

  // -------------------------------------------------------------------------
  // 목록 + 상세
  // -------------------------------------------------------------------------
  function initBoard(opts) {
    var listBody = opts.listBody;
    var pager = opts.pager;
    var colspan = opts.colspan || 6;
    var d = opts.detail || {};
    var show = opts.show || window.show || function () {};

    var state = { page: 1, items: [], pagination: null, filter: null };
    var deepLinkConsumed = false;
    var listPaneId = opts.listPaneId || 'listPane';

    function findListItem(id) {
      var sid = String(id);
      for (var i = 0; i < state.items.length; i++) {
        if (String(state.items[i].id) === sid) return state.items[i];
      }
      return null;
    }

    function showListPane() {
      show(listPaneId);
    }

    function alertLockedAndStayOnList() {
      alert(LOCKED_ALERT_MSG);
      showListPane();
      clearDetailDeepLink();
    }

    function renderComments(postId) {
      var box = d.comments;
      if (!box) return;
      box.innerHTML =
        '<h4>댓글</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">불러오는 중…</p>';
      if (!window.TopikApi || !TopikApi.getBoardComments) { box.innerHTML = ''; return; }
      TopikApi.getBoardComments(postId).then(function (res) {
        if (!res.ok) {
          box.innerHTML =
            '<h4>댓글</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">' +
            esc(TopikApi.parseError(res)) + '</p>';
          return;
        }
        var list = (res.body && res.body.comments) || [];
        box.innerHTML = buildCommentsHtml(list);
        wireComments(box, postId, function () { renderComments(postId); });
      }).catch(function () {
        box.innerHTML =
          '<h4>댓글</h4><p style="color:var(--text-3);font-size:13px;padding:8px 0;">네트워크 오류입니다.</p>';
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
        listBody.innerHTML = emptyRow('등록된 게시글이 없습니다.');
        return;
      }
      var total = (state.pagination && state.pagination.total_items) || items.length;
      var pageSize = (state.pagination && state.pagination.page_size) || items.length;
      var startNo = total - (state.page - 1) * pageSize;
      var typeCell = opts.typeCell || function () { return '<span class="badge badge-outline">-</span>'; };

      listBody.innerHTML = items.map(function (p, idx) {
        var locked = (p.locked != null) ? p.locked : p.is_secret_to_viewer;
        var lock = locked ? '<span class="lock">🔒</span> ' : '';
        var author = p.is_mine ? '본인' : (p.author_name || '—');
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
            alert(LOCKED_ALERT_MSG);
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
      listBody.innerHTML = emptyRow('불러오는 중…');
      if (pager) pager.innerHTML = '';
      if (!window.TopikApi || !TopikApi.canUseApi()) {
        listBody.innerHTML = emptyRow('서버에 연결할 수 없습니다.');
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
          if (deepId) openDetail(deepId);
        }
      }).catch(function () {
        listBody.innerHTML = emptyRow('네트워크 오류입니다.');
      });
    }

    function openDetail(id) {
      var cached = findListItem(id);
      if (cached && isPostLocked(cached)) {
        alertLockedAndStayOnList();
        return;
      }
      show(opts.detailPaneId || 'detailPane');
      if (d.title) d.title.textContent = '불러오는 중…';
      if (d.body) d.body.innerHTML = '<p style="color:var(--text-3);">로딩 중입니다.</p>';
      if (d.reply) d.reply.style.display = 'none';
      if (d.badge) d.badge.textContent = '';
      if (d.status) { d.status.textContent = ''; d.status.className = 'status'; }
      if (d.meta) d.meta.innerHTML = '';
      if (d.comments) d.comments.innerHTML = '';

      TopikApi.getBoardPost(id).then(function (res) {
        if (!res.ok) {
          if (d.title) d.title.textContent = '게시글을 불러올 수 없습니다';
          if (d.body) d.body.innerHTML = '<p>' + esc(TopikApi.parseError(res)) + '</p>';
          return;
        }
        var p = res.body;
        if (p.locked) {
          alertLockedAndStayOnList();
          return;
        }
        if (d.title) d.title.textContent = p.title;
        if (d.badge) {
          var label = p.category || p.post_type || '문의';
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
          // 본인 글은 비밀글이어도 잠금 표식을 보이지 않는다.
          var secret = (p.is_secret && !p.is_mine) ? '<span>·</span><span>🔒 비밀글</span>' : '';
          d.meta.innerHTML =
            '<span>' + esc(p.author_name || currentUserName()) + '</span>' +
            '<span>·</span><span>' + esc(p.date_formatted) + '</span>' + secret;
        }
        if (d.body) d.body.innerHTML = '<p>' + nl2br(p.body) + '</p>';
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
      }).catch(function () {
        if (d.title) d.title.textContent = '게시글을 불러올 수 없습니다';
        if (d.body) d.body.innerHTML = '<p>네트워크 오류입니다.</p>';
      });
    }

    function setFilter(fn) {
      state.filter = fn;
      renderList();
    }

    return {
      load: load,
      openDetail: openDetail,
      setFilter: setFilter,
      reload: function () { load(state.page); },
    };
  }

  window.TPKMBoard = {
    wireSubmit: wireSubmit,
    initBoard: initBoard,
    statusClass: statusClass,
  };
})();
