/**
 * 이메일 발송 시뮬레이션 — localStorage 아웃박스 + 처리 이력 연동
 */
(function (g) {
  'use strict';

  var OUTBOX_KEY = 'topik_mm_mail_outbox_v1';
  var MAX_ITEMS = 200;

  function readOutbox() {
    try {
      var list = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeOutbox(list) {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
    } catch (e) {}
  }

  function uid() {
    return 'mail_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * @param {Object} opts - { to, subject, body, template, meta, from }
   * @returns {Object} sent item
   */
  function send(opts) {
    opts = opts || {};
    var item = {
      id: uid(),
      to: opts.to || '',
      from: opts.from || 'topik.myanmar@mofa.go.kr',
      subject: opts.subject || '(제목 없음)',
      body: opts.body || '',
      template: opts.template || 'generic',
      meta: opts.meta || {},
      status: 'sent',
      sentAt: new Date().toISOString()
    };
    var list = readOutbox();
    list.unshift(item);
    writeOutbox(list);
    if (typeof opts.onSent === 'function') opts.onSent(item);
    if (g.TOPIKBoCore && typeof g.TOPIKBoCore.notifyMailSent === 'function') {
      g.TOPIKBoCore.notifyMailSent(item);
    }
    return item;
  }

  function getOutbox(limit) {
    var list = readOutbox();
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  }

  function clearOutbox() {
    writeOutbox([]);
  }

  function countUnread() {
    return readOutbox().filter(function (m) { return m.status === 'sent'; }).length;
  }

  /** 마케팅 수신 동의자 일괄 발송 (0527) */
  function sendBulk(recipients, opts) {
    opts = opts || {};
    var sent = [];
    (recipients || []).forEach(function (r) {
      sent.push(send({
        to: r.email || r,
        subject: opts.subject,
        body: opts.body,
        template: opts.template || 'marketing',
        meta: { name: r.name, noticeId: opts.noticeId }
      }));
    });
    return sent;
  }

  g.TOPIKMail = {
    send: send,
    sendBulk: sendBulk,
    getOutbox: getOutbox,
    clearOutbox: clearOutbox,
    count: countUnread
  };
})(typeof window !== 'undefined' ? window : this);
