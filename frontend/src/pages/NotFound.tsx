import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="page page-narrow">
      <h1>No such page</h1>
      <p>
        That address is not one of this application&rsquo;s routes.
      </p>
      <ul>
        <li><Link to="/">Home</Link> — what this is and what it is not</li>
        <li><Link to="/create">File a case</Link></li>
        <li><Link to="/cases">My cases</Link></li>
        <li><Link to="/demo">Worked examples</Link></li>
        <li><Link to="/help">How it works</Link></li>
      </ul>
      <p className="small muted">
        To open a case directly, use <span className="mono">/case/&lt;contract address&gt;</span>.
      </p>
    </div>
  );
}
