/**
 * URL ⇄ `AppSearchParams` codec (contract §6). The URL is the single source of truth for
 * region, module, hub, language and theme, so a refresh or a shared link restores the view.
 *
 * - Parsing reads every query value as a plain string (no JSON coercion) and hands the
 *   record to `parseAppSearchParams`, which never throws and repairs hub ↔ region conflicts.
 * - Stringifying goes through `serializeAppSearchParams`, which omits default values.
 */
import {
  type AppSearchParams,
  parseAppSearchParams,
  serializeAppSearchParams,
} from '@senkiro/contracts';

export function parseSearchString(searchStr: string): Record<string, string> {
  const params = new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr);
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    out[key] = value;
  }
  return out;
}

export function stringifySearchRecord(search: object): string {
  const query = new URLSearchParams(serializeAppSearchParams(parseAppSearchParams(search)));
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

/** Partial update where `undefined` explicitly clears an optional parameter. */
export type SearchPatch = { [K in keyof AppSearchParams]?: AppSearchParams[K] | undefined };

/** Merge a patch and re-validate, so the result is always a well-formed `AppSearchParams`. */
export function applySearchPatch(prev: AppSearchParams, patch: SearchPatch): AppSearchParams {
  return parseAppSearchParams({ ...prev, ...patch });
}
