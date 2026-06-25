/* ============================================================
   TOPIK Myanmar — Email renderer
   Builds table-based, inline-CSS email HTML from theme + template.
   render(themeId, tpl, {sample}) -> full HTML document string.
   ============================================================ */
(function () {
  const { THEMES, FOOTER, SAMPLE, FONT, TEMPLATE_BY_KEY } = window.TOPIK;

  /** Resolve preview key + locale into renderable template (gap templates use i18n). */
  function resolveTemplate(tplOrKey, locale) {
    const raw =
      typeof tplOrKey === "string"
        ? TEMPLATE_BY_KEY[tplOrKey] || tplOrKey
        : tplOrKey;
    if (!raw) return tplOrKey;
    const loc = locale && raw.i18n && raw.i18n[locale] ? locale : "ko";
    if (!raw.i18n || !raw.i18n[loc]) return raw;
    const locTpl = raw.i18n[loc];
    return {
      ...raw,
      subject: locTpl.subject,
      preheader: locTpl.preheader,
      eyebrowKo: locTpl.eyebrowKo,
      eyebrowEn: locTpl.eyebrowEn,
      indexNo: locTpl.indexNo,
      h1: locTpl.h1,
      intro: locTpl.intro,
      blocks: locTpl.blocks,
      ctas: locTpl.ctas,
    };
  }

  function blockVisible(b, sample) {
    if (!b.showWhen) return true;
    if (!sample) return true;
    return Object.keys(b.showWhen).every(
      (k) => SAMPLE[k] != null && String(SAMPLE[k]) === String(b.showWhen[k])
    );
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // substitute {var} -> sample value (or keep braces in source mode)
  function sub(str, sample) {
    if (str == null) return "";
    return String(str).replace(/\{(\w+)\}/g, (m, k) => {
      if (sample) return SAMPLE[k] != null ? SAMPLE[k] : m;
      return m;
    });
  }
  // a value used inside href: in sample mode use sample, else keep {var}
  function hrefVal(str, sample) {
    return sub(str, sample);
  }

  // ---- Mobile CSS (real clients + preview .ed-mobile) --------
  function buildMobileCss(t, scope) {
    const p = scope ? scope + " " : "";
    const borderFix = t.id !== "C" ? "border-left:0 !important;border-right:0 !important;" : "";
    return [
      `${p}.ed-outer{padding:0 !important;}`,
      `${p}.ed-card,${p}.ed-card-table{width:100% !important;max-width:100% !important;min-width:0 !important;}`,
      `${p}.ed-card-table{border-radius:0 !important;${borderFix}}`,
      `${p}.ed-pad{padding-left:22px !important;padding-right:22px !important;}`,
      `${p}.ed-body{padding-top:28px !important;padding-bottom:28px !important;}`,
      `${p}.ed-header-band{padding-top:20px !important;padding-bottom:20px !important;}`,
      `${p}.ed-header-white{padding-top:20px !important;padding-bottom:20px !important;}`,
      `${p}.ed-header-minimal{padding-top:24px !important;}`,
      `${p}.ed-header-stack tr,${p}.ed-header-stack tbody{display:block !important;width:100% !important;}`,
      `${p}.ed-header-stack td{display:block !important;width:100% !important;text-align:left !important;}`,
      `${p}.ed-header-stack .ed-header-meta{padding-top:10px !important;}`,
      `${p}.ed-h1{font-size:${t.id === "C" ? 24 : 22}px !important;line-height:1.35 !important;}`,
      `${p}.ed-intro,${p}.ed-paragraph{font-size:14px !important;line-height:1.65 !important;}`,
      `${p}.ed-code-box{padding:22px 16px !important;}`,
      `${p}.ed-code-value{font-size:26px !important;letter-spacing:.08em !important;}`,
      `${p}.ed-code-mono{font-size:22px !important;}`,
      `${p}.ed-info-wrap{padding-left:16px !important;padding-right:16px !important;}`,
      `${p}.ed-info-row td{display:block !important;width:100% !important;box-sizing:border-box !important;}`,
      `${p}.ed-info-label{padding:14px 0 4px !important;white-space:normal !important;border-top:1px solid ${t.line} !important;font-size:13px !important;}`,
      `${p}.ed-info-row:first-child .ed-info-label{border-top:0 !important;padding-top:0 !important;}`,
      `${p}.ed-info-value{padding:0 0 14px !important;font-size:14px !important;}`,
      `${p}.ed-notice-cell,${p}.ed-reason-cell{padding:14px 16px !important;}`,
      `${p}.ed-notice-text,${p}.ed-reason-text{font-size:14px !important;}`,
      `${p}.ed-step-text{font-size:14px !important;}`,
      `${p}.ed-btn-link{padding:14px 20px !important;font-size:14px !important;}`,
      `${p}.ed-footer{padding-top:22px !important;padding-bottom:24px !important;}`,
      `${p}.ed-footer-text{font-size:12px !important;}`,
    ].join("");
  }

  // ---- EYEBROW ---------------------------------------------
  function eyebrow(t, tpl) {
    const txt = t.useEnEyebrow ? tpl.eyebrowEn : tpl.eyebrowKo;
    if (t.eyebrowStyle === "pill") {
      return `<tr><td style="padding:0 0 14px;">
        <span style="display:inline-block;background:${t.accentTint};color:${t.primary};font:600 12px/1 ${t.font};letter-spacing:.02em;padding:7px 12px;border-radius:999px;">${esc(txt)}</span>
      </td></tr>`;
    }
    if (t.eyebrowStyle === "caps") {
      return `<tr><td style="padding:0 0 18px;">
        <span style="font:700 12px/1 ${t.font};letter-spacing:.22em;color:${t.primary};text-transform:uppercase;">${esc(tpl.indexNo)} &nbsp;/&nbsp; ${esc(txt)}</span>
        <div style="height:1px;background:${t.line};margin-top:14px;"></div>
      </td></tr>`;
    }
    // rule (default A)
    return `<tr><td style="padding:0 0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:22px;height:2px;background:${t.primary};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding-left:10px;font:700 12px/1 ${t.font};letter-spacing:.14em;color:${t.primary};text-transform:uppercase;">${esc(txt)}</td>
      </tr></table>
    </td></tr>`;
  }

  // ---- HEADER ----------------------------------------------
  function header(t, tpl) {
    const badge = tpl.badge
      ? `<span style="display:inline-block;margin-left:10px;vertical-align:middle;background:${t.headerStyle==="band"?"rgba(255,255,255,.18)":t.accentTint};color:${t.headerStyle==="band"?"#fff":t.primary};font:600 11px/1 ${t.font};letter-spacing:.02em;padding:5px 9px;border-radius:6px;">${esc(tpl.badge)}</span>`
      : "";

    if (t.headerStyle === "band") {
      return `<tr><td class="ed-header ed-header-band ed-pad" style="background:${t.headerBg};padding:26px ${t.cardPad}px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ed-header-stack ed-header-inner"><tr>
          <td class="ed-header-logo" style="font:800 19px/1.1 ${t.font};letter-spacing:.04em;color:#fff;">TOPIK<span style="font-weight:500;opacity:.85;"> MYANMAR</span></td>
          <td class="ed-header-meta" align="right" style="font:600 12px/1.3 ${t.font};color:rgba(255,255,255,.82);">한국어능력시험${badge}</td>
        </tr></table>
      </td></tr>`;
    }
    if (t.headerStyle === "white") {
      return `<tr><td class="ed-header ed-header-white ed-pad" style="background:${t.headerBg};padding:24px ${t.cardPad}px;border-bottom:1px solid ${t.line};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:40px;height:40px;background:${t.primary};border-radius:11px;text-align:center;vertical-align:middle;font:800 15px/40px ${t.font};color:#fff;letter-spacing:.02em;">TK</td>
          <td style="padding-left:12px;">
            <div style="font:800 16px/1.1 ${t.font};color:${t.ink};">TOPIK Myanmar</div>
            <div style="font:500 12px/1.3 ${t.font};color:${t.sub};margin-top:3px;">한국어능력시험${badge}</div>
          </td>
        </tr></table>
      </td></tr>`;
    }
    // minimal (C)
    return `<tr><td class="ed-header ed-header-minimal ed-pad" style="background:${t.headerBg};padding:30px ${t.cardPad}px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ed-header-stack ed-header-inner"><tr>
        <td class="ed-header-logo" style="font:800 15px/1.1 ${t.font};letter-spacing:.18em;color:${t.ink};text-transform:uppercase;">TOPIK MYANMAR</td>
        <td class="ed-header-meta" align="right" style="font:600 11px/1.3 ${t.font};letter-spacing:.14em;color:${t.sub};text-transform:uppercase;">한국어능력시험${tpl.badge?` · ${esc(tpl.badge)}`:""}</td>
      </tr></table>
      <div style="height:2px;background:${t.ink};margin-top:18px;"></div>
    </td></tr>`;
  }

  // ---- BUTTON ----------------------------------------------
  function button(t, cta, sample) {
    const primary = cta.kind === "primary";
    const bg = primary ? t.primary : t.cardBg;
    const fg = primary ? t.onPrimary : t.primary;
    const border = primary ? t.primary : t.line;
    const arrow = t.btnStyle === "arrow" ? `<span style="padding-left:10px;font-weight:400;">→</span>` : "";
    const ls = t.btnStyle === "arrow" ? "letter-spacing:.06em;" : "";
    const wide = t.btnStyle === "arrow";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ed-btn" style="${wide?"width:100%;":""}">
      <tr><td align="center" style="background:${bg};border:1px solid ${border};border-radius:${t.btnRadius}px;">
        <a class="ed-btn-link" href="${esc(hrefVal(cta.href, sample))}" style="display:block;padding:15px 30px;font:700 15px/1.2 ${t.font};color:${fg};text-decoration:none;${ls}">${esc(cta.label)}${arrow}</a>
      </td></tr>
    </table>`;
  }

  function ctaBlock(t, tpl, sample) {
    if (!tpl.ctas || !tpl.ctas.length) return "";
    const rows = tpl.ctas.map((c, i) =>
      `<tr><td style="padding-top:${i === 0 ? 0 : 10}px;">${button(t, c, sample)}</td></tr>`
    ).join("");
    return `<tr><td style="padding:30px 0 4px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" ${t.btnStyle==="arrow"?'width="100%"':""}>${rows}</table></td></tr>`;
  }

  // ---- CONTENT BLOCKS --------------------------------------
  function codeBlock(t, b, sample) {
    const mono = b.mono ? t.mono : `${t.font}`;
    const fs = b.mono ? 30 : 40;
    const codeClass = b.mono ? "ed-code-value ed-code-mono" : "ed-code-value";
    return `<tr><td style="padding:8px 0 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td class="ed-code-box" align="center" style="background:${t.accentTint};border:1px solid ${t.line};border-radius:${t.codeRadius}px;padding:26px 20px;">
          <div style="font:600 12px/1 ${t.font};letter-spacing:.1em;color:${t.sub};text-transform:uppercase;margin-bottom:12px;">${esc(b.label)}</div>
          <div class="${codeClass}" style="font:800 ${fs}px/1.1 ${mono};letter-spacing:${b.mono?".06em":".12em"};color:${t.primary};">${esc(sub(b.value, sample))}</div>
          ${b.sub ? `<div style="font:500 13px/1.4 ${t.font};color:${t.sub};margin-top:12px;">${esc(sub(b.sub, sample))}</div>` : ""}
        </td>
      </tr></table>
    </td></tr>`;
  }

  function infoTable(t, b, sample) {
    const rows = b.rows.map((r, i) =>
      `<tr class="ed-info-row">
        <td class="ed-info-label" style="padding:13px 0;border-top:${i===0?"0":"1px solid "+t.line};font:500 14px/1.5 ${t.font};color:${t.sub};white-space:nowrap;width:96px;vertical-align:top;">${esc(r[0])}</td>
        <td class="ed-info-value" style="padding:13px 0 13px 16px;border-top:${i===0?"0":"1px solid "+t.line};font:600 14px/1.5 ${t.font};color:${t.ink};">${esc(sub(r[1], sample))}</td>
      </tr>`
    ).join("");
    return `<tr><td style="padding:6px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ed-info-wrap" style="background:${t.id==="C"?t.accentTint:"transparent"};border:1px solid ${t.line};border-radius:${t.noticeRadius}px;padding:4px 18px;">
        ${rows}
      </table>
    </td></tr>`;
  }

  function noticeBlock(t, b, sample) {
    const tone = b.tone || "info";
    const color = tone === "info" ? t.primary : t.status[tone];
    const tint = tone === "info" ? t.accentTint : t.statusTint[tone];
    return `<tr><td style="padding:8px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td class="ed-notice-cell" style="background:${tint};border-radius:${t.noticeRadius}px;padding:15px 18px;border-left:3px solid ${color};">
          <span class="ed-notice-text" style="font:500 14px/1.6 ${t.font};color:${t.body};">${esc(sub(b.text, sample))}</span>
        </td>
      </tr></table>
    </td></tr>`;
  }

  function reasonBox(t, b, sample) {
    const color = t.status[b.tone] || t.primary;
    const tint = t.statusTint[b.tone] || t.accentTint;
    return `<tr><td style="padding:8px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td class="ed-reason-cell" style="background:${tint};border:1px solid ${color}33;border-radius:${t.noticeRadius}px;padding:18px 20px;">
          <div style="font:700 13px/1.3 ${t.font};color:${color};margin-bottom:8px;">${esc(sub(b.title, sample))}</div>
          <div class="ed-reason-text" style="font:500 15px/1.6 ${t.font};color:${t.ink};">${esc(sub(b.reason, sample))}</div>
        </td>
      </tr></table>
    </td></tr>`;
  }

  function steps(t, b) {
    const items = b.items.map((it, i) =>
      `<tr>
        <td style="vertical-align:top;width:26px;padding:0 0 ${i===b.items.length-1?0:12}px;">
          <div style="width:22px;height:22px;border-radius:${t.id==="C"?"0":"999px"};background:${t.primary};color:#fff;text-align:center;font:700 12px/22px ${t.font};">${i+1}</div>
        </td>
        <td class="ed-step-text" style="padding:0 0 ${i===b.items.length-1?0:12}px 12px;font:500 14px/1.5 ${t.font};color:${t.body};vertical-align:top;">${esc(it)}</td>
      </tr>`
    ).join("");
    return `<tr><td style="padding:10px 0 6px;">
      <div style="font:700 13px/1 ${t.font};letter-spacing:.04em;color:${t.ink};margin-bottom:14px;">${esc(b.title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${items}</table>
    </td></tr>`;
  }

  function paragraph(t, b, sample) {
    return `<tr><td class="ed-paragraph" style="padding:10px 0;font:500 15px/1.7 ${t.font};color:${t.body};">${esc(sub(b.text, sample))}</td></tr>`;
  }

  function renderBlock(t, b, sample) {
    switch (b.type) {
      case "code": return codeBlock(t, b, sample);
      case "infoTable": return infoTable(t, b, sample);
      case "notice": return noticeBlock(t, b, sample);
      case "reasonBox": return reasonBox(t, b, sample);
      case "steps": return steps(t, b);
      default: return paragraph(t, b, sample);
    }
  }

  // ---- FOOTER ----------------------------------------------
  function footer(t, tpl, sample) {
    const dark = t.footerStyle === "dark";
    const bg = dark ? t.primaryDark : t.accentTint;
    const ink = dark ? "rgba(255,255,255,.92)" : t.body;
    const mut = dark ? "rgba(255,255,255,.55)" : t.sub;
    const linkc = dark ? "#fff" : t.primary;
    const line = dark ? "rgba(255,255,255,.16)" : t.line;
    const year = sample ? SAMPLE.year : "{year}";
    const siteUrl = sample ? SAMPLE.siteUrl : "{siteUrl}";
    const supportEmail = sample ? SAMPLE.supportEmail : "{supportEmail}";

    const marketing = tpl.marketing
      ? `<tr><td style="padding:14px 0 0;">
          <div style="font:500 12px/1.6 ${t.font};color:${mut};">${esc(FOOTER.marketingNote)}</div>
          <div style="margin-top:8px;"><a href="${esc(sample?SAMPLE.unsubscribeUrl:"{unsubscribeUrl}")}" style="font:600 12px/1 ${t.font};color:${linkc};text-decoration:underline;">${esc(FOOTER.unsubscribeLabel)}</a></div>
        </td></tr>`
      : "";

    return `<tr><td class="ed-footer ed-pad" style="background:${bg};padding:26px ${t.cardPad}px;border-top:1px solid ${line};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td class="ed-footer-text" style="font:600 13px/1.5 ${t.font};color:${ink};">${esc(FOOTER.sendingNote)}</td></tr>
        <tr><td class="ed-footer-text" style="padding-top:12px;font:500 12px/1.7 ${t.font};color:${mut};">
          ${esc(FOOTER.supportLabel)} &nbsp;
          <a href="${esc(sample?SAMPLE.siteUrlFull:"{siteUrl}")}" style="color:${linkc};text-decoration:none;">${esc(siteUrl)}</a> &nbsp;·&nbsp;
          <a href="mailto:${esc(supportEmail)}" style="color:${linkc};text-decoration:none;">${esc(supportEmail)}</a>
        </td></tr>
        ${marketing}
        <tr><td style="padding-top:16px;border-top:1px solid ${line};margin-top:8px;"></td></tr>
        <tr><td class="ed-footer-text" style="padding-top:14px;font:500 12px/1.7 ${t.font};color:${mut};">${esc(FOOTER.operator)}</td></tr>
        <tr><td class="ed-footer-text" style="padding-top:4px;font:500 12px/1.7 ${t.font};color:${mut};">${esc(sub(FOOTER.copyright, sample)).replace("{year}", esc(year))}</td></tr>
      </table>
    </td></tr>`;
  }

  // ---- ASSEMBLE --------------------------------------------
  function render(themeId, tpl, opts) {
    const t = THEMES[themeId];
    const sample = !opts || opts.sample !== false;
    const forceMobile = opts && opts.vp === "mobile";
    const locale = (opts && opts.locale) || "ko";
    const active = resolveTemplate(tpl, locale);
    const pre = sub(active.preheader, sample);
    const mobileCss = buildMobileCss(t);
    const previewMobileCss = forceMobile ? buildMobileCss(t, ".ed-mobile") : "";

    const blocks = (active.blocks || [])
      .filter((b) => blockVisible(b, sample))
      .map((b) => renderBlock(t, b, sample))
      .join("");

    const body = `<tr><td class="ed-body ed-pad" style="padding:${t.headerStyle==="minimal"?34:t.cardPad}px ${t.cardPad}px ${t.cardPad}px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${eyebrow(t, active)}
        <tr><td class="ed-h1" style="padding:0 0 16px;font:800 ${t.id==="C"?28:24}px/1.3 ${t.font};letter-spacing:-.01em;color:${t.ink};">${esc(sub(active.h1, sample))}</td></tr>
        <tr><td class="ed-intro" style="padding:0 0 6px;font:500 15px/1.7 ${t.font};color:${t.body};">${esc(sub(active.intro, sample))}</td></tr>
        ${blocks}
        ${ctaBlock(t, active, sample)}
      </table>
    </td></tr>`;

    const card = `<table role="presentation" class="ed-card-table" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:${t.cardBg};border-radius:${t.cardRadius}px;overflow:hidden;${t.id!=="C"?`border:1px solid ${t.line};`:""}">
      ${t.topStripe ? `<tr><td style="height:4px;background:${t.topStripe};font-size:0;line-height:0;">&nbsp;</td></tr>` : ""}
      ${header(t, active)}
      ${body}
      ${footer(t, active, sample)}
    </table>`;

    const htmlLang = locale === "my" ? "my" : locale === "en" ? "en" : "ko";
    return `<!DOCTYPE html>
<html lang="${htmlLang}"${forceMobile ? ' class="ed-mobile"' : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(sub(active.subject, sample))}</title>
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');
body{margin:0;padding:0;background:${t.pageBg};-webkit-text-size-adjust:100%;}
a{color:inherit;}
@media (max-width:620px){${mobileCss}}
${previewMobileCss}
</style></head>
<body style="margin:0;padding:0;background:${t.pageBg};font-family:${t.font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(pre)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.pageBg};">
  <tr><td class="ed-outer" align="center" style="padding:${t.outerPad+12}px ${t.outerPad}px;">
    <div class="ed-card" style="width:600px;max-width:600px;">${card}</div>
  </td></tr>
</table>
</body></html>`;
  }

  window.TOPIK.render = render;
  window.TOPIK.resolveTemplate = resolveTemplate;
})();
