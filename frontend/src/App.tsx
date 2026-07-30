import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { Create } from './pages/Create';
import { Cases } from './pages/Cases';
import { CasePage } from './pages/CasePage';
import { Demo } from './pages/Demo';
import { Help } from './pages/Help';
import { NotFound } from './pages/NotFound';

/** The six locked routes, plus an honest 404. */
export function App() {
  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/case/:contractAddress" element={<CasePage />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}
