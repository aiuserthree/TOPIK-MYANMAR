/* panels/sessions.jsx — 회차 관리 (TPKM_BO_3_1_*) */

function SessionsPanel() {
  const state = useStore();
  const [edit, setEdit] = useState(null); // {id} or {new:true}
  const [delId, setDelId] = useState(null);
  const canCreate = DataStore.can('sessions', 'create');
  const canEdit = DataStore.can('sessions', 'edit');
  const canDelete = DataStore.can('sessions', 'delete');
  const revokeTarget = delId ? state.sessions.find(x => x.id === delId) : null;

  const sessions = state.sessions.slice().sort((a,b) => (b.examDate || '').localeCompare(a.examDate || ''));

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveSession({ ...data, _isNew: !data.id });
      if (ok) {
        toastOk(data.id ? `${data.name} 정보가 수정되었습니다.` : `${data.name} 회차가 등록되었습니다.`);
        setEdit(null);
      }
      return;
    }
    const session = data.id ? state.sessions.find(s => s.id === data.id) : null;
    if (session) {
      const before = { ...session };
      Object.assign(session, data);
      DataStore.addAudit({ type: '회차', targetId: session.id, action: '수정', before, after: { ...session }, memo: '회차 수정' });
      toastOk(`${session.name} 정보가 수정되었습니다.`);
    } else {
      const id = 's' + (Math.max(...state.sessions.map(s => parseInt(s.id.slice(1)))) + 1);
      const nw = { id, applicants: 0, ...data };
      state.sessions.push(nw);
      DataStore.addAudit({ type: '회차', targetId: id, action: '생성', after: { ...nw }, memo: '회차 신규 등록' });
      toastOk(`${nw.name} 회차가 등록되었습니다.`);
    }
    DataStore.notify();
    setEdit(null);
  };

  const duplicate = (s) => {
    const id = 's' + (Math.max(...state.sessions.map(x => parseInt(x.id.slice(1)))) + 1);
    const copy = { ...s, id, no: s.no + 1, name: `제${s.no + 1}회 TOPIK(복제)`, status: 'planned', applicants: 0 };
    state.sessions.push(copy);
    DataStore.addAudit({ type: '회차', targetId: id, action: '생성', after: { ...copy }, memo: `복제: ${s.name}` });
    DataStore.notify();
    toastOk('회차가 복제되었습니다.');
  };

  const remove = async () => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiRevokeSession(delId);
      if (ok) {
        setDelId(null);
        toastOk('회차가 폐지되었습니다.');
      }
      return;
    }
    const s = state.sessions.find(x => x.id === delId);
    if (!s) return;
    const before = { ...s };
    s.status = 'revoked';
    DataStore.addAudit({ type: '회차', targetId: s.id, action: '폐지', before, after: { ...s }, memo: '회차 폐지' });
    DataStore.notify();
    setDelId(null);
    toastOk('회차가 폐지되었습니다.');
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>회차 관리</h1>
          <div className="sub">시험 회차를 등록·수정·복제합니다. 모든 변경은 처리 이력에 자동 기록됩니다.</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 회차 등록</button>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead>
              <tr>
                <th>회차</th><th>회차명</th><th>접수기간</th><th>시험일</th><th>발표일</th>
                <th className="num">정원</th><th className="num">접수자</th><th>응시료(Ⅰ/Ⅱ)</th><th>시험장</th><th>상태</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const isRevoked = s.status === 'revoked';
                const isOpen = s.status === 'open', isClosed = s.status === 'closed';
                const statusKind = isRevoked ? 'retired' : isOpen ? 'approved' : isClosed ? 'cancel' : 'applied';
                const statusLabel = isRevoked ? '폐지' : isOpen ? '접수중' : isClosed ? '마감' : '예정';
                return (
                  <tr key={s.id} style={isRevoked ? { opacity: 0.6 } : undefined}>
                    <td className="code-id">{s.no}회</td>
                    <td><b>{s.name}</b></td>
                    <td className="code">{s.applyStart} ~ {s.applyEnd}</td>
                    <td className="code">{s.examDate}</td>
                    <td className="code muted">{DataStore.fmtResultDate(s.resultDate)}</td>
                    <td className="num">{DataStore.fmtNum(s.cap)}</td>
                    <td className="num">{DataStore.fmtNum(s.applicants || 0)}</td>
                    <td className="code">{DataStore.fmtNum(s.feeI)}/{DataStore.fmtNum(s.feeII)}</td>
                    <td>{s.venues.length}개소</td>
                    <td><Pill kind={statusKind}>{statusLabel}</Pill></td>
                    <td>
                      <div className="row-actions">
                        {!isRevoked && <>
                          <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ id: s.id })}><I.Edit style={{ width: 12, height: 12 }}/> 수정</button>
                          <button className="ibtn" disabled={!canCreate} onClick={() => duplicate(s)}><I.Copy style={{ width: 12, height: 12 }}/> 복제</button>
                          <button className="ibtn danger" disabled={!canDelete} onClick={() => setDelId(s.id)}><I.Trash style={{ width: 12, height: 12 }}/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <SessionEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
      {delId && revokeTarget && (
        <Modal open onClose={() => setDelId(null)} title="회차 폐지" danger
          footer={<>
            <button className="btn btn-secondary" onClick={() => setDelId(null)}>취소</button>
            <button className="btn btn-danger" onClick={remove}>폐지</button>
          </>}>
          <div>
            <b>{revokeTarget.name}</b> ({revokeTarget.no}회) 회차를 폐지하시겠습니까?
            <br/><br/>
            <span className="muted">접수자 정보는 유지되며 회차는 비공개로 전환됩니다.</span>
          </div>
        </Modal>
      )}
    </>
  );
}

function SessionEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const [busy, setBusy] = useState(false);
  const existing = edit.id ? state.sessions.find(s => s.id === edit.id) : null;
  const nextNo = state.sessions.length
    ? Math.max(...state.sessions.map(s => Number(s.no) || 0)) + 1
    : 1;
  const [f, setF] = useState(() => existing ? {
    ...existing,
    venues: (existing.venues || []).map(String),
    resultDate: existing.resultDate || '',
    cap: existing.cap != null ? Number(existing.cap) : 0,
    feeI: existing.feeI != null ? Number(existing.feeI) : 0,
    feeII: existing.feeII != null ? Number(existing.feeII) : 0,
    no: existing.no != null ? Number(existing.no) : nextNo,
  } : {
    no: nextNo,
    name: '',
    applyStart: '', applyEnd: '', examDate: '', resultDate: '',
    cap: 1000, feeI: 25, feeII: 25, venues: [], status: 'planned'
  });

  useEffect(() => { if (!f.name && !existing) setF(s => ({ ...s, name: `제${s.no}회 TOPIK` })); }, []);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const selectAllOnFocus = (e) => e.target.select();
  const parseRequiredInt = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const toggleVenue = (vid) => setF(s => {
    const venues = (s.venues || []).map(String);
    const id = String(vid);
    return { ...s, venues: venues.includes(id) ? venues.filter(x => x !== id) : [...venues, id] };
  });
  const venues = (f.venues || []).map(String);
  const cap = Number(f.cap);
  const feeI = Number(f.feeI);
  const feeII = Number(f.feeII);

  const validateApplyWindow = (start, end) => {
    if (!start || !end) return true;
    if (end < start) {
      toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
      return false;
    }
    return true;
  };

  const scheduleOk = f.applyStart && f.applyEnd && f.examDate
    && f.applyStart <= f.applyEnd && f.applyEnd <= f.examDate
    && (!f.resultDate || f.examDate <= f.resultDate);
  const valid = f.name.trim()
    && scheduleOk
    && !Number.isNaN(cap) && cap >= 0
    && !Number.isNaN(feeI) && feeI > 0
    && !Number.isNaN(feeII) && feeII > 0
    && venues.length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    if (!validateApplyWindow(f.applyStart, f.applyEnd)) return;
    setBusy(true);
    try {
      await onSave(f);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LP open title={existing ? `회차 수정 — ${existing.name}` : '회차 등록'} sub={existing ? `회차 ID ${existing.id}` : '신규 회차'}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>취소</button>
        <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={submit}>{busy ? '처리 중…' : (existing ? '저장' : '등록')}</button>
      </>}>
      <FieldSet legend="기본 정보" cols={2}>
        <FormRow label="회차 번호" required>
          <input type="number" className="input" value={f.no} onFocus={selectAllOnFocus} onChange={e => set('no', parseRequiredInt(e.target.value))}/>
        </FormRow>
        <FormRow label="회차명" required>
          <input className="input" value={f.name} onChange={e => set('name', e.target.value)}/>
        </FormRow>
        <FormRow label="접수 상태">
          <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', color: 'var(--text-2)', cursor: 'default' }}>
            {existing
              ? ({ planned: '예정', open: '접수중', closed: '마감', revoked: '폐지' }[f.status] || f.status)
              : '저장 시 접수기간 기준 자동 설정'}
          </div>
          <span className="hint">접수 시작일 00:00(MMT) 이전=예정 · 기간 내=접수중 · 마감일 23:59(MMT) 이후=마감. 폐지는 목록에서 별도 처리.</span>
        </FormRow>
        <FormRow label="정원" required>
          <input type="number" className="input" value={f.cap} min={0} onFocus={selectAllOnFocus} onChange={e => set('cap', parseRequiredInt(e.target.value))}/>
        </FormRow>
      </FieldSet>

      <FieldSet legend="일정" cols={2}>
        <FormRow label="접수 시작일" required>
          <input type="date" className="input" value={f.applyStart} onChange={e => {
            const v = e.target.value;
            if (f.applyEnd && v && f.applyEnd < v) {
              toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
              return;
            }
            set('applyStart', v);
          }}/>
        </FormRow>
        <FormRow label="접수 마감일" required>
          <input type="date" className="input" value={f.applyEnd} onChange={e => {
            const v = e.target.value;
            if (f.applyStart && v && v < f.applyStart) {
              toastErr('접수 마감일은 접수 시작일 이후여야 합니다.');
              return;
            }
            set('applyEnd', v);
          }}/>
        </FormRow>
        <FormRow label="시험일" required><input type="date" className="input" value={f.examDate} onChange={e => set('examDate', e.target.value)}/></FormRow>
        <FormRow label="합격발표일"><input type="date" className="input" value={f.resultDate} onChange={e => set('resultDate', e.target.value)} placeholder="미정 시 비워두기"/></FormRow>
      </FieldSet>

      <FieldSet legend="응시료(USD)" cols={2}>
        <FormRow label="TOPIK Ⅰ" required><input type="number" step="1" min={1} className="input" value={f.feeI} onFocus={selectAllOnFocus} onChange={e => set('feeI', parseRequiredInt(e.target.value))}/></FormRow>
        <FormRow label="TOPIK Ⅱ" required><input type="number" step="1" min={1} className="input" value={f.feeII} onFocus={selectAllOnFocus} onChange={e => set('feeII', parseRequiredInt(e.target.value))}/></FormRow>
      </FieldSet>

      <FieldSet legend="시험장 다중 선택">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {state.venues.filter(v => v.active).map(v => (
            <label key={v.id} className="kv" style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <input type="checkbox" checked={venues.includes(String(v.id))} onChange={() => toggleVenue(v.id)}/>
              <div>
                <div className="k">{v.region} · 코드 {v.code}</div>
                <div className="v" style={{ fontSize: 13, fontWeight: 500 }}>{v.nameKo}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>※ 활성 시험장만 선택할 수 있습니다.</div>
      </FieldSet>

      {!valid && (
        <div style={{ padding: 10, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 6, fontSize: 12.5 }}>
          ※ 모든 필수 항목 입력 + 일정 순서(접수시작 ≤ 접수마감 ≤ 시험일) + 시험장 1개 이상 선택이 필요합니다. 정원 0은 미정을 의미합니다. 합격발표일은 미정 시 비워두세요.
          {!venues.length && state.venues.filter(v => v.active).length === 0 && (
            <><br/>활성 시험장이 없습니다. 시험장 관리에서 먼저 등록·활성화해 주세요.</>
          )}
        </div>
      )}
    </LP>
  );
}

window.SessionsPanel = SessionsPanel;
