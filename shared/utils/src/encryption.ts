import { createCipher, createDecipher, createCipheriv, createDecipheriv, randomBytes, scrypt, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  salt: string;
  tag?: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  salt: string;
  tag?: string;
}

export interface KeyDerivationOptions {
  keyLength: number;
  saltLength: number;
  iterations?: number;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly TAG_LENGTH = 16; // 128 bits

  /**
   * Encrypts data using AES-256-GCM with a derived key
   */
  static async encrypt(data: string, password: string): Promise<EncryptionResult> {
    try {
      const salt = randomBytes(this.SALT_LENGTH);
      const iv = randomBytes(this.IV_LENGTH);
      
      // Derive key using scrypt
      const key = await scryptAsync(password, salt, this.KEY_LENGTH) as Buffer;
      
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypts data using AES-256-GCM with a derived key
   */
  static async decrypt(input: DecryptionInput, password: string): Promise<string> {
    try {
      const { encrypted, iv, salt, tag } = input;
      
      if (!tag) {
        throw new Error('Authentication tag is required for decryption');
      }
      
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');
      
      // Derive key using scrypt
      const key = await scryptAsync(password, saltBuffer, this.KEY_LENGTH) as Buffer;
      
      const decipher = createDecipheriv(this.ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypts data at rest using a master key
   */
  static async encryptAtRest(data: string, masterKey: string): Promise<EncryptionResult> {
    return this.encrypt(data, masterKey);
  }

  /**
   * Decrypts data at rest using a master key
   */
  static async decryptAtRest(input: DecryptionInput, masterKey: string): Promise<string> {
    return this.decrypt(input, masterKey);
  }

  /**
   * Generates a secure random key for encryption
   */
  static generateKey(length: number = this.KEY_LENGTH): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Derives a key from a password using scrypt
   */
  static async deriveKey(password: string, salt?: Buffer, options?: KeyDerivationOptions): Promise<{ key: Buffer; salt: Buffer }> {
    const actualSalt = salt || randomBytes(options?.saltLength || this.SALT_LENGTH);
    const keyLength = options?.keyLength || this.KEY_LENGTH;
    
    const key = await scryptAsync(password, actualSalt, keyLength) as Buffer;
    
    return { key, salt: actualSalt };
  }

  /**
   * Creates a hash of sensitive data for comparison without storing the original
   */
  static hashSensitiveData(data: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt || randomBytes(this.SALT_LENGTH).toString('hex');
    const hash = createHash('sha256')
      .update(data + actualSalt)
      .digest('hex');
    
    return { hash, salt: actualSalt };
  }

  /**
   * Verifies sensitive data against a hash
   */
  static verifySensitiveData(data: string, hash: string, salt: string): boolean {
    const { hash: computedHash } = this.hashSensitiveData(data, salt);
    return computedHash === hash;
  }

  /**
   * Encrypts JSON objects
   */
  static async encryptObject(obj: any, password: string): Promise<EncryptionResult> {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, password);
  }

  /**
   * Decrypts JSON objects
   */
  static async decryptObject<T = any>(input: DecryptionInput, password: string): Promise<T> {
    const jsonString = await this.decrypt(input, password);
    return JSON.parse(jsonString);
  }

  /**
   * Securely wipes sensitive data from memory
   */
  static secureWipe(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      buffer.fill(0);
    }
  }
}

export default EncryptionService;