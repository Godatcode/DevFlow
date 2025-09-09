import { randomBytes, createHash } from 'crypto';
import { EncryptionService, EncryptionResult, DecryptionInput } from './encryption';

export interface KeyMetadata {
  id: string;
  purpose: KeyPurpose;
  algorithm: string;
  keyLength: number;
  createdAt: Date;
  expiresAt?: Date;
  rotationSchedule?: RotationSchedule;
  isActive: boolean;
}

export interface HSMConfig {
  provider: HSMProvider;
  endpoint: string;
  credentials: HSMCredentials;
  partition?: string;
  slot?: number;
}

export interface HSMCredentials {
  username?: string;
  password?: string;
  token?: string;
  certificatePath?: string;
  privateKeyPath?: string;
}

export interface RotationSchedule {
  intervalDays: number;
  nextRotation: Date;
  autoRotate: boolean;
}

export enum KeyPurpose {
  DATA_ENCRYPTION = 'data_encryption',
  DATABASE_ENCRYPTION = 'database_encryption',
  JWT_SIGNING = 'jwt_signing',
  API_AUTHENTICATION = 'api_authentication',
  WEBHOOK_SIGNING = 'webhook_signing',
  BACKUP_ENCRYPTION = 'backup_encryption'
}

export enum HSMProvider {
  AWS_CLOUDHSM = 'aws_cloudhsm',
  AZURE_DEDICATED_HSM = 'azure_dedicated_hsm',
  GCP_CLOUD_HSM = 'gcp_cloud_hsm',
  THALES_LUNA = 'thales_luna',
  UTIMACO = 'utimaco',
  SOFTWARE_MOCK = 'software_mock' // For development/testing
}

export enum KeyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  COMPROMISED = 'compromised',
  EXPIRED = 'expired',
  PENDING_ROTATION = 'pending_rotation'
}

export class KeyManagementService {
  private static instance: KeyManagementService;
  private hsmConfig?: HSMConfig;
  private keyStore: Map<string, KeyMetadata> = new Map();
  private encryptedKeys: Map<string, EncryptionResult> = new Map();
  private masterKey: string;

  private constructor(masterKey: string, hsmConfig?: HSMConfig) {
    this.masterKey = masterKey;
    this.hsmConfig = hsmConfig;
    this.initializeKeyStore();
  }

  static getInstance(masterKey?: string, hsmConfig?: HSMConfig): KeyManagementService {
    if (!KeyManagementService.instance) {
      if (!masterKey) {
        throw new Error('Master key is required for first initialization');
      }
      KeyManagementService.instance = new KeyManagementService(masterKey, hsmConfig);
    }
    return KeyManagementService.instance;
  }

  private initializeKeyStore(): void {
    // Initialize with default system keys
    this.createSystemKeys();
  }

  private createSystemKeys(): void {
    const systemKeys = [
      { purpose: KeyPurpose.DATA_ENCRYPTION, rotationDays: 90 },
      { purpose: KeyPurpose.DATABASE_ENCRYPTION, rotationDays: 180 },
      { purpose: KeyPurpose.JWT_SIGNING, rotationDays: 30 },
      { purpose: KeyPurpose.API_AUTHENTICATION, rotationDays: 60 },
      { purpose: KeyPurpose.WEBHOOK_SIGNING, rotationDays: 90 },
      { purpose: KeyPurpose.BACKUP_ENCRYPTION, rotationDays: 365 }
    ];

    systemKeys.forEach(({ purpose, rotationDays }) => {
      this.generateKey(purpose, {
        intervalDays: rotationDays,
        nextRotation: new Date(Date.now() + rotationDays * 24 * 60 * 60 * 1000),
        autoRotate: true
      });
    });
  }

  /**
   * Generates a new encryption key
   */
  async generateKey(purpose: KeyPurpose, rotationSchedule?: RotationSchedule): Promise<string> {
    const keyId = this.generateKeyId();
    const keyData = EncryptionService.generateKey(32); // 256-bit key
    
    const metadata: KeyMetadata = {
      id: keyId,
      purpose,
      algorithm: 'AES-256-GCM',
      keyLength: 256,
      createdAt: new Date(),
      rotationSchedule,
      isActive: true
    };

    // Store key metadata
    this.keyStore.set(keyId, metadata);

    // Encrypt and store the actual key
    if (this.hsmConfig && this.hsmConfig.provider !== HSMProvider.SOFTWARE_MOCK) {
      await this.storeKeyInHSM(keyId, keyData);
    } else {
      // Fallback to software encryption
      const encryptedKey = await EncryptionService.encrypt(keyData, this.masterKey);
      this.encryptedKeys.set(keyId, encryptedKey);
    }

    return keyId;
  }

  /**
   * Retrieves a key by ID
   */
  async getKey(keyId: string): Promise<string> {
    const metadata = this.keyStore.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    if (!metadata.isActive) {
      throw new Error(`Key is not active: ${keyId}`);
    }

    if (metadata.expiresAt && metadata.expiresAt < new Date()) {
      throw new Error(`Key has expired: ${keyId}`);
    }

    if (this.hsmConfig && this.hsmConfig.provider !== HSMProvider.SOFTWARE_MOCK) {
      return this.retrieveKeyFromHSM(keyId);
    } else {
      const encryptedKey = this.encryptedKeys.get(keyId);
      if (!encryptedKey) {
        throw new Error(`Encrypted key not found: ${keyId}`);
      }
      return EncryptionService.decrypt(encryptedKey, this.masterKey);
    }
  }

  /**
   * Gets the active key for a specific purpose
   */
  async getActiveKeyForPurpose(purpose: KeyPurpose): Promise<string> {
    for (const [keyId, metadata] of this.keyStore.entries()) {
      if (metadata.purpose === purpose && metadata.isActive) {
        return this.getKey(keyId);
      }
    }
    throw new Error(`No active key found for purpose: ${purpose}`);
  }

  /**
   * Rotates a key
   */
  async rotateKey(keyId: string): Promise<string> {
    const oldMetadata = this.keyStore.get(keyId);
    if (!oldMetadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    // Generate new key with same purpose
    const newKeyId = await this.generateKey(oldMetadata.purpose, oldMetadata.rotationSchedule);

    // Mark old key as inactive
    oldMetadata.isActive = false;
    this.keyStore.set(keyId, oldMetadata);

    // Update rotation schedule for new key
    if (oldMetadata.rotationSchedule) {
      const newMetadata = this.keyStore.get(newKeyId);
      if (newMetadata) {
        newMetadata.rotationSchedule = {
          ...oldMetadata.rotationSchedule,
          nextRotation: new Date(Date.now() + oldMetadata.rotationSchedule.intervalDays * 24 * 60 * 60 * 1000)
        };
        this.keyStore.set(newKeyId, newMetadata);
      }
    }

    return newKeyId;
  }

  /**
   * Checks for keys that need rotation
   */
  async checkKeyRotation(): Promise<string[]> {
    const keysToRotate: string[] = [];
    const now = new Date();

    for (const [keyId, metadata] of this.keyStore.entries()) {
      if (metadata.isActive && metadata.rotationSchedule?.autoRotate) {
        if (metadata.rotationSchedule.nextRotation <= now) {
          keysToRotate.push(keyId);
        }
      }
    }

    return keysToRotate;
  }

  /**
   * Performs automatic key rotation
   */
  async performAutoRotation(): Promise<{ rotated: string[]; failed: string[] }> {
    const keysToRotate = await this.checkKeyRotation();
    const rotated: string[] = [];
    const failed: string[] = [];

    for (const keyId of keysToRotate) {
      try {
        const newKeyId = await this.rotateKey(keyId);
        rotated.push(newKeyId);
      } catch (error) {
        failed.push(keyId);
        console.error(`Failed to rotate key ${keyId}:`, error);
      }
    }

    return { rotated, failed };
  }

  /**
   * Lists all keys with their metadata
   */
  listKeys(purpose?: KeyPurpose, activeOnly: boolean = true): KeyMetadata[] {
    const keys: KeyMetadata[] = [];
    
    for (const metadata of this.keyStore.values()) {
      if (purpose && metadata.purpose !== purpose) continue;
      if (activeOnly && !metadata.isActive) continue;
      
      keys.push({ ...metadata });
    }

    return keys.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Revokes a key (marks as compromised)
   */
  async revokeKey(keyId: string, reason: string = 'Manual revocation'): Promise<void> {
    const metadata = this.keyStore.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    metadata.isActive = false;
    this.keyStore.set(keyId, metadata);

    // If using HSM, also revoke there
    if (this.hsmConfig && this.hsmConfig.provider !== HSMProvider.SOFTWARE_MOCK) {
      await this.revokeKeyInHSM(keyId);
    } else {
      // Remove from local storage
      this.encryptedKeys.delete(keyId);
    }

    console.warn(`Key ${keyId} revoked: ${reason}`);
  }

  /**
   * Generates a unique key ID
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `key_${timestamp}_${random}`;
  }

  /**
   * Stores key in HSM (mock implementation)
   */
  private async storeKeyInHSM(keyId: string, keyData: string): Promise<void> {
    if (!this.hsmConfig) {
      throw new Error('HSM not configured');
    }

    // This is a mock implementation
    // In a real implementation, this would use the HSM provider's SDK
    switch (this.hsmConfig.provider) {
      case HSMProvider.AWS_CLOUDHSM:
        // AWS CloudHSM implementation
        break;
      case HSMProvider.AZURE_DEDICATED_HSM:
        // Azure Dedicated HSM implementation
        break;
      case HSMProvider.GCP_CLOUD_HSM:
        // GCP Cloud HSM implementation
        break;
      case HSMProvider.SOFTWARE_MOCK:
        // Mock implementation for testing
        const encryptedKey = await EncryptionService.encrypt(keyData, this.masterKey);
        this.encryptedKeys.set(keyId, encryptedKey);
        break;
      default:
        throw new Error(`Unsupported HSM provider: ${this.hsmConfig.provider}`);
    }
  }

  /**
   * Retrieves key from HSM (mock implementation)
   */
  private async retrieveKeyFromHSM(keyId: string): Promise<string> {
    if (!this.hsmConfig) {
      throw new Error('HSM not configured');
    }

    // This is a mock implementation
    switch (this.hsmConfig.provider) {
      case HSMProvider.SOFTWARE_MOCK:
        const encryptedKey = this.encryptedKeys.get(keyId);
        if (!encryptedKey) {
          throw new Error(`Key not found in HSM: ${keyId}`);
        }
        return EncryptionService.decrypt(encryptedKey, this.masterKey);
      default:
        throw new Error(`HSM key retrieval not implemented for: ${this.hsmConfig.provider}`);
    }
  }

  /**
   * Revokes key in HSM (mock implementation)
   */
  private async revokeKeyInHSM(keyId: string): Promise<void> {
    if (!this.hsmConfig) {
      throw new Error('HSM not configured');
    }

    switch (this.hsmConfig.provider) {
      case HSMProvider.SOFTWARE_MOCK:
        this.encryptedKeys.delete(keyId);
        break;
      default:
        // Implementation would depend on HSM provider
        break;
    }
  }
}

export default KeyManagementService;