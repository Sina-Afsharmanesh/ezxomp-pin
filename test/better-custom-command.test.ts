import { describe, expect, test } from "bun:test";
import customProviderWizard, { createCustomProviderHandler } from "../plugins/better-custom/src/index.ts";

type CommandSpec = {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
};

type Notice = { message: string; type?: string };

function commandProbe(): { api: unknown; commands: Map<string, CommandSpec> } {
  const commands = new Map<string, CommandSpec>();
  return {
    api: {
      registerCommand: (name: string, command: CommandSpec) => commands.set(name, command),
    },
    commands,
  };
}

function commandContext(hasUI = true, mode = "tui"): { ctx: unknown; notices: Notice[] } {
  const notices: Notice[] = [];
  return {
    ctx: {
      hasUI,
      mode,
      ui: {
        notify(message: string, type?: string) {
          notices.push({ message, type });
        },
      },
    },
    notices,
  };
}

describe("better-custom command", () => {
  test("default export registers an async /custom-provider handler", async () => {
    const { api, commands } = commandProbe();

    expect(customProviderWizard).toBeTypeOf("function");
    customProviderWizard(api as never);

    const command = commands.get("custom-provider");
    expect(command?.description).toContain("custom providers");
    expect(command?.handler).toBeTypeOf("function");
    const { ctx } = commandContext(false, "print");
    await expect(command!.handler("", ctx)).resolves.toBeUndefined();
  });

  test("dispatches the selected add, edit, or delete flow", async () => {
    for (const action of ["add", "edit", "delete"] as const) {
      const calls: string[] = [];
      const handler = createCustomProviderHandler({
        selectAction: async () => action,
        addProviderFlow: async () => {
          calls.push("add");
          return true;
        },
        editProviderFlow: async () => {
          calls.push("edit");
          return true;
        },
        deleteProviderFlow: async () => {
          calls.push("delete");
          return true;
        },
      });

      const { ctx } = commandContext();
      await handler("", ctx as never);
      expect(calls).toEqual([action]);
    }
  });

  test("returns cleanly when the action picker is canceled", async () => {
    let flowCalls = 0;
    const handler = createCustomProviderHandler({
      selectAction: async () => null,
      addProviderFlow: async () => {
        flowCalls += 1;
        return true;
      },
    });

    const { ctx, notices } = commandContext();
    await expect(handler("", ctx as never)).resolves.toBeUndefined();
    expect(flowCalls).toBe(0);
    expect(notices).toEqual([]);
  });

  test("rejects non-interactive mode without invoking a flow or writing config", async () => {
    let pickerCalls = 0;
    let flowCalls = 0;
    let configWrites = 0;
    const handler = createCustomProviderHandler({
      selectAction: async () => {
        pickerCalls += 1;
        return "add";
      },
      addProviderFlow: async () => {
        flowCalls += 1;
        configWrites += 1;
        return true;
      },
    });

    const { ctx, notices } = commandContext(false, "print");
    await handler("", ctx as never);

    expect(pickerCalls).toBe(0);
    expect(flowCalls).toBe(0);
    expect(configWrites).toBe(0);
    expect(notices).toEqual([{
      message: "The custom-provider wizard requires interactive TUI mode.",
      type: "info",
    }]);
  });

  test("notifies and does not write config when a flow throws", async () => {
    let configWrites = 0;
    const handler = createCustomProviderHandler({
      selectAction: async () => "add",
      addProviderFlow: async () => {
        throw new Error("unexpected flow failure");
      },
      editProviderFlow: async () => {
        configWrites += 1;
        return true;
      },
      deleteProviderFlow: async () => {
        configWrites += 1;
        return true;
      },
    });

    const { ctx, notices } = commandContext();
    await expect(handler("", ctx as never)).resolves.toBeUndefined();
    expect(configWrites).toBe(0);
    expect(notices).toEqual([{
      message: "The custom-provider wizard could not complete.",
      type: "error",
    }]);
  });
});
