const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generates a high-entropy secret for JWT signing.
 * @returns {string} Base64 encoded secret
 */
function generateJwtSecret() {
    return crypto.randomBytes(64).toString('base64');
}

const newSecret = generateJwtSecret();
console.log('--- Secure JWT Secret Generated ---');
console.log(newSecret);
console.log('------------------------------------');
console.log('Instruction: Copy the secret above and update the JWT_SECRET in your .env file.');

// Also save to a temporary file for the agent to easily read if needed during automation
fs.writeFileSync(path.join(__dirname, '../new_jwt_secret.tmp'), newSecret, 'utf8');
console.log('Secret also saved to: new_jwt_secret.tmp');
