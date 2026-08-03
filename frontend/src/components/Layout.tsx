import { NavLink, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CHAIN_NAME, REPO } from '../config';
import { useWallet } from '../state/wallet';
import { shortAddress } from '../lib/format';
import { Ext } from './Primitives';
import { ScrollProgress } from './Motion';

function WalletButton() {
  const { account, available, connecting, connect, disconnect, wrongNetwork, switchNetwork } =
    useWallet();

  if (!available) {
    return (
      <span className="small muted">
        No wallet detected — reading works without one
      </span>
    );
  }
  if (!account) {
    return (
      <button type="button" className="btn" onClick={() => void connect()} disabled={connecting}>
        {connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }
  if (wrongNetwork) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => void switchNetwork()}>
        Switch to {CHAIN_NAME}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn"
      onClick={disconnect}
      title={`${account} — click to forget locally`}
    >
      <span className="mono">{shortAddress(account)}</span>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { wrongNetwork } = useWallet();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="masthead">
        <div className="masthead-inner">
          <Link to="/" className="wordmark">
            Constitution<span className="mark">Court</span>
          </Link>
          <span className="nav-divider" aria-hidden="true" />
          {/*
            Editorial navigation: the reading routes only. Filing is the single
            call to action and is deliberately not one link among five.
          */}
          <nav className="nav" aria-label="Primary">
            <NavLink to="/cases">Case explorer</NavLink>
            <NavLink to="/consensus">How consensus works</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/help">Help</NavLink>
          </nav>
          <div className="masthead-actions">
            <NavLink to="/create" className="cta-pill">File a case</NavLink>
            <WalletButton />
          </div>
        </div>
        <ScrollProgress />
      </header>

      {wrongNetwork ? (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice notice-danger" role="alert">
            <p className="small" style={{ marginBottom: 0 }}>
              Your wallet is on a different network. Switch to {CHAIN_NAME} before signing —
              reading is unaffected.
            </p>
          </div>
        </div>
      ) : null}

      <main id="main">{children}</main>

      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-cols">
            <div className="foot-col">
              <span className="eyebrow">File</span>
              <ul>
                <li><Link to="/create">File a case</Link></li>
                <li><Link to="/cases">Case explorer</Link></li>
                <li><Link to="/demo">Worked examples</Link></li>
              </ul>
            </div>
            <div className="foot-col">
              <span className="eyebrow">Understand</span>
              <ul>
                <li><Link to="/consensus">How consensus works</Link></li>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/help">Help</Link></li>
              </ul>
            </div>
            <div className="foot-col">
              <span className="eyebrow">Verify</span>
              <ul>
                <li><Ext href={REPO}>Source and evidence fixtures</Ext></li>
                <li><span className="muted small">Running on {CHAIN_NAME}</span></li>
              </ul>
            </div>
          </div>

          <div className="foot-legal">
            <p>
              <strong>ConstitutionCourt</strong> is a governance-compliance adjudicator. It is not a
              legal court, a treasury executor, a voting platform, an escrow application, or a
              replacement for GenLayer&rsquo;s native transaction appeal. It holds no funds and moves
              no assets.
            </p>
            <p className="foot-disclaimer">
              A ruling is an opinion with citations. <strong>CERTIFIED</strong> means validators found
              no constitutional violation in the pinned evidence. It does not mean the proposal is
              legal, safe, wise or automatically authorised for execution.
            </p>
          </div>

          {/* Decorative watermark; the text is drawn from CSS. See .foot-wordmark. */}
          <p className="foot-wordmark" aria-hidden="true" />
        </div>
      </footer>
    </div>
  );
}
