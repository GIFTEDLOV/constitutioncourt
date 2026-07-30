/**
 * Test environment shims.
 *
 * jsdom provides no WebCrypto subtle digest, which `lib/hash.ts` depends on and
 * deliberately does not polyfill in app code — a missing SubtleCrypto in a
 * browser should fail loudly rather than silently skip the source-hash check.
 * Supplying Node's implementation here keeps that guarantee intact while making
 * the hash testable.
 */
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom does not implement matchMedia; components must not crash without it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
