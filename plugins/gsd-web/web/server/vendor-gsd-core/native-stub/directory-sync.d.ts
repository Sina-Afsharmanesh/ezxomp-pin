export declare function syncDirectoryEntry(path: string): void;
export declare function syncTree(path: string): void;
export interface DirectorySyncHandle {
  close(): void;
}
export declare function acquireDirectorySync(root: string): DirectorySyncHandle;
