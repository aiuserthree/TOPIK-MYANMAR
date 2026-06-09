/* panels/venues.jsx — 시험장 관리 (TPKM_BO_3_2_*)
   고객사 수정 0526: 좌석배치도/책임자/연락처 입력 항목 없음 (비고에 자유 기재)
*/

function VenuesPanel() {
  const state = useStore();
  const [edit, setEdit] = useState(null);

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
          <button className="btn btn-primary" onClick={() => setEdit({ new: true })}><I.Plus style={{ width: 14, height: 14 }}/> 시험장 등록</button>
        </div>
      </div>

      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg">
            <thead><tr>
              <th>코드</th><th>지역</th><th>한글 명칭</th><th>영문 명칭</th><th>미얀마어 명칭</th><th>주소</th><th className="num">정원</th><th>상태</th><th>비고</th><th>관리</th>
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
                  <td className="num">{DataStore.fmtNum(v.cap)}</td>
                  <td>
                    <Pill kind={v.active ? 'active' : 'inactive'}>{v.active ? '활성' : '비활성'}</Pill>
                  </td>
                  <td className="muted" style={{ maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.memo || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ibtn" onClick={() => setEdit({ id: v.id })}><I.Edit style={{ width: 12, height: 12 }}/> 수정</button>
                      <button className="ibtn" onClick={() => toggleActive(v)}>{v.active ? '비활성' : '활성'}</button>
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
    code: '', regionCode: '001', region: '양곤', nameKo: '', nameEn: '', nameMy: '', address: '', cap: 100, active: true, memo: ''
  });
  const [translating, setTranslating] = useState(false);
  const set = (k, val) => setF(s => ({ ...s, [k]: val }));
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
  const valid = /^[0-9]{2}$/.test(f.code) && f.code !== '00' && f.nameKo && f.nameEn && f.cap > 0;
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
        <FormRow label="정원" required>
          <input type="number" className="input" value={f.cap} onChange={e => set('cap', parseInt(e.target.value||'0'))}/>
        </FormRow>
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
