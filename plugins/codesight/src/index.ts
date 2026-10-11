import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { registerCommands } from './commands.ts';
import { registerCodesightTools, registerSessionNotice } from './tools.ts';
import { CodesightWatcherController } from './watcher.ts';
import { getCodesightRunner } from './codesight.ts';

export default function register(pi: ExtensionAPI) {
  let controller: CodesightWatcherController | undefined;
  const getController = (ctx: ExtensionContext) => {
    if (!controller || controller.root !== ctx.cwd) {
      controller = new CodesightWatcherController(ctx, { runner: getCodesightRunner() });
    }
    return controller;
  };

  registerCodesightTools(pi, getController);
  registerCommands(pi, getController);
  registerSessionNotice(pi, getController);
}
