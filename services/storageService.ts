import { QuizHistoryItem, SavedNote, CoinTransaction } from "../types";
import { 
    db, 
    auth, 
    doc, 
    setDoc, 
    getDoc, 
    deleteDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    OperationType, 
    handleFirestoreError,
    sanitizeForFirestore,
    orderBy,
    limit
} from "./firebase";

const STORAGE_KEY = 'bodhak_quiz_history';
const NOTES_STORAGE_KEY = 'bodhak_saved_notes';

// Smart Purge: Automatically deletes oldest records when collection exceeds threshold
// This prevents the "cloud data full" issue and keeps the app running smoothly.
const purgeCollection = async (path: string, threshold: number) => {
    try {
        const colRef = collection(db, path);
        const q = query(colRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.size > threshold) {
            // Keep exactly 'threshold' number of latest docs
            const docsToDelete = snapshot.docs.slice(threshold);
            console.log(`[Smart Purge] Deleting ${docsToDelete.length} old records from ${path} to save space.`);
            
            const deletePromises = docsToDelete.map(d => deleteDoc(doc(db, `${path}/${d.id}`)));
            await Promise.all(deletePromises);
        }
    } catch (err) {
        console.warn(`[Smart Purge] Failed for ${path}:`, err);
    }
};

// Helper for coin history specifically (uses 'timestamp' instead of 'createdAt')
const purgeCoinHistory = async (userId: string, threshold: number = 30) => {
    try {
        const path = `users/${userId}/coinHistory`;
        const colRef = collection(db, path);
        const q = query(colRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.size > threshold) {
            const docsToDelete = snapshot.docs.slice(threshold);
            const deletePromises = docsToDelete.map(d => deleteDoc(doc(db, `${path}/${d.id}`)));
            await Promise.all(deletePromises);
        }
    } catch (err) {
        console.warn(`[Smart Purge] Coin history purge failed:`, err);
    }
};

export const logCoinTransaction = async (userId: string, transaction: Omit<CoinTransaction, 'id' | 'timestamp'>) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newTx: CoinTransaction = { ...transaction, id, timestamp };
    
    try {
        const path = `users/${userId}/coinHistory/${id}`;
        await setDoc(doc(db, path), newTx);
        // Clean up old transactions automatically (only for self)
        if (auth.currentUser && userId === auth.currentUser.uid) {
            await purgeCoinHistory(userId); 
        }
    } catch (err) {
        console.warn("Failed to log coin transaction:", err);
    }
};

// Helper to get local data (fallback)
const getLocalHistory = (): QuizHistoryItem[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
};

const getLocalNotes = (): SavedNote[] => {
    try {
        const stored = localStorage.getItem(NOTES_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
};

export const saveQuizToHistory = async (item: Omit<QuizHistoryItem, 'id' | 'createdAt'> & { id?: string }): Promise<QuizHistoryItem> => {
    const id = item.id || crypto.randomUUID();
    const createdAt = Date.now();
    
    const newItem: QuizHistoryItem = {
        ...item,
        id,
        createdAt: (item as any).createdAt || createdAt,
    };

    const saveToLocalQuizHistory = (item: QuizHistoryItem) => {
        const history = getLocalHistory();
        const index = history.findIndex(h => h.id === item.id);
        let updatedHistory;
        if (index !== -1) {
            updatedHistory = [...history];
            updatedHistory[index] = item;
        } else {
            updatedHistory = [item, ...history].slice(0, 50);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    };

    if (auth.currentUser && !auth.currentUser.uid.startsWith('guest_')) {
        const path = `users/${auth.currentUser.uid}/quizzes/${id}`;
        try {
            await setDoc(doc(db, path), sanitizeForFirestore(newItem));
            // Trigger smart purge for quizzes (cap at 20)
            await purgeCollection(`users/${auth.currentUser.uid}/quizzes`, 20);
        } catch (error) {
            console.warn("Firestore quiz save failed, using LocalStorage fallback:", error);
            saveToLocalQuizHistory(newItem);
        }
    } else {
        saveToLocalQuizHistory(newItem);
    }
    
    return newItem;
};

export const getQuizHistory = async (): Promise<QuizHistoryItem[]> => {
    if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/quizzes`;
        try {
            const q = query(collection(db, path));
            const snapshot = await getDocs(q);
            const history = snapshot.docs.map(doc => doc.data() as QuizHistoryItem);
            return history.sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            handleFirestoreError(error, OperationType.LIST, path);
            return getLocalHistory();
        }
    }
    return getLocalHistory();
};

export const clearHistory = async () => {
    if (auth.currentUser) {
        // Clearing whole collection is complex on client, usually not needed or handled by deleting user
        localStorage.removeItem(STORAGE_KEY);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
};

export const removeQuizFromHistory = async (id: string) => {
    if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/quizzes/${id}`;
        try {
            await deleteDoc(doc(db, path));
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, path);
        }
    } else {
        const history = getLocalHistory();
        const updatedHistory = history.filter(item => item.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    }
};

export const saveNote = async (note: Omit<SavedNote, 'id' | 'createdAt'> & { id?: string }): Promise<SavedNote> => {
    const id = note.id || crypto.randomUUID();
    const createdAt = Date.now();
    
    const newNote: SavedNote = {
        ...note,
        id,
        createdAt: (note as any).createdAt || createdAt,
    };

    const saveToLocalNotes = (note: SavedNote) => {
        const notes = getLocalNotes();
        const index = notes.findIndex(n => n.id === note.id);
        let updatedNotes;
        if (index !== -1) {
            updatedNotes = [...notes];
            updatedNotes[index] = note;
        } else {
            updatedNotes = [note, ...notes];
        }
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(updatedNotes));
    };

    if (auth.currentUser && !auth.currentUser.uid.startsWith('guest_')) {
        const path = `users/${auth.currentUser.uid}/notes/${id}`;
        try {
            await setDoc(doc(db, path), sanitizeForFirestore(newNote));
            // Trigger smart purge for notes (cap at 20)
            await purgeCollection(`users/${auth.currentUser.uid}/notes`, 20);
        } catch (error) {
            console.warn("Firestore saveNote failed, using LocalStorage fallback:", error);
            saveToLocalNotes(newNote);
        }
    } else {
        saveToLocalNotes(newNote);
    }
    
    return newNote;
};

export const getSavedNotes = async (): Promise<SavedNote[]> => {
    if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/notes`;
        try {
            const q = query(collection(db, path));
            const snapshot = await getDocs(q);
            const notes = snapshot.docs.map(doc => doc.data() as SavedNote);
            return notes.sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            handleFirestoreError(error, OperationType.LIST, path);
            return getLocalNotes();
        }
    }
    return getLocalNotes();
};

export const deleteNote = async (id: string) => {
    if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/notes/${id}`;
        try {
            await deleteDoc(doc(db, path));
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, path);
        }
    } else {
        const notes = getLocalNotes();
        const updatedNotes = notes.filter(n => n.id !== id);
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(updatedNotes));
    }
};
