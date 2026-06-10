/* panels/faq.jsx — FAQ 관리 (TPKM_BO_4_2_*) */

const FAQ_CATS = ['접수','시험','결과','기타'];

function FaqPanel() {
  const state = useStore();
  const [catF, setCatF] = useState('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const canCreate = DataStore.can('faq', 'create');
  const canEdit = DataStore.can('faq', 'edit');
  const canDelete = DataStore.can('faq', 'delete');

  const filtered = useMemo(() => {
    let r = state.faqs.slice();
    if (catF !== 'all') r = r.filter(f => f.cat === catF);
    if (q) r = r.filter(f => f.question.toLowerCase().includes(q.toLowerCase()));
    return r.sort((a,b) => a.cat.localeCompare(b.cat) || a.order - b.order);
  }, [state.faqs, catF, q]);

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveFaq({ ...data, _isNew: !data.id });
      if (ok) {
        toastOk(data.id ? 'FAQ가 수정되었습니다.' : 'FAQ가 등록되었습니다.');
        setEdit(null);
      }
      return;
    }
    if (data.id) {
      const f = state.faqs.find(x => x.id === data.id);
      const before = { ...f };
      Object.assign(f, data);
      DataStore.addAudit({ type: 'FAQ', targetId: f.id, action: '수정', before, after: { ...f }, memo: '' });
      toastOk('FAQ가 수정되었습니다.');
    } else {
      const id = 'f' + (state.faqs.length + 1);
      const nw = { id, no: state.faqs.length + 1, ...data };
      state.faqs.push(nw);
      DataStore.addAudit({ type: 'FAQ', targetId: id, action: '생성', after: { ...nw }, memo: '' });
      toastOk('FAQ가 등록되었습니다.');
    }
    DataStore.notify();
    setEdit(null);
  };

  const remove = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiDeleteFaq(delId);
      if (ok) { setDelId(null); toastOk('FAQ가 삭제되었습니다.'); }
      return;
    }
    const f = state.faqs.find(x => x.id === delId);
    if (!f) return;
    state.faqs.splice(state.faqs.indexOf(f), 1);
    DataStore.addAudit({ type: 'FAQ', targetId: f.id, action: '삭제', before: { ...f }, memo: '' });
    DataStore.notify();
    setDelId(null);
    toastOk('FAQ가 삭제되었습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>FAQ 관리</h1>
          <div className="sub">자주 묻는 질문을 카테고리별로 관리합니다. FO FAQ와 직접 연동됩니다.</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> FAQ 등록</button>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          <button className={`chip ${catF === 'all' ? 'active' : ''}`} onClick={() => setCatF('all')}>전체<span className="cnt">{state.faqs.length}</span></button>
          {FAQ_CATS.map(c => (
            <button key={c} className={`chip ${catF === c ? 'active' : ''}`} onClick={() => setCatF(c)}>{c}<span className="cnt">{state.faqs.filter(f => f.cat === c).length}</span></button>
          ))}
        </div>
        <div className="controls">
          <input className="input search" placeholder="질문 검색" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th className="num">번호</th><th>분류</th><th>질문</th><th className="num">노출 순서</th><th>등록일</th><th>관리</th>
            </tr></thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td className="num">{f.no}</td>
                  <td><span className="pill" style={{ background: 'var(--bg-3)' }}>{f.cat}</span></td>
                  <td><b>{f.question}</b></td>
                  <td className="num">{f.order}</td>
                  <td className="code muted">2026-05-{(10 + f.no).toString().padStart(2,'0')}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ id: f.id })}><I.Edit style={{ width: 12, height: 12 }}/></button>
                      <button className="ibtn danger" disabled={!canDelete} onClick={() => setDelId(f.id)}><I.Trash style={{ width: 12, height: 12 }}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <FaqEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
      {delId && (
        <Modal open onClose={() => setDelId(null)} title="FAQ 삭제" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setDelId(null)}>취소</button>
            <button className="btn btn-danger" onClick={remove}>삭제</button>
          </>}>
          <div>FAQ를 삭제하시겠습니까?</div>
        </Modal>
      )}
    </>
  );
}

function FaqEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const f0 = edit.id ? state.faqs.find(x => x.id === edit.id) : null;
  const [f, setF] = useState(f0 ? { ...f0 } : { cat: '접수', question: '', answer: '', questionMy: '', questionEn: '', answerMy: '', answerEn: '', order: 1 });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.question.trim() && f.answer.trim();

  // 다국어(KO/MY/EN) 입력 — KO 필수, MY/EN 선택
  const [lang, setLang] = useState('KO');
  const qKey = lang === 'KO' ? 'question' : lang === 'MY' ? 'questionMy' : 'questionEn';
  const aKey = lang === 'KO' ? 'answer'   : lang === 'MY' ? 'answerMy'   : 'answerEn';
  return (
    <LP open title={f0 ? `FAQ 수정` : 'FAQ 등록'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(f)}>{f0 ? '저장' : '등록'}</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <FormRow label="분류" required>
          <select className="select" value={f.cat} onChange={e => set('cat', e.target.value)}>
            {FAQ_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </FormRow>
        <FormRow label="노출 순서" hint="작을수록 상단">
          <input type="number" className="input" value={f.order} min={1} onChange={e => set('order', parseInt(e.target.value || '1'))}/>
        </FormRow>
      </FieldSet>
      <FieldSet legend="내용 (KO 필수 · MY/EN 선택)" cols={1}>
        <FormRow label="언어 선택">
          <div className="seg">
            {['KO','MY','EN'].map(l => (
              <button key={l} type="button" className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
                {l}{l === 'KO' ? ' · 필수' : ''}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label={`질문 (${lang})`} required={lang === 'KO'}>
          <input className="input" value={f[qKey] || ''} onChange={e => set(qKey, e.target.value)} maxLength={120}/>
        </FormRow>
        <FormRow label={`답변 (${lang})`} required={lang === 'KO'}>
          <textarea className="textarea" rows="6" value={f[aKey] || ''} onChange={e => set(aKey, e.target.value)} maxLength={3000}/>
        </FormRow>
      </FieldSet>
    </LP>
  );
}

window.FaqPanel = FaqPanel;
