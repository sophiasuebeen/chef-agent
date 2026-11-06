import { StrictMode } from 'react';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ReplayApp } from './ReplayApp';

const SceneApp = lazy(() => import('./App').then(({ App }) => ({ default: App })));

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p>Loading restaurant…</p>}>
      {new URLSearchParams(window.location.search).has('scene') ? <SceneApp /> : <ReplayApp />}
    </Suspense>
  </StrictMode>,
);
