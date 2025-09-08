// Utility functions for handling API responses

export function asApiResponse(data: unknown): any {
  return data as any;
}

export function asOAuthResponse(data: unknown): {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
} {
  return data as any;
}

export function asSlackResponse(data: unknown): {
  ok?: boolean;
  error?: string;
  [key: string]: any;
} {
  return data as any;
}

export function asArrayResponse(data: unknown): any[] {
  return (data as any) || [];
}