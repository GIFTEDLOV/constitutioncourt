/**
 * Browser smoke test against the production build.
 *
 * Every locked route must load, render its heading, and expose the positioning
 * language — with no wallet and with the chain unreachable. Reading has to work
 * for someone who installed nothing.
 */

import { ROUTES, ORIGIN, collectConsole, newPage, unexpectedErrors, withBrowser } from './lib.mjs';

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures += 1; console.error(`  FAIL  ${m}`); };

await withBrowser(async (browser) => {
  console.log('Browser smoke test (production build, no wallet, chain unreachable)');

  for (const route of ROUTES) {
    const page = await newPage(browser);
    const errors = collectConsole(page);
    try {
      const res = await page.goto(`${ORIGIN}${route.path}`, { waitUntil: 'networkidle2' });
      if (!res || res.status() >= 400) {
        fail(`${route.path} returned HTTP ${res?.status()}`);
        continue;
      }

      const h1 = await page.$eval('h1', (el) => el.textContent?.trim() ?? '').catch(() => '');
      if (!h1) fail(`${route.path} rendered no <h1>`);
      else ok(`${route.path} — "${h1}"`);

      const h1Count = await page.$$eval('h1', (els) => els.length);
      if (h1Count !== 1) fail(`${route.path} has ${h1Count} <h1> elements, expected exactly 1`);

      const bad = unexpectedErrors(errors);
      if (bad.length > 0) fail(`${route.path} console errors: ${bad.join(' | ')}`);
    } finally {
      await page.close();
    }
  }

  // --- positioning language must survive the build ------------------------
  const page = await newPage(browser);
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2' });
  const body = await page.$eval('body', (el) => el.innerText);

  const required = [
    ['CERTIFIED disclaimer', /does not mean the proposal is legal, safe, wise or automatically authorised/i],
    ['not a legal court', /not a legal court/i],
    ['not a treasury executor', /not a treasury executor/i],
    ['not a voting platform', /not a voting platform/i],
    ['not escrow', /not (an )?escrow/i],
    ['not a chatbot', /not a chatbot|generic AI chatbot/i],
    ['native appeal', /native (transaction )?appeal/i],
    ['holds no funds', /holds no funds|holds no balance/i],
  ];
  for (const [label, re] of required) {
    if (re.test(body)) ok(`landing page states: ${label}`);
    else fail(`landing page is missing: ${label}`);
  }

  // --- reading works with no wallet ---------------------------------------
  if (/reading works without one|without a wallet/i.test(body)) {
    ok('landing page states that reading needs no wallet');
  } else {
    fail('landing page does not mention wallet-free reading');
  }
  await page.close();

  // --- the lifecycle makes the optional path obvious -----------------------
  const help = await newPage(browser);
  await help.goto(`${ORIGIN}/help`, { waitUntil: 'networkidle2' });
  const helpText = await help.$eval('body', (el) => el.innerText);
  if (/response is optional/i.test(helpText)) ok('/help states the response is optional');
  else fail('/help does not state that the response is optional');
  if (/cannot prevent or delay adjudication/i.test(helpText)) {
    ok('/help states the respondent cannot block adjudication');
  } else {
    fail('/help does not state that the respondent cannot block adjudication');
  }
  await help.close();

  // --- the wizard gates on validation -------------------------------------
  const create = await newPage(browser);
  await create.goto(`${ORIGIN}/create`, { waitUntil: 'networkidle2' });
  const disabled = await create.$eval(
    'button.btn-primary',
    (el) => el.disabled,
  ).catch(() => null);
  if (disabled === true) ok('/create blocks Continue until step 1 is valid');
  else fail('/create allows Continue with an empty form');
  await create.close();

  // --- keyboard navigation reaches the nav --------------------------------
  const kb = await newPage(browser);
  await kb.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2' });
  await kb.keyboard.press('Tab');
  const firstFocus = await kb.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  if (/skip to main content/i.test(firstFocus)) ok('first Tab reaches the skip link');
  else fail(`first Tab focused "${firstFocus}", expected the skip link`);

  const reachable = await kb.evaluate(() => {
    const nodes = document.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    return nodes.length;
  });
  if (reachable > 5) ok(`${reachable} focusable elements on the landing page`);
  else fail(`only ${reachable} focusable elements — keyboard users cannot navigate`);
  await kb.close();
});

console.log(failures === 0 ? '\nSmoke test passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
