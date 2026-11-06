import { StrictMode } from 'react';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveApp } from './LiveApp';
import { ReplayApp } from './ReplayApp';

const SceneApp = lazy(() => import('./App').then(({ App }) => ({ default: App })));

const params = new URLSearchParams(window.location.search);
const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p>Loading restaurant…</p>}>
      {params.has('scene') ? <SceneApp /> : params.has('live') ? <LiveApp /> : <ReplayApp />}
    </Suspense>
  </StrictMode>,
);
