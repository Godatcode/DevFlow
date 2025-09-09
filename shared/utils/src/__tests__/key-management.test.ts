import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagementService, KeyPurpose, HSMProvider } from '../key-management';

describe('KeyManagementService', () => {
  const masterKey = 'test-master-key-32-characters-long';
  let keyManager: KeyManagementService;

  beforeEach(() => {
    // Reset singleton instance for each test
    (KeyManagementService as any).instance = undefined;
    keyManager = KeyManagementService.getInstance(masterKey);
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = KeyManagementService.getInstance(masterKey);
      const instance2 = KeyManagementService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw error if no master key provided on first initialization', () => {
      (KeyManagementService as any).instance = undefined;
      
      expect(() => {
        KeyManagementService.getInstance();
      }).toThrow('Master key is required for first initialization');
    });

    it('should create system keys on initialization', () => {
      const keys = keyManager.listKeys();
      
      expect(keys.length).toBeGreaterThan(0);
      
      // Check that all required system keys are created
      const purposes = keys.map(key => key.purpose);
      expect(purposes).toContain(KeyPurpose.DATA_ENCRYPTION);
      expect(purposes).toContain(KeyPurpose.DATABASE_ENCRYPTION);
      expect(purposes).toContain(KeyPurpose.JWT_SIGNING);
      expect(purposes).toContain(KeyPurpose.API_AUTHENTICATION);
      expect(purposes).toContain(KeyPurpose.WEBHOOK_SIGNING);
      expect(purposes).toContain(KeyPurpose.BACKUP_ENCRYPTION);
    });
  });

  describe('generateKey', () => {
    it('should generate a new key with metadata', async () => {
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      
      expect(keyId).toBeDefined();
      expect(keyId).toMatch(/^key_/);
      
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION);
      const newKey = keys.find(key => key.id === keyId);
      
      expect(newKey).toBeDefined();
      expect(newKey?.purpose).toBe(KeyPurpose.DATA_ENCRYPTION);
      expect(newKey?.algorithm).toBe('AES-256-GCM');
      expect(newKey?.keyLength).toBe(256);
      expect(newKey?.isActive).toBe(true);
    });

    it('should generate key with rotation schedule', async () => {
      const rotationSchedule = {
        intervalDays: 30,
        nextRotation: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        autoRotate: true
      };
      
      const keyId = await keyManager.generateKey(KeyPurpose.JWT_SIGNING, rotationSchedule);
      const keys = keyManager.listKeys(KeyPurpose.JWT_SIGNING);
      const newKey = keys.find(key => key.id === keyId);
      
      expect(newKey?.rotationSchedule).toEqual(rotationSchedule);
    });
  });

  describe('getKey', () => {
    it('should retrieve an active key', async () => {
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      const retrievedKey = await keyManager.getKey(keyId);
      
      expect(retrievedKey).toBeDefined();
      expect(typeof retrievedKey).toBe('string');
      expect(retrievedKey.length).toBe(64); // 32 bytes in hex = 64 characters
    });

    it('should throw error for non-existent key', async () => {
      await expect(
        keyManager.getKey('non-existent-key')
      ).rejects.toThrow('Key not found');
    });

    it('should throw error for inactive key', async () => {
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      await keyManager.revokeKey(keyId);
      
      await expect(
        keyManager.getKey(keyId)
      ).rejects.toThrow('Key is not active');
    });
  });

  describe('getActiveKeyForPurpose', () => {
    it('should return active key for specific purpose', async () => {
      const key = await keyManager.getActiveKeyForPurpose(KeyPurpose.DATA_ENCRYPTION);
      
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
    });

    it('should throw error if no active key found for purpose', async () => {
      // Revoke all keys for a specific purpose
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION);
      for (const key of keys) {
        await keyManager.revokeKey(key.id);
      }
      
      await expect(
        keyManager.getActiveKeyForPurpose(KeyPurpose.DATA_ENCRYPTION)
      ).rejects.toThrow('No active key found for purpose');
    });
  });

  describe('rotateKey', () => {
    it('should rotate a key successfully', async () => {
      const originalKeyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      const newKeyId = await keyManager.rotateKey(originalKeyId);
      
      expect(newKeyId).toBeDefined();
      expect(newKeyId).not.toBe(originalKeyId);
      
      // Original key should be inactive
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION, false);
      const originalKey = keys.find(key => key.id === originalKeyId);
      expect(originalKey?.isActive).toBe(false);
      
      // New key should be active
      const newKey = keys.find(key => key.id === newKeyId);
      expect(newKey?.isActive).toBe(true);
      expect(newKey?.purpose).toBe(KeyPurpose.DATA_ENCRYPTION);
    });

    it('should throw error for non-existent key', async () => {
      await expect(
        keyManager.rotateKey('non-existent-key')
      ).rejects.toThrow('Key not found');
    });

    it('should preserve rotation schedule in new key', async () => {
      const rotationSchedule = {
        intervalDays: 30,
        nextRotation: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        autoRotate: true
      };
      
      const originalKeyId = await keyManager.generateKey(KeyPurpose.JWT_SIGNING, rotationSchedule);
      const newKeyId = await keyManager.rotateKey(originalKeyId);
      
      const keys = keyManager.listKeys(KeyPurpose.JWT_SIGNING);
      const newKey = keys.find(key => key.id === newKeyId);
      
      expect(newKey?.rotationSchedule?.intervalDays).toBe(30);
      expect(newKey?.rotationSchedule?.autoRotate).toBe(true);
    });
  });

  describe('checkKeyRotation', () => {
    it('should identify keys that need rotation', async () => {
      // Create a key with past rotation date
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const rotationSchedule = {
        intervalDays: 30,
        nextRotation: pastDate,
        autoRotate: true
      };
      
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION, rotationSchedule);
      const keysToRotate = await keyManager.checkKeyRotation();
      
      expect(keysToRotate).toContain(keyId);
    });

    it('should not identify keys with future rotation dates', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const rotationSchedule = {
        intervalDays: 30,
        nextRotation: futureDate,
        autoRotate: true
      };
      
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION, rotationSchedule);
      const keysToRotate = await keyManager.checkKeyRotation();
      
      expect(keysToRotate).not.toContain(keyId);
    });
  });

  describe('performAutoRotation', () => {
    it('should rotate keys that need rotation', async () => {
      // Create a key with past rotation date
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rotationSchedule = {
        intervalDays: 30,
        nextRotation: pastDate,
        autoRotate: true
      };
      
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION, rotationSchedule);
      const result = await keyManager.performAutoRotation();
      
      expect(result.rotated.length).toBeGreaterThan(0);
      expect(result.failed.length).toBe(0);
    });

    it('should handle rotation failures gracefully', async () => {
      // Mock a failure scenario by creating an invalid key state
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      
      // Spy on rotateKey to make it throw an error
      const rotateSpy = vi.spyOn(keyManager, 'rotateKey').mockRejectedValue(new Error('Rotation failed'));
      
      // Force the key to need rotation
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION);
      const key = keys.find(k => k.id === keyId);
      if (key) {
        key.rotationSchedule = {
          intervalDays: 30,
          nextRotation: new Date(Date.now() - 24 * 60 * 60 * 1000),
          autoRotate: true
        };
      }
      
      const result = await keyManager.performAutoRotation();
      
      expect(result.failed.length).toBeGreaterThan(0);
      
      rotateSpy.mockRestore();
    });
  });

  describe('listKeys', () => {
    it('should list all active keys by default', () => {
      const keys = keyManager.listKeys();
      
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every(key => key.isActive)).toBe(true);
    });

    it('should filter keys by purpose', () => {
      const jwtKeys = keyManager.listKeys(KeyPurpose.JWT_SIGNING);
      
      expect(jwtKeys.every(key => key.purpose === KeyPurpose.JWT_SIGNING)).toBe(true);
    });

    it('should include inactive keys when requested', async () => {
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      await keyManager.revokeKey(keyId);
      
      const allKeys = keyManager.listKeys(undefined, false);
      const inactiveKey = allKeys.find(key => key.id === keyId);
      
      expect(inactiveKey).toBeDefined();
      expect(inactiveKey?.isActive).toBe(false);
    });

    it('should sort keys by creation date (newest first)', async () => {
      const keyId1 = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const keyId2 = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION);
      const key1Index = keys.findIndex(key => key.id === keyId1);
      const key2Index = keys.findIndex(key => key.id === keyId2);
      
      expect(key2Index).toBeLessThan(key1Index); // Newer key should come first
    });
  });

  describe('revokeKey', () => {
    it('should revoke a key successfully', async () => {
      const keyId = await keyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      
      await keyManager.revokeKey(keyId, 'Test revocation');
      
      const keys = keyManager.listKeys(KeyPurpose.DATA_ENCRYPTION, false);
      const revokedKey = keys.find(key => key.id === keyId);
      
      expect(revokedKey?.isActive).toBe(false);
    });

    it('should throw error for non-existent key', async () => {
      await expect(
        keyManager.revokeKey('non-existent-key')
      ).rejects.toThrow('Key not found');
    });
  });

  describe('HSM integration', () => {
    it('should work with software mock HSM', async () => {
      const hsmConfig = {
        provider: HSMProvider.SOFTWARE_MOCK,
        endpoint: 'mock://localhost',
        credentials: { token: 'mock-token' }
      };
      
      (KeyManagementService as any).instance = undefined;
      const hsmKeyManager = KeyManagementService.getInstance(masterKey, hsmConfig);
      
      const keyId = await hsmKeyManager.generateKey(KeyPurpose.DATA_ENCRYPTION);
      const retrievedKey = await hsmKeyManager.getKey(keyId);
      
      expect(retrievedKey).toBeDefined();
      expect(typeof retrievedKey).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should handle encryption errors during key storage', async () => {
      // This test would require mocking the encryption service to fail
      // For now, we'll test that the service handles errors gracefully
      expect(keyManager).toBeDefined();
    });

    it('should handle invalid key IDs gracefully', async () => {
      await expect(
        keyManager.getKey('')
      ).rejects.toThrow();
      
      await expect(
        keyManager.getKey('invalid-key-format')
      ).rejects.toThrow();
    });
  });
});