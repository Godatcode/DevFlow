import { readFileSync } from 'fs';
import { SecureContextOptions, TLSSocketOptions, SecureVersion } from 'tls';
import { RequestOptions } from 'https';
import { PeerCertificate } from 'tls';

export interface TLSConfiguration {
  minVersion: string;
  maxVersion: string;
  ciphers: string[];
  honorCipherOrder: boolean;
  secureProtocol: string;
  cert?: Buffer;
  key?: Buffer;
  ca?: Buffer[];
  rejectUnauthorized: boolean;
}

export interface CertificateInfo {
  certPath: string;
  keyPath: string;
  caPath?: string;
  passphrase?: string;
}

export class TLSConfigService {
  private static readonly TLS_1_3_CIPHERS = [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_128_CCM_SHA256',
    'TLS_AES_128_CCM_8_SHA256'
  ];

  private static readonly SECURE_CIPHERS = [
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA',
    'ECDHE-RSA-AES128-SHA',
    'DHE-RSA-AES256-GCM-SHA384',
    'DHE-RSA-AES128-GCM-SHA256',
    'DHE-RSA-AES256-SHA256',
    'DHE-RSA-AES128-SHA256',
    'DHE-RSA-AES256-SHA',
    'DHE-RSA-AES128-SHA',
    '!aNULL',
    '!eNULL',
    '!EXPORT',
    '!DES',
    '!RC4',
    '!MD5',
    '!PSK',
    '!SRP',
    '!CAMELLIA'
  ];

  /**
   * Creates a secure TLS configuration for servers
   */
  static createServerTLSConfig(certInfo?: CertificateInfo): TLSConfiguration {
    const config: TLSConfiguration = {
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      ciphers: this.TLS_1_3_CIPHERS,
      honorCipherOrder: true,
      secureProtocol: 'TLSv1_3_method',
      rejectUnauthorized: true
    };

    if (certInfo) {
      try {
        config.cert = readFileSync(certInfo.certPath);
        config.key = readFileSync(certInfo.keyPath);
        
        if (certInfo.caPath) {
          config.ca = [readFileSync(certInfo.caPath)];
        }
      } catch (error) {
        throw new Error(`Failed to load TLS certificates: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return config;
  }

  /**
   * Creates a secure TLS configuration for clients
   */
  static createClientTLSConfig(rejectUnauthorized: boolean = true): TLSConfiguration {
    return {
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      ciphers: this.TLS_1_3_CIPHERS,
      honorCipherOrder: true,
      secureProtocol: 'TLSv1_3_method',
      rejectUnauthorized
    };
  }

  /**
   * Creates HTTPS request options with secure TLS
   */
  static createSecureRequestOptions(baseOptions: RequestOptions): RequestOptions {
    const tlsConfig = this.createClientTLSConfig();
    
    return {
      ...baseOptions,
      secureProtocol: tlsConfig.secureProtocol,
      ciphers: tlsConfig.ciphers.join(':'),
      minVersion: tlsConfig.minVersion as SecureVersion,
      maxVersion: tlsConfig.maxVersion as SecureVersion,
      rejectUnauthorized: tlsConfig.rejectUnauthorized
    };
  }

  /**
   * Creates secure context options for TLS sockets
   */
  static createSecureContextOptions(certInfo?: CertificateInfo): SecureContextOptions {
    const options: SecureContextOptions = {
      minVersion: 'TLSv1.3' as SecureVersion,
      maxVersion: 'TLSv1.3' as SecureVersion,
      ciphers: this.TLS_1_3_CIPHERS.join(':'),
      honorCipherOrder: true,
      secureProtocol: 'TLSv1_3_method'
    };

    if (certInfo) {
      try {
        options.cert = readFileSync(certInfo.certPath);
        options.key = readFileSync(certInfo.keyPath);
        
        if (certInfo.caPath) {
          options.ca = readFileSync(certInfo.caPath);
        }
        
        if (certInfo.passphrase) {
          options.passphrase = certInfo.passphrase;
        }
      } catch (error) {
        throw new Error(`Failed to load TLS certificates: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return options;
  }

  /**
   * Creates TLS socket options
   */
  static createTLSSocketOptions(host: string, port: number, certInfo?: CertificateInfo): TLSSocketOptions {
    const secureContextOptions = this.createSecureContextOptions(certInfo);
    
    return {
      rejectUnauthorized: true
    };
  }

  /**
   * Validates TLS configuration
   */
  static validateTLSConfig(config: TLSConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check minimum TLS version
    if (config.minVersion !== 'TLSv1.3') {
      errors.push('Minimum TLS version must be TLSv1.3');
    }

    // Check maximum TLS version
    if (config.maxVersion !== 'TLSv1.3') {
      errors.push('Maximum TLS version must be TLSv1.3');
    }

    // Check cipher suites
    const hasSecureCiphers = config.ciphers.some(cipher => 
      this.TLS_1_3_CIPHERS.includes(cipher)
    );
    
    if (!hasSecureCiphers) {
      errors.push('Configuration must include secure TLS 1.3 cipher suites');
    }

    // Check for weak ciphers
    const weakCiphers = ['RC4', 'DES', 'MD5', 'NULL'];
    const hasWeakCiphers = config.ciphers.some(cipher =>
      weakCiphers.some(weak => cipher.includes(weak))
    );
    
    if (hasWeakCiphers) {
      errors.push('Configuration contains weak cipher suites');
    }

    // Check certificate presence for server configs
    if (config.cert && !config.key) {
      errors.push('Certificate provided without private key');
    }
    
    if (config.key && !config.cert) {
      errors.push('Private key provided without certificate');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets recommended security headers for HTTPS responses
   */
  static getSecurityHeaders(): Record<string, string> {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; child-src 'none'; worker-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self';",
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), speaker=()'
    };
  }

  /**
   * Creates a middleware function for Express.js to enforce TLS
   */
  static createTLSEnforcementMiddleware() {
    return (req: any, res: any, next: any) => {
      // Check if request is using HTTPS
      if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.status(426).json({
          error: 'HTTPS Required',
          message: 'This endpoint requires a secure HTTPS connection'
        });
      }

      // Add security headers
      const securityHeaders = this.getSecurityHeaders();
      Object.entries(securityHeaders).forEach(([header, value]) => {
        res.setHeader(header, value);
      });

      next();
    };
  }

  /**
   * Checks if the current Node.js version supports TLS 1.3
   */
  static checkTLS13Support(): { supported: boolean; version: string } {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    // TLS 1.3 support was added in Node.js 12.0.0
    const supported = majorVersion >= 12;
    
    return {
      supported,
      version: nodeVersion
    };
  }

  /**
   * Generates a self-signed certificate for development (NOT for production)
   */
  static generateSelfSignedCert(): { cert: string; key: string } {
    // This is a placeholder - in a real implementation, you would use
    // a library like node-forge or call openssl commands
    throw new Error('Self-signed certificate generation not implemented. Use openssl or a proper CA for certificates.');
  }
}

export default TLSConfigService;