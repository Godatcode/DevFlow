import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from '../encryption';

describe('EncryptionService', () => {
  const testData = 'This is sensitive test data that needs encryption';
  const testPassword = 'test-password-123';
  const testObject = { 
    userId: '12345', 
    email: 'test@example.com', 
    sensitiveData: 'secret information' 
  };

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      
      const decrypted = await EncryptionService.decrypt(encrypted, testPassword);
      expect(decrypted).toBe(testData);
    });

    it('should produce different encrypted results for same data', async () => {
      const encrypted1 = await EncryptionService.encrypt(testData, testPassword);
      const encrypted2 = await EncryptionService.encrypt(testData, testPassword);
      
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it('should fail decryption with wrong password', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      await expect(
        EncryptionService.decrypt(encrypted, 'wrong-password')
      ).rejects.toThrow('Decryption failed');
    });

    it('should fail decryption with tampered data', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      // Tamper with encrypted data
      const tamperedEncrypted = {
        ...encrypted,
        encrypted: encrypted.encrypted.slice(0, -2) + '00'
      };
      
      await expect(
        EncryptionService.decrypt(tamperedEncrypted, testPassword)
      ).rejects.toThrow('Decryption failed');
    });

    it('should fail decryption without authentication tag', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      const withoutTag = {
        ...encrypted,
        tag: undefined
      };
      
      await expect(
        EncryptionService.decrypt(withoutTag, testPassword)
      ).rejects.toThrow('Authentication tag is required');
    });
  });

  describe('encryptAtRest and decryptAtRest', () => {
    const masterKey = 'master-key-for-data-at-rest-encryption';

    it('should encrypt and decrypt data at rest', async () => {
      const encrypted = await EncryptionService.encryptAtRest(testData, masterKey);
      const decrypted = await EncryptionService.decryptAtRest(encrypted, masterKey);
      
      expect(decrypted).toBe(testData);
    });

    it('should fail with wrong master key', async () => {
      const encrypted = await EncryptionService.encryptAtRest(testData, masterKey);
      
      await expect(
        EncryptionService.decryptAtRest(encrypted, 'wrong-master-key')
      ).rejects.toThrow('Decryption failed');
    });
  });

  describe('encryptObject and decryptObject', () => {
    it('should encrypt and decrypt JSON objects', async () => {
      const encrypted = await EncryptionService.encryptObject(testObject, testPassword);
      const decrypted = await EncryptionService.decryptObject(encrypted, testPassword);
      
      expect(decrypted).toEqual(testObject);
    });

    it('should handle complex nested objects', async () => {
      const complexObject = {
        user: {
          id: 123,
          profile: {
            name: 'John Doe',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        metadata: {
          created: new Date().toISOString(),
          tags: ['sensitive', 'encrypted']
        }
      };

      const encrypted = await EncryptionService.encryptObject(complexObject, testPassword);
      const decrypted = await EncryptionService.decryptObject(encrypted, testPassword);
      
      expect(decrypted).toEqual(complexObject);
    });
  });

  describe('generateKey', () => {
    it('should generate keys of correct length', () => {
      const key32 = EncryptionService.generateKey(32);
      const key16 = EncryptionService.generateKey(16);
      
      expect(key32).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(key16).toHaveLength(32); // 16 bytes = 32 hex characters
    });

    it('should generate different keys each time', () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('deriveKey', () => {
    it('should derive consistent keys from same password and salt', async () => {
      const password = 'test-password';
      const { key: key1, salt } = await EncryptionService.deriveKey(password);
      const { key: key2 } = await EncryptionService.deriveKey(password, salt);
      
      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys with different salts', async () => {
      const password = 'test-password';
      const { key: key1 } = await EncryptionService.deriveKey(password);
      const { key: key2 } = await EncryptionService.deriveKey(password);
      
      expect(key1.equals(key2)).toBe(false);
    });

    it('should respect custom key length', async () => {
      const { key } = await EncryptionService.deriveKey('password', undefined, { 
        keyLength: 16, 
        saltLength: 16 
      });
      
      expect(key).toHaveLength(16);
    });
  });

  describe('hashSensitiveData and verifySensitiveData', () => {
    const sensitiveData = 'user-password-123';

    it('should hash and verify sensitive data', () => {
      const { hash, salt } = EncryptionService.hashSensitiveData(sensitiveData);
      
      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex string
      
      const isValid = EncryptionService.verifySensitiveData(sensitiveData, hash, salt);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong data', () => {
      const { hash, salt } = EncryptionService.hashSensitiveData(sensitiveData);
      
      const isValid = EncryptionService.verifySensitiveData('wrong-data', hash, salt);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes with different salts', () => {
      const { hash: hash1, salt: salt1 } = EncryptionService.hashSensitiveData(sensitiveData);
      const { hash: hash2, salt: salt2 } = EncryptionService.hashSensitiveData(sensitiveData);
      
      expect(hash1).not.toBe(hash2);
      expect(salt1).not.toBe(salt2);
    });

    it('should produce consistent hash with same salt', () => {
      const { hash: hash1, salt } = EncryptionService.hashSensitiveData(sensitiveData);
      const { hash: hash2 } = EncryptionService.hashSensitiveData(sensitiveData, salt);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('secureWipe', () => {
    it('should wipe buffer contents', () => {
      const buffer = Buffer.from('sensitive data');
      const originalData = buffer.toString();
      
      EncryptionService.secureWipe(buffer);
      
      expect(buffer.toString()).not.toBe(originalData);
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    it('should handle empty buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      
      expect(() => {
        EncryptionService.secureWipe(emptyBuffer);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle encryption errors gracefully', async () => {
      // Test that empty strings can be encrypted (this is valid)
      const result = await EncryptionService.encrypt('', 'password');
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.tag).toBeDefined();
      
      // Test decryption of empty string
      const decrypted = await EncryptionService.decrypt(result, 'password');
      expect(decrypted).toBe('');
    });

    it('should handle malformed decryption input', async () => {
      const malformedInput = {
        encrypted: 'invalid-hex',
        iv: 'invalid-hex',
        salt: 'invalid-hex',
        tag: 'invalid-hex'
      };
      
      await expect(
        EncryptionService.decrypt(malformedInput, testPassword)
      ).rejects.toThrow('Decryption failed');
    });
  });

  describe('performance', () => {
    it('should encrypt and decrypt within reasonable time', async () => {
      const largeData = 'x'.repeat(10000); // 10KB of data
      
      const startTime = Date.now();
      const encrypted = await EncryptionService.encrypt(largeData, testPassword);
      const decrypted = await EncryptionService.decrypt(encrypted, testPassword);
      const endTime = Date.now();
      
      expect(decrypted).toBe(largeData);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});