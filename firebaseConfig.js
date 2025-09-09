import admin from 'firebase-admin';
import { createRequire } from 'module';

// --- START: Secure Credential Handling ---

let serviceAccount;

// Check if the environment variable is available (for production/deployment)
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Decode the Base64 string to get the JSON content
    const decodedServiceAccount = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decodedServiceAccount);
} else {
    // Fallback for local development: read the file from disk
    const require = createRequire(import.meta.url);
    serviceAccount = require('./serviceAccountKey.json');
}

// --- END: Secure Credential Handling ---

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

export default db;
