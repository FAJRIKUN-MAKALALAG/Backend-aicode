const crypto = require('crypto');
// Don't call dotenv here - it's already loaded in server.js
// require('dotenv').config();

const algorithm = 'aes-256-gcm';

// Validate ENCRYPTION_KEY exists
if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set in environment variables. Please add it to your .env file.');
}

const secretKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex') // GCM needs auth tag
    };
};

const decrypt = (hash) => {
    const iv = Buffer.from(hash.iv, 'hex');
    const encryptedText = Buffer.from(hash.content, 'hex');
    // For GCM, we normally need the auth tag too. 
    // If not stored separately, some implementations append it.
    // Let's assume hash contains { iv, content, authTag } or similar struct.
    // If we only persisted 'iv' and 'encrypted_value' in DB, we missed authTag.
    // Let's check schema.
    
    // In schema: encrypted_value text, iv text. No auth_tag column.
    // We should probably append authTag to encrypted_value for storage simplicity.
    // Revised encrypt/decrypt below:
    
    // Fallback: If no authTag provided, encryption fails in GCM usually. 
    // We'll proceed assuming we store authTag appended to content or switch to CBC if schema is fixed.
    // But since user asked for secure ENCRYPTED on DB, GCM is best.
    
    // Re-impl: return iv + content + authTag combined string? 
    // Or just store authTag in the encrypted_value string: "content:authTag"
};

// Start Fresh
const encryptText = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag 
    };
};

const decryptText = (encryptedData, iv, authTag) => {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// To fit into our existing DB schema (encrypted_value, iv), 
// we will store encrypted_value as "encryptedHex:authTagHex"
// This avoids needing a schema migration for auth_tag column.

const encryptForDB = (text) => {
    const { iv, encryptedData, authTag } = encryptText(text);
    return {
        iv,
        encrypted_value: `${encryptedData}:${authTag}`
    };
};

const decryptFromDB = (encrypted_value, iv) => {
    const [encryptedData, authTag] = encrypted_value.split(':');
    if (!authTag) throw new Error('Auth tag missing in encrypted value');
    return decryptText(encryptedData, iv, authTag);
};

module.exports = {
    encrypt: encryptForDB,
    decrypt: decryptFromDB
};
