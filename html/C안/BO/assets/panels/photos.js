/* ============================================================
   panels/photos.js — 사진 심사 (카드 갤러리, vanilla port of photos.jsx)
   접수자 목록(applicants.js)의 PhotoReviewLP / PhotoLarge / PhotoStatusPill 재사용.
   ============================================================ */

const PHOTO_PANEL_REASONS = ['정면 아님', '모자·선글라스', '흑백', '흐림', '본인 아님', '기타'];
/** BO photo-review API codes (api/lib/admin-helpers.ts) */
const PHOTO_REASON_TO_CODE = {
  '정면 아님': 'not_frontal',
  '모자·선글라스': 'hat_glasses',
  '흑백': 'bw_photo',
  '흐림': 'blurry',
  '본인 아님': 'not_self',
  '기타': 'other',
};

function photoRejectCode(reason) {
  return PHOTO_REASON_TO_CODE[reason] || 'other';
}

function PhotosPanel() {
  const state = useStore();
  const sessionId = state.activeSessionId;
  const apps = useMemo(() => state.applicants.filter(a => a.sessionId === sessionId), [state.applicants, sessionId]);

  const [statusF, setStatusF] = useState('pending'); // pending | approved | rejected | all
  const [q, setQ] = useState('');
  const [lpId, setLpId] = useState(null);            // 상세 심사 LP (applicants.js의 PhotoReviewLP 재사용)

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

  // 사진 심사 — applicants.js 와 동일하게 TopikBoApi.photo-review 호출
  const approve = (id) => {
    const a = state.applicants.find(x => x.id === id);
    if (!a || !a.apiId) return;
    return TopikBoApi.photoReview(a.apiId, { action: 'approve', rev: a.rev }).then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return; }
      return BoData.reload('apps').then(() => toastOk('사진이 승인되었습니다.', { title: '사진 심사', type: 'success' }));
    });
  };
  const reject = (id, reason) => {
    const a = state.applicants.find(x => x.id === id);
    if (!a || !a.apiId) return;
    if (!reason || !reason.trim()) { toastErr('반려 사유를 선택해주세요.'); return; }
    const code = photoRejectCode(reason);
    const note = code === 'other' ? reason.trim() : reason.trim();
    return TopikBoApi.photoReview(a.apiId, {
      action: 'reject',
      photo_reject_code: code,
      photo_reject_note: note,
      rev: a.rev,
    }).then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return; }
      return BoData.reload('apps').then(() => toastOk('사진이 반려되었습니다. 응시자에게 이메일이 발송됩니다.', { title: '사진 심사', type: 'success' }));
    });
  };

  const CHIPS = [
    { id: 'pending',  label: '미심사' },
    { id: 'approved', label: '승인' },
    { id: 'rejected', label: '반려' },
    { id: 'all',      label: '전체' },
  ];

  return h(Fragment, null,
    h('div', { className: 'panel-head' },
      h('div', null,
        h('h1', null, '사진 심사'),
        h('div', { className: 'sub' }, '증명사진을 카드 갤러리로 빠르게 검토합니다. 승인·반려는 서버 API로 처리되며 접수자 목록과 동일하게 반영됩니다.')
      ),
      h('div', { className: 'actions' },
        h('a', { className: 'btn btn-secondary', href: '#applicants' }, h(I.Users, { style: { width: 14, height: 14 } }), ' 접수자 목록')
      )
    ),

    h('div', { className: 'filterbar' },
      h('div', { className: 'chips' },
        CHIPS.map(c => h('button', { key: c.id, className: `chip ${statusF === c.id ? 'active' : ''}`, onClick: () => setStatusF(c.id) },
          c.label, h('span', { className: 'cnt' }, DataStore.fmtNum(counts[c.id] || 0))
        ))
      ),
      h('div', { className: 'controls' },
        h('input', { className: 'input search', type: 'text', placeholder: '한글·영문 성명/생년월일', value: q, onChange: e => setQ(e.target.value) })
      )
    ),

    h('div', { className: 'photo-gallery' },
      list.map(a => h(PhotoReviewCard, { key: a.id, a: a, reasons: PHOTO_PANEL_REASONS, onApprove: approve, onReject: reject, onOpen: () => setLpId(a.id) })),
      !list.length && h('div', { className: 'empty', style: { gridColumn: '1 / -1' } },
        h('div', { className: 'icon' }, h(I.Image)),
        h('div', { className: 'ttl' }, '표시할 사진이 없습니다'),
        h('div', { className: 'sub' }, '필터/검색 조건을 변경해 보세요.')
      )
    ),

    // 상세 심사 — applicants.js의 PhotoReviewLP 재사용
    lpId && h(PhotoReviewLP, { id: lpId, onClose: () => setLpId(null), onApprove: approve, onReject: reject }),

    h('style', null, `
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
      `)
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
  return h('div', { className: 'acard photo-rc' },
    h('div', { className: 'acard-body' },
      h('div', { className: 'pic' },
        h(PhotoLarge, { status: a.photoStatus, name: a.nameKo, seed: a.id })
      ),
      h('div', { className: 'nm' }, a.nameKo, ' ', h('small', null, a.nameEn)),
      h('dl', { className: 'kv2' },
        h('dt', null, '생년월일'), h('dd', null, h('code', { className: 'code-id' }, a.dob)),
        h('dt', null, '성별'), h('dd', null, a.sx === 1 ? '남(1)' : '여(2)'),
        h('dt', null, '국적'), h('dd', null, a.nation),
        h('dt', null, '급수'), h('dd', null, 'TOPIK ', a.level),
        h('dt', null, '심사'), h('dd', null, h(PhotoStatusPill, { status: a.photoStatus }))
      ),

      mode === 'reject'
        ? h('div', { className: 'rc-reject' },
            h(FormRow, { label: '반려 사유', required: true, hint: '사유는 응시자에게 안내됩니다(사진 재등록 요청).' },
              h('select', { className: 'select', value: reason, onChange: e => setReason(e.target.value) },
                reasons.map(r => h('option', { key: r }, r))
              )
            ),
            reason === '기타' && h(FormRow, { label: '상세 사유', required: true },
              h('input', { className: 'input', value: other, onChange: e => setOther(e.target.value), placeholder: '상세 사유 입력' })
            ),
            h('div', { className: 'rc-actions' },
              h('button', { className: 'btn btn-secondary', onClick: () => setMode(null) }, '뒤로'),
              h('button', { className: 'btn btn-danger', onClick: doReject }, '반려 처리')
            )
          )
        : h('div', { className: 'rc-actions' },
            h('button', { className: 'ibtn ghost', title: '상세 보기', onClick: onOpen }, h(I.Eye, { style: { width: 14, height: 14 } })),
            h('button', { className: 'btn btn-secondary', onClick: () => setMode('reject'), disabled: a.photoStatus === 'rejected' }, '반려'),
            h('button', { className: 'btn btn-primary', onClick: () => onApprove(a.id), disabled: a.photoStatus === 'approved' }, '승인')
          )
    )
  );
}

window.PhotosPanel = PhotosPanel;
