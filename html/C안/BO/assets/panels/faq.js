/* ============================================================
   panels/faq.js — FAQ 관리 (vanilla port of faq.jsx)
   ============================================================ */

const FAQ_CATS = ['계정','접수','시험','결과','기타'];

function FaqPanelInner() {
  const state = useStore();
  const [catF, setCatF] = useState('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);

  const filtered = useMemo(() => {
    let r = state.faqs.slice();
    if (catF !== 'all') r = r.filter(f => f.cat === catF);
    if (q) r = r.filter(f => (f.question || '').toLowerCase().includes(q.toLowerCase()));
    return r.sort((a,b) => a.cat.localeCompare(b.cat) || a.order - b.order);
  }, [state.faqs, catF, q]);

  const save = (data) => {
    const payload = {
      category: BoData.FAQ_L2C[data.cat] || 'other',
      sort_order: parseInt(data.order, 10) || 0,
      question_ko: (data.question || '').trim(),
      answer_ko: (data.answer || '').trim(),
      question_my: data.questionMy || null,
      question_en: data.questionEn || null,
      answer_my: data.answerMy || null,
      answer_en: data.answerEn || null,
    };
    const run = data.apiId
      ? TopikBoApi.updateFaq(data.apiId, payload)
      : TopikBoApi.createFaq(Object.assign({ is_active: true }, payload));
    return run.then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return; }
      return BoData.reload('faq').then(() => {
        toastOk(data.apiId ? 'FAQ가 수정되었습니다.' : 'FAQ가 등록되었습니다.');
        setEdit(null);
      });
    });
  };

  const remove = () => {
    const f = state.faqs.find(x => x.id === delId);
    if (!f) return;
    TopikBoApi.deleteFaq(f.apiId).then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return; }
      BoData.reload('faq').then(() => { setDelId(null); toastOk('FAQ가 삭제되었습니다.'); });
    });
  };

  const reorder = (f, dir) => {
    if (!f || !f.apiId) return;
    const same = state.faqs.filter(x => x.cat === f.cat).sort((a, b) => a.order - b.order);
    const idx = same.findIndex(x => x.id === f.id);
    const swapIdx = dir < 0 ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= same.length) return;
    const a = same[idx];
    const b = same[swapIdx];
    TopikBoApi.reorderFaq([
      { id: a.apiId, sort_order: b.order },
      { id: b.apiId, sort_order: a.order },
    ]).then(res => {
      if (!res.ok) { toastErr(TopikBoApi.parseError(res)); return; }
      BoData.reload('faq').then(() => toastOk('노출 순서가 변경되었습니다.'));
    });
  };

  return h(Fragment, null,
    h('div', { className: 'panel-head' },
      h('div', null,
        h('h1', null, 'FAQ 관리'),
        h('div', { className: 'sub' }, '자주 묻는 질문을 카테고리별로 관리합니다. FO FAQ와 직접 연동됩니다.')
      ),
      h('div', { className: 'actions' },
        h('button', { className: 'btn btn-primary', onClick: () => setEdit({ new: true }) }, h(I.Plus, { style: { width: 14, height: 14 } }), ' FAQ 등록')
      )
    ),

    h('div', { className: 'filterbar' },
      h('div', { className: 'chips' },
        h('button', { className: `chip ${catF === 'all' ? 'active' : ''}`, onClick: () => setCatF('all') }, '전체', h('span', { className: 'cnt' }, state.faqs.length)),
        FAQ_CATS.map(c => (
          h('button', { key: c, className: `chip ${catF === c ? 'active' : ''}`, onClick: () => setCatF(c) }, c, h('span', { className: 'cnt' }, state.faqs.filter(f => f.cat === c).length))
        ))
      ),
      h('div', { className: 'controls' },
        h('input', { className: 'input search', placeholder: '질문 검색', value: q, onChange: e => setQ(e.target.value) })
      )
    ),

    h('div', { className: 'dg-wrap' },
      h('div', { className: 'dg-scroll' },
        h('table', { className: 'dg' },
          h('thead', null, h('tr', null,
            h('th', { className: 'num' }, '번호'), h('th', null, '분류'), h('th', null, '질문'), h('th', { className: 'num' }, '노출 순서'), h('th', null, '등록일'), h('th', null, '관리')
          )),
          h('tbody', null,
            filtered.map(f => (
              h('tr', { key: f.id },
                h('td', { className: 'num' }, f.no),
                h('td', null, h('span', { className: 'pill', style: { background: 'var(--bg-3)' } }, f.cat)),
                h('td', null, h('b', null, f.question)),
                h('td', { className: 'num' }, f.order),
                h('td', { className: 'code muted' }, f.updatedAt || '—'),
                h('td', null,
                  h('div', { className: 'row-actions' },
                    h('button', { className: 'ibtn', title: '위로', onClick: () => reorder(f, -1) }, '▲'),
                    h('button', { className: 'ibtn', title: '아래로', onClick: () => reorder(f, 1) }, '▼'),
                    h('button', { className: 'ibtn', onClick: () => setEdit({ id: f.id }) }, h(I.Edit, { style: { width: 12, height: 12 } })),
                    h('button', { className: 'ibtn danger', onClick: () => setDelId(f.id) }, h(I.Trash, { style: { width: 12, height: 12 } }))
                  )
                )
              )
            ))
          )
        )
      )
    ),

    edit && h(FaqEditLP, { edit: edit, onClose: () => setEdit(null), onSave: save }),
    delId && h(Modal, {
      open: true, onClose: () => setDelId(null), title: 'FAQ 삭제', danger: true,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: () => setDelId(null) }, '취소'),
        h('button', { className: 'btn btn-danger', onClick: remove }, '삭제')
      )
    },
      h('div', null, 'FAQ를 삭제하시겠습니까?')
    )
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
  return h(LP, {
    open: true, title: f0 ? `FAQ 수정` : 'FAQ 등록', onClose: onClose,
    footer: h(Fragment, null,
      h('button', { className: 'btn btn-secondary', onClick: onClose }, '취소'),
      h('button', { className: 'btn btn-primary', disabled: !valid, onClick: () => onSave(f) }, f0 ? '저장' : '등록')
    )
  },
    h(FieldSet, { legend: '기본', cols: 2 },
      h(FormRow, { label: '분류', required: true },
        h('select', { className: 'select', value: f.cat, onChange: e => set('cat', e.target.value) },
          FAQ_CATS.map(c => h('option', { key: c }, c))
        )
      ),
      h(FormRow, { label: '노출 순서', hint: '작을수록 상단' },
        h('input', { type: 'number', className: 'input', value: f.order, min: 1, onChange: e => set('order', parseInt(e.target.value || '1')) })
      )
    ),
    h(FieldSet, { legend: '내용 (KO 필수 · MY/EN 선택)', cols: 1 },
      h(FormRow, { label: '언어 선택' },
        h('div', { className: 'seg' },
          ['KO','MY','EN'].map(l => (
            h('button', { key: l, type: 'button', className: lang === l ? 'active' : '', onClick: () => setLang(l) },
              l, l === 'KO' ? ' · 필수' : ''
            )
          ))
        )
      ),
      h(FormRow, { label: `질문 (${lang})`, required: lang === 'KO' },
        h('input', { className: 'input', value: f[qKey] || '', onChange: e => set(qKey, e.target.value), maxLength: 120 })
      ),
      h(FormRow, { label: `답변 (${lang})`, required: lang === 'KO' },
        h('textarea', { className: 'textarea', rows: '6', value: f[aKey] || '', onChange: e => set(aKey, e.target.value), maxLength: 3000 })
      )
    )
  );
}

function FaqPanel() {
  return h(ResourceGate, { loader: () => BoData.loadFaq(), deps: [], inner: FaqPanelInner });
}

window.FaqPanel = FaqPanel;
