/**
 * Machine-readable codes for every contract violation raised by `@senkiro/contracts`.
 * Downstream packages may switch on `code` instead of parsing messages.
 */
export type ContractViolationCode =
  | 'INVALID_SK_ID'
  | 'DISHONEST_FARE_QUOTE'
  | 'INVALID_COMMEMORATIVE_TICKET'
  | 'ODBL_ISOLATION_VIOLATION';

/** Thrown by every runtime guard in this package when a hard invariant is broken. */
export class ContractViolationError extends Error {
  readonly code: ContractViolationCode;
  /** Every individual problem found (guards collect all, not just the first). */
  readonly issues: readonly string[];

  constructor(code: ContractViolationCode, issues: readonly string[]) {
    super(`[${code}] ${issues.join('; ')}`);
    this.name = 'ContractViolationError';
    this.code = code;
    this.issues = issues;
  }
}

/** Raised when a string is not a valid v1.0 `SkId` (or cannot be migrated to one). */
export class SkIdError extends ContractViolationError {
  constructor(issue: string) {
    super('INVALID_SK_ID', [issue]);
    this.name = 'SkIdError';
  }
}
