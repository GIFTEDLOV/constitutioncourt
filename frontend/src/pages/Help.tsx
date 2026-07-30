import { OUTCOME_MEANINGS, EVIDENCE_ROLES, REPO, EXPLORER } from '../config';
import { Lifecycle } from '../components/Lifecycle';
import { Badge, Ext, Notice, Panel, TableWrap } from '../components/Primitives';

export function Help() {
  return (
    <div className="page page-narrow">
      <h1>How it works</h1>

      <Panel title="Lifecycle">
        <Lifecycle status="OPEN" hasResponse={false} />
        <TableWrap label="Lifecycle transitions">
          <table>
            <caption className="visually-hidden">Lifecycle transitions</caption>
            <thead>
              <tr>
                <th scope="col">Transition</th>
                <th scope="col">Who</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Deploy → OPEN</th>
                <td>Challenger</td>
                <td>Pins the respondent and four evidence URLs. Costs gas only.</td>
              </tr>
              <tr>
                <th scope="row">OPEN → RESPONDED</th>
                <td>Respondent only</td>
                <td>
                  Optional, and possible only while OPEN. Exactly one response, ever — it cannot be
                  replaced after the respondent sees how it lands.
                </td>
              </tr>
              <tr>
                <th scope="row">OPEN → RULED</th>
                <td>Anyone</td>
                <td>
                  The respondent did not answer. Silence is a choice not to argue, not a way to
                  bury the case.
                </td>
              </tr>
              <tr>
                <th scope="row">RESPONDED → RULED</th>
                <td>Anyone</td>
                <td>The respondent answered and the record is adjudicated with the response.</td>
              </tr>
            </tbody>
          </table>
        </TableWrap>
        <p>
          <strong>Ruling is permissionless by design.</strong> If only the two parties could
          trigger it, a challenger who lost interest and a respondent who preferred no ruling would
          leave the case in OPEN forever. The caller pays gas and gains nothing: there is no payout
          to race for and no ordering to exploit, because the ruling depends only on the evidence.
        </p>
        <p>
          <strong>RULED is terminal.</strong> No reopening, no second ruling, no appeal method in
          this contract. Contesting a ruling means using GenLayer&rsquo;s native transaction appeal
          on the ruling transaction.
        </p>
      </Panel>

      <Panel title="Evidence rules">
        <p>
          Five documents, four pinned at filing and one optional. Each must be a JSON object served
          over HTTPS carrying its exact <code>schema</code> literal.
        </p>
        <TableWrap label="The five evidence documents">
          <table>
            <caption className="visually-hidden">The five evidence documents</caption>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Role</th>
                <th scope="col">Schema literal</th>
              </tr>
            </thead>
            <tbody>
              {EVIDENCE_ROLES.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>{r.role}</td>
                  <td className="mono small">{r.schema}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>

        <h3>Why HTTPS is mandatory</h3>
        <p>
          Over plain HTTP an on-path attacker can serve different bytes to different validators and
          split consensus without even controlling the host. URLs carrying credentials are rejected
          for a related reason: evidence that needs a secret is not something every validator can
          independently fetch, and the secret would be published on-chain forever.
        </p>

        <h3>Pin content, not just a URL</h3>
        <p>
          The contract stores the URL. It cannot store what that URL serves. Validators fetch at
          ruling time, which may be long after filing — so a branch URL that moves in between means
          they adjudicate a document you never saw, and one that moves <em>while</em> they fetch can
          make them disagree with each other. Use commit-pinned or otherwise immutable URLs.
        </p>

        <h3>What validators will not do</h3>
        <p>
          They fetch exactly the pinned URLs — four, or five when a response exists — and never
          follow a link found inside a document. Following links would let a challenger steer
          validators to arbitrary hosts and make the fetch set unbounded and unreproducible.
        </p>
      </Panel>

      <Panel title="Outcomes">
        <TableWrap label="Outcome definitions">
          <table>
            <caption className="visually-hidden">Outcome definitions</caption>
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">Final status</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOME_MEANINGS.map((m) => (
                <tr key={m.outcome}>
                  <th scope="row" className="mono">{m.outcome}</th>
                  <td><Badge kind={m.final}>{m.final}</Badge></td>
                  <td>
                    {m.headline}
                    <br />
                    <span className="small muted">{m.notWhat}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <Notice tone="warn">
          <p className="small" style={{ marginBottom: 0 }}>
            <strong>CERTIFIED means validators found no constitutional violation in the pinned
            evidence.</strong> It does not mean the proposal is legal, safe, wise or automatically
            authorised for execution. It is a finding on a record, not a warrant — and if an
            evidence host served false documents consistently to every validator, the ruling
            faithfully reflects those documents.
          </p>
        </Notice>
      </Panel>

      <Panel title="What consensus actually covers">
        <p>
          Validators agree on two things and only two: the <strong>outcome</strong>, compared as an
          exact string, and the <strong>set of violated rule ids</strong>, compared as a set so that
          ordering and duplicates cannot fail consensus over formatting.
        </p>
        <p>
          Citations and written reasoning are recorded from the <em>leader</em> validator. They are
          explanatory, kept so a reader can check a finding against its basis. Anyone treating the
          stored prose as consensus-verified is misreading it — two validators reaching the same
          verdict for the same reason will still word it differently.
        </p>
      </Panel>

      <Panel title="Limitations">
        <ul>
          <li>
            <strong>No enforcement.</strong> A ruling moves no money, reverses no transfer and
            binds no one. The contract holds no balance and has no payable method.
          </li>
          <li>
            <strong>Evidence is only as good as its host.</strong> The challenger picks four URLs
            and the respondent picks the fifth. Neither is neutral. A consistently false document
            produces a faithful ruling about a false record.
          </li>
          <li>
            <strong>No content pinning.</strong> The contract stores URLs, not hashes. Content
            hashing was considered and deferred: the challenger would pick the hash too, so it
            attests to what the challenger pinned rather than what the organisation published.
          </li>
          <li>
            <strong>One case per contract.</strong> There is no registry and no cross-case search.
            The list of cases in this browser is local to it.
          </li>
          <li>
            <strong>Scope is treasury proposals.</strong> Membership, elections and constitutional
            amendments need different evidence types and different rules.
          </li>
          <li>
            <strong>Filing is free beyond gas.</strong> Nothing stops a frivolous case except the
            fact that an OPEN case is visibly an unadjudicated claim.
          </li>
        </ul>
      </Panel>

      <Panel title="Verifying a ruling yourself">
        <p>You do not have to trust this interface. For any case:</p>
        <ol>
          <li>
            Open the contract address in the <Ext href={EXPLORER}>block explorer</Ext> and read
            <code> get_state</code> and <code>get_evidence_sources</code> directly.
          </li>
          <li>
            Fetch the four or five pinned URLs yourself. They are exactly what validators fetched.
          </li>
          <li>
            Check each cited rule id against the constitution document. The contract rejects a
            ruling that cites an id the constitution does not contain, so every id you see resolved
            at ruling time.
          </li>
          <li>
            Read the ruling transaction on the explorer to see the validator votes, and use the
            native transaction appeal there if you disagree.
          </li>
          <li>
            Compare the deployed contract source against{' '}
            <Ext href={`${REPO}/blob/main/contracts/constitution_court.py`}>the repository</Ext>.
            The frontend embeds and deploys that file byte for byte.
          </li>
        </ol>
      </Panel>
    </div>
  );
}
