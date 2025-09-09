import admin from "firebase-admin";
import { createRequire } from "module";

let serviceAccount;

// Check if the environment variable is available (for production/deployment)
// Decode the Base64 string to get the JSON content
if (process.env.FIREBASE_CREDENTIALS) {
  try {
    // Parse the JSON string directly from the environment variable.
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    console.log(
      "Firebase initialized using FIREBASE_CREDENTIALS environment variable."
    );
  } catch (e) {
    console.error(
      "Error parsing FIREBASE_CREDENTIALS environment variable. Make sure it is a valid JSON string with no extra characters.",
      e
    );
    // Exit the process with a failure code if credentials are provided but invalid.
    process.exit(1);
  }
} else {
  // Fallback for local development: read the file from disk
  console.log("Check on your env file . ");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

export default db;
