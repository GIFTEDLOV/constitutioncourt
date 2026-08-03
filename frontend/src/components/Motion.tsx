/**
 * Motion primitives: marquee, scroll reveal, count-up, scroll progress.
 *
 * The permitted vocabulary is fade, translateY, count-up and marquee. Nothing
 * scales, lifts, bounces or floats.
 *
 * Every component here degrades to its finished state rather than its starting
 * state. An element is hidden only after an observer has been attached and has
 * committed to revealing it, so a browser without IntersectionObserver, a test
 * renderer, or a reader with `prefers-reduced-motion` all get the content
 * immediately instead of an empty page. Animation is an enhancement; the
 * content is not.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** True when the reader has asked for reduced motion, or we cannot animate. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canObserve(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
}

/**
 * A bleeding, continuously scrolling headline.
 *
 * The content is repeated three times and the track translates by exactly one
 * third, so the loop is seamless. Only the first copy is exposed to assistive
 * technology — the repeats are decorative duplicates of the same words, and
 * announcing them three times would be noise.
 */
export function Marquee(
  { text, dir = 'rtl', className }: { text: string; dir?: 'rtl' | 'ltr'; className?: string },
) {
  const copies = [0, 1, 2];
  return (
    <div className="marquee" data-dir={dir} aria-hidden={false}>
      <div className="marquee-track">
        {copies.map((i) => (
          <span
            className={`marquee-item ${className ?? ''}`}
            key={i}
            aria-hidden={i > 0 ? true : undefined}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Fade and lift a block into view once, when it first intersects.
 *
 * `delay` staggers siblings; the caller passes index * 80.
 */
export function Reveal(
  { children, delay = 0, as: As = 'div', className }:
  { children: ReactNode; delay?: number; as?: 'div' | 'section' | 'li'; className?: string },
) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || !canObserve()) return;
    const el = ref.current;
    if (!el) return;

    /*
     * Content already on screen at mount is never animated.
     *
     * Fading in what the reader can already see is a flash rather than a
     * reveal, and it has a concrete accessibility cost: an automated contrast
     * audit that samples the page during the 700ms transition measures the
     * half-faded colour and correctly reports a failure. Only content below the
     * fold is armed.
     */
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setArmed(true);
    setShown(false);
    // Threshold 0: reveal as soon as any part of the block enters the viewport.
    // A percentage threshold can strand a tall section that never shows enough
    // of itself at once, and content that fails to appear is a far worse
    // outcome than an animation that starts a little early.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = [
    className,
    armed ? (shown ? 'reveal-in' : 'reveal') : null,
  ].filter(Boolean).join(' ');

  return (
    <As
      ref={ref as never}
      className={cls || undefined}
      style={armed && shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </As>
  );
}

/**
 * Count a numeral up to its target once, at 40% visibility.
 *
 * The suffix is rendered outside the interpolation so "100%" animates the
 * number and keeps the sign. The accessible name is the final value from the
 * first render — a screen reader should never be read a counter mid-flight.
 */
export function CountUp(
  { value, suffix = '', durationMs = 1100 }:
  { value: number; suffix?: string; durationMs?: number },
) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion() || !canObserve()) return;
    const el = ref.current;
    if (!el) return;
    setDisplay(0);
    let raf = 0;
    let start = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.disconnect();
          const tick = (now: number) => {
            if (!start) start = now;
            const t = Math.min(1, (now - start) / durationMs);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(eased * value));
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">{display}{suffix}</span>
      <span className="visually-hidden">{value}{suffix}</span>
    </span>
  );
}

/** A 2px reading-progress rule beneath the masthead. */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setPct(max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return <div className="progress" style={{ width: `${pct * 100}%` }} aria-hidden="true" />;
}
