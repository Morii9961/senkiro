// Design tokens, imported explicitly: the side-effect import inside `@senkiro/ui-kit`'s entry
// is dropped by the production (rolldown) build, so without this line `vite build` shipped
// no `--sk-*` definitions (dev mode masked it). Found by the P0-W2 Exit Gate 0 E2E run.
import '@senkiro/ui-kit/tokens.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRouter } from './app/router.tsx';
import { DEFAULT_SHELL_SLOTS } from './slots/registry.ts';
import { ShellSlotsProvider } from './slots/slots.tsx';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('SENKIRO: #root element missing from index.html');
}

const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <ShellSlotsProvider slots={DEFAULT_SHELL_SLOTS}>
      <RouterProvider router={router} />
    </ShellSlotsProvider>
  </StrictMode>,
);
