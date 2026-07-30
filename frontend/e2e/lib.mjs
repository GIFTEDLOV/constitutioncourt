/**
 * Shared browser-harness helpers.
 *
 * The preview server is started here rather than assumed, so the browser suites
 * are one command with no setup. Every page load runs against the production
 * build — testing the dev server would test a bundle nobody ships.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer';

export const ORIGIN = 'http://localhost:3100';

export const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/create', name: 'create wizard' },
  { path: '/cases', name: 'my cases' },
  { path: '/demo', name: 'worked examples' },
  { path: '/help', name: 'how it works' },
  { path: '/case/0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA', name: 'case view' },
  { path: '/nowhere', name: '404' },
];

export async function startPreview() {
  const proc = spawn('npx', ['vite', 'preview', '--port', '3100', '--strictPort'], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    shell: true,
    stdio: 'ignore',
  });

  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(ORIGIN);
      if (r.ok) return proc;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  proc.kill();
  throw new Error('Preview server did not start on ' + ORIGIN);
}

export async function withBrowser(fn) {
  const server = await startPreview();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
    server.kill();
  }
}

/**
 * A page with no injected wallet.
 *
 * Reading must work with none — that is the whole point of the observer mode —
 * so the default harness deliberately provides no `window.ethereum`.
 */
export async function newPage(browser, { mockWallet = false, viewport } = {}) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);

  if (mockWallet) {
    // A mocked injected provider. It never signs anything: every request that
    // would need a signature throws, so no test can spend GEN by accident.
    await page.evaluateOnNewDocument(() => {
      window.ethereum = {
        request: async ({ method }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
            return ['0x1111111111111111111111111111111111111111'];
          }
          if (method === 'eth_chainId') return '0x107d';
          throw new Error(`Mock wallet refuses ${method} — Stage 4 signs nothing.`);
        },
        on: () => {},
        removeListener: () => {},
      };
    });
  }

  // Block every outbound request that is not our own origin. The RPC is never
  // contacted: no network, no wallet, no GEN.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) {
      void req.continue();
    } else {
      void req.abort();
    }
  });

  return page;
}

export function collectConsole(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * Console noise that is expected and not a defect.
 *
 * Aborted RPC requests are the harness doing its job — the chain is
 * deliberately unreachable, so the case view's read failing is the correct
 * behaviour under test, not an error to fix.
 */
export const EXPECTED_CONSOLE = [
  /Failed to load resource/i,
  /net::ERR_FAILED/i,
  /net::ERR_BLOCKED/i,
  /ERR_INTERNET_DISCONNECTED/i,
  /rpc-bradbury/i,
  // genlayer-js logs its own message when a read cannot reach the node. The
  // case view failing to read an unreachable chain is the behaviour under test,
  // not a defect — and the page must still render its "could not be read"
  // explanation, which the smoke test asserts separately.
  /GenLayer RPC error/i,
  /Failed to fetch/i,
];

export function unexpectedErrors(errors) {
  return errors.filter((e) => !EXPECTED_CONSOLE.some((re) => re.test(e)));
}
