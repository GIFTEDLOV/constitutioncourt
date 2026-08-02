/**
 * The browser-local case registry.
 *
 * There is no backend and no index. This page lists what *this browser* knows
 * about: cases it created, and cases it was pointed at. That is a deliberate
 * architectural limit, not a missing feature — a server-side index would be a
 * second source of truth that can disagree with the chain, and the contract is
 * the only authoritative store.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCases, removeCase, upsertCase, REGISTRY_EVENT, type CaseEntry } from '../lib/registry';
import { isAddress } from '../lib/validation';
import { Notice, Panel } from '../components/Primitives';
import { shortAddress } from '../lib/format';

export function Cases() {
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setCases(listCases());
    load();
    window.addEventListener('storage', load);
    window.addEventListener(REGISTRY_EVENT, load);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener(REGISTRY_EVENT, load);
    };
  }, []);

  function onImport(e: React.FormEvent) {
    e.preventDefault();
    const v = importValue.trim();
    if (!isAddress(v)) {
      setImportError('Enter a valid 0x contract address (40 hex characters).');
      return;
    }
    setImportError(null);
    upsertCase({ address: v, via: 'imported', addedAt: Date.now() });
    setImportValue('');
    setCases(listCases());
  }

  return (
    <div className="page">
      <h1>My cases</h1>
      <p className="lede">
        Cases this browser has created or been pointed at. Stored locally only.
      </p>

      <Notice>
        <p className="small" style={{ marginBottom: 0 }}>
          This list lives in your browser, not on a server. Clearing site data removes it, and it
          does not follow you to another device. Nothing is lost when that happens — the case is
          the contract, and its address is enough to open it again from anywhere.
        </p>
      </Notice>

      <Panel title="Open a case by address">
        <form onSubmit={onImport}>
          <div className="field">
            <label htmlFor="import">Contract address</label>
            <p className="field-hint">
              Anyone can read any case. A wallet is only needed to act on one.
            </p>
            <input
              id="import"
              type="text"
              className="mono"
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              aria-invalid={!!importError}
              aria-describedby={importError ? 'import-err' : undefined}
              placeholder="0x…"
            />
            {importError ? <p className="msg msg-error" id="import-err">{importError}</p> : null}
          </div>
          <button type="submit" className="btn btn-primary">Add to my cases</button>
        </form>
      </Panel>

      {cases.length === 0 ? (
        <Panel title="No cases yet">
          <p>
            Nothing has been filed or imported from this browser.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" to="/create">File a case</Link>
            <Link className="btn" to="/demo">See worked examples</Link>
          </div>
        </Panel>
      ) : (
        <section>
          <h2 className="panel-title">
            {`${cases.length} case${cases.length === 1 ? '' : 's'}`}
          </h2>
          {/*
            Full-width rows separated by hairlines, not cards. The respondent is
            deliberately absent: this registry is browser-local by design and
            stores only what a listing needs, so showing a respondent would mean
            either a network read per row or widening what the registry keeps.
          */}
          <ul className="case-rows">
            {cases.map((c) => (
              <li className="case-row" key={c.address}>
                <h3 className="case-row-title">
                  <Link to={`/case/${c.address}`}>{c.title || 'Untitled case'}</Link>
                  {c.via === 'created' ? (
                    <span className="small muted"> · filed here</span>
                  ) : null}
                </h3>

                <p className={`case-row-status status-type badge-${(c.lastStatus ?? '').toLowerCase()}`}
                  data-kind={c.lastStatus ?? undefined}
                >
                  {c.lastStatus ?? <span className="muted small">Not read yet</span>}
                  {c.lastOutcome ? (
                    <span className="small muted"> {c.lastOutcome}</span>
                  ) : null}
                </p>

                <dl className="case-row-meta">
                  <div>
                    <dt>Address</dt>
                    <dd className="mono">{shortAddress(c.address)}</dd>
                  </div>
                  <div>
                    <dt>Last known</dt>
                    <dd>
                      <time dateTime={new Date(c.refreshedAt ?? c.addedAt).toISOString()}>
                        {new Date(c.refreshedAt ?? c.addedAt).toISOString().slice(0, 10)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Forget</dt>
                    <dd>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => { removeCase(c.address); setCases(listCases()); }}
                      >
                        Forget
                        <span className="visually-hidden"> {c.title || c.address}</span>
                      </button>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginTop: 'var(--s3)' }}>
            &ldquo;Last seen status&rdquo; is what this browser read when it last looked, not a live
            value. Open a case to read it from the contract.
          </p>
        </section>
      )}
    </div>
  );
}
