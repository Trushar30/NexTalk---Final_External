import CryptoJS from 'crypto-js';

// We use a fixed secret from environment or a default fallback 
// Note: For true E2EE, keys should be exchanged securely per-conversation. 
// This simple AES implementation ensures messages are heavily encrypted in the backend database.
const SECRET_KEY = import.meta.env.VITE_E2E_SECRET || 'nex-talk-secure-key-2026';

export const encryptMessage = (text: string): string => {
  if (!text) return text;
  try {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
  } catch (err) {
    console.error('Encryption failed:', err);
    return text;
  }
};

export const decryptMessage = (ciphertext: string): string => {
  if (!ciphertext) return ciphertext;
  
  // Quick check to see if it looks like a CryptoJS AES string (usually starts with U2FsdGVkX1)
  // If we try to decrypt plaintext it will return an empty string or throw.
  if (!ciphertext.startsWith('U2FsdGVkX1')) {
     return ciphertext; // Probably plain text from before encryption was added
  }

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || ciphertext; // fallback to ciphertext if decryption returns empty
  } catch (err) {
    console.error('Decryption failed:', err);
    return ciphertext;
  }
};
