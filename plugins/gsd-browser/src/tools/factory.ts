/**
 * src/tools/factory.ts — Pattern A tool factory (shared by W3-W7).
 *
 * Wraps pi.registerTool with the uniform envelope: typebox-style simple arg
 * schema, `{content:[{type:"text",text}], isError?, details}` result.
 * Execute handler signature: (toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult>
 */
import { Type, type TSchema } from "typebox";

export interface ToolArgSpec {
 type: "string" | "number" | "boolean" | "array";
 description: string;
 /** Omitted params fall back to settings/defaults; schema marks Type.Optional. */
 optional?: boolean;
}

export interface ToolDef {
 description: string;
 args: Record<string, ToolArgSpec>;
 /** Host approval tier; defaults to read. Side-effecting tools declare exec. */
 approval?: "read" | "exec";
 execute: (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onUpdate: ((details: unknown) => void) | undefined,
  ctx: { cwd: string }
 ) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  details?: Record<string, unknown>;
 }>;
}

interface HostLike {
 registerTool?: (definition: unknown) => void;
}

function buildSchema(args: Record<string, ToolArgSpec>): TSchema {
 const properties: Record<string, unknown> = {};
 for (const [name, spec] of Object.entries(args)) {
  let prop: TSchema =
   spec.type === "array"
    ? Type.Array(Type.Unknown(), { description: spec.description })
    : ({ type: spec.type, description: spec.description } as TSchema);
  // Optional args must be schema-optional: `{}`-style calls (snapshot with
  // defaults) are valid and must not be rejected by host-side validation.
  if (spec.optional) prop = Type.Optional(prop);
  properties[name] = prop;
 }
 // Hand-rolled property map: typebox's TProperties is structurally this record.
 return Type.Object(properties as never, { additionalProperties: false });
}

/** Register one tool through the uniform envelope; no-op when host lacks registerTool. */
export function registerTool(pi: unknown, name: string, def: ToolDef): void {
 const host = pi as HostLike;
 if (typeof host.registerTool !== "function") return;

 const schema = buildSchema(def.args);
 host.registerTool({
  name,
  description: def.description,
  label: name,
  parameters: schema,
  approval: (def.approval ?? "read") as "read" | "exec",
  execute: async (...args: unknown[]) => {
   // Support both the new OMP 5-arg signature and the old 1-arg test signature
   let toolCallId: string;
   let params: Record<string, unknown>;
   let signal: AbortSignal | undefined;
   let onUpdate: ((details: unknown) => void) | undefined;
   let ctx: { cwd: string };

   if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    // Old test style: execute(params)
    params = args[0] as Record<string, unknown>;
    toolCallId = "";
    signal = undefined;
    onUpdate = undefined;
    ctx = { cwd: process.cwd() };
   } else {
    // New OMP style: execute(toolCallId, params, signal, onUpdate, ctx)
    toolCallId = args[0] as string;
    params = args[1] as Record<string, unknown>;
    signal = args[2] as AbortSignal | undefined;
    onUpdate = args[3] as ((details: unknown) => void) | undefined;
    ctx = args[4] as { cwd: string };
   }

   return def.execute(toolCallId, params, signal, onUpdate, ctx);
  },
 });
}
