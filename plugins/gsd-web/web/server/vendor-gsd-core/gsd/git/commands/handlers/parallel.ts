// Vendor-web thin surface: interactive command handlers live in the CLI runtime.
// The RPC-bridged web app resolves /gsd commands through server/bridge, not these.
import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
export async function handleParallelCommand(_args: string, _ctx: ExtensionCommandContext, _pi?: unknown): Promise<void> {}
