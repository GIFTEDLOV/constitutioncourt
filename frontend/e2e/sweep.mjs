/**
 * Visual overflow and console-error sweep.
 *
 * Two failure modes this catches, both invisible to unit tests:
 *
 *  - **Horizontal page scroll.** A 68-character URL or a long rule id can push
 *    the body wider than the viewport on a phone, which makes the page feel
 *    broken and hides content off-screen. Wide content must scroll inside its
 *    own container, never take the page with it.
 *  - **Console errors.** Anything the app logs that is not the deliberately
 *    blocked RPC.
 */

import { ROUTES, ORIGIN, collectConsole, newPage, unexpectedErrors, withBrowser } from './lib.mjs';

const VIEWPORTS = [
  { name: 'phone', width: 320, height: 720 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures += 1; console.error(`  FAIL  ${m}`); };

await withBrowser(async (browser) => {
  console.log('Overflow and console sweep');

  for (const vp of VIEWPORTS) {
    console.log(`\n  ${vp.name} ${vp.width}x${vp.height}`);
    for (const route of ROUTES) {
      const page = await newPage(browser, { viewport: { width: vp.width, height: vp.height } });
      const errors = collectConsole(page);
      try {
        await page.goto(`${ORIGIN}${route.path}`, { waitUntil: 'networkidle2' });

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          // Any element wider than the viewport that is not inside its own
          // scroll container is the actual culprit.
          culprits: [...document.querySelectorAll('*')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (r.width <= document.documentElement.clientWidth + 1) return false;
              let p = el.parentElement;
              while (p) {
                const style = getComputedStyle(p);
                if (style.overflowX === 'auto' || style.overflowX === 'scroll') return false;
                p = p.parentElement;
              }
              return true;
            })
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`),
        }));

        if (overflow.scrollWidth > overflow.clientWidth + 1) {
          fail(`${route.path} scrolls horizontally `
            + `(${overflow.scrollWidth}px content in ${overflow.clientWidth}px viewport)`
            + (overflow.culprits.length ? ` — ${overflow.culprits.join(', ')}` : ''));
        } else {
          ok(`${route.path} — no horizontal page scroll`);
        }

        const bad = unexpectedErrors(errors);
        if (bad.length > 0) fail(`${route.path} console: ${bad.join(' | ')}`);
      } finally {
        await page.close();
      }
    }
  }

  // Tap targets on the smallest viewport: an interactive control smaller than
  // ~44px is hard to hit accurately on a touch screen.
  console.log('\n  tap targets (phone 320px)');
  const page = await newPage(browser, { viewport: { width: 320, height: 720 } });
  await page.goto(`${ORIGIN}/create`, { waitUntil: 'networkidle2' });
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input, a.btn')]
    .map((el) => ({ tag: el.tagName.toLowerCase(), h: el.getBoundingClientRect().height,
      text: (el.textContent || '').trim().slice(0, 24) }))
    .filter((el) => el.h > 0 && el.h < 44));
  if (small.length === 0) ok('all interactive controls are at least 44px tall');
  else fail(`${small.length} control(s) under 44px: ${small.map((s) => `${s.tag} "${s.text}"`).join(', ')}`);
  await page.close();
});

console.log(failures === 0 ? '\nSweep passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
