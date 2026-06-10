/* panels/terms.jsx — 약관 관리 (TPKM_BO_5_2_*)
   - 버전 목록, 등록/수정/미리보기/게시/폐지/동의 이력
*/

const TERM_KINDS = ['이용약관','개인정보','마케팅'];

/** 게시 버전 기준 다음 초안 버전 제안 (v1.0 → v1.1, v2 → v2.1) */
function bumpVersion(ver) {
  if (!ver) return 'v1.0';
  const s = String(ver).trim();
  const m = s.match(/^([vV]?)(\d+)\.(\d+)$/);
  if (m) return `${m[1] || 'v'}${m[2]}.${parseInt(m[3], 10) + 1}`;
  const m2 = s.match(/^([vV]?)(\d+)$/);
  if (m2) return `${m2[1] || 'v'}${m2[2]}.1`;
  return s + '.1';
}

function TermsPanel() {
  const state = useStore();
  const canCreate = DataStore.can('terms', 'create');
  const canEdit = DataStore.can('terms', 'create');
  const canPublish = DataStore.can('terms', 'publish');
  const [kindF, setKindF] = useState('all');
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [publish, setPublish] = useState(null);
  const [retire, setRetire] = useState(null);
  const [consent, setConsent] = useState(false);

  const filtered = useMemo(() => {
    let r = state.terms.slice();
    if (kindF !== 'all') r = r.filter(t => t.kind === kindF);
    return r.sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  }, [state.terms, kindF]);

  const save = async (data) => {
    const { _fromPublished, _sourceVersion, ...payload } = data;
    if (_fromPublished) {
      delete payload.id;
      delete payload.status;
      delete payload.publishedAt;
      delete payload.retiredAt;
      delete payload.author;
    }
    const isNewDraft = !payload.id;

    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveTerm({ ...payload, _isNew: isNewDraft });
      if (ok) {
        toastOk(
          isNewDraft
            ? (_fromPublished ? '신규 버전 초안이 등록되었습니다. 목록에서 «게시»로 교체 게시하세요.' : '약관 초안이 등록되었습니다.')
            : '약관 초안이 수정되었습니다.'
        );
        setEdit(null);
      }
      return;
    }
    if (payload.id) {
      const t = state.terms.find(x => x.id === payload.id);
      if (t.status !== 'draft') { toastErr('게시된 약관은 수정할 수 없습니다. 신규 버전을 등록해주세요.'); return; }
      const before = { ...t };
      Object.assign(t, payload);
      DataStore.addAudit({ type: '약관', targetId: t.id, action: '수정', before, after: { ...t }, memo: '' });
      toastOk('약관 초안이 수정되었습니다.');
    } else {
      const id = 't' + (state.terms.length + 1);
      const nw = { id, status: 'draft', author: state.me?.id || 'admin01', publishedAt: '', retiredAt: '', ...payload };
      state.terms.push(nw);
      const memo = _fromPublished
        ? `게시본 ${_sourceVersion || ''} 기반 신규 버전 초안`
        : '초안 등록';
      DataStore.addAudit({ type: '약관', targetId: id, action: '생성', after: { ...nw }, memo });
      toastOk(_fromPublished ? '신규 버전 초안이 등록되었습니다. 목록에서 «게시»로 교체 게시하세요.' : '약관 초안이 등록되었습니다.');
    }
    DataStore.notify();
    setEdit(null);
  };

  const doPublish = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiPublishTerm(publish);
      if (ok) {
        const t = state.terms.find(x => x.id === publish);
        setPublish(null);
        toastOk(`${t?.kind} ${t?.version}가 게시되었습니다.`);
      }
      return;
    }
    const t = state.terms.find(x => x.id === publish);
    // 동종 기존 게시 버전 폐지
    state.terms.forEach(x => {
      if (x.kind === t.kind && x.status === 'pub' && x.id !== t.id) {
        x.status = 'retired';
        x.retiredAt = new Date().toISOString().slice(0,10);
        DataStore.addAudit({ type: '약관', targetId: x.id, action: '폐지', memo: `신규 ${t.version} 게시에 따라 자동 폐지` });
      }
    });
    const before = { status: t.status };
    t.status = 'pub';
    t.publishedAt = new Date().toISOString().slice(0,10);
    DataStore.addAudit({ type: '약관', targetId: t.id, action: '게시', before, after: { status: 'pub' }, memo: '회원 재동의 정책: 다음 로그인 시 재동의' });
    DataStore.notify();
    setPublish(null);
    toastOk(`${t.kind} ${t.version}가 게시되었습니다.`);
  };

  const doRetire = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiRetireTerm(retire);
      if (ok) { setRetire(null); toastOk('약관이 폐지되었습니다.'); }
      return;
    }
    const t = state.terms.find(x => x.id === retire);
    const before = { status: t.status };
    t.status = 'retired';
    t.retiredAt = new Date().toISOString().slice(0,10);
    DataStore.addAudit({ type: '약관', targetId: t.id, action: '폐지', before, after: { status: 'retired' }, memo: '관리자 폐지' });
    DataStore.notify();
    setRetire(null);
    toastOk('약관이 폐지되었습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>약관 관리</h1>
          <div className="sub">이용약관 / 개인정보 / 마케팅 · 게시본은 «신규 버전»으로만 수정 · 동의 이력 영구 보관</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setConsent(true)}><I.History style={{ width: 14, height: 14 }}/> 동의 이력</button>
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 약관 등록</button>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          <button className={`chip ${kindF === 'all' ? 'active' : ''}`} onClick={() => setKindF('all')}>전체<span className="cnt">{state.terms.length}</span></button>
          {TERM_KINDS.map(k => (
            <button key={k} className={`chip ${kindF === k ? 'active' : ''}`} onClick={() => setKindF(k)}>{k}<span className="cnt">{state.terms.filter(t => t.kind === k).length}</span></button>
          ))}
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>약관 종류</th><th>버전</th><th>게시일</th><th>폐지일</th><th>상태</th><th>작성자</th><th>관리</th>
            </tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td><span className="pill" style={{ background: 'var(--bg-3)' }}>{t.kind}</span></td>
                  <td className="code"><b>{t.version}</b></td>
                  <td className="code muted">{t.publishedAt || '—'}</td>
                  <td className="code muted">{t.retiredAt || '—'}</td>
                  <td>
                    <Pill kind={t.status === 'pub' ? 'pub' : t.status === 'draft' ? 'draft' : 'retired'}>{t.status === 'pub' ? '게시' : t.status === 'draft' ? '초안' : '폐지'}</Pill>
                    {t.status === 'pub' && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4, maxWidth: 200 }}>
                        본문 수정 시 «신규 버전»으로 초안 생성 후 게시
                      </div>
                    )}
                  </td>
                  <td className="muted">{t.author}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" onClick={() => setPreview(t.id)}><I.Eye style={{ width: 12, height: 12 }}/> 미리보기</button>
                      {t.status === 'draft' && <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ id: t.id })}><I.Edit style={{ width: 12, height: 12 }}/></button>}
                      {t.status === 'draft' && <button className="ibtn primary" disabled={!canPublish} onClick={() => setPublish(t.id)}>게시</button>}
                      {t.status === 'pub' && <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ fromPublishedId: t.id })}><I.Edit style={{ width: 12, height: 12 }}/> 신규 버전</button>}
                      {t.status === 'pub' && <button className="ibtn danger" disabled={!canPublish} onClick={() => setRetire(t.id)}>폐지</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <TermEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
      {preview && <TermPreviewLP id={preview} onClose={() => setPreview(null)}/>}
      {publish && (
        <Modal open onClose={() => setPublish(null)} title="약관 게시"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setPublish(null)}>취소</button>
            <button className="btn btn-primary" onClick={doPublish}>게시</button>
          </>}>
          <div>약관을 즉시 게시하시겠습니까? 동일 종류의 기존 게시 버전은 자동 폐지되고 회원에게는 다음 로그인 시 재동의가 요청됩니다.</div>
        </Modal>
      )}
      {retire && (
        <Modal open onClose={() => setRetire(null)} title="약관 폐지" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setRetire(null)}>취소</button>
            <button className="btn btn-danger" onClick={doRetire}>폐지</button>
          </>}>
          <div>약관을 폐지하시겠습니까? 버전과 동의 이력은 보존되며, FO 노출이 중단됩니다.</div>
        </Modal>
      )}
      {consent && <ConsentLogLP onClose={() => setConsent(false)}/>}
    </>
  );
}

function TermEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const fromPub = edit.fromPublishedId ? state.terms.find(x => x.id === edit.fromPublishedId) : null;
  const t0 = edit.id ? state.terms.find(x => x.id === edit.id) : null;
  const initFromPublished = fromPub ? {
    kind: fromPub.kind,
    version: bumpVersion(fromPub.version),
    body: fromPub.body || '',
    bodyMy: fromPub.bodyMy || '',
    bodyEn: fromPub.bodyEn || '',
    scheduledAt: fromPub.scheduledAt || '',
  } : null;
  const [f, setF] = useState(
    initFromPublished || (t0 ? { ...t0 } : { kind: '이용약관', version: 'v1.0', body: '', bodyMy: '', bodyEn: '', scheduledAt: '' })
  );
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.kind && f.version && true;

  const lpTitle = fromPub
    ? `신규 버전 작성 — ${fromPub.kind} ${fromPub.version}`
    : (t0 ? `약관 수정 — ${t0.kind} ${t0.version}` : '약관 등록 (신규)');
  const lpSub = fromPub
    ? `게시 중인 약관은 직접 수정할 수 없습니다. 현재 게시본(${fromPub.version})을 복사한 신규 초안입니다. 저장 후 목록에서 «게시»하면 기존 게시 버전은 자동 폐지되고 회원 재동의가 요청됩니다.`
    : (t0 ? '초안만 본문·버전 수정 가능 · 게시된 약관은 «신규 버전»으로 새 초안을 만드세요' : '신규 약관 초안 등록 · 저장 후 목록에서 «게시»');

  const [lang, setLang] = useState('KO');
  const bodyKey = lang === 'KO' ? 'body' : lang === 'MY' ? 'bodyMy' : 'bodyEn';

  const editorHostRef = useRef(null);
  const editorRef = useRef(null);
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

  const handleSave = () => {
    const bodyHtml = editorRef.current ? editorRef.current.getHtml() : (f[bodyKey] || '');
    const bodies = {
      body: bodyKey === 'body' ? bodyHtml : (f.body || ''),
      bodyMy: bodyKey === 'bodyMy' ? bodyHtml : (f.bodyMy || ''),
      bodyEn: bodyKey === 'bodyEn' ? bodyHtml : (f.bodyEn || ''),
    };
    const base = { ...f, [bodyKey]: bodyHtml, ...bodies };
    if (fromPub) {
      onSave({ ...base, _fromPublished: true, _sourceVersion: fromPub.version });
    } else {
      onSave(base);
    }
  };

  return (
    <LP open title={lpTitle} sub={lpSub} onClose={onClose} size="wide"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid} onClick={handleSave}>
          {fromPub ? '초안 저장' : (t0 ? '저장' : '등록')}
        </button>
      </>}>
      {fromPub && (
        <div style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13, lineHeight: 1.55, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>신규 버전 흐름</b> — ① 현재 게시본 복사 → ② 본문·버전 수정 후 «초안 저장» → ③ 목록에서 «게시»로 교체 게시 (기존 {fromPub.version} 자동 폐지)
        </div>
      )}
      <FieldSet legend="기본" cols={2}>
        <FormRow label="약관 종류" required>
          <select className="select" value={f.kind} disabled={!!fromPub} onChange={e => set('kind', e.target.value)}>
            {TERM_KINDS.map(k => <option key={k}>{k}</option>)}
          </select>
        </FormRow>
        <FormRow label="버전 (시맨틱)" required hint={fromPub ? `이전 게시: ${fromPub.version} · 필요 시 직접 수정` : '예: v2.0, v2.1'}>
          <input className="input" value={f.version} onChange={e => set('version', e.target.value)}/>
        </FormRow>
        <FormRow label="게시 예정일">
          <input type="date" className="input" value={f.scheduledAt || ''} onChange={e => set('scheduledAt', e.target.value)}/>
        </FormRow>
      </FieldSet>
      <FieldSet legend="본문 (KO 필수 · MY/EN 선택)" cols={1}>
        <FormRow label="언어 선택">
          <div className="seg">
            {['KO','MY','EN'].map(l => (
              <button key={l} type="button" className={lang === l ? 'active' : ''} onClick={() => switchLang(l)}>
                {l}{l === 'KO' ? ' · 필수' : ''}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label={`본문 (${lang})`} required={lang === 'KO'}>
          <div className="bo-rich-editor">
            <div ref={editorHostRef} className="bo-quill-host"/>
          </div>
        </FormRow>
      </FieldSet>
    </LP>
  );
}

function TermPreviewLP({ id, onClose }) {
  const state = useStore();
  const t = state.terms.find(x => x.id === id);
  if (!t) return null;
  return (
    <LP open title={`미리보기 — ${t.kind} ${t.version}`} sub="FO 표시 형태로 렌더링" onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>닫기</button>}>
      <article style={{ background: 'var(--bg)', padding: 20, borderRadius: 8, border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>{t.kind} ({t.version})</h2>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>게시일: {t.publishedAt || '미게시'}</div>
        <div
          className="bo-term-preview-body"
          style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: t.body || '<p style="color:var(--text-3)">— 본문 미입력 —</p>' }}
        />
      </article>
    </LP>
  );
}

function ConsentLogLP({ onClose }) {
  const state = useStore();
  const [memberF, setMemberF] = useState('all');
  const [kindF, setKindF] = useState('all');
  const [loading, setLoading] = useState(false);

  // 동의 이력은 진입 시 실제 API(GET /api/v1/admin/terms/consents)로 로드 — 목업 제거
  useEffect(() => {
    if (DataStore.isApiMode && DataStore.isApiMode() && DataStore.apiLoadConsents) {
      setLoading(true);
      DataStore.apiLoadConsents({}).then(() => setLoading(false));
    }
  }, []);

  const filtered = useMemo(() => {
    let r = state.consents.slice();
    if (memberF !== 'all') r = r.filter(c => c.memberId === memberF);
    if (kindF !== 'all')   r = r.filter(c => c.termsKind === kindF);
    return r.sort((a,b) => b.ts.localeCompare(a.ts));
  }, [state.consents, memberF, kindF]);

  const exportCSV = () => {
    const headers = ['시각', '회원ID', '약관', '버전', 'IP', '방식'];
    const rows = filtered.map(c => [c.ts, c.memberId, c.termsKind, c.version, c.ip, c.method]);
    const fn = '약관동의이력_' + new Date().toISOString().slice(0, 10) + '.csv';
    const after = () => {
      DataStore.addAudit({ type: '약관', targetId: '—', action: '게시', memo: `약관 동의 이력 CSV 내보내기(${filtered.length}건) — 감사 자료` });
      toastOk(`동의 이력 CSV(${filtered.length}건)를 생성했습니다.`);
    };
    if (window.TOPIKExport && TOPIKExport.downloadCsv) { TOPIKExport.downloadCsv(fn, headers, rows).then(after); }
    else after();
  };

  return (
    <LP open size="wide" title="약관 동의 이력" sub="회원·버전별 동의 시점/IP/방식 (감사 자료)" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        <button className="btn btn-primary" onClick={exportCSV} disabled={!filtered.length}><I.Download style={{ width: 12, height: 12 }}/> CSV 내보내기</button>
      </>}>
      {loading && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-3)' }}>동의 이력 로딩 중…</div>}
      <div className="filterbar">
        <div className="controls">
          <select className="select" value={memberF} onChange={e => setMemberF(e.target.value)} style={{ minWidth: 180 }}>
            <option value="all">전체 회원</option>
            {state.members.slice(0, 20).map(m => <option key={m.id} value={m.id}>{m.id} · {m.nameKo}</option>)}
          </select>
          <select className="select" value={kindF} onChange={e => setKindF(e.target.value)}>
            <option value="all">전체 약관</option>
            {TERM_KINDS.map(k => <option key={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className="dg-wrap" style={{ marginTop: 12 }}>
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr><th>시각</th><th>회원ID</th><th>약관</th><th>버전</th><th>IP</th><th>방식</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="code">{c.ts}</td>
                  <td><code className="code-id">{c.memberId}</code></td>
                  <td>{c.termsKind}</td>
                  <td className="code">{c.version}</td>
                  <td className="code muted">{c.ip}</td>
                  <td><span className="tag">{c.method}</span></td>
                </tr>
              ))}
              {!filtered.length && !loading && (
                <tr><td colSpan="6"><div className="empty" style={{ padding: '20px 0' }}>동의 이력이 없습니다</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LP>
  );
}

window.TermsPanel = TermsPanel;
