import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { openCodesightOverlay } from './overlay.ts';
import { CodesightWatcherController } from './watcher.ts';
import { registerCodesightCommands } from './tools.ts';

export type CodesightControllerProvider = (ctx: ExtensionContext) => CodesightWatcherController;

export function registerCommands(pi: ExtensionAPI, getController: CodesightControllerProvider) {
  registerCodesightCommands(pi, getController);
  pi.registerCommand('codesight', {
    description: 'Show CodeSight status, actions, and watcher settings',
    handler: async (_args, ctx) => {
      await openCodesightOverlay(ctx, getController(ctx));
    },
  });
}
