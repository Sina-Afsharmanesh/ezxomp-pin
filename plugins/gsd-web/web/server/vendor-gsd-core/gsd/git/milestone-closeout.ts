// Vendor-web thin surface: upstream milestone-closeout is an interactive runtime
// module the RPC-bridged web app never executes. Only doctor's terminal-state
// check is consumed here.
export type MilestoneCloseoutStatus = string;
export function isCompletedMilestoneTerminal(_basePath: string, status: string): boolean {
	return status === "done" || status === "completed" || status === "closed";
}

export type DispatchAction = any;
export type DispatchContext = any;
export async function evaluateGuardedCompleteMilestoneDispatch(ctx: DispatchContext): Promise<DispatchAction> {
	void ctx;
	return { action: "noop" };
}
export async function evaluateCompleteMilestoneDispatch(ctx: DispatchContext): Promise<DispatchAction | null> {
	void ctx;
	return null;
}
