import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FO_BASE = 'http://localhost:8080';
const BO_LP_DIR = path.join(__dirname, 'bo-lp');
const ANNOTATIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'screen-annotations.json'), 'utf8'),
);

const MO_DEVICE = devices['iPhone 14 Pro Max'];
const PC_VIEWPORT = { width: 1440, height: 900 };

const FO_PAGES = [
  ['fo/common-layout', `${FO_BASE}/index.html`, 'pair'],
  ['fo/index', `${FO_BASE}/index.html`],
  ['fo/guide-overview', `${FO_BASE}/guide-overview.html`],
  ['fo/guide-intro', `${FO_BASE}/guide-intro.html`],
  ['fo/guide-questions', `${FO_BASE}/guide-questions.html`],
  ['fo/guide-evaluation', `${FO_BASE}/guide-evaluation.html`],
  ['fo/rules-notice', `${FO_BASE}/rules-notice.html`],
  ['fo/rules-answer', `${FO_BASE}/rules-answer.html`],
  ['fo/rules-fee', `${FO_BASE}/rules-fee.html`],
  ['fo/rules-id', `${FO_BASE}/rules-id.html`],
  ['fo/apply-howto', `${FO_BASE}/apply-howto.html`],
  ['fo/register', `${FO_BASE}/register.html`],
  ['fo/mypage', `${FO_BASE}/mypage.html`],
  ['fo/ticket', `${FO_BASE}/ticket.html`],
  ['fo/notice-list', `${FO_BASE}/notice.html`],
  ['fo/faq', `${FO_BASE}/faq.html`],
  ['fo/qna', `${FO_BASE}/qna.html`],
  ['fo/refund-correction', `${FO_BASE}/refund-correction.html`],
  ['fo/login', `${FO_BASE}/login.html`],
  ['fo/signup', `${FO_BASE}/signup.html`],
  ['fo/password-reset', `${FO_BASE}/password-reset.html`],
  ['fo/mypage-profile-basic', `${FO_BASE}/mypage-profile.html`],
  ['fo/mypage-profile-account', `${FO_BASE}/mypage-profile.html`],
  ['fo/terms', `${FO_BASE}/terms.html`],
  ['fo/privacy', `${FO_BASE}/privacy.html`],
  ['fo/marketing', `${FO_BASE}/marketing.html`],
  ['fo/404', `${FO_BASE}/404.html`],
];

const BO_LP_PAGES = Object.keys(ANNOTATIONS)
  .filter((k) => k.startsWith('bo/bo-lp-'))
  .map((key) => {
    const file = key.replace('bo/', '') + '.html';
    return [key, `file://${path.join(BO_LP_DIR, file)}`];
  });

async function checkMarkers(page, markers) {
  return page.evaluate((items) => {
    const results = [];
    for (const item of items) {
      const el = document.querySelector(item.selector);
      let ok = false;
      if (el) {
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        ok = rect.width > 0 && rect.height > 0
          && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      }
      results.push({ n: item.n, selector: item.selector, ok });
    }
    return results;
  }, markers);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pc = await browser.newContext({ viewport: PC_VIEWPORT });
  const mo = await browser.newContext({ ...MO_DEVICE });

  const issues = [];

  async function audit(key, url, mode = 'single', hooks = {}) {
    const entry = ANNOTATIONS[key];
    if (!entry) {
      issues.push({ key, problem: 'no annotations entry' });
      return;
    }

    if (mode === 'pair') {
      for (const device of ['pc', 'mo']) {
        const ctx = device === 'pc' ? pc : mo;
        const page = await ctx.newPage();
        try {
          await page.goto(url, { waitUntil: 'networkidle' });
          if (hooks.moBeforeShot && device === 'mo') await hooks.moBeforeShot(page);
          await page.waitForTimeout(400);
          const markers = entry[device] || [];
          const res = await checkMarkers(page, markers);
          for (const r of res) {
            if (!r.ok) issues.push({ key, device, ...r });
          }
        } finally {
          await page.close();
        }
      }
      return;
    }

    const page = await pc.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      if (hooks.beforeShot) await hooks.beforeShot(page);
      await page.waitForTimeout(400);
      const markers = entry.markers || entry.pc || [];
      const res = await checkMarkers(page, markers);
      for (const r of res) {
        if (!r.ok) issues.push({ key, device: 'pc', ...r });
      }
    } finally {
      await page.close();
    }
  }

  async function openFoDrawer(page) {
    const drawerBtn = page.locator('#btnDrawer');
    if (await drawerBtn.count()) {
      await drawerBtn.click();
      await page.waitForSelector('#drawer.open', { timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  for (const [key, url, mode] of FO_PAGES) {
    const hooks = key === 'fo/common-layout' ? { moBeforeShot: openFoDrawer } : {};
    await audit(key, url, mode, hooks);
  }

  for (const [key, url] of BO_LP_PAGES) {
    await audit(key, url);
  }

  await pc.close();
  await mo.close();
  await browser.close();

  if (!issues.length) {
    console.log('All marker selectors resolved.');
    return;
  }

  console.log(`Found ${issues.length} marker issues:\n`);
  const grouped = new Map();
  for (const i of issues) {
    const k = `${i.key}${i.device ? ` (${i.device})` : ''}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(i);
  }
  for (const [k, items] of grouped) {
    console.log(k);
    for (const i of items) {
      console.log(`  #${i.n} FAIL ${i.selector}${i.problem ? ` — ${i.problem}` : ''}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
