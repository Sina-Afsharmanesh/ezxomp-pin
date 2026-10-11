// Minimal host mock so tool modules importing @oh-my-pi/pi-coding-agent in
// tests resolve without the real extension host (cook vitest alias precedent).
export const registerToolCalls: unknown[] = [];

export const ExtensionAPI = class {};
