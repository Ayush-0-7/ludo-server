import admin from 'firebase-admin';
import { createRequire } from 'module';


let serviceAccount;

// Check if the environment variable is available (for production/deployment)
// Decode the Base64 string to get the JSON content
    const decodedServiceAccount = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decodedServiceAccount);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

export default db;
