/**
 * Encrypt small secrets (passwords, API keys) at rest with the OS keychain
 * via Electron safeStorage. Only usable after the app is ready.
 */

const { safeStorage } = require('electron');

const ENCRYPTED_PREFIX = 'safe:v1:';

function canEncrypt() {
    return safeStorage.isEncryptionAvailable();
}

function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/** Returns the encrypted form, or the value unchanged when encryption is unavailable. */
function encryptSecret(value) {
    if (!value || !canEncrypt()) return value;
    return ENCRYPTED_PREFIX + safeStorage.encryptString(value).toString('base64');
}

/** Returns the plain value, '' if it can't be decrypted, or non-encrypted values unchanged. */
function decryptSecret(value) {
    if (!isEncrypted(value)) return value;
    try {
        return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'));
    } catch (error) {
        // E.g. the file was copied from another machine or user account.
        console.error('Could not decrypt a saved secret; it must be re-entered.');
        return '';
    }
}

module.exports = { canEncrypt, isEncrypted, encryptSecret, decryptSecret };
