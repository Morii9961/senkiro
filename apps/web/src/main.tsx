// Design tokens and the global base, imported explicitly and in this order: the side-effect
// imports inside `@senkiro/ui-kit`'s entry are dropped by the production (rolldown) build,
// so without these lines `vite build` shipped no `--sk-*` definitions (found by the P0-W2
// Exit Gate 0 E2E run) and no base.css (8px body margin, content-box, no focus ring).
import '@senkiro/ui-kit/tokens.css';
import '@senkiro/ui-kit/base.css';
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
