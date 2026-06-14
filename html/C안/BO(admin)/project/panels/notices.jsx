/* panels/notices.jsx — 공지사항 관리 (TPKM_BO_4_1_*)
   고객사 수정 0527: 신규 게시 시 마케팅수신동의자 이메일 일괄 발송
*/

const NOTICE_CATS = ['중요','접수','시험','결과'];

function NoticesPanel() {
  const state = useStore();
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('all');
  const [viewTab, setViewTab] = useState('list'); // list | trash
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [restoreId, setRestoreId] = useState(null);

  const canCreate = DataStore.can('notices', 'create');
  const canEdit = DataStore.can('notices', 'edit');
  const canDelete = DataStore.can('notices', 'delete');
  const isReadonly = DataStore.isReadonly();

  useEffect(() => {
    if (viewTab === 'trash' && DataStore.isApiMode && DataStore.isApiMode() && DataStore.reloadNotices) {
      DataStore.reloadNotices({ trash: true });
    }
  }, [viewTab]);

  const source = viewTab === 'trash' ? (state.noticeTrash || []) : state.notices;

  const filtered = useMemo(() => {
    let r = source.slice();
    if (catF !== 'all') r = r.filter(n => n.cat === catF);
    if (q) r = r.filter(n => n.title.toLowerCase().includes(q.toLowerCase()));
    return r.sort((a,b) => (b.pin?1:0) - (a.pin?1:0) || b.createdAt.localeCompare(a.createdAt));
  }, [source, q, catF]);

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveNotice({ ...data, _isNew: !data.id });
      if (ok) {
        toastOk(data.id ? '공지가 수정되었습니다.' : (data.public ? '공지 등록 완료' : '공지가 등록되었습니다.'));
        setEdit(null);
      }
      return;
    }
    if (data.id) {
      const n = state.notices.find(x => x.id === data.id);
      const before = { ...n };
      Object.assign(n, data);
      DataStore.addAudit({ type: '공지', targetId: n.id, action: '수정', before, after: { ...n }, memo: '' });
      toastOk('공지가 수정되었습니다.');
    } else {
      const id = 'n' + (state.notices.length + 1);
      const nw = { id, no: state.notices.length + 1, author: state.me?.id || 'admin01', createdAt: new Date().toISOString().slice(0,16).replace('T',' '), views: 0, ...data };
      state.notices.unshift(nw);
      DataStore.addAudit({ type: '공지', targetId: id, action: '생성', after: { ...nw }, memo: '신규 게시' });
      // 고객사 수정 0527 — 마케팅 동의자에 이메일 일괄 발송
      if (nw.public) {
        const targets = state.members.filter(m => m.marketing && m.status === 'active').length;
        DataStore.addAudit({ type: '공지', targetId: id, action: '게시', memo: `마케팅수신동의자 ${targets}명 이메일 일괄 발송` });
        toastOk(`공지 등록 완료 · 마케팅 동의 회원 ${targets}명에게 알림 이메일을 발송했습니다.`);
      } else {
        toastOk('공지가 등록되었습니다.');
      }
    }
    DataStore.notify();
    setEdit(null);
  };

  const restore = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.apiRestoreNotice) {
      const ok = await DataStore.apiRestoreNotice(restoreId);
      if (ok) { setRestoreId(null); toastOk('공지가 복구되었습니다.'); }
      return;
    }
    setRestoreId(null);
  };

  const remove = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiDeleteNotice(delId);
      if (ok) { setDelId(null); toastOk('공지가 휴지통으로 이동되었습니다.'); }
      return;
    }
    const n = state.notices.find(x => x.id === delId);
    if (!n) return;
    state.notices.splice(state.notices.indexOf(n), 1);
    DataStore.addAudit({ type: '공지', targetId: n.id, action: '삭제', before: { ...n }, memo: 'soft-delete' });
    DataStore.notify();
    setDelId(null);
    toastOk('공지가 삭제되었습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>공지사항 관리</h1>
          <div className="sub">FO 공지사항과 직접 연동 · 신규 게시 시 마케팅 동의 회원에 이메일 알림 발송</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 공지 작성</button>
        </div>
      </div>

      {isReadonly && (
        <div style={{ padding: 14, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⓘ 조회 전용 계정입니다. 작성·수정·삭제 버튼이 비활성화됩니다.
        </div>
      )}

      <div className="filterbar">
        <div className="chips">
          <button className={`chip ${viewTab === 'list' ? 'active' : ''}`} onClick={() => setViewTab('list')}>목록<span className="cnt">{state.notices.length}</span></button>
          <button className={`chip ${viewTab === 'trash' ? 'active' : ''}`} onClick={() => setViewTab('trash')}>휴지통<span className="cnt">{(state.noticeTrash || []).length}</span></button>
          <button className={`chip ${catF === 'all' ? 'active' : ''}`} onClick={() => setCatF('all')}>전체<span className="cnt">{source.length}</span></button>
          {NOTICE_CATS.map(c => (
            <button key={c} className={`chip ${catF === c ? 'active' : ''}`} onClick={() => setCatF(c)}>{c}<span className="cnt">{state.notices.filter(n => n.cat === c).length}</span></button>
          ))}
        </div>
        <div className="controls">
          <input className="input search" placeholder="제목 검색" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th className="num">번호</th><th>카테고리</th><th>제목</th><th>작성자</th><th>작성일</th>
              {viewTab === 'trash' && <th>삭제일</th>}
              <th className="num">조회</th><th>노출</th><th>관리</th>
            </tr></thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id}>
                  <td className="num">{n.no}</td>
                  <td><span className={`pill pill-${n.cat === '중요' ? 'rejected' : 'applied'}`}>{n.cat}</span></td>
                  <td>{n.pin && <I.Bookmark style={{ width: 12, height: 12, color: 'var(--accent)', display: 'inline', verticalAlign: '-2px', marginRight: 4 }}/>}<b>{n.title}</b></td>
                  <td className="muted">{n.author}</td>
                  <td className="code muted">{n.createdAt}</td>
                  {viewTab === 'trash' && <td className="code muted">{n.deletedAt || '—'}</td>}
                  <td className="num muted">{DataStore.fmtNum(n.views)}</td>
                  <td><Pill kind={n.public ? 'active' : 'inactive'}>{n.public ? '공개' : '비공개'}</Pill></td>
                  <td>
                    <div className="row-actions">
                      {viewTab === 'trash' ? (
                        <button className="ibtn" disabled={!canEdit} onClick={() => setRestoreId(n.id)}><I.RefreshCcw style={{ width: 12, height: 12 }}/> 복구</button>
                      ) : (
                        <>
                          <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ id: n.id })}><I.Edit style={{ width: 12, height: 12 }}/></button>
                          <button className="ibtn danger" disabled={!canDelete} onClick={() => setDelId(n.id)}><I.Trash style={{ width: 12, height: 12 }}/></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (edit.id ? canEdit : canCreate) && <NoticeEditLP edit={edit} onClose={() => setEdit(null)} onSave={save} canSave={edit.id ? canEdit : canCreate}/>}
      {delId && (
        <Modal open onClose={() => setDelId(null)} title="공지 삭제" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setDelId(null)}>취소</button>
            <button className="btn btn-danger" onClick={remove}>삭제</button>
          </>}>
          <div>공지를 삭제하시겠습니까? 30일 동안 휴지통에 보관되며, 이후 영구 삭제됩니다.</div>
        </Modal>
      )}
      {restoreId && (
        <Modal open onClose={() => setRestoreId(null)} title="공지 복구"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setRestoreId(null)}>취소</button>
            <button className="btn btn-primary" onClick={restore}>복구</button>
          </>}>
          <div>휴지통에서 공지를 복구하시겠습니까? 복구 후 공개 여부를 다시 설정해 주세요.</div>
        </Modal>
      )}
    </>
  );
}

function NoticeEditLP({ edit, onClose, onSave, canSave = true }) {
  const state = useStore();
  const n = edit.id ? state.notices.find(x => x.id === edit.id) : null;
  const [f, setF] = useState(n ? { ...n } : {
    cat: '접수', title: '', body: '', titleMy: '', titleEn: '', bodyMy: '', bodyEn: '',
    public: true, pin: false, showStart: '', showEnd: '', attachments: []
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.title.trim();
  const isNew = !n;

  // 다국어(KO/MY/EN) 입력 — KO 필수, MY/EN 선택
  const [lang, setLang] = useState('KO');
  const titleKey = lang === 'KO' ? 'title' : lang === 'MY' ? 'titleMy' : 'titleEn';
  const bodyKey  = lang === 'KO' ? 'body'  : lang === 'MY' ? 'bodyMy'  : 'bodyEn';
  const titlePh  = lang === 'KO' ? '예) 제107회 TOPIK 접수 안내' : lang === 'MY' ? 'ဥပမာ - ၁၀၇ ကြိမ်မြောက် TOPIK လျှောက်ထားရန်' : 'e.g. 107th TOPIK Application Guide';
  const marketingTargets = state.members.filter(m => m.marketing && m.status === 'active').length;

  const editorHostRef = useRef(null);
  const editorRef = useRef(null);
  const attachInputRef = useRef(null);
  const attachListRef = useRef(null);
  const attachCtrlRef = useRef(null);
  const fRef = useRef(f);
  fRef.current = f;

  const switchLang = (l) => {
    if (l === lang) return;
    if (editorRef.current) {
      const html = editorRef.current.getHtml();
      setF(s => {
        const next = { ...s, [bodyKey]: html };
        const nextBodyKey = l === 'KO' ? 'body' : l === 'MY' ? 'bodyMy' : 'bodyEn';
        if (editorRef.current) {
          editorRef.current.setHtml(next[nextBodyKey] || '');
        }
        return next;
      });
    }
    setLang(l);
  };

  useEffect(() => {
    if (!editorHostRef.current || !window.BoNoticeEditor) return;
    const useApi = DataStore.isApiMode && DataStore.isApiMode();
    editorRef.current = BoNoticeEditor.mountRichEditor(
      editorHostRef.current,
      fRef.current[bodyKey] || '',
      {
        uploadImageFn: useApi && window.TopikBoApi && TopikBoApi.uploadNoticeAttachment
          ? (file) => TopikBoApi.uploadNoticeAttachment(file)
          : null,
      }
    );
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!attachInputRef.current || !attachListRef.current || !window.BoNoticeEditor) return;
    const useApi = DataStore.isApiMode && DataStore.isApiMode();
    attachCtrlRef.current = BoNoticeEditor.bindNoticeAttachments({
      input: attachInputRef.current,
      listEl: attachListRef.current,
      existing: n && n.attachments ? n.attachments : [],
      uploadFn: useApi && window.TopikBoApi && TopikBoApi.uploadNoticeAttachment
        ? (file) => TopikBoApi.uploadNoticeAttachment(file)
        : null,
    });
    return () => { attachCtrlRef.current = null; };
  }, [n && n.id]);

  const validateDisplayWindow = (start, end) => {
    if (!start || !end) return true;
    if (end <= start) {
      toastErr('노출 종료는 노출 시작 이후여야 합니다.');
      return false;
    }
    return true;
  };

  const handleSave = () => {
    const ctrl = attachCtrlRef.current;
    if (ctrl && ctrl.hasPending()) {
      toastErr('첨부파일 업로드가 완료될 때까지 기다려 주세요.');
      return;
    }
    if (!validateDisplayWindow(f.showStart, f.showEnd)) return;
    const bodyHtml = editorRef.current ? editorRef.current.getHtml() : (f[bodyKey] || '');
    const bodies = {
      body: bodyKey === 'body' ? bodyHtml : (f.body || ''),
      bodyMy: bodyKey === 'bodyMy' ? bodyHtml : (f.bodyMy || ''),
      bodyEn: bodyKey === 'bodyEn' ? bodyHtml : (f.bodyEn || ''),
    };
    const inlineIds = [];
    if (window.BoNoticeEditor && BoNoticeEditor.collectInlineFileIds) {
      ['body', 'bodyMy', 'bodyEn'].forEach(k => {
        BoNoticeEditor.collectInlineFileIds(bodies[k]).forEach(id => {
          if (inlineIds.indexOf(id) === -1) inlineIds.push(id);
        });
      });
    }
    const attachIds = ctrl ? ctrl.getNewFileIds() : [];
    const mergedAttachIds = attachIds.concat(
      inlineIds.filter(id => attachIds.indexOf(id) === -1)
    );
    onSave({
      ...f,
      [bodyKey]: bodyHtml,
      body: bodyKey === 'body' ? bodyHtml : f.body,
      attachmentFileIds: mergedAttachIds,
      removeAttachmentFileIds: ctrl ? ctrl.getRemoveFileIds() : [],
    });
  };

  return (
    <LP open title={n ? `공지 수정 — ${n.title}` : '공지 작성'} onClose={onClose} size="wide"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid || !canSave} onClick={handleSave}>{n ? '저장' : '게시'}</button>
      </>}>
      <FieldSet legend="기본 정보" cols={2}>
        <FormRow label="카테고리" required>
          <select className="select" value={f.cat} onChange={e => set('cat', e.target.value)}>
            {NOTICE_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </FormRow>
        <FormRow label="옵션">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', height: 38 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={f.public} onChange={e => set('public', e.target.checked)}/> 공개
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={f.pin} onChange={e => set('pin', e.target.checked)}/> 상단 고정
            </label>
          </div>
        </FormRow>
        <FormRow label="노출 시작" hint="미얀마 현지시각(MMT, UTC+6:30)">
          <input type="datetime-local" className="input" value={f.showStart} onChange={e => {
            const v = e.target.value;
            if (f.showEnd && v && f.showEnd <= v) {
              toastErr('노출 종료는 노출 시작 이후여야 합니다.');
              return;
            }
            set('showStart', v);
          }}/>
        </FormRow>
        <FormRow label="노출 종료" hint="미얀마 현지시각(MMT, UTC+6:30)">
          <input type="datetime-local" className="input" value={f.showEnd} onChange={e => {
            const v = e.target.value;
            if (f.showStart && v && v <= f.showStart) {
              toastErr('노출 종료는 노출 시작 이후여야 합니다.');
              return;
            }
            set('showEnd', v);
          }}/>
        </FormRow>
      </FieldSet>

      <FieldSet legend="다국어 입력 (KO 필수 · MY/EN 선택)" cols={1}>
        <FormRow label="언어 선택">
          <div className="seg">
            {['KO','MY','EN'].map(l => (
              <button key={l} type="button" className={lang === l ? 'active' : ''} onClick={() => switchLang(l)}>
                {l}{l === 'KO' ? ' · 필수' : ''}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label={`제목 (${lang})`} required={lang === 'KO'}>
          <input className="input" value={f[titleKey] || ''} onChange={e => set(titleKey, e.target.value)} maxLength={80} placeholder={titlePh}/>
        </FormRow>
        <FormRow label={`본문 (${lang})`} required={lang === 'KO'}>
          <div className="bo-rich-editor">
            <div ref={editorHostRef} className="bo-quill-host"/>
          </div>
        </FormRow>
      </FieldSet>

      <FieldSet legend="첨부파일" cols={1}>
        <FormRow label="파일 업로드">
          <div className="bo-att-zone">
            <input ref={attachInputRef} type="file" multiple className="bo-att-input" accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.txt,.zip,.csv"/>
            <div className="bo-att-help">
              최대 5개 · 파일당 10MB · 이미지(jpg, png, gif, webp 등) 및 문서(pdf, doc, docx, xls, xlsx, ppt, pptx, hwp, txt, zip 등)
            </div>
            <div ref={attachListRef} className="bo-att-list"/>
          </div>
        </FormRow>
      </FieldSet>

      {isNew && f.public && (
        <div style={{ padding: 12, background: 'var(--st-applied-bg)', color: 'var(--st-applied)', borderRadius: 6, fontSize: 12.5, marginBottom: 10 }}>
          ⓘ 게시 시 마케팅 수신 동의 회원 <b>{marketingTargets}명</b>에게 알림 이메일이 일괄 발송됩니다.<br/>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>제목 + FO 공지사항 페이지 링크 포함 (본문 전체 미발송). 수정/삭제 시 발송하지 않습니다.</span>
        </div>
      )}
    </LP>
  );
}

window.NoticesPanel = NoticesPanel;
