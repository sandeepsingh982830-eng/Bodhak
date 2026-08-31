import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GeminiKeyConfig, GeminiWorkType } from '../types';

export const WORK_TYPE_METADATA: Record<GeminiWorkType, {
    labelEn: string;
    labelHi: string;
    description: string;
    color: string;
    icon: string;
}> = {
    all: {
        labelEn: "All Work / Global Default",
        labelHi: "सभी कार्यों के लिए (डिफ़ॉल्ट)",
        description: "Applies globally to all AI features if a specific key is not designated or busy.",
        color: "bg-indigo-50 text-indigo-700 border-indigo-200",
        icon: "🌟"
    },
    quiz: {
        labelEn: "Quiz & Mock Tests",
        labelHi: "क्विज़ व मॉक टेस्ट निर्माण",
        description: "Generates Prelims/Mains MCQs, questions, distractors, and model explanations.",
        color: "bg-purple-50 text-purple-700 border-purple-200",
        icon: "📝"
    },
    ca: {
        labelEn: "Current Affairs & The Hindu",
        labelHi: "करंट अफेयर्स व द हिन्दू",
        description: "Powers daily analytical news summaries, syllabus mapping, and The Hindu editorials.",
        color: "bg-red-50 text-red-700 border-red-200",
        icon: "📰"
    },
    notes: {
        labelEn: "Smart Notes & Material",
        labelHi: "स्मार्ट नोट्स व अध्ययन सामग्री",
        description: "Creates comprehensive exam notes, infographics, flowcharts, and study summaries.",
        color: "bg-blue-50 text-blue-700 border-blue-200",
        icon: "📚"
    },
    ans_chak: {
        labelEn: "AnsChak / Copy Evaluation",
        labelHi: "उत्तर मूल्यांकन (AnsChak कॉपी चेकिंग)",
        description: "Evaluates UPSC/PSC subjective answers, multi-criteria scoring, and model feedback.",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: "✍️"
    },
    pyq: {
        labelEn: "PYQ Scanner & OCR",
        labelHi: "पीवाईक्यू स्कैनर व ओसीआर",
        description: "Extracts previous years questions from scanned PDF/image documents.",
        color: "bg-amber-50 text-amber-700 border-amber-200",
        icon: "🔍"
    },
    chat: {
        labelEn: "AI Tutor & Support Chat",
        labelHi: "एआई ट्यूटर व सहायता चैट",
        description: "Instant doubt resolution, concept explanations, and guidance for aspirants.",
        color: "bg-cyan-50 text-cyan-700 border-cyan-200",
        icon: "💬"
    },
    ocr: {
        labelEn: "Image OCR & Vision",
        labelHi: "इमेज ओसीआर व विज़न",
        description: "Digitizes handwritten text and image diagrams into editable study material.",
        color: "bg-teal-50 text-teal-700 border-teal-200",
        icon: "👁️"
    }
};

/**
 * Fetch all configured Gemini keys from Firestore and backend server
 */
export const fetchConfiguredGeminiKeys = async (): Promise<GeminiKeyConfig[]> => {
    let keys: GeminiKeyConfig[] = [];

    // 1. First try loading from Firestore (persisted across cloud deployments)
    try {
        const docRef = doc(db, 'settings', 'gemini_keys');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data?.keys) && data.keys.length > 0) {
                keys = data.keys;
            }
        }
    } catch (e) {
        console.warn("[GeminiKeyManager] Error reading keys from Firestore:", e);
    }

    // 2. Also check backend server's in-memory / local config
    try {
        const response = await fetch('/api/manager/gemini-keys');
        if (response.ok) {
            const serverData = await response.json();
            if (Array.isArray(serverData?.keys) && serverData.keys.length > 0) {
                if (keys.length === 0) {
                    keys = serverData.keys;
                } else {
                    // Merge any server-specific usage counts or statuses
                    const keyMap = new Map<string, GeminiKeyConfig>();
                    keys.forEach(k => keyMap.set(k.id, k));
                    serverData.keys.forEach((sk: GeminiKeyConfig) => {
                        if (!keyMap.has(sk.id)) {
                            keyMap.set(sk.id, sk);
                        } else {
                            const existing = keyMap.get(sk.id)!;
                            keyMap.set(sk.id, {
                                ...existing,
                                usageCount: sk.usageCount || existing.usageCount,
                                lastUsedAt: sk.lastUsedAt || existing.lastUsedAt,
                                status: sk.status || existing.status
                            });
                        }
                    });
                    keys = Array.from(keyMap.values());
                }
            }
        }
    } catch (e) {
        console.warn("[GeminiKeyManager] Error syncing with /api/manager/gemini-keys:", e);
    }

    // Sync to backend if Firestore had keys but server didn't
    if (keys.length > 0) {
        try {
            fetch('/api/manager/gemini-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys })
            }).catch(() => {});
        } catch (e) {}
    }

    return keys;
};

/**
 * Save all configured Gemini keys to both Firestore and backend server
 */
export const saveConfiguredGeminiKeys = async (keys: GeminiKeyConfig[]): Promise<boolean> => {
    // 1. Save to Firestore
    try {
        const docRef = doc(db, 'settings', 'gemini_keys');
        await setDoc(docRef, {
            keys,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (e) {
        console.error("[GeminiKeyManager] Error writing keys to Firestore:", e);
    }

    // 2. Sync to Backend server
    try {
        const res = await fetch('/api/manager/gemini-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys })
        });
        if (!res.ok) {
            console.warn("[GeminiKeyManager] Server returned status", res.status);
        }
    } catch (e) {
        console.error("[GeminiKeyManager] Error saving keys to backend server:", e);
    }

    return true;
};

/**
 * Test an API key in real-time
 */
export const testSingleGeminiKey = async (key: string, model: string = "gemini-3.7-flash") => {
    try {
        const res = await fetch('/api/manager/gemini-keys/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, model })
        });
        return await res.json();
    } catch (e: any) {
        return {
            success: false,
            valid: false,
            error: e?.message || "Network error while testing key"
        };
    }
};
