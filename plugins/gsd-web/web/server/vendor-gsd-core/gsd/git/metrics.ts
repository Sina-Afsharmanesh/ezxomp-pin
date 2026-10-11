// Vendor-web thin surface: interactive metrics collection lives in the CLI runtime.
export const metrics = { record: (...args: any[]) => {}, increment: (...args: any[]) => {} };
export function pruneMetricsLedger(...args: any[]): void { void args; }
