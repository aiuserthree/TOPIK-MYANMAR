/* panels/venues.jsx — 시험장 관리 (TPKM_BO_3_2_*)
   고객사 수정 0526: 좌석배치도/책임자/연락처 입력 항목 없음 (비고에 자유 기재)
*/

function VenuesPanel() {
  const state = useStore();
  const [edit, setEdit] = useState(null);
  const canCreate = DataStore.can('venues', 'create');
  const canEdit = DataStore.can('venues', 'edit');

  const list = state.venues.slice().sort((a,b) => a.regionCode.localeCompare(b.regionCode) || a.code.localeCompare(b.code));

  const save = async (data) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveVenue({ ...data, _isNew: !data.id });
      if (ok) {
        toastOk(data.id ? `${data.nameKo} 정보가 수정되었습니다.` : `${data.nameKo}가 등록되었습니다.`);
        setEdit(null);
      }
      return;
    }
    if (data.id) {
      const v = state.venues.find(x => x.id === data.id);
      const before = { ...v };
      Object.assign(v, data);
      DataStore.addAudit({ type: '시험장', targetId: v.id, action: '수정', before, after: { ...v }, memo: '' });
      toastOk(`${v.nameKo} 정보가 수정되었습니다.`);
    } else {
      // 코드 중복 검사 (동일 지역 내)
      if (state.venues.some(v => v.regionCode === data.regionCode && v.code === data.code)) {
        toastErr('동일 지역 내 시험장 코드가 중복됩니다.'); return false;
      }
      const id = 'v' + (Math.max(...state.venues.map(x => parseInt(x.id.slice(1)))) + 1).toString().padStart(2, '0');
      const nw = { id, active: true, ...data };
      state.venues.push(nw);
      DataStore.addAudit({ type: '시험장', targetId: id, action: '생성', after: { ...nw }, memo: '' });
      toastOk(`${nw.nameKo}가 등록되었습니다.`);
    }
    DataStore.notify();
    setEdit(null);
  };

  const toggleActive = async (v) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const ok = await DataStore.apiSaveVenue({ ...v, active: !v.active });
      if (ok) toastOk(`시험장이 ${!v.active ? '활성화' : '비활성화'}되었습니다.`);
      return;
    }
    const before = { active: v.active };
    v.active = !v.active;
    DataStore.addAudit({ type: '시험장', targetId: v.id, action: '수정', before, after: { active: v.active }, memo: v.active ? '활성화' : '비활성화' });
    DataStore.notify();
    toastOk(`시험장이 ${v.active ? '활성화' : '비활성화'}되었습니다.`);
  };

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>시험장 관리</h1>
          <div className="sub">국가코드 025(미얀마) · 지역코드 + 시험장코드(2자리)는 13자리 수험번호 생성에 사용됩니다.</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 시험장 등록</button>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>코드</th><th>지역</th><th>한글 명칭</th><th>영문 명칭</th><th>미얀마어 명칭</th><th>주소</th><th className="num">정원(전체/Ⅰ/Ⅱ)</th><th>상태</th><th>비고</th><th>관리</th>
            </tr></thead>
            <tbody>
              {list.map(v => (
                <tr key={v.id}>
                  <td className="code"><b>025·{v.regionCode}·{v.code}</b></td>
                  <td>{v.region}</td>
                  <td><b>{v.nameKo}</b></td>
                  <td className="muted">{v.nameEn}</td>
                  <td className="muted">{v.nameMy || '—'}</td>
                  <td className="muted" style={{ maxWidth: 240, overflow:'hidden', textOverflow:'ellipsis' }}>{v.address}</td>
                  <td className="num">{fmtCapTriple(v.cap, v.capI, v.capII)}</td>
                  <td>
                    <Pill kind={v.active ? 'active' : 'inactive'}>{v.active ? '활성' : '비활성'}</Pill>
                  </td>
                  <td className="muted" style={{ maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.memo || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" disabled={!canEdit} onClick={() => setEdit({ id: v.id })}><I.Edit style={{ width: 12, height: 12 }}/> 수정</button>
                      <button className="ibtn" disabled={!canEdit} onClick={() => toggleActive(v)}>{v.active ? '비활성' : '활성'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <VenueEditLP edit={edit} onClose={() => setEdit(null)} onSave={save}/>}
    </>
  );
}

function VenueEditLP({ edit, onClose, onSave }) {
  const state = useStore();
  const v = edit.id ? state.venues.find(x => x.id === edit.id) : null;
  const [f, setF] = useState(v ? { ...v } : {
    code: '', regionCode: '001', region: '양곤', nameKo: '', nameEn: '', nameMy: '', address: '', cap: 100, capI: 0, capII: 0, active: true, memo: ''
  });
  const [translating, setTranslating] = useState(false);
  const set = (k, val) => setF(s => ({ ...s, [k]: val }));
  // 정원 입력: 포커스 시 전체 선택 → 기존 값(0 등) 위에 바로 덮어쓸 수 있게 (회차 관리와 동일)
  const selectAllOnFocus = (e) => e.target.select();
  const parseRequiredInt = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const applyMyanmarTranslate = async () => {
    if (!f.nameKo || translating) return;
    setTranslating(true);
    try {
      if (DataStore.isApiMode && DataStore.isApiMode() && window.TopikBoApi && TopikBoApi.translateText) {
        const res = await TopikBoApi.translateText({ text: f.nameKo, source: 'ko', target: 'my' });
        if (res.ok && res.body && res.body.text) {
          set('nameMy', res.body.text);
          toastOk('미얀마어 명칭이 적용되었습니다.');
        } else {
          toastErr((TopikBoApi.parseError && TopikBoApi.parseError(res)) || '번역에 실패했습니다.');
        }
        return;
      }
      set('nameMy', f.nameKo);
      toastOk('데모: 미얀마어 명칭이 적용되었습니다.');
    } finally {
      setTranslating(false);
    }
  };
  const onRegion = (rc) => {
    const r = state.regions.find(x => x.code === rc);
    setF(s => ({ ...s, regionCode: rc, region: r ? r.name.split('(')[0] : s.region }));
  };
  const cap = Number(f.cap) || 0;
  const capI = Number(f.capI) || 0;
  const capII = Number(f.capII) || 0;
  // 급수별 정원은 전체 정원(사람 수)을 넘을 수 없다 — 회차 관리와 동일한 규칙.
  // Ⅰ+Ⅱ 합이 전체를 넘는 것은 동시 접수자 때문에 정상이다.
  const levelCapOk = !(cap > 0) || (capI <= cap && capII <= cap);
  const valid = /^[0-9]{2}$/.test(f.code) && f.code !== '00' && f.nameKo && f.nameEn && cap > 0 && levelCapOk;
  return (
    <LP open size="sm" title={v ? `시험장 수정 — ${v.nameKo}` : '시험장 등록'}
      sub={v ? '코드 변경 시 기존 부여된 수험번호와 충돌 정책 합의' : null}
      onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(f)}>{v ? '저장' : '등록'}</button>
      </>}>
      <FieldSet legend="기본" cols={2}>
        <FormRow label="국가">
          <input className="input" disabled value="미얀마 (025)"/>
        </FormRow>
        <FormRow label="지역" required>
          <select className="select" value={f.regionCode} onChange={e => onRegion(e.target.value)}>
            {state.regions.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
          </select>
        </FormRow>
        <FormRow label="시험장 코드 (2자리, 01~99)" required hint="동일 지역 내 unique, 00 사용 불가">
          <input className="input" maxLength={2} value={f.code} onChange={e => set('code', e.target.value.replace(/\D/g,''))}/>
        </FormRow>
        <FormRow label="전체 정원 (인원)" required hint="Ⅰ·Ⅱ 동시 접수자도 1명">
          <input type="number" className="input" min={0} value={f.cap || 0} onFocus={selectAllOnFocus} onChange={e => set('cap', parseRequiredInt(e.target.value))}/>
        </FormRow>
      </FieldSet>

      <FieldSet legend="급수별 정원 (접수 원서 수)" cols={2}>
        <FormRow label="TOPIK Ⅰ 정원" hint="0 = 미정(무제한)">
          <input type="number" className="input" min={0} value={f.capI || 0} onFocus={selectAllOnFocus} onChange={e => set('capI', parseRequiredInt(e.target.value))}/>
        </FormRow>
        <FormRow label="TOPIK Ⅱ 정원" hint="0 = 미정(무제한)">
          <input type="number" className="input" min={0} value={f.capII || 0} onFocus={selectAllOnFocus} onChange={e => set('capII', parseRequiredInt(e.target.value))}/>
        </FormRow>
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-3)' }}>
          ※ 전체 정원과 별개로 적용됩니다. 급수별 정원이 차면 이 시험장에서는 해당 급수만 접수가 막히고 다른 급수는 계속 접수됩니다.
          Ⅰ·Ⅱ 동시 접수자 때문에 <b>Ⅰ+Ⅱ 합이 전체 정원보다 커도 정상</b>이며,
          <b>각 급수 정원은 전체 정원을 넘을 수 없습니다.</b>
        </div>
        {!levelCapOk && (
          <div style={{ gridColumn: '1 / -1', padding: 10, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 6, fontSize: 12.5 }}>
            ※ 급수별 정원({DataStore.fmtNum(capI)} / {DataStore.fmtNum(capII)})이 전체 정원({DataStore.fmtNum(cap)})을 초과했습니다.
            각 급수 정원을 전체 정원 이하로 입력해 주세요.
          </div>
        )}
      </FieldSet>

      <FieldSet legend="명칭 / 주소" cols={1}>
        <FormRow label="한글 명칭" required>
          <input className="input" value={f.nameKo} onChange={e => set('nameKo', e.target.value)} placeholder="예: 양곤대 흘라잉캠퍼스"/>
        </FormRow>
        <FormRow label="영문 명칭" required>
          <input className="input" value={f.nameEn} onChange={e => set('nameEn', e.target.value)} placeholder="예: Yangon Univ. Hlaing Campus"/>
        </FormRow>
        <FormRow label="미얀마어 명칭" hint="한글 명칭 기준 자동 번역 · 필요 시 직접 수정">
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <input className="input" style={{ flex: 1 }} value={f.nameMy || ''} onChange={e => set('nameMy', e.target.value)} placeholder="မြန်မာဘာသာ အမည်"/>
            <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} disabled={!f.nameKo || translating} onClick={applyMyanmarTranslate}>
              {translating ? '번역 중…' : '적용'}
            </button>
          </div>
        </FormRow>
        <FormRow label="주소">
          <input className="input" value={f.address} onChange={e => set('address', e.target.value)}/>
        </FormRow>
      </FieldSet>

      <FieldSet legend="기타" cols={1}>
        <FormRow label="상태">
          <div className="seg">
            <button className={f.active ? 'active' : ''} onClick={() => set('active', true)} type="button">활성</button>
            <button className={!f.active ? 'active' : ''} onClick={() => set('active', false)} type="button">비활성</button>
          </div>
        </FormRow>
        <FormRow label="비고" hint="좌석배치도·시험장 책임자·연락처 등 운영 정보는 이 비고란에 자유 기재(고객사 수정 0526)">
          <textarea className="textarea" rows="3" value={f.memo} onChange={e => set('memo', e.target.value)}/>
        </FormRow>
      </FieldSet>
    </LP>
  );
}

window.VenuesPanel = VenuesPanel;
