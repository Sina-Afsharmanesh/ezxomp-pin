// Type declarations for the in-tree ESM wrapper around the vendored js-yaml CJS package.
// js-yaml@4.3.1 ships CJS only and we do not depend on @types/js-yaml in production.
// This file mirrors just the two functions evo uses (load + dump) so the import is typed
// without pulling the full @types/js-yaml surface into the plugin.

export interface DumpOptions {
  lineWidth?: number;
  noRefs?: boolean;
  indent?: number;
}

export function load(input: string): unknown;
export function dump(input: unknown, options?: DumpOptions): string;

declare const _default: {
  load: typeof load;
  dump: typeof dump;
};
export default _default;
