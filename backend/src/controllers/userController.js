const { db } = require('../services/firebase');

const updateProfile = async (req, res) => {
    try {
        const { uid, email } = req.user;
        const { firstName } = req.body;

        if (!uid) {
            return res.status(400).json({ error: 'User ID missing from token' });
        }

        // Check if user exists to set registeredDate only on creation
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = {
            email,
            updatedAt: new Date().toISOString()
        };

        if (!userDoc.exists) {
            userData.registeredDate = new Date().toISOString();
        }

        if (firstName !== undefined) {
            userData.firstName = firstName;
        }

        await db.collection('users').doc(uid).set(userData, { merge: true });

        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        req.log.error({ err: error }, 'Error updating profile');
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

const getProfile = async (req, res) => {
    try {
        const { uid } = req.user;

        const doc = await db.collection('users').doc(uid).get();

        if (!doc.exists) {
            // Return basic info from token if DB record doesn't exist yet
            return res.json({
                firstName: '',
                email: req.user.email,
                registeredDate: new Date().toISOString()
            });
        }

        const data = doc.data();
        res.json({
            firstName: data.firstName || '',
            email: data.email || req.user.email,
            registeredDate: data.registeredDate || data.updatedAt || new Date().toISOString()
        });

    } catch (error) {
        req.log.error({ err: error }, 'Error fetching profile');
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

module.exports = {
    updateProfile,
    getProfile
};
