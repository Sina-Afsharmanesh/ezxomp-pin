/**
 * Minimal auth-storage surface for @gsd/pi-coding-agent used by gsd-web service layer.
 */

export interface AuthCredential {
  type: string;
  [key: string]: unknown;
}

export interface ApiKeyCredential extends AuthCredential {
  type: "api_key";
  key: string;
}

export interface OAuthCredential extends AuthCredential {
  type: "oauth";
  [key: string]: unknown;
}

export const AuthStorage = {
  create: (path: string) => ({
    getCredentialsForProvider: (providerId: string) => [],
  }),
  inMemory: (config: Record<string, unknown>) => ({
    getCredentialsForProvider: (providerId: string) => [],
  }),
};
