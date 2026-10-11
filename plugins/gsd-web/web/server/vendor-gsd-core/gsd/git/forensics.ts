// Vendor-web thin surface: upstream forensics is a runtime diagnostics module
// with an interactive dependency cloud the RPC-bridged web app never executes.
// Only the completed-key splitter is consumed here.
export function splitCompletedKey(key: string): Record<string, string> {
	const idx = key.indexOf(":");
	if (idx < 0) return {};
	return { key, unit: key.slice(0, idx), unitId: key.slice(0, idx), ts: key.slice(idx + 1) };
}
