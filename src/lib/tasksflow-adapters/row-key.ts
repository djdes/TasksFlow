/**
 * Shared helpers for TasksFlow adapter rowKey parsing.
 *
 * Three rowKey shapes in production:
 *   - `employee-<userId>`         — per-employee rows (most adapters)
 *   - `freetask:<userId>:<rand>`  — admin-driven free-text task
 *                                   (assembled in bind-row/route.ts)
 *   - `<adapter-specific>`        — e.g. `cleaning-pair-<id>`, managed
 *                                   by the adapter alone
 *
 * Both `employee-` and `freetask:` encode a single responsible WeSetup
 * user id — `extractEmployeeId` returns it so `applyRemoteCompletion`
 * can file the journal entry the same way for either source.
 */

export function extractEmployeeId(rowKey: string): string | null {
  if (rowKey.startsWith("employee-")) {
    return rowKey.slice("employee-".length);
  }
  if (rowKey.startsWith("freetask:")) {
    const rest = rowKey.slice("freetask:".length);
    const sep = rest.indexOf(":");
    return sep > 0 ? rest.slice(0, sep) : null;
  }
  return null;
}

export function rowKeyForEmployee(userId: string): string {
  return `employee-${userId}`;
}
