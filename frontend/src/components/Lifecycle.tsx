/**
 * The lifecycle, drawn so the optional response path is unmistakable.
 *
 * The single most important thing this component communicates: the respondent
 * **cannot block adjudication**. `rule()` is reachable from OPEN, so silence is
 * a choice not to argue rather than a way to bury the case. A diagram that drew
 * OPEN → RESPONDED → RULED as the only path would imply the opposite and
 * misrepresent the contract.
 */

export type NodeState = 'done' | 'current' | 'future' | 'skipped';

export function lifecycleStates(status: string, hasResponse: boolean): Record<string, NodeState> {
  if (status === 'OPEN') {
    return { OPEN: 'current', RESPONDED: 'future', RULED: 'future' };
  }
  if (status === 'RESPONDED') {
    return { OPEN: 'done', RESPONDED: 'current', RULED: 'future' };
  }
  if (status === 'RULED') {
    // A case ruled straight from OPEN never passed through RESPONDED. Marking
    // that node "skipped" rather than "done" is the difference between an
    // accurate history and an invented one.
    return {
      OPEN: 'done',
      RESPONDED: hasResponse ? 'done' : 'skipped',
      RULED: 'current',
    };
  }
  return { OPEN: 'future', RESPONDED: 'future', RULED: 'future' };
}

export function Lifecycle({ status, hasResponse }: { status: string; hasResponse: boolean }) {
  const states = lifecycleStates(status, hasResponse);
  const respondedLabel = states.RESPONDED === 'skipped'
    ? 'RESPONDED (not used)'
    : 'RESPONDED';

  return (
    <div>
      <div className="lifecycle" role="group" aria-label="Case lifecycle">
        <span className="lifecycle-node" data-state={states.OPEN}>OPEN</span>
        <span className="lifecycle-arrow" aria-hidden="true">→</span>
        <span className="lifecycle-node" data-state={states.RESPONDED}>{respondedLabel}</span>
        <span className="lifecycle-arrow" aria-hidden="true">→</span>
        <span className="lifecycle-node" data-state={states.RULED}>RULED</span>
      </div>
      <p className="lifecycle-optional">
        The response is optional. A case can be ruled directly from OPEN — the respondent cannot
        prevent or delay adjudication by declining to answer.
      </p>
    </div>
  );
}
