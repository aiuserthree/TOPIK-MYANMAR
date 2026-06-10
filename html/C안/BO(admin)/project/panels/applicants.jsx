/* ============================================================
   panels/applicants.jsx — 접수자 관리
   IDs from docs/02_apply.md:
     TPKM_BO_2_1_1  필터+검색 (상태칩7/시험장/급수/검색)
     TPKM_BO_2_1_2  데이터 그리드 (연명부 컬럼 정합)
     TPKM_BO_2_1_3  오프라인 수납(+사진/기본정보 동시 확인, 다중 처리, 수납취소→환불자)
     TPKM_BO_2_1_4  승인 처리 (사진 미심사 가드)
     TPKM_BO_2_1_5  반려 처리 (사유 필수)
     TPKM_BO_2_1_6  상세 보기 LP (프로필+사진+메모+처리 이력)
     TPKM_BO_2_1_7  수험번호 13자리 일괄 부여
     TPKM_BO_2_1_8  엑셀(연명부 양식) 내보내기
     TPKM_BO_2_1_9  사진 zip 다운로드(폴더 구조)
     TPKM_BO_2_1_10 인쇄
   ============================================================ */

const STATUS_CHIPS = [
  { id: 'all',      label: '전체' },
  { id: 'applied',  label: '접수완료' },
  { id: 'photo',    label: '사진심사중' },
  { id: 'pay',      label: '수납대기' },
  { id: 'approved', label: '승인완료' },
  { id: 'rejected', label: '반려' },
  { id: 'cancel',   label: '취소' },
  { id: 'refund',   label: '환불자' },
];

const GENERAL_REJECT_REASONS = ['정보 불일치', '중복 접수', '기타'];

/** FO 접수 취소 — API `cancelled` → BO `cancel` (bo-api-bridge mapApplicantStatus) */
function isFoCancelled(a) {
  return !!(a && a.status === 'cancel');
}

function ApplicantsPanel() {
  const state = useStore();
  const sessionId = state.activeSessionId;
  const apps = useMemo(() => state.applicants.filter(a => a.sessionId === sessionId), [state.applicants, sessionId]);

  // ---- Filter / search ----
  const [statusF, setStatusF] = useState('all');
  const [venueF, setVenueF] = useState('all');
  const [levelF, setLevelF] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ k: 'no', dir: 'asc' });
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;

  // URL sync (북마크 가능)
  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (params.has('s')) setStatusF(params.get('s'));
    if (params.has('v')) setVenueF(params.get('v'));
    if (params.has('l')) setLevelF(params.get('l'));
    if (params.has('q')) setQ(params.get('q'));
  }, []);

  const filtered = useMemo(() => {
    let r = apps;
    if (statusF !== 'all') r = r.filter(a => a.status === statusF);
    if (venueF !== 'all')  r = r.filter(a => a.venueId === venueF);
    if (levelF !== 'all')  r = r.filter(a => a.level === levelF);
    if (q) {
      const qq = q.trim().toLowerCase();
      r = r.filter(a => a.nameKo.includes(qq) || a.nameEn.toLowerCase().includes(qq) || (a.email && a.email.toLowerCase().includes(qq)) || a.dob.includes(qq) || (a.exam && a.exam.includes(qq)));
    }
    // sort
    r = r.slice().sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      const cmp = String(va).localeCompare(String(vb), 'ko');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [apps, statusF, venueF, levelF, q, sort]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [statusF, venueF, levelF, q, sessionId]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // status counts (for chip badges)
  const counts = useMemo(() => {
    const c = { all: apps.length };
    STATUS_CHIPS.forEach(x => { if (x.id !== 'all') c[x.id] = 0; });
    apps.forEach(a => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [apps]);

  // ---- Selection ----
  const [selected, setSelected] = useState(() => new Set());
  const allOnPage = pageRows.every(r => selected.has(r.id)) && pageRows.length > 0;
  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPage) pageRows.forEach(r => next.delete(r.id));
    else pageRows.forEach(r => next.add(r.id));
    setSelected(next);
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // ---- Modals ----
  const [detailId, setDetailId] = useState(null);
  const [payModal, setPayModal] = useState(null);          // { ids:[], mode:'pay'|'cancel' }
  const [approveModal, setApproveModal] = useState(null);  // { ids:[] }
  const [rejectModal, setRejectModal] = useState(null);    // { ids:[] }
  const [examModal, setExamModal] = useState(false);
  const [excelModal, setExcelModal] = useState(false);
  const [zipModal, setZipModal] = useState(false);
  const [photoLP, setPhotoLP] = useState(null);   // 사진 심사 인라인 패널 id (TPKM_BO_2_1_3)

  // expose detail open to other panels (Dashboard 'Recent')
  useEffect(() => { window.openApplicantDetail = (id) => setDetailId(id); }, []);

  // ---- 사진 심사 (인라인) handlers — TPKM_BO_2_1_3 ----
  const doPhotoApprove = async (id) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      if (await DataStore.apiPhotoApprove(id)) toastOk('사진이 승인되었습니다.', { title: '사진 심사', type: 'success' });
      return;
    }
    const a = state.applicants.find(x => x.id === id);
    if (!a) return;
    const before = { photoStatus: a.photoStatus, status: a.status };
    a.photoStatus = 'approved';
    a.photoOk = true;
    // 사진 승인으로 후속 상태 진행
    if (a.status === 'photo') a.status = a.paid ? 'applied' : 'pay';
    DataStore.addAudit({ type: '사진', targetId: id, action: '승인', before, after: { photoStatus: 'approved', status: a.status }, memo: '' });
    DataStore.notify();
    toastOk('사진이 승인되었습니다.', { title: '사진 심사', type: 'success' });
  };
  const doPhotoReject = async (id, reason) => {
    if (!reason || !reason.trim()) { toastErr('반려 사유를 입력해주세요.'); return; }
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      if (await DataStore.apiPhotoReject(id, reason)) toastOk('사진이 반려되었습니다. 반려 사유는 FO 마이페이지에 안내됩니다.', { title: '사진 심사', type: 'success' });
      return;
    }
    const a = state.applicants.find(x => x.id === id);
    if (!a) return;
    const before = { photoStatus: a.photoStatus, status: a.status, rejectReason: a.rejectReason };
    a.photoStatus = 'rejected';
    a.photoOk = false;
    a.status = 'rejected';
    a.rejectReason = reason;
    DataStore.addAudit({ type: '사진', targetId: id, action: '반려', before, after: { photoStatus: 'rejected', status: 'rejected', rejectReason: reason }, memo: reason });
    DataStore.notify();
    toastOk('사진이 반려되었습니다. 반려 사유는 FO 마이페이지에 안내됩니다.', { title: '사진 심사', type: 'success' });
  };
  const doBulkPhotoApprove = async (ids) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      let n = 0;
      for (const id of ids) {
        if (await DataStore.apiPhotoApprove(id)) n++;
      }
      if (n) toastOk(`${n}건의 사진을 일괄 승인했습니다.`, { title: '사진 심사', type: 'success' });
      else toastErr('이미 모두 승인된 상태입니다.');
      setSelected(new Set());
      return;
    }
    let n = 0;
    ids.forEach(id => {
      const a = state.applicants.find(x => x.id === id);
      if (!a || a.photoStatus === 'approved') return;
      const before = { photoStatus: a.photoStatus, status: a.status };
      a.photoStatus = 'approved';
      a.photoOk = true;
      if (a.status === 'photo') a.status = a.paid ? 'applied' : 'pay';
      n++;
      DataStore.addAudit({ type: '사진', targetId: id, action: '승인', before, after: { photoStatus: 'approved', status: a.status }, memo: '일괄 사진 승인' });
    });
    DataStore.notify();
    if (n) toastOk(`${n}건의 사진을 일괄 승인했습니다.`, { title: '사진 심사', type: 'success' });
    else toastErr('이미 모두 승인된 상태입니다.');
    setSelected(new Set());
  };
  const doApprove = async (ids) => {
    // 사진 미심사 행 가드 — 사진 승인 완료 건만 승인 가능
    const blocked = ids.filter(id => {
      const a = state.applicants.find(x => x.id === id);
      return a && a.photoStatus !== 'approved';
    });
    if (blocked.length) {
      toastErr(`사진 미심사 ${blocked.length}건이 포함되어 있습니다. 상세보기에서 먼저 심사해주세요.`, { title: '승인 불가' });
      return;
    }
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const n = await DataStore.apiApprove(ids);
      if (n) toastOk(`${n}건이 승인되었습니다.`, { title: '승인 완료', type: 'success' });
      setApproveModal(null);
      setSelected(new Set());
      return;
    }
    let n = 0;
    ids.forEach(id => {
      const a = state.applicants.find(x => x.id === id);
      if (!a) return;
      const before = { status: a.status };
      a.status = 'approved';
      n++;
      DataStore.addAudit({ type: '접수자', targetId: id, action: '승인', before, after: { status: 'approved' }, memo: '' });
    });
    DataStore.notify();
    toastOk(`${n}건이 승인되었습니다.`, { title: '승인 완료', type: 'success' });
    setApproveModal(null);
    setSelected(new Set());
  };

  const doReject = async (ids, reason) => {
    if (!reason || !reason.trim()) { toastErr('반려 사유를 입력해주세요.'); return; }
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const n = await DataStore.apiReject(ids, reason);
      if (n) toastOk(`${n}건이 반려되었습니다.`, { title: '반려 완료', type: 'success' });
      setRejectModal(null);
      setSelected(new Set());
      return;
    }
    let n = 0;
    ids.forEach(id => {
      const a = state.applicants.find(x => x.id === id);
      if (!a) return;
      const before = { status: a.status, rejectReason: a.rejectReason };
      a.status = 'rejected';
      a.rejectReason = reason;
      n++;
      DataStore.addAudit({ type: '접수자', targetId: id, action: '반려', before, after: { status: 'rejected', rejectReason: reason }, memo: reason });
    });
    DataStore.notify();
    toastOk(`${n}건이 반려되었습니다.`, { title: '반려 완료', type: 'success' });
    setRejectModal(null);
    setSelected(new Set());
  };

  const doPay = async (ids, info) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const n = await DataStore.apiPay(ids, info);
      if (n) toastOk(`${n}건 수납 처리되었습니다.`, { title: '수납 완료', type: 'success' });
      setPayModal(null);
      setSelected(new Set());
      return;
    }
    let n = 0;
    ids.forEach(id => {
      const a = state.applicants.find(x => x.id === id);
      if (!a || a.paid) return;
      const before = { paid: a.paid, status: a.status };
      a.paid = true;
      a.paidAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
      a.receipt = info.receipt || `R-${Math.floor(10000 + Math.random() * 89999)}`;
      a.memo = (a.memo || '') + (info.memo ? `[수납] ${info.memo}\n` : '');
      // 사진·수납 완료 시 접수완료(승인처리는 별도)
      if (a.photoOk && (a.status === 'pay' || a.status === 'photo')) a.status = 'applied';
      else if (a.status === 'applied' && !a.photoOk) a.status = 'photo';
      n++;
      DataStore.addAudit({ type: '접수자', targetId: id, action: '수납', before, after: { paid: true, status: a.status }, memo: info.memo || '' });
    });
    DataStore.notify();
    toastOk(`${n}건 수납 처리되었습니다.`, { title: '수납 완료', type: 'success' });
    setPayModal(null);
    setSelected(new Set());
  };

  const doCancelPay = async (ids, reason) => {
    if (!reason || !reason.trim()) { toastErr('수납 취소(환불) 사유를 입력해주세요.'); return; }
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const n = await DataStore.apiCancelPay(ids);
      if (n) toastOk(`${n}건 수납 취소(환불자 분류) 처리되었습니다.`, { title: '수납 취소', type: 'success' });
      setPayModal(null);
      setSelected(new Set());
      return;
    }
    let n = 0;
    ids.forEach(id => {
      const a = state.applicants.find(x => x.id === id);
      if (!a || !a.paid) return;
      const before = { paid: a.paid, status: a.status };
      a.paid = false;
      a.status = 'refund';                 // 환불자 상태로 분류 (수험번호는 유지)
      a.memo = (a.memo || '') + `[환불] ${reason}\n`;
      n++;
      DataStore.addAudit({ type: '접수자', targetId: id, action: '수납취소', before, after: { paid: false, status: 'refund' }, memo: reason });
    });
    DataStore.notify();
    toastOk(`${n}건 수납 취소(환불자 분류) 처리되었습니다.`, { title: '수납 취소', type: 'success' });
    setPayModal(null);
    setSelected(new Set());
  };

  // 수험번호 13자리 일괄 부여
  const doAssignExam = async (preview = false) => {
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      const body = await DataStore.apiAssignExamNumbers(sessionId, preview);
      if (!body) return null;
      if (preview) {
        return {
          result: (body.preview || []).map(function (exam, i) { return { id: '', name: '', nameKo: '', exam: exam, level: '' }; }),
          targets: body.assigned || (body.preview || []).length,
          skipped: 0,
        };
      }
      toastOk(`${body.assigned || 0}건에 수험번호가 일괄 부여되었습니다.`, { title: '수험번호 부여 완료' });
      return { result: [], targets: body.assigned || 0 };
    }
    const session = state.sessions.find(s => s.id === sessionId);
    // 대상: paid && photoOk && status NOT IN (cancel, rejected) && exam 비어있음
    const targets = state.applicants
      .filter(a => a.sessionId === sessionId)
      .filter(a => a.paid && a.photoOk && !['cancel', 'rejected'].includes(a.status) && !a.exam);
    // 같은 시험장에서 동시접수(Ⅰ+Ⅱ) 강제: 본 데모에서는 lvl=동시 동일 처리
    // 알파벳 오름차순(영문)
    const sorted = targets.slice().sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    // 그룹: 시험장×수준(7/8)
    const seqs = {}; // key: venueCode|lvlCode → 0001 시작
    const result = [];
    for (const a of sorted) {
      const v = state.venues.find(x => x.id === a.venueId);
      const venueCode = v ? v.code : '01';
      const regionCode = v ? v.regionCode : '001';
      const lvlCodes = a.level === '동시' ? ['7', '8'] : [a.level === 'Ⅰ' ? '7' : '8'];
      const assigned = [];
      for (const lc of lvlCodes) {
        const key = venueCode + '|' + lc;
        seqs[key] = (seqs[key] || 0) + 1;
        const num = `025${regionCode}${lc}${venueCode}${String(seqs[key]).padStart(4, '0')}`;
        assigned.push(num);
      }
      result.push({ id: a.id, name: a.nameEn, nameKo: a.nameKo, exam: assigned.join(' / '), level: a.level });
    }

    if (preview) return { result, targets: targets.length, skipped: state.applicants.filter(a => a.sessionId === sessionId).length - targets.length };

    // 확정
    for (const r of result) {
      const a = state.applicants.find(x => x.id === r.id);
      a.exam = r.exam;
      DataStore.addAudit({ type: '접수자', targetId: r.id, action: '수험번호부여', after: { exam: a.exam }, memo: `회차 ${session?.no} 알파벳순 부여` });
    }
    DataStore.notify();
    toastOk(`${result.length}건에 수험번호가 일괄 부여되었습니다.`, { title: '수험번호 부여 완료' });
    return { result, targets: targets.length };
  };

  const canAssignExam = DataStore.can('applicants', 'exam');
  const canDownload = DataStore.can('applicants', 'export');
  const canPhoto = DataStore.can('applicants', 'photo');
  const canPay = DataStore.can('applicants', 'pay');
  const canApprove = DataStore.can('applicants', 'approve');
  const canReject = DataStore.can('applicants', 'reject');
  const isReadonly = DataStore.isReadonly();

  // bulk action helpers
  const bulkIds = Array.from(selected);

  // sort helper
  const sortBy = (k) => setSort(s => s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'asc' });

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>접수자 관리</h1>
          <div className="sub">사진 심사·수납·승인·반려·수험번호 부여를 단일 메뉴에서 동시에 진행합니다.</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setExcelModal(true)} disabled={!canDownload}>
            <I.Download style={{ width: 14, height: 14 }}/> 연명부 엑셀
          </button>
          <button className="btn btn-secondary" onClick={() => setZipModal(true)} disabled={!canDownload}>
            <I.Download style={{ width: 14, height: 14 }}/> 사진 zip
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <I.Printer style={{ width: 14, height: 14 }}/> 인쇄
          </button>
          <button className="btn btn-primary" disabled={!canAssignExam} onClick={() => setExamModal(true)}>
            <I.Hash style={{ width: 14, height: 14 }}/> 수험번호 일괄 부여
          </button>
        </div>
      </div>

      {/* Filter bar — TPKM_BO_2_1_1 */}
      <div className="filterbar no-print">
        <div className="chips">
          {STATUS_CHIPS.map(c => (
            <button key={c.id}
              className={`chip ${statusF === c.id ? 'active' : ''}`}
              onClick={() => setStatusF(c.id)}>
              {c.label}<span className="cnt">{DataStore.fmtNum(counts[c.id] || 0)}</span>
            </button>
          ))}
        </div>
        <div className="controls">
          <select className="select" value={venueF} onChange={e => setVenueF(e.target.value)}>
            <option value="all">전체 시험장</option>
            {state.venues.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.nameKo}</option>)}
          </select>
          <select className="select" value={levelF} onChange={e => setLevelF(e.target.value)}>
            <option value="all">전체 급수</option>
            <option value="Ⅰ">TOPIK Ⅰ</option>
            <option value="Ⅱ">TOPIK Ⅱ</option>
            <option value="동시">동시(Ⅰ+Ⅱ)</option>
          </select>
          <input className="input search" type="text" placeholder="한글·영문 성명/이메일/생년월일/수험번호"
            value={q} onChange={e => setQ(e.target.value)}/>
          {(statusF !== 'all' || venueF !== 'all' || levelF !== 'all' || q) && (
            <button className="ibtn ghost" onClick={() => { setStatusF('all'); setVenueF('all'); setLevelF('all'); setQ(''); }}>
              조건 초기화
            </button>
          )}
        </div>
      </div>

      {isReadonly && (
        <div style={{ padding: 12, background: 'var(--st-photo-bg)', color: 'var(--st-photo)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⓘ 조회 전용 계정입니다. 사진 심사·수납·승인·반려 등 변경 작업이 비활성화됩니다.
        </div>
      )}

      {/* Bulk action bar */}
      <BulkBar count={bulkIds.length} onClear={() => setSelected(new Set())}>
        <button className="ibtn" disabled={!canPhoto} onClick={() => doBulkPhotoApprove(bulkIds)}>사진 일괄 승인</button>
        <button className="ibtn" disabled={!canPay} onClick={() => setPayModal({ ids: bulkIds, mode: 'pay' })}>오프라인 수납</button>
        <button className="ibtn" disabled={!canApprove} onClick={() => setApproveModal({ ids: bulkIds })}>승인</button>
        <button className="ibtn danger" disabled={!canReject} onClick={() => setRejectModal({ ids: bulkIds })}>반려</button>
        <button className="ibtn" disabled={!canPay} onClick={() => setPayModal({ ids: bulkIds.filter(id => state.applicants.find(a => a.id === id)?.paid), mode: 'cancel' })}>수납 취소(환불)</button>
      </BulkBar>

      {/* Data grid — TPKM_BO_2_1_2 연명부 컬럼 정합 */}
      <div className="dg-wrap">
        <div className="dg-scroll">
          <table className="dg" id="applicants-grid">
            <thead>
              <tr>
                <th className="cb"><input type="checkbox" checked={allOnPage} onChange={toggleAllOnPage}/></th>
                <th className="sortable num" onClick={() => sortBy('no')}>번호</th>
                <th>사진</th>
                <th className="sortable" onClick={() => sortBy('nameKo')}>한글성명</th>
                <th className="sortable" onClick={() => sortBy('nameEn')}>영문성명</th>
                <th className="sortable" onClick={() => sortBy('email')}>이메일</th>
                <th>급수</th>
                <th className="sortable" onClick={() => sortBy('appliedAt')}>접수일</th>
                <th>사진심사</th>
                <th>수납</th>
                <th>수험번호</th>
                <th>상태</th>
                <th className="no-print">관리</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(a => (
                <tr key={a.id} className={selected.has(a.id) ? 'sel' : ''}>
                  <td className="cb"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)}/></td>
                  <td className="num">{a.no}</td>
                  <td>
                    <PhotoThumb status={a.photoStatus} name={a.nameKo} seed={a.id} photoUrl={a.photoUrl}/>
                  </td>
                  <td><a style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setDetailId(a.id)}>{a.nameKo}</a></td>
                  <td>{a.nameEn}</td>
                  <td className="muted">{a.email || '—'}</td>
                  <td><span className="code-id">{a.level}</span></td>
                  <td className="code muted">{a.appliedAt}</td>
                  <td><PhotoStatusPill status={a.photoStatus}/></td>
                  <td>{a.paid ? <Pill kind="approved">수납완료</Pill> : <Pill kind="pay">미수납</Pill>}</td>
                  <td className="code"><b style={{ color: a.exam ? 'var(--st-number)' : 'var(--text-4)' }}>{a.exam || '—'}</b></td>
                  <td><Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></td>
                  <td className="no-print">
                    <div className="row-actions">
                      <button className="ibtn" title="상세 보기" onClick={() => setDetailId(a.id)}><I.Eye style={{ width: 14, height: 14 }}/> 상세보기</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan="13">
                  <div className="empty">
                    <div className="icon"><I.Search/></div>
                    <div className="ttl">조건에 맞는 접수자가 없습니다</div>
                    <div className="sub">필터/검색 조건을 변경해 보세요.</div>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dg-foot no-print">
          <div className="info">총 <b style={{ color: 'var(--text)', fontFamily: 'Inter' }}>{DataStore.fmtNum(filtered.length)}</b>건 · 페이지 {page} / {totalPages}</div>
          <Pager page={page} total={totalPages} onPage={setPage}/>
        </div>
      </div>

      {/* 노출시점 설정 — 서버 저장(exam_number_visible_at) */}
      <ExamVisibilityCard sessionId={sessionId}/>

      {/* Detail LP (TPKM_BO_2_1_6) */}
      {detailId && <ApplicantDetailLP id={detailId} onClose={() => setDetailId(null)}
        onApprove={() => { setApproveModal({ ids: [detailId] }); }}
        onReject={() => { setRejectModal({ ids: [detailId] }); }}
        onPay={() => { const a = state.applicants.find(x => x.id === detailId); setPayModal({ ids: [detailId], mode: a?.paid ? 'cancel' : 'pay' }); }}
        onPhotoApprove={() => doPhotoApprove(detailId)}
        onPhotoReject={(reason) => doPhotoReject(detailId, reason)}
      />}

      {/* Modals */}
      {photoLP && <PhotoReviewLP id={photoLP} onClose={() => setPhotoLP(null)} onApprove={doPhotoApprove} onReject={doPhotoReject}/>}
      {payModal && <PayModal modal={payModal} onClose={() => setPayModal(null)} onPay={doPay} onCancel={doCancelPay} onPhotoApprove={doPhotoApprove}/>}
      {approveModal && <ApproveModal modal={approveModal} onClose={() => setApproveModal(null)} onConfirm={() => doApprove(approveModal.ids)}/>}
      {rejectModal && <RejectModal modal={rejectModal} onClose={() => setRejectModal(null)} onConfirm={(reason) => doReject(rejectModal.ids, reason)}/>}
      {examModal && <ExamAssignModal onClose={() => setExamModal(false)} doAssign={doAssignExam}/>}
      {excelModal && <ExcelExportModal onClose={() => setExcelModal(false)} rows={filtered}/>}
      {zipModal && <ZipExportModal onClose={() => setZipModal(false)} rows={filtered}
        venueId={venueF !== 'all' ? venueF : null}
        level={levelF === 'Ⅰ' ? 'I' : levelF === 'Ⅱ' ? 'II' : null}/>}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb, .tb, .panel-head .actions { display: none !important; }
          .app { display: block !important; }
          .mn { padding: 0 !important; }
          .dg-wrap { border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
    </>
  );
}

// ===== 수험번호/수험표 노출 시점 설정 (exam_number_visible_at 서버 저장) =====
function ExamVisibilityCard({ sessionId }) {
  const state = useStore();
  const session = state.sessions.find(s => s.id === sessionId);
  const iso = session?.examNumberVisibleAt || '';
  const initDate = iso ? iso.slice(0, 10) : '';
  const initTime = iso ? (iso.replace('T', ' ').slice(11, 16) || '09:00') : '09:00';
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDate(iso ? iso.slice(0, 10) : '');
    setTime(iso ? (iso.replace('T', ' ').slice(11, 16) || '09:00') : '09:00');
  }, [iso, sessionId]);

  const save = async () => {
    if (!date) { toastErr('노출 시작일을 선택해주세요.'); return; }
    const visibleAt = `${date}T${(time || '00:00')}:00`;
    if (DataStore.isApiMode && DataStore.isApiMode()) {
      setSaving(true);
      const ok = await DataStore.apiSetExamVisibility(sessionId, visibleAt);
      setSaving(false);
      if (ok) toastOk('수험번호 노출 시점이 저장되었습니다. (FO 접수확인에 반영)');
      return;
    }
    DataStore.addAudit({ type: '회차', targetId: sessionId, action: '수정', memo: `수험번호 노출 시점 변경(${visibleAt})` });
    toastOk('노출 시점이 저장되었습니다.');
  };

  return (
    <div className="acard no-print" style={{ marginTop: 16 }}>
      <div className="acard-head">
        <h3>수험번호 / 수험표 노출 시점 설정 (FO 접수확인)</h3>
      </div>
      <div className="acard-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <FormRow label="노출 시작일" hint="이 일시 이전에는 FO에서 수험번호 미노출">
          <input type="date" className="input" style={{ height: 38, width: 200 }} value={date} onChange={e => setDate(e.target.value)}/>
        </FormRow>
        <FormRow label="노출 시작 시각">
          <input type="time" className="input" style={{ height: 38, width: 140 }} value={time} onChange={e => setTime(e.target.value)}/>
        </FormRow>
        <button className="btn btn-primary" style={{ marginTop: 23 }} onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '노출 시점 저장'}
        </button>
        {iso && <div style={{ marginTop: 27, fontSize: 12, color: 'var(--text-3)' }}>현재 설정: <code className="code-id">{iso.replace('T', ' ').slice(0, 16)}</code></div>}
      </div>
    </div>
  );
}

// ---- 실제 사진 표시(<img>) — 실패 시 fallback(이니셜/상태 박스) ----
function PhotoImg({ src, alt, fallback, className, rotate, style, onClick }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (!src || err) return fallback;
  return (
    <img
      className={className}
      src={src}
      alt={alt || ''}
      loading="lazy"
      onClick={onClick}
      onError={() => setErr(true)}
      style={{ ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}), ...style }}
    />
  );
}

// ---- thumb: 실제 사진 우선, 없으면 이니셜/상태 박스 ----
function PhotoThumb({ status, name, seed, photoUrl }) {
  const initial = (name || '?').slice(0, 1);
  const hue = ((seed || 'x').charCodeAt((seed || 'x').length - 1) * 17) % 360;
  const fb = status === 'pending'
    ? <div className="photo" style={{ background: 'var(--st-photo-bg)', color: 'var(--st-photo)' }}>미심사</div>
    : status === 'rejected'
      ? <div className="photo" style={{ background: 'var(--st-rejected-bg)', color: 'var(--st-rejected)' }}>반려</div>
      : <div className="photo" style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 88%), hsl(${hue} 30% 78%))`, color: '#fff', fontSize: 13, fontWeight: 700 }}>{initial}</div>;
  return <PhotoImg src={photoUrl} alt={name} className="photo" fallback={fb}/>;
}

// ---- 사진 심사 상태 렀 (미심사 · 승인 · 반려) ----
function PhotoStatusPill({ status }) {
  if (status === 'approved') return <Pill kind="approved">승인</Pill>;
  if (status === 'rejected') return <Pill kind="rejected">반려</Pill>;
  return <Pill kind="photo">미심사</Pill>;
}

// ===== 사진 심사 인라인 슬라이드 패널 (TPKM_BO_2_1_3) =====
const PHOTO_REJECT_REASONS = ['정면 아님', '모자·선글라스', '흑백', '흐림', '본인 아님', '기타'];
function PhotoReviewLP({ id, onClose, onApprove, onReject }) {
  const state = useStore();
  const a = state.applicants.find(x => x.id === id);
  const [mode, setMode] = useState(null); // null | 'reject'
  const [reason, setReason] = useState(PHOTO_REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const [zoom, setZoom] = useState(false);
  const [rotate, setRotate] = useState(0);
  if (!a) return null;
  const locked = isFoCancelled(a);
  const venue = state.venues.find(v => v.id === a.venueId);
  const hue = (a.id.charCodeAt(a.id.length - 1) * 17) % 360;
  const finalReason = reason === '기타' ? other : (other ? `${reason} — ${other}` : reason);
  const downloadOriginal = () => {
    if (!a.photoFileId || !window.TopikBoApi || !TopikBoApi.downloadFile(a.photoFileId, (a.exam || a.nameEn || a.id) + '.jpg')) {
      toastErr('원본 사진을 받을 수 없습니다. (사진 미제출 또는 API 미연결)');
    }
  };
  const approve = () => { onApprove(id); onClose(); };
  const reject = () => {
    if (reason === '기타' && !other.trim()) { toastErr('상세 사유를 입력해주세요.'); return; }
    onReject(id, finalReason); onClose();
  };
  return (
    <LP open size="sm" onClose={onClose}
      title={`사진 심사 — ${a.nameKo}`}
      sub={<span>접수ID <code className="code-id">{a.id}</code> · 현재 <PhotoStatusPill status={a.photoStatus}/></span>}
      footer={mode === 'reject'
        ? <>
            <button className="btn btn-secondary" onClick={() => setMode(null)}>뒤로</button>
            <button className="btn btn-danger" onClick={reject} disabled={locked || (reason === '기타' && !other.trim())}>반려 처리</button>
          </>
        : <>
            <button className="btn btn-secondary" onClick={onClose}>닫기</button>
            <button className="btn btn-danger" onClick={() => setMode('reject')} disabled={locked}>반려</button>
            <button className="btn btn-primary" onClick={approve} disabled={locked}>승인</button>
          </>}>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: '0 0 150px' }}>
          <PhotoLarge status={a.photoStatus} name={a.nameKo} seed={a.id} photoUrl={a.photoUrl} rotate={rotate} onClick={a.photoUrl ? () => setZoom(true) : null}/>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button className="ibtn" style={{ flex: 1 }} onClick={() => setRotate(r => (r + 90) % 360)} disabled={!a.photoUrl}>회전</button>
            <button className="ibtn" style={{ flex: 1 }} onClick={downloadOriginal} disabled={!a.photoFileId}><I.Download style={{ width: 12, height: 12 }}/> 받기</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <dl className="dl" style={{ gridTemplateColumns: '78px 1fr' }}>
            <dt>한글성명</dt><dd>{a.nameKo}</dd>
            <dt>영문성명</dt><dd>{a.nameEn}</dd>
            <dt>생년월일</dt><dd><code>{a.dob}</code></dd>
            <dt>성별</dt><dd>{a.sx === 1 ? '남(1)' : '여(2)'}</dd>
            <dt>국적</dt><dd>{a.nation}</dd>
            <dt>급수</dt><dd>TOPIK {a.level}</dd>
            <dt>시험장</dt><dd>{venue?.nameKo}</dd>
          </dl>
        </div>
      </div>

      {mode === 'reject' && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <FormRow label="반려 사유" required hint="사유는 응시자 이메일·마이페이지에 안내됩니다(사진 재등록 요청).">
            <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
              {PHOTO_REJECT_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </FormRow>
          <FormRow label={reason === '기타' ? '상세 사유' : '추가 안내(선택)'} required={reason === '기타'}>
            <textarea className="textarea" rows="2" value={other} onChange={e => setOther(e.target.value)} placeholder="예) 정면 사진이 아닙니다. 사진을 다시 등록해주세요."></textarea>
          </FormRow>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-3)', background: 'var(--bg-2)', padding: 8, borderRadius: 6 }}>
        ⓘ 동시 작업 충돌 방지(낙관적 잠금) · 이미 다른 관리자가 처리한 경우 안내 후 새로고침됩니다. 처리 즉시 처리 이력에 기록됩니다.
      </div>

      {zoom && (
        <div className="modal-backdrop open" style={{ zIndex: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setZoom(false)}>
          {a.photoUrl
            ? <img src={a.photoUrl} alt={a.nameKo} style={{ width: 'min(420px, 90vw)', maxHeight: '86vh', objectFit: 'contain', borderRadius: 10, transform: `rotate(${rotate}deg)`, background: '#fff' }}/>
            : <div style={{ width: 'min(420px, 90vw)', aspectRatio: '3/4', borderRadius: 10, background: `linear-gradient(160deg, hsl(${hue} 40% 80%), hsl(${hue} 35% 48%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 160, fontWeight: 700 }}>{a.nameKo.slice(0,1)}</div>}
        </div>
      )}
    </LP>
  );
}

// ===== Detail LP =====
function ApplicantDetailLP({ id, onClose, onApprove, onReject, onPay, onPhotoApprove, onPhotoReject }) {
  const state = useStore();
  const a = state.applicants.find(x => x.id === id);
  const isReadonly = DataStore.isReadonly();
  const [tab, setTab] = useState('profile');
  const [memo, setMemo] = useState('');
  const [photoMode, setPhotoMode] = useState(null);
  const [photoReason, setPhotoReason] = useState(PHOTO_REJECT_REASONS[0]);
  const [photoOther, setPhotoOther] = useState('');
  const [rotate, setRotate] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (!a) return null;
  const locked = isFoCancelled(a);
  const downloadOriginal = () => {
    if (!a.photoFileId || !window.TopikBoApi || !TopikBoApi.downloadFile(a.photoFileId, (a.exam || a.nameEn || a.id) + '.jpg')) {
      toastErr('원본 사진을 받을 수 없습니다. (사진 미제출 또는 API 미연결)');
    }
  };
  const venue = state.venues.find(v => v.id === a.venueId);
  const log = state.audit.filter(l => l.targetId === id);
  const photoRejectReason = photoReason === '기타' ? photoOther : (photoOther ? `${photoReason} — ${photoOther}` : photoReason);

  const addMemo = () => {
    if (!memo.trim()) return;
    a.memo = (a.memo || '') + `[${new Date().toISOString().slice(0,16).replace('T',' ')}/${state.me?.id}] ${memo}\n`;
    DataStore.addAudit({ type: '접수자', targetId: id, action: '수정', memo: '관리자 메모 추가' });
    DataStore.notify();
    setMemo('');
    toastOk('메모가 추가되었습니다.');
  };
  const approvePhoto = () => {
    onPhotoApprove();
    setPhotoMode(null);
  };
  const rejectPhoto = () => {
    if (photoReason === '기타' && !photoOther.trim()) { toastErr('상세 사유를 입력해주세요.'); return; }
    onPhotoReject(photoRejectReason);
    setPhotoMode(null);
  };

  return (
    <LP open={true} size="wide" onClose={onClose}
      title={`접수자 상세 — ${a.nameKo} (${a.nameEn})`}
      sub={<span>회차 컨텍스트 · 접수ID <code className="code-id">{a.id}</code> · 상태 <Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></span>}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        {!isReadonly && <>
          <button className="btn btn-secondary" onClick={onReject} disabled={locked}>반려</button>
          <button className="btn btn-secondary" onClick={onPay} disabled={locked}>{a.paid ? '수납 취소' : '수납'}</button>
          <button className="btn btn-primary" onClick={onApprove} disabled={locked}>승인</button>
        </>}
      </>}
      tabs={
        <div className="lp-tabs">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>기본 정보</button>
          <button className={tab === 'memo' ? 'active' : ''} onClick={() => setTab('memo')}>메모</button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>처리 이력 ({log.length})</button>
        </div>
      }>
      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
          <div>
            <PhotoLarge status={a.photoStatus} name={a.nameKo} seed={a.id} photoUrl={a.photoUrl} rotate={rotate} onClick={a.photoUrl ? () => setZoom(true) : null}/>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button className="ibtn" style={{ flex: 1 }} onClick={downloadOriginal} disabled={isReadonly || !a.photoFileId}><I.Download style={{ width: 12, height: 12 }}/> 원본 받기</button>
              <button className="ibtn" style={{ flex: 1 }} onClick={() => setRotate(r => (r + 90) % 360)} disabled={isReadonly || !a.photoUrl}>회전 보정</button>
            </div>
            <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>사진 심사</div>
                <PhotoStatusPill status={a.photoStatus}/>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="ibtn" style={{ flex: 1 }} onClick={() => setPhotoMode(photoMode === 'reject' ? null : 'reject')} disabled={isReadonly || locked}>사진 반려</button>
                <button className="ibtn" style={{ flex: 1 }} onClick={approvePhoto} disabled={isReadonly || locked || a.photoStatus === 'approved'}>사진 승인</button>
              </div>
              {photoMode === 'reject' && (
                <div style={{ marginTop: 10 }}>
                  <FormRow label="사진 반려 사유" required>
                    <select className="select" value={photoReason} onChange={e => setPhotoReason(e.target.value)} disabled={isReadonly || locked}>
                      {PHOTO_REJECT_REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label={photoReason === '기타' ? '상세 사유' : '추가 안내(선택)'} required={photoReason === '기타'}>
                    <textarea className="textarea" rows="2" value={photoOther} onChange={e => setPhotoOther(e.target.value)} placeholder="예) 정면 사진이 아닙니다. 사진을 다시 등록해주세요." disabled={isReadonly || locked}></textarea>
                  </FormRow>
                  <button className="btn btn-secondary btn-block" onClick={rejectPhoto} disabled={isReadonly || locked || (photoReason === '기타' && !photoOther.trim())}>사진 반려 처리</button>
                </div>
              )}
            </div>
          </div>
          <div>
            <FieldSet legend="응시자 정보" cols={2}>
              <KV k="접수 번호" v={a.no}/>
              <KV k="접수 ID" v={<code className="code-id">{a.id}</code>}/>
              <KV k="한글 성명" v={a.nameKo}/>
              <KV k="영문 성명" v={a.nameEn}/>
              <KV k="생년월일" v={<code className="code-id">{a.dob}</code>}/>
              <KV k="성별" v={a.sx === 1 ? '남(1)' : '여(2)'}/>
              <KV k="국적" v={a.nation}/>
              <KV k="제1언어" v={a.l1}/>
              <KV k="직업" v={a.job}/>
              <KV k="이메일" v={a.email}/>
              <KV k="전화" v={a.tel}/>
              <KV k="편의지원" v={a.accommodation ? '신청' : '미신청'}/>
            </FieldSet>

            <FieldSet legend="시험 정보" cols={2}>
              <KV k="회차 ID" v={<code className="code-id">{a.sessionId}</code>}/>
              <KV k="처리 상태" v={<Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill>}/>
              <KV k="급수" v={`TOPIK ${a.level}`}/>
              <KV k="시험장" v={venue?.nameKo}/>
              <KV k="시험장 ID" v={<code className="code-id">{a.venueId}</code>}/>
              <KV k="사진 심사" v={<PhotoStatusPill status={a.photoStatus}/>}/>
              <KV k="사진 승인 여부" v={a.photoOk ? '승인' : '미승인'}/>
              <KV k="응시동기" v={a.motive}/>
              <KV k="응시목적" v={a.purpose}/>
              <KV k="수납 상태" v={a.paid ? <Pill kind="approved">수납완료</Pill> : <Pill kind="pay">미수납</Pill>}/>
              <KV k="수납 일시" v={a.paidAt || '—'}/>
              <KV k="영수증" v={a.receipt || '—'}/>
              <KV k="수험번호" v={a.exam ? <code className="code-id" style={{ color: 'var(--st-number)', fontWeight: 700 }}>{a.exam}</code> : '미부여'}/>
              <KV k="접수일시" v={a.appliedAt}/>
              <KV k="반려 사유" v={a.rejectReason || '—'}/>
            </FieldSet>
          </div>
        </div>
      )}

      {tab === 'memo' && (
        <div>
          <FormRow label="새 메모 추가">
            <textarea className="textarea" rows="3" value={memo} onChange={e => setMemo(e.target.value)} placeholder="이 응시자에 대한 관리자 메모를 입력하세요" disabled={isReadonly}></textarea>
          </FormRow>
          <button className="btn btn-primary" onClick={addMemo} disabled={isReadonly || !memo.trim()}>메모 추가</button>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }}/>
          <div>
            <div className="label" style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>지난 메모</div>
            <pre style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 6, fontSize: 12.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--text-2)' }}>{a.memo || '메모 없음'}</pre>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="timeline">
          {log.length === 0 && <div className="empty">처리 이력이 없습니다</div>}
          {log.map(l => (
            <div key={l.id} className={`ev ${l.action === '승인' ? 'approved' : l.action === '반려' ? 'rejected' : ''}`}>
              <div className="when">{l.ts}</div>
              <div className="what">{l.type} · <b>{l.action}</b></div>
              <div className="who">처리자 <code className="code-id">{l.actor}</code> · IP {l.ip}</div>
              {l.memo && <div className="note">{l.memo}</div>}
            </div>
          ))}
        </div>
      )}

      {zoom && a.photoUrl && (
        <div className="modal-backdrop open" style={{ zIndex: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setZoom(false)}>
          <img src={a.photoUrl} alt={a.nameKo} style={{ width: 'min(460px, 90vw)', maxHeight: '86vh', objectFit: 'contain', borderRadius: 10, transform: `rotate(${rotate}deg)`, background: '#fff' }}/>
        </div>
      )}
    </LP>
  );
}

function KV({ k, v }) {
  return (
    <div className="form-row" style={{ marginBottom: 0 }}>
      <div className="label" style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{v}</div>
    </div>
  );
}

function PhotoLarge({ status, name, seed, photoUrl, rotate, onClick }) {
  const initial = (name || '?').slice(0, 1);
  const hue = ((seed || 'x').charCodeAt((seed || 'x').length - 1) * 17) % 360;
  const fb = status === 'pending'
    ? <div className="photo-lg" style={{ background: 'var(--st-photo-bg)', color: 'var(--st-photo)' }}>사진 미심사</div>
    : status === 'rejected'
      ? <div className="photo-lg" style={{ background: 'var(--st-rejected-bg)', color: 'var(--st-rejected)' }}>사진 반려</div>
      : <div className="photo-lg" style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 86%), hsl(${hue} 30% 70%))`, color: '#fff', fontSize: 80, fontWeight: 700 }}>{initial}</div>;
  return <PhotoImg src={photoUrl} alt={name} className="photo-lg" rotate={rotate} fallback={fb} onClick={onClick} style={onClick ? { cursor: 'zoom-in' } : null}/>;
}

// ===== Pay modal (TPKM_BO_2_1_3) — 수납 / 수납취소(환불자) =====
function PayModal({ modal, onClose, onPay, onCancel, onPhotoApprove }) {
  const state = useStore();
  const [memo, setMemo] = useState('');
  const [receipt, setReceipt] = useState('');
  const [reason, setReason] = useState('본인 요청');
  const [reasonOther, setReasonOther] = useState('');
  const ids = modal.ids || [];
  const rows = ids.map(id => state.applicants.find(a => a.id === id)).filter(Boolean);
  if (!rows.length) return (
    <Modal open onClose={onClose} title="오프라인 수납 처리"
      footer={<button className="btn btn-primary" onClick={onClose}>확인</button>}>
      <div>처리 가능한 대상이 없습니다.</div>
    </Modal>
  );
  const session = state.sessions.find(s => s.id === rows[0].sessionId);
  const totalFee = rows.reduce((sum, a) => {
    if (a.level === 'Ⅰ') return sum + session.feeI;
    if (a.level === 'Ⅱ') return sum + session.feeII;
    return sum + session.feeI + session.feeII;
  }, 0);
  const cancelMode = modal.mode === 'cancel';
  const finalReason = reason === '기타' ? reasonOther : reason;

  return (
    <Modal open onClose={onClose} title={cancelMode ? '수납 취소(환불자 분류)' : '오프라인 수납 처리'} danger={cancelMode}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        {cancelMode ? (
          <button className="btn btn-danger" onClick={() => onCancel(ids, finalReason)} disabled={!finalReason.trim()}>수납 취소</button>
        ) : (
          <button className="btn btn-primary" onClick={() => onPay(ids, { memo, receipt })}>수납 완료 처리</button>
        )}
      </>}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-2)' }}>
        대상 <b>{rows.length}</b>건 · 합계 응시료 <b style={{ color: 'var(--primary)' }}>{DataStore.fmtCurrency(totalFee)}</b>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {cancelMode
            ? '※ 수납 취소 시 응시자는 환불자로 분류되며, 수험번호는 유지됩니다.'
            : '※ 행 단위 낙관적 잠금 · 처리 즉시 관리자 처리 이력에 기록됩니다.'}
        </div>
      </div>

      {/* 사진/기본정보 동시 확인 (고객사 수정 0526) — 사진 미심사 건은 모달 내 사진 승인 가능 */}
      <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14 }}>
        <table className="dg" style={{ fontSize: 12 }}>
          <thead><tr><th>사진</th><th>한글성명</th><th>영문성명</th><th>생년월일</th><th>급수</th><th>시험장</th><th>사진심사</th><th>현 상태</th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td><PhotoThumb status={a.photoStatus} name={a.nameKo} seed={a.id} photoUrl={a.photoUrl}/></td>
                <td>{a.nameKo}</td>
                <td>{a.nameEn}</td>
                <td className="code">{a.dob}</td>
                <td>{a.level}</td>
                <td>{DataStore.venueName(a.venueId)}</td>
                <td>
                  {a.photoStatus === 'pending'
                    ? <button className="ibtn" onClick={() => onPhotoApprove(a.id)} disabled={isFoCancelled(a)}>사진 승인</button>
                    : <PhotoStatusPill status={a.photoStatus}/>}
                </td>
                <td><Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cancelMode ? (
        <>
          <FormRow label="취소 사유" required>
            <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
              {['본인 요청','중복 접수','정보 오류','기타'].map(r => <option key={r}>{r}</option>)}
            </select>
          </FormRow>
          {reason === '기타' && (
            <FormRow label="상세 사유" required>
              <textarea className="textarea" rows="2" value={reasonOther} onChange={e => setReasonOther(e.target.value)}/>
            </FormRow>
          )}
        </>
      ) : (
        <>
          <FormRow label="영수증 번호(선택)">
            <input className="input" placeholder="예) R-12345" value={receipt} onChange={e => setReceipt(e.target.value)}/>
          </FormRow>
          <FormRow label="메모(선택)">
            <textarea className="textarea" rows="2" placeholder="예) 양곤대 흘라잉캠퍼스 1층 접수 데스크" value={memo} onChange={e => setMemo(e.target.value)}/>
          </FormRow>
        </>
      )}
    </Modal>
  );
}

// ===== Approve modal (TPKM_BO_2_1_4) =====
function ApproveModal({ modal, onClose, onConfirm }) {
  const state = useStore();
  const ids = modal.ids;
  const rows = ids.map(id => state.applicants.find(a => a.id === id)).filter(Boolean);
  const blocked = rows.filter(a => a.photoStatus !== 'approved');
  return (
    <Modal open onClose={onClose} title="접수자 승인 처리"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={blocked.length > 0}>승인 완료</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        대상 <b>{rows.length}</b>건을 승인합니다. 승인 완료 시 FO 마이페이지·접수확인에 반영됩니다.
      </div>
      {blocked.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--danger-50)', color: 'var(--danger)', borderRadius: 6, fontSize: 12.5 }}>
          ⚠ 사진 미심사 <b>{blocked.length}</b>건이 포함되어 있습니다. 접수자 목록에서 먼저 심사해 주세요.
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {blocked.slice(0, 5).map(a => <li key={a.id}>{a.nameKo} ({a.nameEn})</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ===== Reject modal (TPKM_BO_2_1_5) =====
function RejectModal({ modal, onClose, onConfirm }) {
  const state = useStore();
  const [reason, setReason] = useState(GENERAL_REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const ids = modal.ids;
  const rows = ids.map(id => state.applicants.find(a => a.id === id)).filter(Boolean);
  const final = reason === '기타' ? other : (other ? `${reason} — ${other}` : reason);
  return (
    <Modal open onClose={onClose} title="접수자 반려 처리" danger
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-danger" onClick={() => onConfirm(final)} disabled={reason === '기타' && !other.trim()}>반려 처리</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
        대상 <b>{rows.length}</b>건 · 반려 사유는 응시자 이메일/마이페이지에 안내됩니다.
      </div>
      <FormRow label="반려 사유" required>
        <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
          {GENERAL_REJECT_REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
      </FormRow>
      <FormRow label={reason === '기타' ? '상세 사유' : '추가 안내 (선택)'} required={reason === '기타'}>
        <textarea className="textarea" rows="3" value={other} onChange={e => setOther(e.target.value)} placeholder="예) 정면 사진이 아닙니다. 사진 재등록 후 다시 접수해주세요."/>
      </FormRow>
    </Modal>
  );
}

// ===== 수험번호 일괄 부여 (TPKM_BO_2_1_7) =====
function ExamAssignModal({ onClose, doAssign }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(doAssign(true)).then((data) => {
      if (!cancelled) {
        setPreview(data || { result: [], targets: 0, skipped: 0 });
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setPreview({ result: [], targets: 0, skipped: 0 });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [doAssign]);
  if (loading || !preview) {
    return (
      <Modal open onClose={onClose} title="수험번호 13자리 일괄 부여"
        footer={<button className="btn btn-secondary" onClick={onClose}>취소</button>}>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>미리보기를 불러오는 중…</div>
      </Modal>
    );
  }
  const confirm = async () => {
    await doAssign(false);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="수험번호 13자리 일괄 부여"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={confirm} disabled={preview.result.length === 0}>{preview.result.length}건 일괄 부여</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        <p>① 국가코드(3) <b>025</b> + ② 지역코드(3) + ③ 수준코드(1) <b>7=Ⅰ / 8=Ⅱ</b> + ④ 시험장코드(2) + ⑤ 응시자코드(4) — 영문 성명 알파벳 오름차순.</p>
        <p style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 12 }}>
          대상: 수납 완료 + 사진 승인 + 비반려/비취소 · 환불자는 수험번호 유지<br/>
          이메일 발송: <b style={{ color: 'var(--danger)' }}>안 함</b> · 노출 시점: 별도 설정한 날짜에 FO 접수확인 페이지에서 공개
        </p>
      </div>
      <div className="kpi-grid" style={{ margin: '14px 0' }}>
        <div className="kpi"><div className="label">부여 대상</div><div className="val">{preview.result.length}</div></div>
        <div className="kpi"><div className="label">제외(누락 사유)</div><div className="val">{preview.skipped || 0}</div></div>
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <table className="dg" style={{ fontSize: 12 }}>
          <thead><tr><th>한글성명</th><th>영문성명</th><th>급수</th><th>수험번호(미리보기)</th></tr></thead>
          <tbody>
            {preview.result.slice(0, 50).map(r => (
              <tr key={r.id}>
                <td>{r.nameKo}</td><td>{r.name}</td>
                <td>{r.level}</td>
                <td><code className="code-id" style={{ color: 'var(--st-number)', fontWeight: 700 }}>{r.exam}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.result.length > 50 && <div style={{ padding: 8, textAlign: 'center', fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-2)' }}>… 외 {preview.result.length - 50}건</div>}
      </div>
    </Modal>
  );
}

// ===== 엑셀(연명부 양식) 내보내기 (TPKM_BO_2_1_8) =====
function ExcelExportModal({ onClose, rows }) {
  const state = useStore();
  const [mode, setMode] = useState('current'); // current | full
  const session = state.sessions.find(s => s.id === state.activeSessionId);

  const levelPfx = (lv) => String(lv || '').indexOf('동시') >= 0 ? 'TOPIK Ⅰ·Ⅱ'
    : (String(lv).indexOf('Ⅱ') >= 0 ? 'TOPIK Ⅱ' : 'TOPIK Ⅰ');

  // 지역·시험장·시험수준별 개별 파일(단일 시트) — 파일명 TOPIK Ⅰ_미얀마_{지역}_{시험장}.xlsx
  const groups = useMemo(() => {
    const src = mode === 'full' ? state.applicants.filter(a => a.sessionId === state.activeSessionId) : rows;
    const m = new Map();
    src.forEach(a => {
      const venue = state.venues.find(v => v.id === a.venueId);
      const region = venue ? (venue.region || '미얀마') : '미지정';
      const vname = venue ? venue.nameKo : '미지정';
      const fname = `${levelPfx(a.level)}_미얀마_${region}_${vname}.xlsx`;
      m.set(fname, (m.get(fname) || 0) + 1);
    });
    return Array.from(m.entries()).map(([k, n]) => ({ k, n }));
  }, [rows, state.venues, state.applicants, mode]);
  const totalRows = groups.reduce((s, g) => s + g.n, 0);

  const doExport = () => {
    const role = (DataStore.getAdminSession && DataStore.getAdminSession()?.role) || 'super';
    if (window.TOPIKBoBridge && !TOPIKBoBridge.enforcePerm(role, '접수 관리|엑셀·사진 zip 다운로드', 'execute')) return;
    const run = () => {
      DataStore.addAudit({ type: '접수자', targetId: '—', action: '게시', memo: `연명부 엑셀 내보내기(${totalRows}건, ${groups.length}개 파일, ${mode === 'full' ? '회차전체' : '현재 필터'})` });
      toastOk(`연명부 엑셀 ${groups.length}개 파일을 생성했습니다.`, { title: '엑셀 생성 완료' });
      onClose();
    };
    if (window.TOPIKBoBridge) {
      TOPIKBoBridge.exportRosterExcel({ mode, rows, state }).then(run).catch(e => toastErr(e.message || '엑셀 생성 실패'));
      return;
    }
    run();
  };
  return (
    <Modal open onClose={onClose} title="연명부 양식 엑셀 내보내기"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={doExport} disabled={!groups.length}>다운로드</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        「연명부 양식.xlsx」 <b>10컬럼</b>: 한글성명 · 영문성명 · 생년월일(8) · 성별(1/2) · 국적 · 제1언어 · 직업코드 · 응시동기코드 · 응시목적코드 · 수험번호(13)
      </div>
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={mode === 'current' ? 'active' : ''} onClick={() => setMode('current')}>현재 필터({rows.length})</button>
        <button className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}>회차 전체</button>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="label" style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>생성될 파일(지역·시험장·수준별 / 단일 시트{groups.length > 1 ? ' · zip 묶음' : ''})</div>
        <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: 12, fontSize: 12.5, fontFamily: 'Inter, monospace', color: 'var(--text-2)', maxHeight: 220, overflow: 'auto' }}>
          {groups.length === 0
            ? <div style={{ color: 'var(--text-3)' }}>대상 없음</div>
            : groups.map(g => (
                <div key={g.k}>{g.k} <span style={{ color: 'var(--text-3)' }}>({g.n}행)</span></div>
              ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>※ 수험번호(영문명 정렬) 순으로 행 배치 · 파일당 단일 시트(여러 시트 작성 시 등록 불가).</div>
      </div>
    </Modal>
  );
}

// ===== 사진 zip 다운로드 (TPKM_BO_2_1_9) =====
function ZipExportModal({ onClose, rows, venueId, level }) {
  const state = useStore();
  const [busy, setBusy] = useState(false);
  const apiMode = !!(DataStore.isApiMode && DataStore.isApiMode());
  const session = state.sessions.find(s => s.id === state.activeSessionId);
  const doExport = () => {
    const role = (DataStore.getAdminSession && DataStore.getAdminSession()?.role) || 'super';
    if (window.TOPIKBoBridge && !TOPIKBoBridge.enforcePerm(role, '접수 관리|엑셀·사진 zip 다운로드', 'execute')) return;
    if (!apiMode) { toastErr('사진 zip 다운로드는 서버 연결(API)이 필요합니다.'); return; }
    setBusy(true);
    TOPIKBoBridge.exportPhotosZip({ roundId: state.activeSessionId, venueId, level })
      .then(() => {
        DataStore.addAudit({ type: '접수자', targetId: '—', action: '게시', memo: '사진 zip 서버 다운로드({지역}/{시험장}/{수준}/{수험번호}.jpg)' });
        toastOk('사진 zip 다운로드를 시작했습니다.', { title: 'ZIP 다운로드' });
        onClose();
      })
      .catch(e => toastErr(e.message || 'ZIP 다운로드 실패'))
      .then(() => setBusy(false));
  };
  return (
    <Modal open onClose={onClose} title="사진 일괄 다운로드 (zip)"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={doExport} disabled={busy || !apiMode}>{busy ? '다운로드 중…' : '다운로드'}</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        서버가 실제 사진 파일을 <b>{'{지역}/{시험장}/{수준}'}</b> 폴더 구조로 압축하여 스트리밍합니다.
        파일명은 <b>13자리 수험번호 + .jpg</b> (다른 정보 포함 금지). 수험번호 미부여/사진 없음은 누락 리포트로 동봉됩니다.
      </div>
      <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'Inter, monospace', color: 'var(--text-2)' }}>
{`└─ 미얀마/
   ├─ 양곤대 흘라잉캠퍼스/
   │  ├─ TOPIK Ⅰ/
   │  │   ├─ 0250017010001.jpg
   │  │   └─ 0250017010002.jpg
   │  └─ TOPIK Ⅱ/
   │      └─ 0250018010001.jpg
   └─ 누락_리포트.txt`}
      </div>
      {!apiMode && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--st-rejected-bg)', color: 'var(--st-rejected)', borderRadius: 6, fontSize: 12.5 }}>
          ⚠ 현재 API에 연결되어 있지 않아 사진 zip을 받을 수 없습니다.
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>대상 회차: <b>{session?.name || '—'}</b> · 서버 엔드포인트 <code className="code-id">GET /api/v1/admin/applications/photos.zip</code></div>
    </Modal>
  );
}

// quick icon
I.Hash = (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>;

window.ApplicantsPanel = ApplicantsPanel;
// 접수자 목록 내부 상세/일괄 처리에서 공유
window.PhotoReviewLP = PhotoReviewLP;
window.PhotoLarge = PhotoLarge;
window.PhotoStatusPill = PhotoStatusPill;
window.PhotoThumb = PhotoThumb;
