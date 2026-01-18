const { auth, isReady } = require('../services/firebase');

const verifyToken = async (req, res, next) => {
    // Check if Firebase service is ready
    if (!isReady) {
        req.log.warn('Auth Service Unavailable: Firebase not initialized');
        return res.status(503).json({ error: 'Auth service unavailable' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        req.log.error({ err: error }, 'Error verifying token');
        res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = { verifyToken };
