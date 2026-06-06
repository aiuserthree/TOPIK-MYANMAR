/* ============================================================
   panels/photos.jsx — 사진 심사 (카드 갤러리)
   접수자 목록(applicants.jsx)의 사진 심사 로직(PhotoReviewLP / DataStore)을
   재사용한 카드형 갤러리 뷰. 각 카드에서 인라인 승인/반려(사유 코드) 처리.
   ============================================================ */

const PHOTO_PANEL_REASONS = ['정면 아님', '모자·선글라스', '흑백', '흐림', '본인 아님', '기타'];

function PhotosPanel() {
  const state = useStore();
  const sessionId = state.activeSessionId;
  const apps = useMemo(() => state.applicants.filter(a => a.sessionId === sessionId), [state.applicants, sessionId]);

  const [statusF, setStatusF] = useState('pending'); // pending | approved | rejected | all
  const [q, setQ] = useState('');
  const [lpId, setLpId] = useState(null);            // 상세 심사 LP (applicants.jsx의 PhotoReviewLP 재사용)

  const counts = useMemo(() => ({
    all: apps.length,
    pending: apps.filter(a => a.photoStatus === 'pending').length,
    approved: apps.filter(a => a.photoStatus === 'approved').length,
    rejected: apps.filter(a => a.photoStatus === 'rejected').length,
  }), [apps]);

  const list = useMemo(() => {
    let r = apps;
    if (statusF !== 'all') r = r.filter(a => a.photoStatus === statusF);
    if (q) {
      const qq = q.trim().toLowerCase();
      r = r.filter(a => a.nameKo.includes(qq) || a.nameEn.toLowerCase().includes(qq) || a.dob.includes(qq));
    }
    return r;
  }, [apps, statusF, q]);

  // 사진 심사 로직 — applicants.jsx의 doPhotoApprove / doPhotoReject 와 동일하게 동작
  const approve = (id) => {
    const a = state.applicants.find(x => x.id === id);
    if (!a) return;
    const before = { photoStatus: a.photoStatus, status: a.status };
    a.photoStatus = 'approved';
    a.photoOk = true;
    if (a.status === 'photo') a.status = a.paid ? 'approved' : 'pay';
    DataStore.addAudit({ type: '사진', targetId: id, action: '승인', before, after: { photoStatus: 'approved', status: a.status }, memo: '' });
    DataStore.notify();
    toastOk('사진이 승인되었습니다.', { title: '사진 심사', type: 'success' });
  };
  const reject = (id, reason) => {
    const a = state.applicants.find(x => x.id === id);
    if (!a) return;
    if (!reason || !reason.trim()) { toastErr('반려 사유를 선택해주세요.'); return; }
    const before = { photoStatus: a.photoStatus, status: a.status, rejectReason: a.rejectReason };
    a.photoStatus = 'rejected';
    a.photoOk = false;
    a.status = 'rejected';
    a.rejectReason = reason;
    DataStore.addAudit({ type: '사진', targetId: id, action: '반려', before, after: { photoStatus: 'rejected', status: 'rejected', rejectReason: reason }, memo: reason });
    DataStore.notify();
    toastOk('사진이 반려되었습니다. 응시자에게 이메일이 발송됩니다.', { title: '사진 심사', type: 'success' });
  };

  const CHIPS = [
    { id: 'pending',  label: '미심사' },
    { id: 'approved', label: '승인' },
    { id: 'rejected', label: '반려' },
    { id: 'all',      label: '전체' },
  ];

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>사진 심사</h1>
          <div className="sub">증명사진을 카드 갤러리로 빠르게 검토합니다. 접수자 목록의 사진 심사 로직과 동일하게 처리되며, 처리 즉시 이력에 기록됩니다.</div>
        </div>
        <div className="actions">
          <a className="btn btn-secondary" href="#applicants"><I.Users style={{ width: 14, height: 14 }}/> 접수자 목록</a>
        </div>
      </div>

      <div className="filterbar">
        <div className="chips">
          {CHIPS.map(c => (
            <button key={c.id} className={`chip ${statusF === c.id ? 'active' : ''}`} onClick={() => setStatusF(c.id)}>
              {c.label}<span className="cnt">{DataStore.fmtNum(counts[c.id] || 0)}</span>
            </button>
          ))}
        </div>
        <div className="controls">
          <input className="input search" type="text" placeholder="한글·영문 성명/생년월일" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="photo-gallery">
        {list.map(a => (
          <PhotoReviewCard key={a.id} a={a} reasons={PHOTO_PANEL_REASONS}
            onApprove={approve} onReject={reject} onOpen={() => setLpId(a.id)}/>
        ))}
        {!list.length && (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>
            <div className="icon"><I.Image/></div>
            <div className="ttl">표시할 사진이 없습니다</div>
            <div className="sub">필터/검색 조건을 변경해 보세요.</div>
          </div>
        )}
      </div>

      {/* 상세 심사 — applicants.jsx의 PhotoReviewLP 재사용 */}
      {lpId && <PhotoReviewLP id={lpId} onClose={() => setLpId(null)} onApprove={approve} onReject={reject}/>}

      <style>{`
        .photo-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 14px;
        }
        .photo-rc .acard-body { display: flex; flex-direction: column; }
        .photo-rc .pic { width: 130px; align-self: center; }
        .photo-rc .nm { font-size: 15px; font-weight: 700; color: var(--text); margin-top: 12px; }
        .photo-rc .nm small { font-weight: 500; color: var(--text-3); font-size: 12.5px; margin-left: 4px; }
        .photo-rc dl.kv2 { display: grid; grid-template-columns: 64px 1fr; gap: 3px 8px; margin-top: 8px; font-size: 12.5px; align-items: center; }
        .photo-rc dl.kv2 dt { color: var(--text-3); }
        .photo-rc dl.kv2 dd { color: var(--text-2); }
        .photo-rc .rc-actions { margin-top: 12px; display: flex; gap: 6px; align-items: center; }
        .photo-rc .rc-actions .btn { flex: 1; }
        .photo-rc .rc-reject { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
      `}</style>
    </>
  );
}

// ----- 사진 심사 카드 (인라인 승인/반려 + 반려 사유 코드) -----
function PhotoReviewCard({ a, reasons, onApprove, onReject, onOpen }) {
  const [mode, setMode] = useState(null); // null | 'reject'
  const [reason, setReason] = useState(reasons[0]);
  const [other, setOther] = useState('');
  const finalReason = reason === '기타' ? other : (other ? `${reason} — ${other}` : reason);
  const doReject = () => {
    if (reason === '기타' && !other.trim()) { toastErr('상세 사유를 입력해주세요.'); return; }
    onReject(a.id, finalReason);
    setMode(null); setOther('');
  };
  return (
    <div className="acard photo-rc">
      <div className="acard-body">
        <div className="pic">
          <PhotoLarge status={a.photoStatus} name={a.nameKo} seed={a.id}/>
        </div>
        <div className="nm">{a.nameKo} <small>{a.nameEn}</small></div>
        <dl className="kv2">
          <dt>생년월일</dt><dd><code className="code-id">{a.dob}</code></dd>
          <dt>성별</dt><dd>{a.sx === 1 ? '남(1)' : '여(2)'}</dd>
          <dt>국적</dt><dd>{a.nation}</dd>
          <dt>급수</dt><dd>TOPIK {a.level}</dd>
          <dt>심사</dt><dd><PhotoStatusPill status={a.photoStatus}/></dd>
        </dl>

        {mode === 'reject' ? (
          <div className="rc-reject">
            <FormRow label="반려 사유" required hint="사유는 응시자에게 안내됩니다(사진 재등록 요청).">
              <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
                {reasons.map(r => <option key={r}>{r}</option>)}
              </select>
            </FormRow>
            {reason === '기타' && (
              <FormRow label="상세 사유" required>
                <input className="input" value={other} onChange={e => setOther(e.target.value)} placeholder="상세 사유 입력"/>
              </FormRow>
            )}
            <div className="rc-actions">
              <button className="btn btn-secondary" onClick={() => setMode(null)}>뒤로</button>
              <button className="btn btn-danger" onClick={doReject}>반려 처리</button>
            </div>
          </div>
        ) : (
          <div className="rc-actions">
            <button className="ibtn ghost" title="상세 보기" onClick={onOpen}><I.Eye style={{ width: 14, height: 14 }}/></button>
            <button className="btn btn-secondary" onClick={() => setMode('reject')} disabled={a.photoStatus === 'rejected'}>반려</button>
            <button className="btn btn-primary" onClick={() => onApprove(a.id)} disabled={a.photoStatus === 'approved'}>승인</button>
          </div>
        )}
      </div>
    </div>
  );
}

window.PhotosPanel = PhotosPanel;
