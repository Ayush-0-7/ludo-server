import admin from 'firebase-admin';

let serviceAccount;

// Priority 1: Use an environment variable that contains the raw JSON key.
if (process.env.FIREBASE_CREDENTIALS) {
  try {
    // Parse the JSON string directly from the environment variable.
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    console.log("Firebase initialized using FIREBASE_CREDENTIALS environment variable.");
  } catch (e) {
    console.error("Error parsing FIREBASE_CREDENTIALS environment variable. Make sure it is a valid JSON string with no extra characters.", e);
    // Exit the process with a failure code if credentials are provided but invalid.
    process.exit(1);
  }
} 
// Priority 2: Fallback to a local file for local development.
else {
 console.log("Failed to parse credentials . ") ;
}

// Initialize Firebase Admin with the retrieved credentials.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

export default db;

