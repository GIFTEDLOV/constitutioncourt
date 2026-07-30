import { NavLink, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CHAIN_NAME, REPO } from '../config';
import { useWallet } from '../state/wallet';
import { shortAddress } from '../lib/format';
import { Ext } from './Primitives';

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
          <nav className="nav" aria-label="Primary">
            <NavLink to="/create">File a case</NavLink>
            <NavLink to="/cases">My cases</NavLink>
            <NavLink to="/demo">Worked examples</NavLink>
            <NavLink to="/help">How it works</NavLink>
          </nav>
          <WalletButton />
        </div>
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
          <p>
            <strong>ConstitutionCourt</strong> is a governance-compliance adjudicator. It is not a
            legal court, a treasury executor, a voting platform, an escrow application, or a
            replacement for GenLayer&rsquo;s native transaction appeal. It holds no funds and moves
            no assets.
          </p>
          <p>
            A ruling is an opinion with citations. <strong>CERTIFIED</strong> means validators found
            no constitutional violation in the pinned evidence. It does not mean the proposal is
            legal, safe, wise or automatically authorised for execution.
          </p>
          <p>
            Running on {CHAIN_NAME}. <Ext href={REPO}>Source and evidence fixtures</Ext>.
          </p>
        </div>
      </footer>
    </div>
  );
}
