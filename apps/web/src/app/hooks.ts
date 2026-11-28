import { type AppSearchParams, parseAppSearchParams } from '@senkiro/contracts';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { MESSAGES, type Messages } from '../i18n/messages.ts';
import { applySearchPatch, type SearchPatch } from './search.ts';

const rootApi = getRouteApi('__root__');

/**
 * Typed, validated `AppSearchParams` for the current URL.
 *
 * TanStack Router merges the raw query into the root route's validated search
 * (`{ ...raw, ...validated }`), so keys the contract parser *dropped* — a hub that
 * contradicts the region, a malformed `station` — would leak back in. Re-validating here
 * guarantees components only ever see contract-clean params.
 */
export function useAppSearch(): AppSearchParams {
  const search = rootApi.useSearch();
  return useMemo(() => parseAppSearchParams(search), [search]);
}

/** Messages for the current URL language. */
export function useMessages(): Messages {
  return MESSAGES[useAppSearch().lang];
}

export interface UpdateSearchOptions {
  /** Replace the history entry instead of pushing (used for language/theme). */
  replace?: boolean;
}

/** Patch the URL search params; the result is re-validated through the contract schema. */
export function useUpdateSearch(): (patch: SearchPatch, options?: UpdateSearchOptions) => void {
  const navigate = rootApi.useNavigate();
  return useCallback(
    (patch, options = {}) => {
      void navigate({
        to: '.',
        search: (prev: AppSearchParams) => applySearchPatch(prev, patch),
        replace: options.replace ?? false,
      });
    },
    [navigate],
  );
}
