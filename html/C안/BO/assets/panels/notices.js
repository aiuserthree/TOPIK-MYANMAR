/* ============================================================
   panels/notices.js — 공지사항 관리 (vanilla port of notices.jsx)
   고객사 수정 0527: 신규 게시 시 마케팅수신동의자 이메일 일괄 발송
   0604: 본문 WYSIWYG 에디터(Quill 2.x) + 본문 이미지 삽입 + 게시물 첨부파일
   ============================================================ */

const NOTICE_CATS = ['중요','접수','시험','결과'];

// 본문 이미지 업로드 허용 형식 / 첨부파일 허용 형식
const NT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp';
const NT_FILE_ACCEPT =
  NT_IMAGE_ACCEPT +
  ',application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip,.txt,.csv';

function ntFileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(fr.result); };
    fr.onerror = function () { reject(fr.error); };
    fr.readAsDataURL(file);
  });
}

function ntFmtSize(bytes) {
  var b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ------------------------------------------------------------------
   NoticeBodyEditor — Quill WYSIWYG mounted imperatively.
   The host <div> is a vdom leaf with NO managed children, so the BO
   runtime's full-tree re-render never touches Quill's internal DOM.
   Keyed by language in the parent → switching language remounts with
   the right initial HTML; cleanup persists the final HTML.
------------------------------------------------------------------ */
function NoticeBodyEditor({ initialHtml, onChange, uploadImage, apiRef }) {
  const hostRef = useRef(null);

  useEffect(function () {
    const host = hostRef.current;
    if (!host) return;
    if (!window.Quill) {
      host.innerHTML =
        '<div style="padding:14px;border:1px solid var(--border,#dbe0e6);border-radius:6px;' +
        'color:var(--danger,#d8345f);font-size:13px;">에디터(Quill)를 불러오지 못했습니다. ' +
        '네트워크 상태를 확인한 뒤 새로고침해 주세요.</div>';
      return;
    }

    const inner = document.createElement('div');
    host.appendChild(inner);

    const quill = new window.Quill(inner, {
      theme: 'snow',
      placeholder: '본문을 입력하세요. 이미지 · 표 · 링크 삽입이 가능합니다.',
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ align: [] }],
            ['link', 'image'],
            ['blockquote', 'code-block'],
            ['clean'],
          ],
          handlers: { image: imageHandler },
        },
      },
    });

    function getHTML() {
      var html;
      try { html = quill.getSemanticHTML(); }
      catch (e) { html = quill.root.innerHTML; }
      if (html === '<p></p>' || html === '<p><br></p>') return '';
      return html;
    }

    if (initialHtml) {
      try {
        const delta = quill.clipboard.convert({ html: initialHtml });
        quill.setContents(delta, 'silent');
      } catch (e) {
        quill.root.innerHTML = initialHtml;
      }
    }

    if (apiRef) apiRef.current = { getHTML: getHTML };

    quill.on('text-change', function () {
      if (onChange) onChange(getHTML());
    });

    function imageHandler() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = NT_IMAGE_ACCEPT;
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return;
        host.classList.add('is-busy');
        Promise.resolve(uploadImage(file)).then(function (url) {
          host.classList.remove('is-busy');
          if (!url) return;
          const range = quill.getSelection(true) || { index: quill.getLength() };
          quill.insertEmbed(range.index, 'image', url, 'user');
          quill.setSelection(range.index + 1, 0, 'user');
          if (onChange) onChange(getHTML());
        }).catch(function () {
          host.classList.remove('is-busy');
        });
      };
      input.click();
    }

    return function cleanup() {
      // Persist final HTML for this language before tearing down.
      try { if (onChange) onChange(getHTML()); } catch (e) { /* ignore */ }
      if (apiRef) apiRef.current = null;
      try { host.innerHTML = ''; } catch (e) { /* ignore */ }
    };
  }, []);

  return h('div', { className: 'notice-editor-host', ref: hostRef });
}

function NoticesPanelInner() {
  const state = useStore();
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('all');
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let r = state.notices.slice();
    if (catF !== 'all') r = r.filter(n => n.cat === catF);
    if (q) r = r.filter(n => n.title.toLowerCase().includes(q.toLowerCase()));
    return r.sort((a,b) => (b.pin?1:0) - (a.pin?1:0) || (b.createdAt||'').localeCompare(a.createdAt||''));
  }, [state.notices, q, catF]);

  const save = async (data) => {
    const payload = {
      category: BoData.NOTICE_L2C[data.cat] || 'registration',
      title: (data.title || '').trim(),
      body_html: data.body || '',
      is_pinned: !!data.pin,
    };
    setBusy(true);
    try {
      let noticeId = data.apiId;
      const orig = data.apiId ? state.notices.find(x => x.id === data.id) : null;
      const wasPublic = !!(orig && orig.public);
      if (data.apiId) {
        const res = await TopikBoApi.updateNotice(data.apiId, payload);
        if (!res.ok) { toastErr(TopikBoApi.parseError(res)); setBusy(false); return; }
        if (orig && orig.public !== data.public) {
          const pres = data.public
            ? await TopikBoApi.publishNotice(data.apiId)
            : await TopikBoApi.unpublishNotice(data.apiId);
          if (!pres.ok) { toastErr(TopikBoApi.parseError(pres)); setBusy(false); return; }
        }
      } else {
        const res = await TopikBoApi.createNotice(Object.assign({ is_published: !!data.public }, payload));
        if (!res.ok) { toastErr(TopikBoApi.parseError(res)); setBusy(false); return; }
        noticeId = res.body && res.body.id;
      }

      // 첨부파일: 삭제 → 추가
      let attachErr = null;
      const removed = data._removedAttachmentIds || [];
      const added = data._newAttachments || [];
      if (noticeId) {
        for (let i = 0; i < removed.length; i++) {
          const r = await TopikBoApi.deleteNoticeAttachment(noticeId, removed[i]);
          if (!r.ok) attachErr = TopikBoApi.parseError(r);
        }
        for (let j = 0; j < added.length; j++) {
          const a = added[j];
          const r = await TopikBoApi.uploadNoticeAttachment(noticeId, a.dataUrl, a.name, a.mime);
          if (!r.ok) attachErr = TopikBoApi.parseError(r);
        }
      }

      await BoData.reload('notices');

      let marketingErr = null;
      if (noticeId && !!data.public && !wasPublic) {
        const mres = await TopikBoApi.sendNoticeMarketing(noticeId);
        if (!mres.ok) marketingErr = TopikBoApi.parseError(mres);
      }

      setBusy(false);
      setEdit(null);
      if (attachErr) toastErr('공지는 저장되었으나 일부 첨부파일 처리에 실패했습니다: ' + attachErr);
      else if (marketingErr) toastOk((data.apiId ? '공지가 수정되었습니다.' : '공지가 등록되었습니다.') + ' (마케팅 알림 발송 실패: ' + marketingErr + ')');
      else if (noticeId && !!data.public && !wasPublic) toastOk((data.apiId ? '공지가 수정·게시되었습니다.' : '공지가 등록·게시되었습니다.') + ' · 마케팅 동의 회원에 알림이 발송됩니다.');
      else toastOk(data.apiId ? '공지가 수정되었습니다.' : '공지가 등록되었습니다.');
    } catch (e) {
      setBusy(false);
      toastErr('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const remove = () => {
    const n = state.notices.find(x => x.id === delId);
    if (!n) return;
    setBusy(true);
    TopikBoApi.deleteNotice(n.apiId).then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); setBusy(false); return; }
      BoData.reload('notices').then(() => { setDelId(null); setBusy(false); toastOk('공지가 삭제되었습니다.'); });
    });
  };

  return h(Fragment, null,
    h('div', { className: 'panel-head' },
      h('div', null,
        h('h1', null, '공지사항 관리'),
        h('div', { className: 'sub' }, 'FO 공지사항과 직접 연동 · 신규 게시 시 마케팅 동의 회원에 이메일 알림 발송')
      ),
      h('div', { className: 'actions' },
        h('button', { className: 'btn btn-primary', onClick: () => setEdit({ new: true }) },
          h(I.Plus, { style: { width: 14, height: 14 } }), ' 공지 작성'
        )
      )
    ),

    h('div', { className: 'filterbar' },
      h('div', { className: 'chips' },
        h('button', { className: `chip ${catF === 'all' ? 'active' : ''}`, onClick: () => setCatF('all') },
          '전체', h('span', { className: 'cnt' }, state.notices.length)
        ),
        NOTICE_CATS.map(c => h('button', { key: c, className: `chip ${catF === c ? 'active' : ''}`, onClick: () => setCatF(c) },
          c, h('span', { className: 'cnt' }, state.notices.filter(n => n.cat === c).length)
        ))
      ),
      h('div', { className: 'controls' },
        h('input', { className: 'input search', placeholder: '제목 검색', value: q, onChange: e => setQ(e.target.value) })
      )
    ),

    h('div', { className: 'dg-wrap' },
      h('div', { className: 'dg-scroll' },
        h('table', { className: 'dg' },
          h('thead', null,
            h('tr', null,
              h('th', { className: 'num' }, '번호'),
              h('th', null, '카테고리'),
              h('th', null, '제목'),
              h('th', null, '작성자'),
              h('th', null, '작성일'),
              h('th', { className: 'num' }, '조회'),
              h('th', null, '노출'),
              h('th', null, '관리')
            )
          ),
          h('tbody', null,
            filtered.map((n, idx) => {
              const no = n.pin ? '—' : String(filtered.length - idx);
              return h('tr', { key: n.id },
              h('td', { className: 'num' }, no),
              h('td', null, h('span', { className: `pill pill-${n.cat === '중요' ? 'rejected' : 'applied'}` }, n.cat)),
              h('td', null, n.pin && h(I.Bookmark, { style: { width: 12, height: 12, color: 'var(--accent)', display: 'inline', verticalAlign: '-2px', marginRight: 4 } }), h('b', null, n.title)),
              h('td', { className: 'muted' }, n.author),
              h('td', { className: 'code muted' }, n.createdAt),
              h('td', { className: 'num muted' }, DataStore.fmtNum(n.views)),
              h('td', null, h(Pill, { kind: n.public ? 'active' : 'inactive' }, n.public ? '공개' : '비공개')),
              h('td', null,
                h('div', { className: 'row-actions' },
                  h('button', { className: 'ibtn', onClick: () => setEdit({ id: n.id }) }, h(I.Edit, { style: { width: 12, height: 12 } })),
                  h('button', { className: 'ibtn danger', onClick: () => setDelId(n.id) }, h(I.Trash, { style: { width: 12, height: 12 } }))
                )
              )
            );
            })
          )
        )
      )
    ),

    edit && h(NoticeEditLP, { edit: edit, onClose: () => setEdit(null), onSave: save }),
    delId && h(Modal, {
      open: true, onClose: () => setDelId(null), title: '공지 삭제', danger: true,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: () => setDelId(null) }, '취소'),
        h('button', { className: 'btn btn-danger', onClick: remove }, '삭제')
      )
    },
      h('div', null, '공지를 삭제하시겠습니까? 30일 동안 휴지통에 보관됩니다(soft-delete).')
    )
  );
}

function NoticeEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const n = edit.id ? state.notices.find(x => x.id === edit.id) : null;
  const isNew = !n;
  const [f, setF] = useState(n ? { ...n } : {
    cat: '접수', title: '', titleMy: '', titleEn: '',
    public: true, pin: false, showStart: '', showEnd: ''
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = (f.title || '').trim();

  // 본문 HTML(언어별)은 폼 state가 아닌 ref에 보관 → 타이핑이 vdom 재렌더를 유발하지 않음
  const bodiesRef = useRef({ KO: '', MY: '', EN: '' });
  const editorApiRef = useRef(null);
  const fileInputRef = useRef(null);

  const [loaded, setLoaded] = useState(!(n && n.apiId)); // 기존 공지는 본문 로드 후 true
  const [att, setAtt] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // 기존 공지 본문(body_html) + 첨부파일 로드
  useEffect(() => {
    if (n && n.apiId) {
      TopikBoApi.getNotice(n.apiId).then(res => {
        if (res.ok && res.body) bodiesRef.current.KO = res.body.body_html || '';
        setLoaded(true);
      });
      TopikBoApi.listNoticeAttachments(n.apiId).then(res => {
        if (res.ok && res.body && res.body.items) {
          setAtt(res.body.items.map(it => ({
            fileId: it.id, name: it.filename, size: it.size, mime: it.mime,
            isNew: false, removed: false,
          })));
        }
      });
    }
  }, []);

  // 다국어(KO/MY/EN) 입력 — KO 필수, MY/EN 선택
  const [lang, setLang] = useState('KO');
  const titleKey = lang === 'KO' ? 'title' : lang === 'MY' ? 'titleMy' : 'titleEn';
  const titlePh  = lang === 'KO' ? '예) 제106회 TOPIK 접수 안내' : lang === 'MY' ? 'ဥပမာ - ၁၀၆ ကြိမ်မြောက် TOPIK လျှောက်ထားရန်' : 'e.g. 106th TOPIK Application Guide';

  const uploadImage = (file) => {
    return ntFileToDataUrl(file).then(function (dataUrl) {
      return TopikBoApi.uploadNoticeImage(dataUrl, file.name, file.type).then(function (res) {
        if (!res.ok) { toastErr('이미지 업로드 실패: ' + TopikBoApi.parseError(res)); return null; }
        return res.body && res.body.url;
      });
    }).catch(function () {
      toastErr('이미지를 읽는 중 오류가 발생했습니다.');
      return null;
    });
  };

  const onPickFiles = (fileList) => {
    const arr = Array.prototype.slice.call(fileList || []);
    if (!arr.length) return;
    setAtt(prev => prev.concat(arr.map(file => ({
      name: file.name, size: file.size, mime: file.type,
      isNew: true, file: file, removed: false,
      tempId: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
    }))));
  };

  const toggleRemoveAt = (i) => {
    setAtt(prev => {
      const copy = prev.slice();
      const it = copy[i];
      if (!it) return prev;
      if (it.isNew) { copy.splice(i, 1); }
      else { copy[i] = Object.assign({}, it, { removed: !it.removed }); }
      return copy;
    });
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // 현재 언어의 최종 본문을 캡처 (text-change로 이미 동기화되지만 안전망)
      if (editorApiRef.current && editorApiRef.current.getHTML) {
        bodiesRef.current[lang] = editorApiRef.current.getHTML();
      }
      const _newAttachments = [];
      for (let i = 0; i < att.length; i++) {
        const a = att[i];
        if (a.isNew && !a.removed) {
          const dataUrl = await ntFileToDataUrl(a.file);
          _newAttachments.push({ name: a.name, mime: a.mime, dataUrl: dataUrl });
        }
      }
      const _removedAttachmentIds = att
        .filter(a => !a.isNew && a.removed)
        .map(a => a.fileId);

      await onSave(Object.assign({}, f, {
        body: bodiesRef.current.KO,
        bodyMy: bodiesRef.current.MY,
        bodyEn: bodiesRef.current.EN,
        _newAttachments: _newAttachments,
        _removedAttachmentIds: _removedAttachmentIds,
      }));
    } catch (e) {
      toastErr('저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return h(LP, {
    open: true, title: n ? `공지 수정 — ${n.title}` : '공지 작성', onClose: onClose, size: 'wide',
    footer: h(Fragment, null,
      h('button', { className: 'btn btn-secondary', onClick: onClose }, '취소'),
      h('button', { className: 'btn btn-primary', disabled: !valid || submitting, onClick: submit }, n ? '저장' : '게시')
    )
  },
    h(FieldSet, { legend: '기본 정보', cols: 2 },
      h(FormRow, { label: '카테고리', required: true },
        h('select', { className: 'select', value: f.cat, onChange: e => set('cat', e.target.value) },
          NOTICE_CATS.map(c => h('option', { key: c }, c))
        )
      ),
      h(FormRow, { label: '옵션' },
        h('div', { style: { display: 'flex', gap: 16, alignItems: 'center', height: 38 } },
          h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 } },
            h('input', { type: 'checkbox', checked: f.public, onChange: e => set('public', e.target.checked) }), ' 공개'
          ),
          h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 } },
            h('input', { type: 'checkbox', checked: f.pin, onChange: e => set('pin', e.target.checked) }), ' 상단 고정'
          )
        )
      ),
      h(FormRow, { label: '노출 시작' },
        h('input', { type: 'datetime-local', className: 'input', value: f.showStart, onChange: e => set('showStart', e.target.value) })
      ),
      h(FormRow, { label: '노출 종료' },
        h('input', { type: 'datetime-local', className: 'input', value: f.showEnd, onChange: e => set('showEnd', e.target.value) })
      )
    ),

    h(FieldSet, { legend: '다국어 입력 (KO 필수 · MY/EN 선택)', cols: 1 },
      h(FormRow, { label: '언어 선택' },
        h('div', { className: 'seg' },
          ['KO','MY','EN'].map(l => h('button', { key: l, type: 'button', className: lang === l ? 'active' : '', onClick: () => setLang(l) },
            l, l === 'KO' ? ' · 필수' : ''
          ))
        )
      ),
      h(FormRow, { label: `제목 (${lang})`, required: lang === 'KO' },
        h('input', { className: 'input', value: f[titleKey] || '', onChange: e => set(titleKey, e.target.value), maxLength: 80, placeholder: titlePh })
      ),
      h(FormRow, { label: `본문 (${lang})`, required: lang === 'KO', hint: '서식 · 이미지 삽입 가능. 본문은 HTML로 저장되어 FO에 그대로 노출됩니다.' },
        loaded
          ? h(NoticeBodyEditor, {
              key: lang,
              initialHtml: bodiesRef.current[lang] || '',
              onChange: (html) => { bodiesRef.current[lang] = html; },
              uploadImage: uploadImage,
              apiRef: editorApiRef,
            })
          : h('div', { style: { padding: 20, color: 'var(--text-3)', fontSize: 13 } }, '에디터 불러오는 중…')
      )
    ),

    h(FieldSet, { legend: '첨부파일', cols: 1 },
      h(FormRow, { label: '파일 첨부', hint: '이미지 · PDF · 문서(doc/xls/ppt/hwp) · zip · txt/csv (개당 최대 20MB)' },
        h('div', null,
          h('div', {
            className: 'nt-attach-drop',
            onClick: () => fileInputRef.current && fileInputRef.current.click()
          }, '클릭하여 파일을 선택하세요 (여러 개 선택 가능)'),
          h('input', {
            ref: fileInputRef, type: 'file', multiple: true,
            accept: NT_FILE_ACCEPT, style: { display: 'none' },
            onChange: e => { onPickFiles(e.target.files); e.target.value = ''; }
          }),
          att.length > 0 && h('div', { className: 'nt-attach-list' },
            att.map((it, i) => h('div', {
              key: it.fileId || it.tempId || i,
              className: 'nt-attach-item' + (it.removed ? ' removed' : '')
            },
              h('span', { className: 'nm' }, it.name, it.isNew ? h('span', { className: 'sz', style: { marginLeft: 6, color: 'var(--primary,#2f6df6)' } }, '(신규)') : null),
              h('span', { className: 'sz' }, ntFmtSize(it.size)),
              h('button', {
                type: 'button', className: 'x',
                title: it.removed ? '복원' : '삭제',
                onClick: () => toggleRemoveAt(i)
              }, it.removed ? '↺' : '✕')
            ))
          )
        )
      )
    ),

    isNew && f.public && h('div', { style: { padding: 12, background: 'var(--st-applied-bg)', color: 'var(--st-applied)', borderRadius: 6, fontSize: 12.5, marginBottom: 10 } },
      'ⓘ 게시(공개)하면 FO 공지사항 페이지에 즉시 노출됩니다.', h('br'),
      h('span', { style: { fontSize: 11.5, color: 'var(--text-3)' } }, '※ 게시 시 마케팅 수신 동의 회원에게 이메일 알림이 발송됩니다. 다국어(MY/EN) 본문 저장은 추후 반영 예정입니다.')
    )
  );
}

// 데이터 로딩 게이트 — API에서 공지 목록을 받아온 뒤 내부 패널을 렌더
function NoticesPanel() {
  return h(ResourceGate, { loader: () => BoData.loadNotices(), deps: [], inner: NoticesPanelInner });
}

window.NoticesPanel = NoticesPanel;
