import { createHash, randomBytes, createHmac } from 'crypto';

export class CryptoUtils {
  static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt || randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(password + actualSalt)
      .digest('hex');
    
    return { hash, salt: actualSalt };
  }

  static verifyPassword(password: string, hash: string, salt: string): boolean {
    const { hash: computedHash } = this.hashPassword(password, salt);
    return computedHash === hash;
  }

  static createHMAC(data: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  static verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return signature === expectedSignature;
  }

  static hashData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}