export type CheckStatus = "pass" | "fail" | "pending" | "skipped" | "unknown";

export interface VerifyCheck {
  kind: "type-check" | "smoke-test" | "provider-check";
  name: string;
  status: CheckStatus;
  evidence?: string;
  detail?: string;
}

export interface VerifyResult {
  checks: VerifyCheck[];
  overall: CheckStatus;
}

/** Severity for computing worst-of across checks. Higher = worse. */
const severity: Record<CheckStatus, number> = {
  pass: 0,
  skipped: 1,
  pending: 2,
  unknown: 3,
  fail: 4,
};

/** Compute overall status as the worst check status. */
export function worstStatus(...statuses: CheckStatus[]): CheckStatus {
  let worst: CheckStatus = "pass";
  for (const s of statuses) {
    if (severity[s] > severity[worst]) worst = s;
  }
  return worst;
}

/** true if the overall is strictly passing (no failure/pending/unknown). */
export function isPassing(result: VerifyResult): boolean {
  return result.overall === "pass" || result.overall === "skipped";
}
