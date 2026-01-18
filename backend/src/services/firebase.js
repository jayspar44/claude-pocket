const admin = require('firebase-admin');
const logger = require('../logger');

let isReady = false;

if (!admin.apps.length) {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : {};

        // basic check to avoid trying to init with empty object if parse returned empty
        if (Object.keys(serviceAccount).length > 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            logger.info('Firebase Admin initialized successfully');
            isReady = true;
        } else {
            logger.warn('Firebase Service Account is empty. Skipping initialization.');
        }

    } catch (error) {
        logger.error({ err: error }, 'Firebase Admin initialization failed');
        logger.warn('Backend will start but Firebase features will fail.');
    }
} else {
    isReady = true;
}

// Export nulls if not ready to prevent crash on require
const db = isReady ? admin.firestore() : null;
const auth = isReady ? admin.auth() : null;

module.exports = { admin, db, auth, isReady };
