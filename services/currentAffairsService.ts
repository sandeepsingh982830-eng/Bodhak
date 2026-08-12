import { 
    db, 
    auth, 
    doc, 
    setDoc, 
    deleteDoc, 
    collection, 
    getDocs, 
    query, 
    OperationType, 
    handleFirestoreError,
    sanitizeForFirestore,
    orderBy
} from "./firebase";

const SAVED_AFFAIRS_KEY = 'bodhak_saved_affairs';

// Smart Purge: Keep only last 20 saved affairs to save space
const purgeSavedAffairs = async (userId: string) => {
    try {
        const path = `users/${userId}/savedAffairs`;
        const colRef = collection(db, path);
        const q = query(colRef, orderBy('savedAt', 'desc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.size > 20) {
            const docsToDelete = snapshot.docs.slice(20);
            const deletePromises = docsToDelete.map(d => deleteDoc(doc(db, `${path}/${d.id}`)));
            await Promise.all(deletePromises);
        }
    } catch (err) {
        console.warn("[Smart Purge] Saved affairs cleanup failed:", err);
    }
};

export interface CurrentAffair {
    id?: string;
    title: string;
    description: string;
    date: string;
    category: string;
    source?: string;
    isSaved?: boolean;
    userId?: string;
    points?: string[];
    syllabus_tags?: string[];
}

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
}

// Helper for local fallback
const getLocalSavedAffairs = (userId: string): CurrentAffair[] => {
    try {
        const stored = localStorage.getItem(`${SAVED_AFFAIRS_KEY}_${userId}`);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
};

export const generateQuiz = async (affairs: CurrentAffair[], lang: string = 'en', count: number = 5): Promise<QuizQuestion[]> => {
    try {
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ affairs, lang, count })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate quiz');
        return data;
    } catch (error: any) {
        console.error("Error generating quiz:", error);
        throw error;
    }
};

export const fetchDailyAffairs = async (lang: string = "en", topic: string = "", timeRange: string = "") => {
    try {
        const url = `/api/current-affairs?lang=${lang}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}${timeRange ? `&timeRange=${timeRange}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Failed to fetch current affairs');
        }
        return data as CurrentAffair[];
    } catch (error: any) {
        console.error("Error fetching current affairs:", error);
        throw error;
    }
};

export const fetchTheHinduNews = async (lang: string = "en") => {
    try {
        const url = `/api/the-hindu?lang=${lang}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Failed to fetch The Hindu news');
        }
        return data as CurrentAffair[];
    } catch (error: any) {
        console.error("Error fetching The Hindu news:", error);
        throw error;
    }
};

export const saveAffair = async (userId: string, affair: CurrentAffair) => {
    const id = affair.id || crypto.randomUUID();
    const affairToSave = {
        ...affair,
        id,
        userId,
        savedAt: Date.now()
    };

    if (auth.currentUser && auth.currentUser.uid === userId) {
        const path = `users/${userId}/savedAffairs/${id}`;
        try {
            await setDoc(doc(db, path), sanitizeForFirestore(affairToSave));
            // Cleanup old records to save space
            await purgeSavedAffairs(userId);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
        }
    } else {
        const saved = getLocalSavedAffairs(userId);
        if (saved.some(a => a.title === affair.title)) return;
        const updated = [affairToSave, ...saved];
        localStorage.setItem(`${SAVED_AFFAIRS_KEY}_${userId}`, JSON.stringify(updated));
    }
};

export const deleteSavedAffair = async (userId: string, affairId: string) => {
    if (auth.currentUser && auth.currentUser.uid === userId) {
        const path = `users/${userId}/savedAffairs/${affairId}`;
        try {
            await deleteDoc(doc(db, path));
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, path);
        }
    } else {
        const saved = getLocalSavedAffairs(userId);
        const updated = saved.filter(a => a.id !== affairId);
        localStorage.setItem(`${SAVED_AFFAIRS_KEY}_${userId}`, JSON.stringify(updated));
    }
};

export const fetchSavedAffairs = async (userId: string): Promise<CurrentAffair[]> => {
    if (auth.currentUser && auth.currentUser.uid === userId) {
        const path = `users/${userId}/savedAffairs`;
        try {
            const q = query(collection(db, path));
            const snapshot = await getDocs(q);
            const affairs = snapshot.docs.map(doc => doc.data() as CurrentAffair);
            return affairs.sort((a: any, b: any) => (b.savedAt || 0) - (a.savedAt || 0));
        } catch (error) {
            handleFirestoreError(error, OperationType.LIST, path);
            return getLocalSavedAffairs(userId);
        }
    }
    return getLocalSavedAffairs(userId);
};
