import type { AutoCompactionEndEvent, AutoCompactionStartEvent, ContextUsage, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { CircuitState, CompactEngMode, CompactEngStatus, CompactionOrigin, CompactionReceipt, GovernorPhase, ResolvedCompactEngConfig, UsageSample } from "./types";

interface RequestCycle {
	epoch: number;
	generation: number;
	mode: CompactEngMode;
	origin: CompactionOrigin;
	promise: Promise<CompactionReceipt>;
}

interface AttemptOutcome {
	receipt: CompactionReceipt;
	after?: UsageSample;
	failed: boolean;
	noProgress: boolean;
	deferred: boolean;
}

/**
 * Automatic cycles originate at agent_end, OMP's turn-complete signal, while
 * isIdle is still false during the awaited handler unwind. Their boundary and
 * initial attempt gate pending/native-flight state. Manual and fallback cycles
 * retain the full idle/no-pending predicate.
 */
export class CompactEngGovernor {
	readonly config: ResolvedCompactEngConfig;
	private phase: GovernorPhase = "armed";
	private circuit: CircuitState = "closed";
	private generation = 0;
	private epoch = 0;
	private turn = 0;
	private cooldownRemaining = 0;
	private circuitCooldownRemaining = 0;
	private consecutiveFailures = 0;
	private noProgressCount = 0;
	private inFlight?: RequestCycle;
	private nativeInFlight = false;
	private lastUsage?: UsageSample;
	private lastReceipt?: CompactionReceipt;

	constructor(config: ResolvedCompactEngConfig) {
		this.config = config;
	}

	observeTurnEnd(ctx: ExtensionContext, continuationScheduled = false): Promise<CompactionReceipt> {
		if (this.inFlight) return this.inFlight.promise;
		this.turn++;
		const pending = this.turnDeferral(ctx, continuationScheduled);
		if (pending) return Promise.resolve(pending);
		return this.evaluateTurnUsage(ctx);
	}

	private evaluateTurnUsage(ctx: ExtensionContext): Promise<CompactionReceipt> {
		const usage = this.sample(ctx);
		if (!usage) return Promise.resolve(this.recordDefer("usage-unavailable", "auto"));
		const blocked = this.turnUsageDeferral(usage);
		if (blocked) return Promise.resolve(blocked);
		const pressure = this.automaticUsageDeferral(usage);
		if (pressure) return Promise.resolve(pressure);
		return this.requestCompaction(ctx, this.config.mode, { before: usage });
	}

	private automaticUsageDeferral(usage: UsageSample): CompactionReceipt | undefined {
		if (!this.config.autoCompact) return this.recordDefer("auto-disabled", "auto", false, usage);
		if (!this.isBelowWatermark(usage)) return undefined;
		this.closeReleasedCircuit(usage);
		return this.recordDefer("below-watermark", "auto", false, usage);
	}

	private turnUsageDeferral(usage: UsageSample): CompactionReceipt | undefined {
		const circuitReceipt = this.advanceOpenCircuit();
		if (circuitReceipt) return circuitReceipt;
		const cooldownReceipt = this.advanceCooldown(usage);
		if (cooldownReceipt) return cooldownReceipt;
		return undefined;
	}

	requestCompaction(ctx: ExtensionContext, mode: CompactEngMode, options: { manual?: boolean; before?: UsageSample } = {}): Promise<CompactionReceipt> {
		if (this.inFlight) return this.inFlight.promise;
		const origin = this.requestOrigin(options.manual);
		const blocked = this.requestDeferral(ctx, origin);
		if (blocked) return Promise.resolve(blocked);
		const before = this.requestSample(ctx, options.before);
		if (!before) return Promise.resolve(this.recordDefer("usage-unavailable", origin));
		return this.startCycle(ctx, mode, before, origin);
	}

	private requestOrigin(manual: boolean | undefined): Exclude<CompactionOrigin, "fallback"> {
		return manual === true ? "manual" : "auto";
	}

	private requestSample(ctx: ExtensionContext, supplied: UsageSample | undefined): UsageSample | undefined {
		if (supplied) return supplied;
		return this.sample(ctx);
	}

	private startCycle(ctx: ExtensionContext, mode: CompactEngMode, before: UsageSample, origin: CompactionOrigin): Promise<CompactionReceipt> {
		const generation = ++this.generation;
		let cycle: RequestCycle;
		const promise = Promise.resolve().then(() => this.runCycle(cycle, ctx, before));
		cycle = { epoch: this.epoch, generation, mode, origin, promise };
		this.phase = "requesting";
		this.inFlight = cycle;
		return promise;
	}

	observeAutoStart(event: AutoCompactionStartEvent): void {
		this.nativeInFlight = true;
		const from = this.phase;
		if (this.inFlight) this.phase = "compacting";
		const request = this.requestMetadata();
		this.record({
			class: this.observedStartClass(event.action),
			source: request.source,
			origin: request.origin,
			generation: request.generation,
			requestedMode: request.mode,
			observedAction: event.action,
			result: "accepted",
			transition: `${from}->${this.phase}`,
		});
	}

	observeAutoEnd(event: AutoCompactionEndEvent, ctx: ExtensionContext): void {
		this.nativeInFlight = false;
		const after = this.sample(ctx);
		const request = this.requestMetadata();
		this.record({
			class: "native-outcome",
			source: request.source,
			origin: request.origin,
			generation: request.generation,
			requestedMode: request.mode,
			observedAction: event.action,
			result: this.observedEndResult(event),
			after,
			aborted: event.aborted,
			skipped: event.skipped,
			retry: event.willRetry,
			error: this.boundedError(event.errorMessage),
			transition: `${this.phase}->${this.phase}`,
		});
	}

	status(ctx?: ExtensionContext): CompactEngStatus {
		if (ctx) this.sample(ctx);
		return {
			config: this.config,
			phase: this.phase,
			circuit: this.circuit,
			generation: this.generation,
			inFlight: Boolean(this.inFlight),
			turn: this.turn,
			cooldownRemaining: this.cooldownRemaining,
			circuitCooldownRemaining: this.circuitCooldownRemaining,
			consecutiveFailures: this.consecutiveFailures,
			noProgressCount: this.noProgressCount,
			usage: this.lastUsage,
			lastReceipt: this.lastReceipt,
		};
	}

	reset(): void {
		this.epoch++;
		this.generation++;
		this.phase = "armed";
		this.circuit = "closed";
		this.turn = 0;
		this.cooldownRemaining = 0;
		this.circuitCooldownRemaining = 0;
		this.consecutiveFailures = 0;
		this.noProgressCount = 0;
		this.inFlight = undefined;
		this.nativeInFlight = false;
		this.lastUsage = undefined;
		this.lastReceipt = undefined;
	}

	private async runCycle(cycle: RequestCycle, ctx: ExtensionContext, before: UsageSample): Promise<CompactionReceipt> {
		let outcome = await this.performAttempt(cycle, ctx, before, cycle.mode);
		const fallbackBefore = this.fallbackSample(cycle, outcome, ctx);
		if (fallbackBefore) {
			cycle.generation = ++this.generation;
			cycle.mode = "text";
			cycle.origin = "fallback";
			this.phase = "requesting";
			outcome = await this.performAttempt(cycle, ctx, fallbackBefore, "text");
		}
		return this.completeCycle(cycle, outcome, fallbackBefore !== undefined);
	}

	private completeCycle(cycle: RequestCycle, outcome: AttemptOutcome, fallback: boolean): CompactionReceipt {
		if (!this.isCurrent(cycle)) return this.stale(cycle);
		if (fallback) outcome.receipt.fallback = "text";
		this.finish(outcome);
		if (this.inFlight === cycle) this.inFlight = undefined;
		return outcome.receipt;
	}

	private async performAttempt(cycle: RequestCycle, ctx: ExtensionContext, before: UsageSample, mode: CompactEngMode): Promise<AttemptOutcome> {
		const blocked = this.attemptDeferral(cycle, ctx, before);
		if (blocked) return blocked;
		const from = this.phase;
		this.phase = "compacting";
		this.record({
			class: this.requestClass(mode),
			source: "compact-eng-request",
			origin: cycle.origin,
			generation: cycle.generation,
			requestedMode: mode,
			result: "accepted",
			before,
			transition: `${from}->compacting`,
		});
		try {
			await this.requestNativeCompaction(ctx, mode);
		} catch (error) {
			return this.failedAttempt(cycle, ctx, before, mode, error);
		}
		return this.successfulAttempt(cycle, ctx, before, mode);
	}

	private failedAttempt(cycle: RequestCycle, ctx: ExtensionContext, before: UsageSample, mode: CompactEngMode, error: unknown): AttemptOutcome {
		if (!this.isCurrent(cycle)) return this.staleOutcome(cycle);
		const after = this.sample(ctx);
		const receipt = this.record({
			class: "native-outcome", source: "compact-eng-request", origin: cycle.origin, generation: cycle.generation, requestedMode: mode,
			result: "error", before, after, error: this.errorMessage(error),
			transition: `${this.phase}->settling`,
		});
		this.phase = "settling";
		return { receipt, after, failed: true, noProgress: false, deferred: false };
	}

	private successfulAttempt(cycle: RequestCycle, ctx: ExtensionContext, before: UsageSample, mode: CompactEngMode): AttemptOutcome {
		if (!this.isCurrent(cycle)) return this.staleOutcome(cycle);
		const after = this.sample(ctx);
		const noProgress = this.madeNoProgress(before, after);
		const receipt = this.recordOutcome(cycle, mode, before, after, noProgress);
		this.phase = "settling";
		return { receipt, after, failed: false, noProgress, deferred: false };
	}

	private finish(outcome: AttemptOutcome): void {
		if (outcome.deferred) {
			this.phase = "armed";
			return;
		}
		this.updateOutcomeCounts(outcome);
		if (this.failureLimitReached()) this.openCircuit();
		else this.startCooldown();
	}

	private sample(ctx: ExtensionContext): UsageSample | undefined {
		const usage = this.readUsage(ctx);
		if (!this.isValidUsage(usage)) return undefined;
		const percentageTrigger = Math.floor(usage.contextWindow * this.config.watermark);
		const sample: UsageSample = {
			tokens: usage.tokens,
			contextWindow: usage.contextWindow,
			percent: usage.tokens / usage.contextWindow * 100,
			triggerTokens: this.triggerTokens(percentageTrigger),
			releaseTokens: Math.floor(usage.contextWindow * this.config.releaseWatermark),
		};
		this.lastUsage = sample;
		return sample;
	}

	private turnDeferral(ctx: ExtensionContext, continuationScheduled: boolean): CompactionReceipt | undefined {
		// agent_end is the auto path's terminal turn boundary. OMP still reports
		// isIdle=false while that event unwinds, so pending work—not isIdle—is the
		// boundary safety predicate. Manual requests retain the full isSafe gate.
		if (continuationScheduled) return this.recordDefer("deferred-pending", "auto", true);
		if (this.hasPendingMessages(ctx)) return this.recordDefer("deferred-pending", "auto", true);
		if (this.nativeInFlight) return this.recordDefer("deferred-pending", "auto", true);
		return undefined;
	}

	private advanceOpenCircuit(): CompactionReceipt | undefined {
		if (this.circuit !== "open") return undefined;
		if (this.circuitCooldownRemaining > 0) this.circuitCooldownRemaining--;
		if (this.circuitCooldownRemaining > 0) return this.recordDefer("circuit-open", "auto");
		this.circuit = "half-open";
		return undefined;
	}

	private advanceCooldown(usage: UsageSample): CompactionReceipt | undefined {
		if (this.phase !== "cooldown") return undefined;
		if (this.cooldownRemaining > 0) this.cooldownRemaining--;
		if (this.cooldownRemaining > 0) return this.recordDefer("cooldown", "auto", false, usage);
		this.phase = "armed";
		return undefined;
	}

	private isBelowWatermark(usage: UsageSample): boolean {
		return usage.tokens < usage.triggerTokens;
	}

	private closeReleasedCircuit(usage: UsageSample): void {
		if (this.circuit !== "half-open") return;
		if (this.hasHeadroom(usage)) this.circuit = "closed";
	}

	private requestDeferral(ctx: ExtensionContext, origin: Exclude<CompactionOrigin, "fallback">): CompactionReceipt | undefined {
		if (this.requestGateUnsafe(ctx, origin)) return this.recordDefer("deferred-pending", origin, true);
		if (this.nativeInFlight) return this.recordDefer("deferred-pending", origin, true);
		return this.openCircuitDeferral(origin);
	}

	private requestGateUnsafe(ctx: ExtensionContext, origin: Exclude<CompactionOrigin, "fallback">): boolean {
		return origin === "manual" ? !this.isSafe(ctx) : this.hasPendingMessages(ctx);
	}

	private openCircuitDeferral(origin: Exclude<CompactionOrigin, "fallback">): CompactionReceipt | undefined {
		if (this.circuit !== "open") return undefined;
		if (origin === "auto") return this.recordDefer("circuit-open", origin);
		this.circuit = "half-open";
		return undefined;
	}

	private requestMetadata(): { source: CompactionReceipt["source"]; origin?: CompactionOrigin; generation: number; mode?: CompactEngMode } {
		const cycle = this.inFlight;
		if (cycle) return { source: "compact-eng-request", origin: cycle.origin, generation: cycle.generation, mode: cycle.mode };
		return { source: "native-auto", generation: this.generation };
	}

	private observedStartClass(action: string): CompactionReceipt["class"] {
		if (action === "shake") return "native-shake-observed";
		return "native-auto-observed";
	}

	private observedEndResult(event: AutoCompactionEndEvent): CompactionReceipt["result"] {
		if (event.errorMessage) return "error";
		if (event.aborted) return "aborted";
		if (event.skipped) return "skipped";
		return "settled";
	}

	private boundedError(message: string | undefined): string | undefined {
		if (message === undefined) return undefined;
		return message.slice(0, 500);
	}

	private fallbackSample(cycle: RequestCycle, outcome: AttemptOutcome, ctx: ExtensionContext): UsageSample | undefined {
		if (!this.isSnapcompactFailure(cycle, outcome)) return undefined;
		if (!this.hasFallbackPressure(outcome)) return undefined;
		if (!this.canFallback(cycle, ctx)) return undefined;
		return outcome.after;
	}

	private isSnapcompactFailure(cycle: RequestCycle, outcome: AttemptOutcome): boolean {
		if (cycle.mode !== "snapcompact") return false;
		return outcome.noProgress || outcome.failed;
	}

	private hasFallbackPressure(outcome: AttemptOutcome): boolean {
		if (!outcome.after) return false;
		return outcome.after.tokens >= outcome.after.triggerTokens;
	}

	private canFallback(cycle: RequestCycle, ctx: ExtensionContext): boolean {
		if (!this.isCurrent(cycle)) return false;
		if (!this.isSafe(ctx)) return false;
		return !this.nativeInFlight;
	}

	private attemptDeferral(cycle: RequestCycle, ctx: ExtensionContext, before: UsageSample): AttemptOutcome | undefined {
		if (!this.isCurrent(cycle)) return this.staleOutcome(cycle);
		if (this.attemptGateUnsafe(cycle.origin, ctx)) {
			return { receipt: this.recordDefer("deferred-pending", cycle.origin, true, before), failed: false, noProgress: false, deferred: true };
		}
		return undefined;
	}

	private attemptGateUnsafe(origin: CompactionOrigin, ctx: ExtensionContext): boolean {
		if (this.nativeInFlight) return true;
		return origin === "auto" ? this.hasPendingMessages(ctx) : !this.isSafe(ctx);
	}

	private requestClass(mode: CompactEngMode): CompactionReceipt["class"] {
		if (mode === "text") return "plugin-native-text-requested";
		return "plugin-native-snapcompact-requested";
	}

	private async requestNativeCompaction(ctx: ExtensionContext, mode: CompactEngMode): Promise<void> {
		if (mode === "snapcompact") {
			await ctx.compact({ mode: "snapcompact" });
			return;
		}
		await ctx.compact();
	}

	private staleOutcome(cycle: RequestCycle): AttemptOutcome {
		return { receipt: this.stale(cycle), failed: false, noProgress: false, deferred: false };
	}

	private errorMessage(error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		return message.slice(0, 500);
	}

	private madeNoProgress(before: UsageSample, after: UsageSample | undefined): boolean {
		if (!after) return true;
		if (before.tokens - after.tokens < this.config.minProgressTokens) return true;
		return !this.hasHeadroom(after);
	}

	private recordOutcome(cycle: RequestCycle, mode: CompactEngMode, before: UsageSample, after: UsageSample | undefined, noProgress: boolean): CompactionReceipt {
		const result = noProgress ? "no-progress" : "settled";
		const receiptClass = noProgress ? "no-progress" : "native-outcome";
		return this.record({
			class: receiptClass, source: "compact-eng-request", origin: cycle.origin, generation: cycle.generation,
			requestedMode: mode, result, before, after, noProgress,
			transition: `${this.phase}->settling`,
		});
	}

	private updateOutcomeCounts(outcome: AttemptOutcome): void {
		if (outcome.failed) {
			this.consecutiveFailures++;
			return;
		}
		if (outcome.noProgress) {
			this.noProgressCount++;
			return;
		}
		this.consecutiveFailures = 0;
		this.noProgressCount = 0;
		this.circuit = "closed";
	}

	private failureLimitReached(): boolean {
		return this.consecutiveFailures + this.noProgressCount >= this.config.maxConsecutiveFailures;
	}

	private openCircuit(): void {
		this.circuit = "open";
		this.circuitCooldownRemaining = this.config.circuitCooldownTurns;
		this.phase = "armed";
	}

	private startCooldown(): void {
		this.cooldownRemaining = this.config.cooldownTurns;
		this.phase = this.cooldownRemaining > 0 ? "cooldown" : "armed";
	}

	private readUsage(ctx: ExtensionContext): ContextUsage | undefined {
		try {
			return ctx.getContextUsage();
		} catch {
			return undefined;
		}
	}

	private isValidUsage(usage: ContextUsage | undefined): usage is ContextUsage {
		if (!usage) return false;
		if (!this.isValidTokenCount(usage.tokens)) return false;
		return this.isValidContextWindow(usage.contextWindow);
	}

	private isValidTokenCount(tokens: number): boolean {
		return Number.isFinite(tokens) && tokens >= 0;
	}

	private isValidContextWindow(contextWindow: number): boolean {
		return Number.isFinite(contextWindow) && contextWindow > 0;
	}

	private triggerTokens(percentageTrigger: number): number {
		if (this.config.watermarkTokens === null) return percentageTrigger;
		return Math.min(percentageTrigger, this.config.watermarkTokens);
	}

	private isSafe(ctx: ExtensionContext): boolean {
		try { return ctx.isIdle() && !ctx.hasPendingMessages(); } catch { return false; }
	}

	private hasPendingMessages(ctx: ExtensionContext): boolean {
		try { return ctx.hasPendingMessages(); } catch { return true; }
	}

	private isCurrent(cycle: RequestCycle): boolean {
		return cycle.epoch === this.epoch && this.inFlight === cycle;
	}

	private hasHeadroom(after: UsageSample): boolean {
		return after.tokens <= after.releaseTokens && after.tokens + this.config.outputHeadroomTokens < after.triggerTokens;
	}

	private recordDefer(result: CompactionReceipt["result"], origin: CompactionOrigin, pending = false, before = this.lastUsage): CompactionReceipt {
		return this.record({
			class: result === "circuit-open" ? "circuit-open" : "deferred", source: "compact-eng-request", origin, generation: this.generation,
			requestedMode: this.config.mode, result, before, pending, transition: `${this.phase}->${this.phase}`,
		});
	}

	private stale(cycle: RequestCycle): CompactionReceipt {
		return { class: "stale-completion", source: "compact-eng-request", origin: cycle.origin, generation: cycle.generation, result: "stale-completion", transition: `${this.phase}->${this.phase}`, turn: this.turn, at: Date.now() };
	}

	private record(receipt: Omit<CompactionReceipt, "turn" | "at">): CompactionReceipt {
		const complete = { ...receipt, turn: this.turn, at: Date.now() };
		this.lastReceipt = complete;
		return complete;
	}
}
