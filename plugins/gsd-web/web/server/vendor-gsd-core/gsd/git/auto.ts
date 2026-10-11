// Vendor-web thin surface: interactive auto runtime lives in the CLI.
export type AutoRuntime = Record<string, any>;
export const autoRuntime: AutoRuntime = {};

export function isAutoActive(): boolean { return false; }

export function checkRemoteAutoSession(...args: any[]): unknown { return null; }
export function forceStopAutoRemote(...args: any[]): Promise<void> { return Promise.resolve(); }
export function isAutoPaused(): boolean { return false; }
export function stopAutoRemote(...args: any[]): Promise<void> { return Promise.resolve(); }
export function getAutoDashboardData(...args: any[]): unknown { return {}; }
export function pauseAuto(...args: any[]): void {}
export function startAutoDetached(...args: any[]): void {}
export function stopAuto(...args: any[]): void {}
