// ponytail: bundled stub for `@plannotator/webtui/server`.
//
// `@plannotator/webtui/server` top-level-imports `node-pty`, a native
// package whose bundled code embeds the build machine's `__dirname` and
// whose `.node` binary must be compiled for the consumer's platform. We
// alias the entire server subpath so Bun's bundler cannot reach those
// transitive imports, then surface `pty-unavailable` at the natural
// failure site: `agent-terminal.ts` calls `new serverModule.NodePtyBackend()`
// after a successful `Promise.all([...])`; the constructor throws, the
// existing second catch returns `reason: "pty-unavailable"`. `ws` is
// pure JS but stays covered transitively (the server subpath is the
// only entry that imports it).
//
// Ceiling: the bundled marketplace cannot launch the interactive agent
// terminal. Plan review, code review, and Markdown annotation are
// unaffected.
//
// Upstream upgrade: drop this stub + the `redirect-webtui-server` Bun
// plugin in `scripts/build-bundle.mjs` once upstream
// `@plannotator/webtui/server` stops top-level-importing `node-pty`.

export class WebtuiServerUnavailableError extends Error {
	constructor() {
		super(
			"@plannotator/webtui/server is not bundled in the plannotator " +
				"marketplace bundle. The bundled marketplace intentionally " +
				"surfaces pty-unavailable; it cannot use the host webtui install " +
				"because the stub is inlined and the real package is external.",
		);
		this.name = "WebtuiServerUnavailableError";
	}
}

function fail() {
	throw new WebtuiServerUnavailableError();
}

export class NodePtyBackend {
	constructor() {
		fail();
	}
}

export function createNodePtyWebSocketServer() {
	fail();
}

export default {
	NodePtyBackend,
	createNodePtyWebSocketServer,
};
