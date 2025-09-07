import { UUID } from '@devflow/shared-types';

export interface MFAConfig {
  enabled: boolean;
  methods: MFAMethod[];
  gracePeriod: number; // seconds
  backupCodes: {
    enabled: boolean;
    count: number;
  };
}

export interface MFAMethod {
  type: 'totp' | 'sms' | 'email' | 'backup-codes';
  enabled: boolean;
  config?: Record<string, any>;
}

export interface MFAChallenge {
  id: UUID;
  userId: UUID;
  method: string;
  code: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

export interface MFAVerificationResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  backupCodesRemaining?: number;
}

export interface TOTPSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export class MFAManager {
  private config: MFAConfig;
  private challenges: Map<UUID, MFAChallenge> = new Map();
  private userSecrets: Map<UUID, string> = new Map();
  private userBackupCodes: Map<UUID, Set<string>> = new Map();

  constructor(config: MFAConfig) {
    this.config = config;
  }

  /**
   * Check if MFA is required for a user
   */
  isMFARequired(userId: UUID, userRoles: string[]): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Require MFA for admin roles
    const adminRoles = ['super-admin', 'team-admin'];
    return userRoles.some(role => adminRoles.includes(role));
  }

  /**
   * Generate TOTP secret for a user
   */
  async generateTOTPSecret(userId: UUID, userEmail: string): Promise<TOTPSecret> {
    const secret = this.generateRandomSecret();
    const issuer = 'DevFlow.ai';
    const label = `${issuer}:${userEmail}`;
    
    // Store the secret
    this.userSecrets.set(userId, secret);
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    this.userBackupCodes.set(userId, new Set(backupCodes));
    
    // Generate QR code URL (in production, use a proper QR code library)
    const qrCodeUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    
    return {
      secret,
      qrCode: qrCodeUrl,
      backupCodes
    };
  }

  /**
   * Verify TOTP code
   */
  async verifyTOTP(userId: UUID, code: string): Promise<MFAVerificationResult> {
    const secret = this.userSecrets.get(userId);
    if (!secret) {
      return {
        success: false,
        error: 'TOTP not configured for user'
      };
    }

    // Generate current TOTP code (simplified implementation)
    const currentCode = this.generateTOTPCode(secret);
    const previousCode = this.generateTOTPCode(secret, -1); // Allow previous window
    const nextCode = this.generateTOTPCode(secret, 1); // Allow next window

    if (code === currentCode || code === previousCode || code === nextCode) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Invalid TOTP code'
    };
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: UUID, code: string): Promise<MFAVerificationResult> {
    const backupCodes = this.userBackupCodes.get(userId);
    if (!backupCodes) {
      return {
        success: false,
        error: 'Backup codes not configured'
      };
    }

    if (backupCodes.has(code)) {
      // Remove used backup code
      backupCodes.delete(code);
      
      return {
        success: true,
        backupCodesRemaining: backupCodes.size
      };
    }

    return {
      success: false,
      error: 'Invalid backup code'
    };
  }

  /**
   * Create MFA challenge for SMS/Email
   */
  async createChallenge(userId: UUID, method: 'sms' | 'email', contact: string): Promise<UUID> {
    const challengeId = this.generateUUID();
    const code = this.generateRandomCode(6);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const challenge: MFAChallenge = {
      id: challengeId,
      userId,
      method,
      code,
      expiresAt,
      attempts: 0,
      maxAttempts: 3
    };

    this.challenges.set(challengeId, challenge);

    // Send the code (in production, integrate with SMS/Email service)
    await this.sendChallenge(method, contact, code);

    return challengeId;
  }

  /**
   * Verify challenge code
   */
  async verifyChallenge(challengeId: UUID, code: string): Promise<MFAVerificationResult> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      return {
        success: false,
        error: 'Challenge not found'
      };
    }

    // Check if challenge is expired
    if (new Date() > challenge.expiresAt) {
      this.challenges.delete(challengeId);
      return {
        success: false,
        error: 'Challenge expired'
      };
    }

    // Check attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      this.challenges.delete(challengeId);
      return {
        success: false,
        error: 'Too many attempts'
      };
    }

    challenge.attempts++;

    if (challenge.code === code) {
      this.challenges.delete(challengeId);
      return { success: true };
    }

    return {
      success: false,
      error: 'Invalid code',
      remainingAttempts: challenge.maxAttempts - challenge.attempts
    };
  }

  /**
   * Get available MFA methods for a user
   */
  getAvailableMethods(userId: UUID): MFAMethod[] {
    const methods: MFAMethod[] = [];

    // TOTP
    if (this.userSecrets.has(userId)) {
      methods.push({
        type: 'totp',
        enabled: true
      });
    }

    // Backup codes
    const backupCodes = this.userBackupCodes.get(userId);
    if (backupCodes && backupCodes.size > 0) {
      methods.push({
        type: 'backup-codes',
        enabled: true,
        config: { remaining: backupCodes.size }
      });
    }

    return methods;
  }

  /**
   * Disable MFA for a user
   */
  async disableMFA(userId: UUID): Promise<void> {
    this.userSecrets.delete(userId);
    this.userBackupCodes.delete(userId);
    
    // Remove any active challenges
    for (const [challengeId, challenge] of this.challenges.entries()) {
      if (challenge.userId === userId) {
        this.challenges.delete(challengeId);
      }
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: UUID): Promise<string[]> {
    const backupCodes = this.generateBackupCodes();
    this.userBackupCodes.set(userId, new Set(backupCodes));
    return backupCodes;
  }

  /**
   * Generate random secret for TOTP
   */
  private generateRandomSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  /**
   * Generate TOTP code (simplified implementation)
   */
  private generateTOTPCode(secret: string, timeOffset: number = 0): string {
    // This is a simplified implementation
    // In production, use a proper TOTP library like otplib
    const time = Math.floor(Date.now() / 1000 / 30) + timeOffset;
    const hash = this.simpleHash(secret + time.toString());
    return (hash % 1000000).toString().padStart(6, '0');
  }

  /**
   * Simple hash function (replace with proper HMAC in production)
   */
  private simpleHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.config.backupCodes.count; i++) {
      codes.push(this.generateRandomCode(8));
    }
    return codes;
  }

  /**
   * Generate random code
   */
  private generateRandomCode(length: number): string {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Generate UUID (simplified implementation)
   */
  private generateUUID(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Send challenge code (mock implementation)
   */
  private async sendChallenge(method: 'sms' | 'email', contact: string, code: string): Promise<void> {
    // In production, integrate with SMS/Email service
    console.log(`Sending ${method} challenge to ${contact}: ${code}`);
  }

  /**
   * Clean up expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = new Date();
    for (const [challengeId, challenge] of this.challenges.entries()) {
      if (now > challenge.expiresAt) {
        this.challenges.delete(challengeId);
      }
    }
  }
}