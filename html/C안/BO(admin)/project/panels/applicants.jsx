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
     TPKM_BO_2_1_11 학생 접수 확인증 열람(FO 접수 확인증 동일)
   ============================================================ */

/** 필터 칩 — `photo`만 사진심사 상태(미심사) 기준, 나머지는 접수 처리 상태 */
function matchesStatusChip(a, chipId) {
  if (!a || chipId === 'all') return true;
  if (chipId === 'photo') {
    return a.photoStatus === 'pending' && a.status !== 'cancel' && a.status !== 'cancelled';
  }
  return a.status === chipId;
}

const STATUS_CHIPS = [
  { id: 'all',      label: '전체' },
  { id: 'applied',  label: '접수완료' },
  { id: 'photo',    label: '미심사' },
  { id: 'pay',      label: '수납대기' },
  { id: 'approved', label: '승인완료' },
  { id: 'rejected', label: '반려' },
  { id: 'cancel',   label: '취소' },
  { id: 'refund',   label: '환불자' },
];

/** FO 다국어 저장값 → BO 상세보기 한글 표시 */
function boAdminNationKo(v) {
  return window.TOPIKBoAdminKo?.nationalityKo(v, '미얀마') ?? (v || '미얀마');
}
function boAdminLangKo(v) {
  return window.TOPIKBoAdminKo?.firstLanguageKo(v, '') ?? (v || '');
}

/** FO 접수 취소 — API `cancelled` → BO `cancel` (bo-api-bridge mapApplicantStatus) */
function isFoCancelled(a) {
  return !!(a && a.status === 'cancel');
}

/** 승인 가능: 사진 심사 승인 + 수납 완료 */
function applicantReadyForApprove(a) {
  return !!a && a.photoStatus === 'approved' && !!a.paid;
}

function normalizeApplicantSearchQuery(raw) {
  var s = (raw || '').trim();
  s = s.replace(/^접수번호\s*/i, '');
  return s.trim();
}

/** APP-20-1 / APP-20-2 처럼 급수까지 있는 접수번호는 정확 일치만 허용 */
function normalizeApplicationNoSuffix(no) {
  return String(no || '').toLowerCase().replace(/-(i|ii)$/, function (_, lv) {
    return lv === 'ii' ? '-2' : '-1';
  });
}

function applicationNoMatchesSearch(appNo, query) {
  if (!appNo || !query) return false;
  var a = normalizeApplicationNoSuffix(appNo);
  var q = normalizeApplicationNoSuffix(String(query).trim());
  if (/^app-\d+-[0-9]+$/.test(q)) return a === q;
  if (/^app-\d+-?$/.test(q)) return a.indexOf(q) === 0;
  return a.includes(q);
}

function applicantMatchesSearch(a, query) {
  if (!query) return true;
  var qq = query.toLowerCase();
  return (
    (a.nameKo && a.nameKo.includes(query)) ||
    (a.nameEn && a.nameEn.toLowerCase().includes(qq)) ||
    (a.email && a.email.toLowerCase().includes(qq)) ||
    (a.dob && a.dob.includes(query)) ||
    (a.exam && String(a.exam).toLowerCase().includes(qq)) ||
    applicationNoMatchesSearch(a.applicationNo, query) ||
    (a.id && String(a.id) === query)
  );
}

function formatApplicantDob(dob) {
  if (!dob) return '—';
  var s = String(dob);
  if (s.length === 8 && /^\d+$/.test(s)) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }
  return s;
}

function applicantRoundTitle(a, session) {
  var roundNo = a && a.roundNo != null ? a.roundNo : (session && session.no != null ? session.no : null);
  var title = ((a && a.roundTitle) || (session && session.name) || '').trim();
  var noText = roundNo != null ? ('제' + roundNo + '회') : '';
  if (noText && title) {
    var n = String(roundNo);
    return title.indexOf(n) >= 0 ? title : (noText + ' · ' + title);
  }
  return title || noText || 'TOPIK';
}

function applicantLevelText(a) {
  if (!a) return '—';
  if (a.level === 'Ⅰ') return 'TOPIK Ⅰ';
  if (a.level === 'Ⅱ') return 'TOPIK Ⅱ';
  if (a.level === '동시') return 'TOPIK Ⅰ + Ⅱ';
  return 'TOPIK ' + a.level;
}

function applicantFeeAmount(a, session) {
  if (!session || !a) return 25;
  if (a.level === 'Ⅰ') return session.feeI;
  if (a.level === 'Ⅱ') return session.feeII;
  if (a.level === '동시') return session.feeI + session.feeII;
  return session.feeI;
}

function applicantPaymentStatus(a) {
  if (window.TOPIKBoBridge && TOPIKBoBridge.applicantPaymentStatus) {
    return TOPIKBoBridge.applicantPaymentStatus(a);
  }
  if (!a) return 'unpaid';
  if (a.paymentStatus) return a.paymentStatus;
  if (a.paid) return 'paid';
  if (a.status === 'refund') return 'refunded';
  return 'unpaid';
}

function isUnpaidRosterApplicant(a) {
  if (window.TOPIKBoBridge && TOPIKBoBridge.isUnpaidRosterApplicant) {
    return TOPIKBoBridge.isUnpaidRosterApplicant(a);
  }
  if (!a || a.status === 'cancel' || a.status === 'cancelled') return false;
  return applicantPaymentStatus(a) === 'unpaid';
}

function applicantPaymentPill(a) {
  var ps = applicantPaymentStatus(a);
  if (ps === 'paid') return <Pill kind="approved">수납완료</Pill>;
  if (ps === 'refunded') return <Pill kind="refund">환불</Pill>;
  return <Pill kind="pay">미수납</Pill>;
}

function applicantPaymentStatusView(a) {
  if (!a) return <Pill kind="pay">미수납</Pill>;
  var ps = applicantPaymentStatus(a);
  if (ps === 'refunded') return <Pill kind="refund">환불</Pill>;
  if (ps !== 'paid') return <Pill kind="pay">미수납</Pill>;
  var memo = String(a.paymentMemo || '').trim();
  if (!memo) return <Pill kind="approved">수납완료</Pill>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Pill kind="approved">수납완료</Pill>
      <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400, lineHeight: 1.45 }}>{memo}</span>
    </span>
  );
}

/** FO 마이페이지 접수 확인증과 동일한 수험번호 표시 */
function applicantConfirmExamNumber(a, session) {
  if (!a) return { text: '—', adminNote: null };
  if (a.examNumberVisible && a.exam) {
    return { text: a.exam, adminNote: null };
  }
  if (a.exam) {
    var awaiting = '공개 예정';
    var visAt = session && session.examNumberVisibleAt;
    if (visAt) awaiting += ' (' + String(visAt).slice(0, 10).replace(/-/g, '.') + ')';
    return { text: awaiting, adminNote: '관리자 참고: 수험번호 ' + a.exam };
  }
  return { text: '부여 전', adminNote: null };
}

function applicantConfirmAvailable(a) {
  return !!(a && a.applicationNo && a.status !== 'cancel');
}

function ApplicantsPanel() {
  const state = useStore();
  const sessionId = state.activeSessionId;
  const apps = useMemo(() => state.applicants.filter(a => a.sessionId === sessionId), [state.applicants, sessionId]);

  const isApi = !!(DataStore.isApiMode && DataStore.isApiMode());

  // ---- Filter / search ----
  const [statusF, setStatusF] = useState('all');
  const [venueF, setVenueF] = useState('all');
  const [levelF, setLevelF] = useState('all');
  const [qInput, setQInput] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [sort, setSort] = useState({ k: 'id', dir: 'desc' }); // 최신 접수 우선
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const runSearch = () => {
    setAppliedQ(normalizeApplicantSearchQuery(qInput));
  };

  const resetFilters = () => {
    setStatusF('all');
    setVenueF('all');
    setLevelF('all');
    setQInput('');
    setAppliedQ('');
  };

  const prevSessionRef = useRef(sessionId);

  useEffect(() => {
    if (!sessionId || !isApi || !DataStore.reloadApplicants) return;
    DataStore.reloadApplicants(sessionId);
  }, [sessionId, isApi]);

  useEffect(() => {
    if (prevSessionRef.current === sessionId) return;
    prevSessionRef.current = sessionId;
    setQInput('');
    setAppliedQ('');
  }, [sessionId]);

  // URL sync (북마크 가능)
  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (params.has('s')) setStatusF(params.get('s'));
    if (params.has('v')) setVenueF(params.get('v'));
    if (params.has('l')) setLevelF(params.get('l'));
    if (params.has('q')) {
      const fromUrl = normalizeApplicantSearchQuery(params.get('q') || '');
      setQInput(fromUrl);
      setAppliedQ(fromUrl);
    }
  }, []);

  const filtered = useMemo(() => {
    let r = apps;
    if (statusF !== 'all') r = r.filter(a => matchesStatusChip(a, statusF));
    if (venueF !== 'all')  r = r.filter(a => a.venueId === venueF);
    if (levelF !== 'all')  r = r.filter(a => a.level === levelF);
    if (appliedQ) r = r.filter(a => applicantMatchesSearch(a, appliedQ));
    // sort — id/appliedAt 은 최신순 기본, 번호(no) 클릭은 id 기준
    r = r.slice().sort((a, b) => {
      const key = sort.k === 'no' ? 'id' : sort.k;
      let cmp = 0;
      if (key === 'id') {
        cmp = Number(a.id) - Number(b.id);
      } else if (key === 'appliedAt') {
        cmp = String(a.appliedAt || '').localeCompare(String(b.appliedAt || ''));
      } else {
        cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'ko');
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [apps, statusF, venueF, levelF, appliedQ, sort]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [statusF, venueF, levelF, appliedQ, sessionId]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const rowNo = (index) => filtered.length - (page - 1) * PER_PAGE - index;

  // status counts (for chip badges)
  const counts = useMemo(() => {
    const c = { all: apps.length };
    STATUS_CHIPS.forEach(x => { if (x.id !== 'all') c[x.id] = 0; });
    apps.forEach(a => {
      STATUS_CHIPS.forEach(x => {
        if (x.id !== 'all' && matchesStatusChip(a, x.id)) c[x.id] = (c[x.id] || 0) + 1;
      });
    });
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
  const [paymentExcelModal, setPaymentExcelModal] = useState(false);
  const [zipModal, setZipModal] = useState(false);
  const [photoLP, setPhotoLP] = useState(null);   // 사진 심사 인라인 패널 id (TPKM_BO_2_1_3)
  const [confirmId, setConfirmId] = useState(null); // 접수 확인증 (TPKM_BO_2_1_11)

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
    const blockedPhoto = ids.filter(id => {
      const a = state.applicants.find(x => x.id === id);
      return a && a.photoStatus !== 'approved';
    });
    if (blockedPhoto.length) {
      toastErr(`사진 미심사 ${blockedPhoto.length}건이 포함되어 있습니다. 상세보기에서 먼저 심사해주세요.`, { title: '승인 불가' });
      return;
    }
    const blockedPay = ids.filter(id => {
      const a = state.applicants.find(x => x.id === id);
      return a && !a.paid;
    });
    if (blockedPay.length) {
      toastErr(`미수납 ${blockedPay.length}건이 포함되어 있습니다. 수납 완료 후 승인해주세요.`, { title: '승인 불가' });
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
      a.paymentStatus = 'paid';
      a.paidAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
      a.paymentMemo = info.memo || '';
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
      const n = await DataStore.apiCancelPay(ids, reason);
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
      a.paymentStatus = 'refunded';
      a.paymentMemo = '';
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
        var rows = (body.preview_rows && body.preview_rows.length)
          ? body.preview_rows.map(function (r) {
              return {
                id: String(r.application_id || ''),
                name: r.name_en || '',
                nameKo: r.name_ko || '',
                exam: r.exam_number || '',
                level: r.exam_level === 'II' ? 'Ⅱ' : (r.exam_level === 'I' ? 'Ⅰ' : (r.exam_level || '')),
              };
            })
          : (body.preview || []).map(function (exam) {
              return { id: '', name: '', nameKo: '', exam: exam, level: '' };
            });
        var skippedList = body.skipped || [];
        return {
          result: rows,
          targets: body.assigned || rows.length,
          skipped: skippedList.length,
          warning: skippedList.length
            ? ('시험장 정보 없음으로 제외된 접수 ' + skippedList.length + '건이 있습니다. 시험장 관리를 확인해 주세요.')
            : (rows.length === 0 && (body.eligible_count || 0) === 0
              ? '부여 대상이 없습니다. (상태 승인완료 + 수험번호 미부여 건만 대상)'
              : ''),
        };
      }
      toastOk(`${body.assigned || 0}건에 수험번호가 일괄 부여되었습니다.`, { title: '수험번호 부여 완료' });
      return { result: [], targets: body.assigned || 0 };
    }
    const session = state.sessions.find(s => s.id === sessionId);
    // 대상: BO 상태 승인완료(approved) + 수험번호 미부여
    const targets = state.applicants
      .filter(a => a.sessionId === sessionId)
      .filter(a => a.status === 'approved' && !a.exam);
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

  const isSuperAdmin = state.me?.role === 'super';
  const canAssignExam = isSuperAdmin && DataStore.can('applicants', 'exam');
  const canDownload = DataStore.can('applicants', 'export');
  const canPhoto = DataStore.can('applicants', 'photo');
  const canPay = DataStore.can('applicants', 'pay');
  const canApprove = DataStore.can('applicants', 'approve');
  const canReject = DataStore.can('applicants', 'reject');
  const isReadonly = DataStore.isReadonly();

  // bulk action helpers
  const bulkIds = Array.from(selected);

  // sort helper — 번호 열 클릭 시 접수 ID(최신순) 정렬
  const sortBy = (k) => {
    const key = k === 'no' ? 'id' : k;
    setSort(s => s.k === key
      ? { k: key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { k: key, dir: (key === 'id' || key === 'appliedAt') ? 'desc' : 'asc' });
  };

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
          <button className="btn btn-secondary" onClick={() => setPaymentExcelModal(true)} disabled={!canPay}>
            <I.Download style={{ width: 14, height: 14 }}/> 수납 명단
          </button>
          <button className="btn btn-secondary" onClick={() => setZipModal(true)} disabled={!canDownload}>
            <I.Download style={{ width: 14, height: 14 }}/> 사진 zip
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <I.Printer style={{ width: 14, height: 14 }}/> 인쇄
          </button>
          <button className="btn btn-primary" disabled={!canAssignExam} title={!isSuperAdmin ? '수험번호 일괄 부여는 최고관리자(super)만 가능합니다.' : ''} onClick={() => setExamModal(true)}>
            <I.Hash style={{ width: 14, height: 14 }}/> 수험번호 일괄 부여
          </button>
        </div>
      </div>

      {/* Filter bar — TPKM_BO_2_1_1 */}
      <div className="filterbar filterbar-applicants no-print">
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
          <input className="input search" type="search" placeholder="한글·영문 성명/이메일/생년월일/접수번호/수험번호"
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}/>
          <button type="button" className="btn btn-secondary btn-sm" onClick={runSearch}>검색</button>
          {(statusF !== 'all' || venueF !== 'all' || levelF !== 'all' || appliedQ || qInput) && (
            <button className="ibtn ghost" onClick={resetFilters}>
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
                <th className="sortable" onClick={() => sortBy('applicationNo')}>접수번호</th>
                <th>사진심사</th>
                <th>수납</th>
                <th>수험번호</th>
                <th>상태</th>
                <th className="no-print">관리</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((a, i) => (
                <tr key={a.id} className={selected.has(a.id) ? 'sel' : ''}>
                  <td className="cb"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)}/></td>
                  <td className="num">{rowNo(i)}</td>
                  <td>
                    <PhotoThumb status={a.photoStatus} name={a.nameKo} seed={a.id} photoUrl={a.photoUrl}/>
                  </td>
                  <td><a style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setDetailId(a.id)}>{a.nameKo}</a></td>
                  <td>{a.nameEn}</td>
                  <td className="muted">{a.email || '—'}</td>
                  <td><span className="code-id">{a.level}</span></td>
                  <td className="code muted">{a.appliedAt}</td>
                  <td className="code"><b style={{ color: a.applicationNo ? 'var(--primary)' : 'var(--text-4)' }}>{a.applicationNo || '—'}</b></td>
                  <td><PhotoStatusPill status={a.photoStatus}/></td>
                  <td>{applicantPaymentPill(a)}</td>
                  <td className="code"><b style={{ color: a.exam ? 'var(--st-number)' : 'var(--text-4)' }}>{a.exam || '—'}</b></td>
                  <td><Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></td>
                  <td className="no-print">
                    <div className="row-actions">
                      <button className="ibtn" title="접수 확인증" onClick={() => setConfirmId(a.id)} disabled={!applicantConfirmAvailable(a)}>
                        <I.FileText style={{ width: 14, height: 14 }}/> 접수증
                      </button>
                      <button className="ibtn" title="상세 보기" onClick={() => setDetailId(a.id)}><I.Eye style={{ width: 14, height: 14 }}/> 상세보기</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan="14">
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
        onViewConfirm={() => setConfirmId(detailId)}
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
      {paymentExcelModal && <PaymentExcelModal onClose={() => setPaymentExcelModal(false)} sessionId={sessionId}/>}
      {zipModal && <ZipExportModal onClose={() => setZipModal(false)} rows={filtered}
        venueId={venueF !== 'all' ? venueF : null}
        level={levelF === 'Ⅰ' ? 'I' : levelF === 'Ⅱ' ? 'II' : null}/>}
      {confirmId && <ApplicationConfirmModal id={confirmId} onClose={() => setConfirmId(null)}/>}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb, .tb, .panel-head .actions { display: none !important; }
          .app { display: block !important; }
          .mn { padding: 0 !important; }
          .dg-wrap { border: 0 !important; box-shadow: none !important; }
          body.printing-app-confirm #root { display: none !important; }
          body.printing-app-confirm #app-confirm-print-clone {
            display: block !important;
            padding: 12mm !important;
            background: #fff !important;
          }
          body.printing-app-confirm #app-confirm-print-clone h3 {
            margin: 0 0 14px !important;
            font-size: 18px !important;
          }
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
  const formatted = iso && DataStore.fmtMmt ? DataStore.fmtMmt(iso) : '';
  const initDate = formatted ? formatted.slice(0, 10) : '';
  const initTime = formatted ? formatted.slice(11, 16) : '09:00';
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const f = iso && DataStore.fmtMmt ? DataStore.fmtMmt(iso) : '';
    setDate(f ? f.slice(0, 10) : '');
    setTime(f ? f.slice(11, 16) : '09:00');
  }, [iso, sessionId]);

  const save = async () => {
    if (!date) { toastErr('노출 시작일을 선택해주세요.'); return; }
    const visibleAt = `${date}T${(time || '00:00')}`;
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
        <FormRow label="노출 시작일" hint="이 일시(MMT) 이전에는 사용자 화면(FO)에서 수험번호 미노출">
          <input type="date" className="input" style={{ height: 38, width: 200 }} value={date} onChange={e => setDate(e.target.value)}/>
        </FormRow>
        <FormRow label="노출 시작 시각">
          <input type="time" className="input" style={{ height: 38, width: 140 }} value={time} onChange={e => setTime(e.target.value)}/>
        </FormRow>
        <button className="btn btn-primary" style={{ marginTop: 23 }} onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '노출 시점 저장'}
        </button>
        {iso && <div style={{ marginTop: 27, fontSize: 12, color: 'var(--text-3)' }}>현재 설정(MMT): <code className="code-id">{(DataStore.fmtMmt ? DataStore.fmtMmt(iso) : iso).replace('T', ' ').slice(0, 16)}</code></div>}
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
    if (!a.photoFileId || !window.TopikBoApi) {
      toastErr('원본 사진을 받을 수 없습니다. (사진 미제출 또는 API 미연결)');
      return;
    }
    TopikBoApi.downloadFile(a.photoFileId, (a.exam || a.nameEn || a.id) + '.jpg').then(function (ok) {
      if (!ok) toastErr('원본 사진을 받을 수 없습니다.');
    });
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

// 접수자 상세 처리 이력 — 접수 건(접수자·사진)만. targetId 숫자만 맞추면 회원 이력이 섞이지 않도록 유형도 필터.
const APPLICANT_AUDIT_TYPES = new Set(['접수자', '사진']);
function filterApplicantAudit(audit, appId) {
  const sid = String(appId);
  return audit.filter(l => APPLICANT_AUDIT_TYPES.has(l.type) && String(l.targetId) === sid);
}

// ===== Detail LP =====
function ApplicantDetailLP({ id, onClose, onViewConfirm, onApprove, onReject, onPay, onPhotoApprove, onPhotoReject }) {
  const state = useStore();
  const appId = String(id);
  const a = state.applicants.find(x => x.id === appId);
  const displayNo = useMemo(() => {
    if (!a) return '—';
    const sessionApps = state.applicants.filter(x => x.sessionId === a.sessionId);
    const sorted = sessionApps.slice().sort((x, y) => Number(y.id) - Number(x.id));
    const idx = sorted.findIndex(x => x.id === a.id);
    return idx >= 0 ? sessionApps.length - idx : '—';
  }, [state.applicants, a]);
  const isReadonly = DataStore.isReadonly();
  const isApi = !!(DataStore.isApiMode && DataStore.isApiMode());
  const [tab, setTab] = useState('profile');
  const [memo, setMemo] = useState('');
  const [photoMode, setPhotoMode] = useState(null);
  const [photoReason, setPhotoReason] = useState(PHOTO_REJECT_REASONS[0]);
  const [photoOther, setPhotoOther] = useState('');
  const [rotate, setRotate] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [detailLog, setDetailLog] = useState(null);

  const loadDetailLog = useCallback(() => {
    if (isApi && DataStore.fetchApplicantAudit) {
      return DataStore.fetchApplicantAudit(appId).then(rows => { setDetailLog(rows || []); });
    }
    setDetailLog(null);
    return Promise.resolve();
  }, [appId, isApi]);

  // 상세 LP 열릴 때·처리 후 해당 접수 건 이력·상태 동기화
  useEffect(() => {
    setDetailLog(null);
    loadDetailLog();
  }, [appId, loadDetailLog, a && a.rev, a && a.status, a && a.paid, a && a.photoStatus]);

  const log = useMemo(() => {
    if (isApi) return detailLog !== null ? detailLog : [];
    return filterApplicantAudit(state.audit, appId);
  }, [state.audit, appId, detailLog, isApi]);

  if (!a) return null;
  const locked = isFoCancelled(a);
  const downloadOriginal = () => {
    if (!a.photoFileId || !window.TopikBoApi) {
      toastErr('원본 사진을 받을 수 없습니다. (사진 미제출 또는 API 미연결)');
      return;
    }
    TopikBoApi.downloadFile(a.photoFileId, (a.exam || a.nameEn || a.id) + '.jpg').then(function (ok) {
      if (!ok) toastErr('원본 사진을 받을 수 없습니다.');
    });
  };
  const venue = state.venues.find(v => v.id === a.venueId);
  const photoRejectReason = photoReason === '기타' ? photoOther : (photoOther ? `${photoReason} — ${photoOther}` : photoReason);

  const addMemo = () => {
    if (!memo.trim()) return;
    a.memo = (a.memo || '') + `[${new Date().toISOString().slice(0,16).replace('T',' ')}/${state.me?.id}] ${memo}\n`;
    DataStore.addAudit({ type: '접수자', targetId: appId, action: '수정', memo: '관리자 메모 추가' });
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
      sub={<span>회차 컨텍스트 · 접수번호 <code className="code-id">{a.applicationNo || '—'}</code> · 접수ID <code className="code-id">{a.id}</code> · 상태 <Pill kind={a.status}>{DataStore.statusLabel(a.status)}</Pill></span>}
      footer={<>
        <button className="btn btn-secondary" onClick={onViewConfirm} disabled={!applicantConfirmAvailable(a)} title={!applicantConfirmAvailable(a) ? '접수번호가 없거나 취소된 접수입니다' : '학생 마이페이지 접수 확인증과 동일'}>
          <I.FileText style={{ width: 14, height: 14 }}/> 접수 확인증
        </button>
        <button className="btn btn-secondary" onClick={onClose}>닫기</button>
        {!isReadonly && <>
          <button className="btn btn-secondary" onClick={onReject} disabled={locked}>반려</button>
          <button className="btn btn-secondary" onClick={onPay} disabled={locked}>{a.paid ? '수납 취소' : '수납'}</button>
          <button className="btn btn-primary" onClick={onApprove} disabled={locked || !applicantReadyForApprove(a)} title={!applicantReadyForApprove(a) ? '사진 승인·수납 완료 후 승인할 수 있습니다' : ''}>승인</button>
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
            <div id="photo-review-box" style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)' }}>
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
              <KV k="번호" v={displayNo}/>
              <KV k="접수번호" v={a.applicationNo ? <code className="code-id" style={{ color: 'var(--primary)', fontWeight: 700 }}>{a.applicationNo}</code> : '—'}/>
              <KV k="접수 ID" v={<code className="code-id">{a.id}</code>}/>
              <KV k="한글 성명" v={a.nameKo}/>
              <KV k="영문 성명" v={a.nameEn}/>
              <KV k="생년월일" v={<code className="code-id">{a.dob}</code>}/>
              <KV k="성별" v={a.sx === 1 ? '남(1)' : '여(2)'}/>
              <KV k="국적" v={boAdminNationKo(a.nation)}/>
              <KV k="제1언어" v={boAdminLangKo(a.l1)}/>
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
              <KV k="수납 상태" v={applicantPaymentStatusView(a)}/>
              <KV k="수납 일시" v={a.paidAt || '—'}/>
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

// ===== 접수 확인증 (FO mypage 접수 확인증과 동일 — 환불 대조용) =====
function ApplicationConfirmModal({ id, onClose }) {
  const state = useStore();
  const a = state.applicants.find(x => x.id === id);
  const session = state.sessions.find(s => s.id === a?.sessionId);
  const exam = applicantConfirmExamNumber(a, session);
  const fee = applicantFeeAmount(a, session);

  useEffect(() => {
    var fn = function () {
      document.body.classList.remove('printing-app-confirm');
      var clone = document.getElementById('app-confirm-print-clone');
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
    };
    window.addEventListener('afterprint', fn);
    return function () { window.removeEventListener('afterprint', fn); };
  }, []);

  if (!a) return null;

  var handlePrint = function () {
    var src = document.getElementById('app-confirm-print');
    if (!src) return;
    var prev = document.getElementById('app-confirm-print-clone');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var wrap = document.createElement('div');
    wrap.id = 'app-confirm-print-clone';
    var heading = document.createElement('h3');
    heading.textContent = '접수 확인증';
    wrap.appendChild(heading);
    wrap.appendChild(src.cloneNode(true));
    document.body.appendChild(wrap);
    document.body.classList.add('printing-app-confirm');
    window.print();
  };

  return (
    <Modal open onClose={onClose} title="접수 확인증"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={handlePrint}>
          <I.Printer style={{ width: 14, height: 14 }}/> 인쇄
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      <p className="app-confirm-hint" style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        학생 마이페이지의 <b>접수 확인증</b>과 동일한 정보입니다. 환불·정정 처리 시 학생이 출력한 접수증과 대조해 주세요.
      </p>
      <div id="app-confirm-print">
        <table className="dg" style={{ margin: 0, fontSize: 13.5 }}>
          <tbody>
            <tr><th style={{ width: 110, background: 'var(--bg-2)', color: 'var(--text-2)' }}>회차</th><td>{applicantRoundTitle(a, session)}</td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>접수번호</th><td><code className="code-id">{a.applicationNo}</code></td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>수험번호</th><td><code className="code-id" style={{ color: a.examNumberVisible && a.exam ? 'var(--st-number)' : undefined }}>{exam.text}</code></td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>응시 급수</th><td>{applicantLevelText(a)}</td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>응시료</th><td style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, color: 'var(--primary)' }}>{DataStore.fmtCurrency(fee)}</td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>접수일</th><td>{a.appliedAt || '—'}</td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>응시자</th><td>{a.nameKo} / {a.nameEn}</td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>생년월일</th><td><code className="code-id">{formatApplicantDob(a.dob)}</code></td></tr>
            <tr><th style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>수납 상태</th><td>{applicantPaymentPill(a)}</td></tr>
          </tbody>
        </table>
        {exam.adminNote && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)' }}>
            {exam.adminNote} (학생 화면에는 공개 전까지 표시되지 않습니다)
          </div>
        )}
      </div>
    </Modal>
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
          <button className="btn btn-primary" onClick={() => onPay(ids, { memo })}>수납 완료 처리</button>
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
      <div id="pay-target-table" style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14 }}>
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
  const blockedPhoto = rows.filter(a => a.photoStatus !== 'approved');
  const blockedPay = rows.filter(a => !a.paid);
  const blocked = blockedPhoto.length > 0 || blockedPay.length > 0;
  return (
    <Modal open onClose={onClose} title="접수자 승인 처리"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>취소</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={blocked}>승인 완료</button>
      </>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        대상 <b>{rows.length}</b>건을 승인합니다. <b>사진 승인·수납 완료</b>된 건만 승인할 수 있습니다.
      </div>
      {blockedPhoto.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--danger-50)', color: 'var(--danger)', borderRadius: 6, fontSize: 12.5 }}>
          ⚠ 사진 미심사 <b>{blockedPhoto.length}</b>건이 포함되어 있습니다. 접수자 목록에서 먼저 심사해 주세요.
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {blockedPhoto.slice(0, 5).map(a => <li key={a.id}>{a.nameKo} ({a.nameEn})</li>)}
          </ul>
        </div>
      )}
      {blockedPay.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, background: 'var(--danger-50)', color: 'var(--danger)', borderRadius: 6, fontSize: 12.5 }}>
          ⚠ 미수납 <b>{blockedPay.length}</b>건이 포함되어 있습니다. 수납 완료 후 승인해 주세요.
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {blockedPay.slice(0, 5).map(a => <li key={a.id}>{a.nameKo} ({a.nameEn})</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ===== Reject modal (TPKM_BO_2_1_5) =====
const GENERAL_REJECT_REASONS = ['정보 불일치', '중복 접수', '기타'];
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
          대상: 접수자 목록 상태 <b>승인완료</b> + 수험번호 미부여 · 환불자는 수험번호 유지<br/>
          이메일 발송: <b style={{ color: 'var(--danger)' }}>안 함</b> · 노출 시점: 별도 설정한 날짜에 FO 접수확인 페이지에서 공개
        </p>
      </div>
      {preview.warning ? (
        <div style={{ margin: '12px 0', padding: '10px 12px', borderRadius: 6, background: 'var(--warning-bg, #fff8e6)', color: 'var(--text-2)', fontSize: 13 }}>
          {preview.warning}
        </div>
      ) : null}
      <div className="kpi-grid" style={{ margin: '14px 0' }}>
        <div className="kpi"><div className="label">부여 대상</div><div className="val">{preview.result.length}</div></div>
        <div className="kpi"><div className="label">제외(누락 사유)</div><div className="val">{preview.skipped || 0}</div></div>
      </div>
      <div id="exam-preview-table" style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
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

  // 시험장·수준별 개별 파일 — 파일명: 제{회차}회 TOPIK 지원자 연명부(미얀마_{시험장})[_{급수}].xlsx
  const groups = useMemo(() => {
    const src = mode === 'full' ? state.applicants.filter(a => a.sessionId === state.activeSessionId) : rows;
    const roundNo = session ? session.no : '';
    const m = new Map();
    const levelsByVenue = new Map();
    src.forEach(a => {
      const venue = state.venues.find(v => v.id === a.venueId);
      const vname = venue ? venue.nameKo : '미지정';
      const lp = levelPfx(a.level);
      if (!levelsByVenue.has(vname)) levelsByVenue.set(vname, new Set());
      levelsByVenue.get(vname).add(lp);
    });
    src.forEach(a => {
      const venue = state.venues.find(v => v.id === a.venueId);
      const vname = venue ? venue.nameKo : '미지정';
      const lp = levelPfx(a.level);
      const multiLevel = (levelsByVenue.get(vname)?.size || 0) > 1;
      const fname = window.TOPIKBoBridge?.rosterExportFilename
        ? TOPIKBoBridge.rosterExportFilename(roundNo, vname, lp, multiLevel)
        : `${roundNo ? `제${roundNo}회 ` : ''}TOPIK 지원자 연명부(미얀마_${vname})${multiLevel ? `_${lp}` : ''}.xlsx`;
      m.set(fname, (m.get(fname) || 0) + 1);
    });
    return Array.from(m.entries()).map(([k, n]) => ({ k, n }));
  }, [rows, state.venues, state.applicants, mode, session]);
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

// ===== 수납 대상자 명단 엑셀 다운로드·일괄 업로드 =====
function PaymentExcelModal({ onClose, sessionId }) {
  const state = useStore();
  const activeSessionId = sessionId || state.activeSessionId;
  const session = state.sessions.find(s => String(s.id) === String(activeSessionId));
  const apiMode = !!(DataStore.isApiMode && DataStore.isApiMode());
  const unpaidRows = useMemo(() => (
    state.applicants.filter(a =>
      String(a.sessionId) === String(activeSessionId) && isUnpaidRosterApplicant(a)
    )
  ), [state.applicants, activeSessionId]);
  const [busy, setBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef(null);

  const doDownload = () => {
    const role = (DataStore.getAdminSession && DataStore.getAdminSession()?.role) || 'super';
    if (window.TOPIKBoBridge && !TOPIKBoBridge.enforcePerm(role, '접수 관리|수납', 'execute')) return;
    if (!unpaidRows.length) { toastErr('미수납 대상자가 없습니다.'); return; }
    setBusy(true);
    const run = () => {
      DataStore.addAudit({ type: '접수자', targetId: '—', action: '게시', memo: `수납 대상자 명단 엑셀 내보내기(${unpaidRows.length}건)` });
      toastOk(`수납 대상자 명단 ${unpaidRows.length}건을 다운로드했습니다.`, { title: '엑셀 다운로드' });
      setBusy(false);
    };
    if (apiMode && DataStore.apiDownloadPaymentRoster) {
      DataStore.apiDownloadPaymentRoster(activeSessionId).then(res => {
        if (res && res.ok) run();
        else { toastErr((res && res.body && res.body.error && res.body.error.message) || '다운로드 실패'); setBusy(false); }
      }).catch(e => { toastErr(e.message || '다운로드 실패'); setBusy(false); });
      return;
    }
    if (window.TOPIKBoBridge && TOPIKBoBridge.exportPaymentExcel) {
      TOPIKBoBridge.exportPaymentExcel({ rows: unpaidRows, state }).then(run).catch(e => { toastErr(e.message || '다운로드 실패'); setBusy(false); });
      return;
    }
    setBusy(false);
    toastErr('엑셀 내보내기 모듈을 불러올 수 없습니다.');
  };

  const doUpload = (file) => {
    if (!file) return;
    const role = (DataStore.getAdminSession && DataStore.getAdminSession()?.role) || 'super';
    if (window.TOPIKBoBridge && !TOPIKBoBridge.enforcePerm(role, '접수 관리|수납', 'execute')) return;
    setBusy(true);
    setUploadResult(null);

    const finish = (body) => {
      setUploadResult(body);
      setBusy(false);
      if (body && body.updated > 0) {
        DataStore.addAudit({ type: '접수자', targetId: '—', action: '수납', memo: `수납 명단 엑셀 일괄 업로드(${body.updated}건 반영)` });
        toastOk(`${body.updated}건 수납 상태가 반영되었습니다.`, { title: '업로드 완료', type: 'success' });
      } else if (body && !body.updated && !(body.skipped_photo_not_approved || []).length) {
        toastOk('변경할 수납 상태가 없습니다.', { title: '업로드 완료' });
      }
    };

    if (apiMode && DataStore.apiImportPaymentRoster) {
      DataStore.apiImportPaymentRoster(activeSessionId, file).then(body => {
        if (body) finish(body);
        else setBusy(false);
      }).catch(e => { toastErr(e.message || '업로드 실패'); setBusy(false); });
      return;
    }

    if (window.TOPIKExport && window.TOPIKBoBridge) {
      TOPIKExport.parsePaymentXlsxFile(file).then(items => {
        if (!items.length) { toastErr('엑셀에서 수납상태 데이터를 찾을 수 없습니다.'); setBusy(false); return; }
        return TOPIKBoBridge.importPaymentExcelLocal({ items, state }).then(finish);
      }).catch(e => { toastErr(e.message || '엑셀 파싱 실패'); setBusy(false); });
      return;
    }
    setBusy(false);
    toastErr('엑셀 업로드 모듈을 불러올 수 없습니다.');
  };

  const skippedPhoto = uploadResult && (uploadResult.skipped_photo_not_approved || []);

  return (
    <Modal open onClose={onClose} title="수납 대상자 명단 (엑셀)"
      footer={<button className="btn btn-primary" onClick={onClose}>닫기</button>}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
        현장 수납 처리용 <b>미수납 대상자</b> 명단을 엑셀로 받아, 현장에서 <b>수납상태</b>만 수정한 뒤 다시 업로드하면 일괄 반영됩니다.
      </div>

      <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-2)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>엑셀 컬럼</div>
        접수번호 · 접수ID · 한글성명 · 영문성명 · 생년월일 · 시험장 · 급수 · 사진심사(참고) · <b>수납상태</b>
        <div style={{ marginTop: 8, color: 'var(--text-3)' }}>
          수납상태: <code className="code-id">미수납</code> / <code className="code-id">수납완료</code> (또는 <code className="code-id">X</code> / <code className="code-id">O</code>)
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 12, background: 'var(--st-rejected-bg)', borderRadius: 8, fontSize: 12.5, color: 'var(--st-rejected)' }}>
        <b>⚠ 업로드 시 필수 조건</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li><b>사진심사가 「승인」되지 않은 접수자</b>는 엑셀에 수납완료(O)로 표시되어 있어도 <b>수납 상태가 업데이트되지 않습니다.</b></li>
          <li>사진 승인 후에만 수납완료 처리가 반영됩니다. 사진 미심사 건은 먼저 사진 심사를 완료해 주세요.</li>
          <li>접수번호·접수ID 열은 수정·삭제하지 마세요 (매칭 키).</li>
        </ul>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={doDownload} disabled={busy || !unpaidRows.length}>
          {busy ? '처리 중…' : `미수납 명단 다운로드 (${unpaidRows.length}건)`}
        </button>
        <button className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
          엑셀 업로드 (일괄 반영)
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files && e.target.files[0]; if (f) doUpload(f); e.target.value = ''; }}/>
      </div>

      {uploadResult && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-2)', borderRadius: 8, fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>업로드 결과</div>
          <div>수납 반영: <b style={{ color: 'var(--primary)' }}>{uploadResult.updated || 0}</b>건</div>
          <div style={{ color: 'var(--text-3)' }}>변경 없음: {uploadResult.skipped_unchanged || 0}건 · 미매칭: {(uploadResult.skipped_not_found || []).length}건</div>
          {skippedPhoto && skippedPhoto.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, background: 'var(--st-rejected-bg)', color: 'var(--st-rejected)', borderRadius: 6 }}>
              <b>사진 미승인으로 수납 미반영 {skippedPhoto.length}건</b>
              <ul style={{ marginTop: 6, paddingLeft: 16, maxHeight: 120, overflow: 'auto' }}>
                {skippedPhoto.slice(0, 10).map((r, i) => (
                  <li key={i}>{r.name_ko || r.nameKo || '—'} ({r.application_no || r.applicationNo || '—'}) — 사진심사 미승인</li>
                ))}
              </ul>
              {skippedPhoto.length > 10 && <div style={{ fontSize: 11, marginTop: 4 }}>… 외 {skippedPhoto.length - 10}건</div>}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
        대상 회차: <b>{session?.name || '—'}</b>
        {unpaidRows.length === 0 && (
          <span style={{ display: 'block', marginTop: 6, color: 'var(--text-2)' }}>
            ※ 현재 선택한 회차에 수납 대상(미수납) 접수자가 없습니다. 환불 처리된 건은 「환불」로 표시되며 명단에 포함되지 않습니다. 미수납이 다른 회차에 있다면 상단 회차 선택에서 해당 회차를 선택해 주세요.
          </span>
        )}
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
