const { db } = require('../services/firebase');

// Get all notes for the authenticated user
const getNotes = async (req, res) => {
    try {
        const { uid } = req.user;

        const snapshot = await db
            .collection('users')
            .doc(uid)
            .collection('notes')
            .orderBy('updatedAt', 'desc')
            .get();

        const notes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(notes);
    } catch (error) {
        req.log.error({ err: error }, 'Error fetching notes');
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
};

// Get a single note by ID
const getNote = async (req, res) => {
    try {
        const { uid } = req.user;
        const { id } = req.params;

        const doc = await db
            .collection('users')
            .doc(uid)
            .collection('notes')
            .doc(id)
            .get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({
            id: doc.id,
            ...doc.data()
        });
    } catch (error) {
        req.log.error({ err: error }, 'Error fetching note');
        res.status(500).json({ error: 'Failed to fetch note' });
    }
};

// Create a new note
const createNote = async (req, res) => {
    try {
        const { uid } = req.user;
        const { title, content } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Title is required' });
        }

        const now = new Date().toISOString();
        const noteData = {
            title: title.trim(),
            content: content || '',
            createdAt: now,
            updatedAt: now
        };

        const docRef = await db
            .collection('users')
            .doc(uid)
            .collection('notes')
            .add(noteData);

        res.status(201).json({
            id: docRef.id,
            ...noteData
        });
    } catch (error) {
        req.log.error({ err: error }, 'Error creating note');
        res.status(500).json({ error: 'Failed to create note' });
    }
};

// Update an existing note
const updateNote = async (req, res) => {
    try {
        const { uid } = req.user;
        const { id } = req.params;
        const { title, content } = req.body;

        const noteRef = db
            .collection('users')
            .doc(uid)
            .collection('notes')
            .doc(id);

        const doc = await noteRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const updates = {
            updatedAt: new Date().toISOString()
        };

        if (title !== undefined) {
            if (title.trim() === '') {
                return res.status(400).json({ error: 'Title cannot be empty' });
            }
            updates.title = title.trim();
        }

        if (content !== undefined) {
            updates.content = content;
        }

        await noteRef.update(updates);

        const updatedDoc = await noteRef.get();
        res.json({
            id: updatedDoc.id,
            ...updatedDoc.data()
        });
    } catch (error) {
        req.log.error({ err: error }, 'Error updating note');
        res.status(500).json({ error: 'Failed to update note' });
    }
};

// Delete a note
const deleteNote = async (req, res) => {
    try {
        const { uid } = req.user;
        const { id } = req.params;

        const noteRef = db
            .collection('users')
            .doc(uid)
            .collection('notes')
            .doc(id);

        const doc = await noteRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Note not found' });
        }

        await noteRef.delete();

        res.json({ success: true, message: 'Note deleted' });
    } catch (error) {
        req.log.error({ err: error }, 'Error deleting note');
        res.status(500).json({ error: 'Failed to delete note' });
    }
};

module.exports = {
    getNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote
};
