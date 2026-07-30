/**
 * Accessibility audit with axe-core.
 *
 * The bar is **zero serious or critical violations** on every route, at desktop
 * and mobile widths. Moderate and minor findings are reported but do not fail
 * the run — they are listed so nothing is silently accepted.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ROUTES, ORIGIN, newPage, withBrowser } from './lib.mjs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

let serious = 0;
let other = 0;

await withBrowser(async (browser) => {
  console.log('Accessibility audit (axe-core) — zero serious/critical required');

  for (const viewport of VIEWPORTS) {
    console.log(`\n  ${viewport.name} ${viewport.width}x${viewport.height}`);
    for (const route of ROUTES) {
      const page = await newPage(browser, {
        viewport: { width: viewport.width, height: viewport.height },
      });
      try {
        await page.goto(`${ORIGIN}${route.path}`, { waitUntil: 'networkidle2' });
        await page.evaluate(axeSource);
        const results = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          const r = await axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          });
          return r.violations.map((v) => ({
            id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
          }));
        });

        const bad = results.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const mild = results.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
        serious += bad.length;
        other += mild.length;

        if (bad.length === 0) {
          console.log(`    ok    ${route.path}${mild.length ? ` (${mild.length} minor)` : ''}`);
        } else {
          console.error(`    FAIL  ${route.path}`);
          for (const v of bad) {
            console.error(`          [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node(s))`);
          }
        }
        for (const v of mild) {
          console.log(`          note [${v.impact}] ${v.id}: ${v.help}`);
        }
      } finally {
        await page.close();
      }
    }
  }
});

console.log(
  serious === 0
    ? `\nAccessibility passed: 0 serious/critical, ${other} minor note(s).`
    : `\n${serious} serious/critical violation(s).`,
);
process.exit(serious === 0 ? 0 : 1);
