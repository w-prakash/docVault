import * as CryptoJS from 'crypto-js';

// 🔐 encrypt
export function encryptData(data: ArrayBuffer, key: string): string {
  const wordArray = CryptoJS.lib.WordArray.create(data as any);
  return CryptoJS.AES.encrypt(wordArray, key).toString();
}

// 🔓 decrypt
export function decryptData(encrypted: string, key: string): Uint8Array {
  const bytes = CryptoJS.AES.decrypt(encrypted, key);
  const wordArray = bytes as any;

  const result = new Uint8Array(wordArray.sigBytes);

  for (let i = 0; i < wordArray.sigBytes; i++) {
    result[i] =
      (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }

  return result;
}