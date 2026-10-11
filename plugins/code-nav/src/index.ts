import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import { clearCache } from './cache.ts';
import { registerPiLspCommands } from './commands.ts';
import { registerPiLspTools } from './tools.ts';
import { resetState } from './state.ts';

export default function register(pi: ExtensionAPI): void {
  registerPiLspTools(pi);
  registerPiLspCommands(pi);
  pi.on('session_start', () => {
    clearCache();
    resetState();
  });
  pi.on('session_shutdown', () => {
    clearCache();
    resetState();
  });
}
