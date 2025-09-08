// Global type declarations for integration service

declare global {
  interface Response {
    json(): Promise<any>;
  }
}

// API response types
export interface ApiResponse {
  [key: string]: any;
}

export interface OAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface SlackResponse {
  ok?: boolean;
  error?: string;
  [key: string]: any;
}

export {};