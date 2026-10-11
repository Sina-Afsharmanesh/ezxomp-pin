/**
 * Shared test helpers for Agent Experience phase test scripts.
 *
 * These scripts run under Bun (Node cannot strip types for the source-shipped
 * @oh-my-pi/* packages under node_modules). The zod mock lets
 * registerAgentExperienceConversationalTools build its parameter schemas
 * without a real zod instance.
 */

/** Chainable zod-shaped stub: every terminal/intermediate method returns the chain. */
function zodChain() {
	const chain = {};
	for (const m of ["optional", "default", "describe", "min", "max", "int", "nonempty", "array", "union", "literal", "record", "nullable"]) {
		chain[m] = () => chain;
	}
	return chain;
}

/** Minimal zod stub covering the schema shapes the conversational tools build. */
export const zodStub = {
	object: (shape) => shape,
	string: () => zodChain(),
	boolean: () => zodChain(),
	number: () => zodChain(),
	enum: () => zodChain(),
	array: () => zodChain(),
	union: () => zodChain(),
	literal: () => zodChain(),
	record: () => zodChain(),
	nullable: () => zodChain(),
};

/**
 * Build a fakePi with the minimum surface the Agent Experience extension
 * touches during registration. Callers can spread/override fields for
 * phase-specific needs (e.g. extra hooks, model metadata).
 */
export function makeFakePi({ commands = new Map(), handlers = new Map(), tools = new Map() } = {}) {
	return {
		zod: zodStub,
		registerCommand(name, options) { commands.set(name, options); },
		registerTool(definition) { tools.set(definition.name, definition); },
		on(event, handler) { handlers.set(event, handler); },
		registerShortcut() { throw new Error("Agent Experience must not register shortcuts"); },
		registerFlag() { throw new Error("Agent Experience must not register flags"); },
	};
}
