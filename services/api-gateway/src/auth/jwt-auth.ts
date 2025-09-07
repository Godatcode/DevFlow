import { UUID } from '@devflow/shared-types';

export interface JWTPayload {
  sub: UUID; // User ID
  email: string;
  teamId?: UUID;
  roles: string[];
  permissions: string[];
  iat: number; // Issued at
  exp: number; // Expires at
  iss: string; // Issuer
  aud: string; // Audience
}

export interface AuthResult {
  success: boolean;
  payload?: JWTPayload;
  error?: string;
}

export interface JWTConfig {
  secret: string;
  issuer: string;
  audience: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export class JWTAuthenticator {
  private config: JWTConfig;

  constructor(config: JWTConfig) {
    this.config = config;
  }

  /**
   * Generate a JWT token for a user
   */
  async generateToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.parseExpiration(this.config.expiresIn);
    
    const fullPayload: JWTPayload = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
      iss: this.config.issuer,
      aud: this.config.audience
    };

    return this.signToken(fullPayload);
  }

  /**
   * Generate a refresh token
   */
  async generateRefreshToken(userId: UUID): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.parseExpiration(this.config.refreshExpiresIn);
    
    const payload = {
      sub: userId,
      type: 'refresh',
      iat: now,
      exp: now + expiresIn,
      iss: this.config.issuer,
      aud: this.config.audience
    };

    return this.signToken(payload);
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string): Promise<AuthResult> {
    try {
      const payload = await this.verifyAndDecodeToken(token);
      
      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          success: false,
          error: 'Token expired'
        };
      }

      // Check issuer and audience
      if (payload.iss !== this.config.issuer) {
        return {
          success: false,
          error: 'Invalid issuer'
        };
      }

      if (payload.aud !== this.config.audience) {
        return {
          success: false,
          error: 'Invalid audience'
        };
      }

      return {
        success: true,
        payload: payload as JWTPayload
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid token'
      };
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string, userPayload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<{ accessToken: string; refreshToken: string } | null> {
    try {
      const decoded = await this.verifyAndDecodeToken(refreshToken);
      
      if (decoded.type !== 'refresh') {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        return null;
      }

      // Generate new tokens
      const newAccessToken = await this.generateToken(userPayload);
      const newRefreshToken = await this.generateRefreshToken(userPayload.sub);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Sign a token (simplified implementation - in production use a proper JWT library)
   */
  private async signToken(payload: any): Promise<string> {
    // In a real implementation, use a proper JWT library like jsonwebtoken
    // This is a simplified version for demonstration
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    
    const signature = await this.createSignature(`${encodedHeader}.${encodedPayload}`);
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a token (simplified implementation)
   */
  private async verifyAndDecodeToken(token: string): Promise<any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const expectedSignature = await this.createSignature(`${encodedHeader}.${encodedPayload}`);
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(encodedPayload));
    return payload;
  }

  /**
   * Create HMAC signature (simplified implementation)
   */
  private async createSignature(data: string): Promise<string> {
    // In a real implementation, use crypto.createHmac
    // This is a simplified version for demonstration
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.config.secret);
    const messageData = encoder.encode(data);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    return this.base64UrlEncode(new Uint8Array(signature));
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(data: string | Uint8Array): string {
    let base64: string;
    
    if (typeof data === 'string') {
      base64 = btoa(data);
    } else {
      base64 = btoa(String.fromCharCode(...data));
    }
    
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(data: string): string {
    let base64 = data
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    return atob(base64);
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiration format');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: throw new Error('Invalid expiration unit');
    }
  }
}