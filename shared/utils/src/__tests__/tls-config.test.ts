import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { TLSConfigService } from '../tls-config';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

const mockReadFileSync = vi.mocked(readFileSync);

describe('TLSConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createServerTLSConfig', () => {
    it('should create secure TLS configuration without certificates', () => {
      const config = TLSConfigService.createServerTLSConfig();
      
      expect(config.minVersion).toBe('TLSv1.3');
      expect(config.maxVersion).toBe('TLSv1.3');
      expect(config.secureProtocol).toBe('TLSv1_3_method');
      expect(config.honorCipherOrder).toBe(true);
      expect(config.rejectUnauthorized).toBe(true);
      expect(config.ciphers).toContain('TLS_AES_256_GCM_SHA384');
    });

    it('should load certificates when provided', () => {
      const mockCert = Buffer.from('mock-certificate');
      const mockKey = Buffer.from('mock-private-key');
      const mockCA = Buffer.from('mock-ca-certificate');
      
      mockReadFileSync
        .mockReturnValueOnce(mockCert)
        .mockReturnValueOnce(mockKey)
        .mockReturnValueOnce(mockCA);
      
      const certInfo = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        caPath: '/path/to/ca.pem'
      };
      
      const config = TLSConfigService.createServerTLSConfig(certInfo);
      
      expect(config.cert).toEqual(mockCert);
      expect(config.key).toEqual(mockKey);
      expect(config.ca).toEqual([mockCA]);
      expect(mockReadFileSync).toHaveBeenCalledTimes(3);
    });

    it('should throw error when certificate loading fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const certInfo = {
        certPath: '/invalid/cert.pem',
        keyPath: '/invalid/key.pem'
      };
      
      expect(() => {
        TLSConfigService.createServerTLSConfig(certInfo);
      }).toThrow('Failed to load TLS certificates');
    });
  });

  describe('createClientTLSConfig', () => {
    it('should create secure client TLS configuration', () => {
      const config = TLSConfigService.createClientTLSConfig();
      
      expect(config.minVersion).toBe('TLSv1.3');
      expect(config.maxVersion).toBe('TLSv1.3');
      expect(config.secureProtocol).toBe('TLSv1_3_method');
      expect(config.rejectUnauthorized).toBe(true);
    });

    it('should allow disabling certificate verification', () => {
      const config = TLSConfigService.createClientTLSConfig(false);
      
      expect(config.rejectUnauthorized).toBe(false);
    });
  });

  describe('createSecureRequestOptions', () => {
    it('should create secure HTTPS request options', () => {
      const baseOptions = {
        hostname: 'api.example.com',
        port: 443,
        path: '/api/v1/data',
        method: 'GET'
      };
      
      const secureOptions = TLSConfigService.createSecureRequestOptions(baseOptions);
      
      expect(secureOptions.hostname).toBe('api.example.com');
      expect(secureOptions.secureProtocol).toBe('TLSv1_3_method');
      expect(secureOptions.minVersion).toBe('TLSv1.3');
      expect(secureOptions.maxVersion).toBe('TLSv1.3');
      expect(secureOptions.rejectUnauthorized).toBe(true);
      expect(secureOptions.ciphers).toContain('TLS_AES_256_GCM_SHA384');
    });
  });

  describe('createSecureContextOptions', () => {
    it('should create secure context options without certificates', () => {
      const options = TLSConfigService.createSecureContextOptions();
      
      expect(options.minVersion).toBe('TLSv1.3');
      expect(options.maxVersion).toBe('TLSv1.3');
      expect(options.secureProtocol).toBe('TLSv1_3_method');
      expect(options.honorCipherOrder).toBe(true);
    });

    it('should include certificates when provided', () => {
      const mockCert = Buffer.from('mock-certificate');
      const mockKey = Buffer.from('mock-private-key');
      
      mockReadFileSync
        .mockReturnValueOnce(mockCert)
        .mockReturnValueOnce(mockKey);
      
      const certInfo = {
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        passphrase: 'secret-passphrase'
      };
      
      const options = TLSConfigService.createSecureContextOptions(certInfo);
      
      expect(options.cert).toEqual(mockCert);
      expect(options.key).toEqual(mockKey);
      expect(options.passphrase).toBe('secret-passphrase');
    });
  });

  describe('createTLSSocketOptions', () => {
    it('should create TLS socket options', () => {
      const options = TLSConfigService.createTLSSocketOptions('example.com', 443);
      
      expect(options.host).toBe('example.com');
      expect(options.port).toBe(443);
      expect(options.secureContext).toBeDefined();
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.checkServerIdentity).toBeDefined();
    });
  });

  describe('validateTLSConfig', () => {
    it('should validate correct TLS 1.3 configuration', () => {
      const config = {
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        ciphers: ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'],
        honorCipherOrder: true,
        secureProtocol: 'TLSv1_3_method',
        rejectUnauthorized: true
      };
      
      const result = TLSConfigService.validateTLSConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with wrong TLS version', () => {
      const config = {
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        ciphers: ['TLS_AES_256_GCM_SHA384'],
        honorCipherOrder: true,
        secureProtocol: 'TLSv1_2_method',
        rejectUnauthorized: true
      };
      
      const result = TLSConfigService.validateTLSConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Minimum TLS version must be TLSv1.3');
      expect(result.errors).toContain('Maximum TLS version must be TLSv1.3');
    });

    it('should reject configuration with weak ciphers', () => {
      const config = {
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        ciphers: ['RC4-SHA', 'DES-CBC-SHA'],
        honorCipherOrder: true,
        secureProtocol: 'TLSv1_3_method',
        rejectUnauthorized: true
      };
      
      const result = TLSConfigService.validateTLSConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Configuration must include secure TLS 1.3 cipher suites');
      expect(result.errors).toContain('Configuration contains weak cipher suites');
    });

    it('should validate certificate and key pairing', () => {
      const configWithCertOnly = {
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        ciphers: ['TLS_AES_256_GCM_SHA384'],
        honorCipherOrder: true,
        secureProtocol: 'TLSv1_3_method',
        cert: Buffer.from('certificate'),
        rejectUnauthorized: true
      };
      
      const result = TLSConfigService.validateTLSConfig(configWithCertOnly);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Certificate provided without private key');
    });
  });

  describe('getSecurityHeaders', () => {
    it('should return comprehensive security headers', () => {
      const headers = TLSConfigService.getSecurityHeaders();
      
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
      expect(headers['Permissions-Policy']).toContain('geolocation=()');
    });
  });

  describe('createTLSEnforcementMiddleware', () => {
    it('should create middleware that enforces HTTPS', () => {
      const middleware = TLSConfigService.createTLSEnforcementMiddleware();
      
      expect(typeof middleware).toBe('function');
      
      // Test with non-secure request
      const mockReq = {
        secure: false,
        get: vi.fn().mockReturnValue(null)
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      };
      const mockNext = vi.fn();
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(426);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'HTTPS Required',
        message: 'This endpoint requires a secure HTTPS connection'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow secure requests and add security headers', () => {
      const middleware = TLSConfigService.createTLSEnforcementMiddleware();
      
      const mockReq = {
        secure: true,
        get: vi.fn()
      };
      const mockRes = {
        setHeader: vi.fn()
      };
      const mockNext = vi.fn();
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow requests with x-forwarded-proto header', () => {
      const middleware = TLSConfigService.createTLSEnforcementMiddleware();
      
      const mockReq = {
        secure: false,
        get: vi.fn().mockReturnValue('https')
      };
      const mockRes = {
        setHeader: vi.fn()
      };
      const mockNext = vi.fn();
      
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkTLS13Support', () => {
    it('should check Node.js TLS 1.3 support', () => {
      const result = TLSConfigService.checkTLS13Support();
      
      expect(result).toHaveProperty('supported');
      expect(result).toHaveProperty('version');
      expect(typeof result.supported).toBe('boolean');
      expect(typeof result.version).toBe('string');
      expect(result.version).toMatch(/^v\d+\.\d+\.\d+/);
    });
  });

  describe('generateSelfSignedCert', () => {
    it('should throw error for self-signed certificate generation', () => {
      expect(() => {
        TLSConfigService.generateSelfSignedCert();
      }).toThrow('Self-signed certificate generation not implemented');
    });
  });
});