/* panels/terms.jsx — 약관 관리 (TPKM_BO_5_2_*)
   - 버전 목록, 등록/수정/미리보기/게시/폐지/동의 이력
*/

const TERM_KINDS = ['이용약관','개인정보','마케팅'];

function TermsPanel() {
  const state = useStore();
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
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveTerm({ ...data, _isNew: !data.id });
      if (ok) {
        toastOk(data.id ? '약관 초안이 수정되었습니다.' : '약관 초안이 등록되었습니다.');
        setEdit(null);
      }
      return;
    }
    if (data.id) {
      const t = state.terms.find(x => x.id === data.id);
      if (t.status !== 'draft') { toastErr('게시된 약관은 수정할 수 없습니다. 신규 버전을 등록해주세요.'); return; }
      const before = { ...t };
      Object.assign(t, data);
      DataStore.addAudit({ type: '약관', targetId: t.id, action: '수정', before, after: { ...t }, memo: '' });
      toastOk('약관 초안이 수정되었습니다.');
    } else {
      const id = 't' + (state.terms.length + 1);
      const nw = { id, status: 'draft', author: state.me?.id || 'admin01', publishedAt: '', retiredAt: '', ...data };
      state.terms.push(nw);
      DataStore.addAudit({ type: '약관', targetId: id, action: '생성', after: { ...nw }, memo: '초안 등록' });
      toastOk('약관 초안이 등록되었습니다.');
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
          <div className="sub">이용약관 / 개인정보 / 마케팅 · 버전 보존 + 동의 이력 영구 보관</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setConsent(true)}><I.History style={{ width: 14, height: 14 }}/> 동의 이력</button>
          <button className="btn btn-primary" onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 약관 등록</button>
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
                  <td><Pill kind={t.status === 'pub' ? 'pub' : t.status === 'draft' ? 'draft' : 'retired'}>{t.status === 'pub' ? '게시' : t.status === 'draft' ? '초안' : '폐지'}</Pill></td>
                  <td className="muted">{t.author}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" onClick={() => setPreview(t.id)}><I.Eye style={{ width: 12, height: 12 }}/> 미리보기</button>
                      {t.status === 'draft' && <button className="ibtn" onClick={() => setEdit({ id: t.id })}><I.Edit style={{ width: 12, height: 12 }}/></button>}
                      {t.status === 'draft' && <button className="ibtn primary" onClick={() => setPublish(t.id)}>게시</button>}
                      {t.status === 'pub' && <button className="ibtn danger" onClick={() => setRetire(t.id)}>폐지</button>}
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
  const t0 = edit.id ? state.terms.find(x => x.id === edit.id) : null;
  const [f, setF] = useState(t0 ? { ...t0 } : { kind: '이용약관', version: 'v1.0', body: '', scheduledAt: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.kind && f.version && true;
  return (
    <LP open title={t0 ? `약관 수정 — ${t0.kind} ${t0.version}` : '약관 등록'} sub="게시 전에만 본문 수정 가능 · 게시 후에는 신규 버전 등록" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(f)}>{t0 ? '저장' : '등록'}</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <FormRow label="약관 종류" required>
          <select className="select" value={f.kind} onChange={e => set('kind', e.target.value)}>
            {TERM_KINDS.map(k => <option key={k}>{k}</option>)}
          </select>
        </FormRow>
        <FormRow label="버전 (시맨틱)" required hint="예: v2.0, v2.1">
          <input className="input" value={f.version} onChange={e => set('version', e.target.value)}/>
        </FormRow>
        <FormRow label="게시 예정일">
          <input type="date" className="input" value={f.scheduledAt || ''} onChange={e => set('scheduledAt', e.target.value)}/>
        </FormRow>
      </FieldSet>
      <FieldSet legend="본문 (KO 필수 · MY/EN 선택 — 데모는 KO만)" cols={1}>
        <FormRow label="본문(KO)" required>
          <textarea className="textarea" rows="14" value={f.body || ''} onChange={e => set('body', e.target.value)} placeholder="제1조 (목적) ..."/>
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
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}>{t.body || '— 본문 미입력 —'}</pre>
      </article>
    </LP>
  );
}

function ConsentLogLP({ onClose }) {
  const state = useStore();
  const [memberF, setMemberF] = useState('all');
  const [kindF, setKindF] = useState('all');
  const filtered = useMemo(() => {
    let r = state.consents.slice();
    if (memberF !== 'all') r = r.filter(c => c.memberId === memberF);
    if (kindF !== 'all')   r = r.filter(c => c.termsKind === kindF);
    return r.sort((a,b) => b.ts.localeCompare(a.ts));
  }, [state.consents, memberF, kindF]);

  const exportCSV = () => {
    DataStore.addAudit({ type: '약관', targetId: '—', action: '게시', memo: `약관 동의 이력 CSV 내보내기(${filtered.length}건) — 감사 자료` });
    toastOk('동의 이력 CSV를 생성했습니다.');
  };

  return (
    <LP open size="wide" title="약관 동의 이력" sub="회원·버전별 동의 시점/IP/방식 (감사 자료)" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        <button className="btn btn-primary" onClick={exportCSV}><I.Download style={{ width: 12, height: 12 }}/> CSV 내보내기</button>
      </>}>
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
            </tbody>
          </table>
        </div>
      </div>
    </LP>
  );
}

window.TermsPanel = TermsPanel;
