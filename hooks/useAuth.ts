import { useState, useEffect } from 'react';
import { 
    auth, 
    db, 
    googleProvider, 
    signInWithPopup, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail, 
    onAuthStateChanged,
    firebaseUpdateProfile,
    googleSignIn,
    logout as firebaseLogout,
    doc, 
    getDoc, 
    setDoc, 
    collection,
    getDocs,
    query,
    where,
    increment,
    onSnapshot,
    updateDoc,
    handleFirestoreError, 
    OperationType,
    serverTimestamp,
    getAccessToken
} from '../services/firebase';

import { logCoinTransaction } from '../services/storageService';

const PROFILE_STORAGE_KEY = 'bodhak_user_profile';

export interface UserProfile {
    userId: string;
    name: string;
    mobile: string;
    study: string;
    studyFocus?: string;
    email: string;
    photoURL?: string;
    photoUrl?: string;
    isManager?: boolean;
    coins?: number;
    streakCount?: number;
    lastActiveDate?: string;
    awPassExpirity?: number;
    quizPassExpirity?: number;
    ipAddress?: string;
    deviceFingerprint?: string;
    unlimitedExpirity?: number; // timestamp in ms
    language?: 'en' | 'hi';
}

const getIP = async () => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch {
        return 'unknown';
    }
};

const getFingerprint = () => {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        let renderer = 'unknown';
        if (gl) {
            const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
            renderer = debugInfo ? (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
        }
        
        const data = [
            navigator.userAgent,
            screen.width,
            screen.height,
            navigator.language,
            new Date().getTimezoneOffset(),
            renderer
        ].join('|');
        return btoa(data);
    } catch (e) {
        return 'fingerprint-error';
    }
};

let isSessionChecked = false;

export const useAuth = () => {
    const [user, setUser] = useState<any>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(() => {
        try {
            const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState<string | null>(null);
    const [streakRewardInfo, setStreakRewardInfo] = useState<any>(null);

    const authorizeDrive = async () => {
        try {
            const token = await getAccessToken(true);
            setAccessToken(token);
            return token;
        } catch (err) {
            console.error("Drive authorization failed:", err);
            return null;
        }
    };

    const clearStreakReward = () => {
        setStreakRewardInfo(null);
    };

    const getFormattedDate = (offsetDays = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    };

    const recordDailyActivity = async (actionType: string) => {
        if (!auth.currentUser || !profile) return;
        try {
            const today = getFormattedDate(0);
            const yesterday = getFormattedDate(-1);
            const userRef = doc(db, 'users', auth.currentUser.uid);
            
            let newStreak = profile.streakCount || 0;
            let isFirstActivityToday = false;
            let rewardCoins = 0;

            const updates: any = {
                lastActiveDate: today,
                updatedAt: serverTimestamp()
            };

            // Basic streak logic
            if (profile.lastActiveDate !== today) {
                isFirstActivityToday = true;
                if (profile.lastActiveDate === yesterday) {
                    newStreak = (profile.streakCount || 0) + 1;
                } else {
                    newStreak = 1;
                }
                updates.streakCount = newStreak;

                // Check streak milestone rewards (7, 15, 30 days)
                try {
                    const snap = await getDoc(doc(db, 'settings', 'streakRewards'));
                    const rewardsConfig = snap.exists() ? snap.data() : { day7: 50, day15: 150, day30: 500 };

                    if (newStreak === 7) rewardCoins = rewardsConfig.day7 ?? 50;
                    else if (newStreak === 15) rewardCoins = rewardsConfig.day15 ?? 150;
                    else if (newStreak === 30) rewardCoins = rewardsConfig.day30 ?? 500;

                    if (rewardCoins > 0) {
                        updates.coins = increment(rewardCoins);
                        await logCoinTransaction(auth.currentUser.uid, {
                            amount: rewardCoins,
                            type: 'reward',
                            reason: `Daily Streak Reward (${newStreak} Days)`
                        });
                    }
                } catch (e) {
                    console.error("Streak rewards fetch error:", e);
                }
            }

            await updateDoc(userRef, updates);

            if (isFirstActivityToday) {
                let nextMilestone = 7;
                let nextReward = 50;
                if (newStreak >= 30) { nextMilestone = 30; nextReward = 500; }
                else if (newStreak >= 15) { nextMilestone = 30; nextReward = 500; }
                else if (newStreak >= 7) { nextMilestone = 15; nextReward = 150; }

                setStreakRewardInfo({
                    streakCount: newStreak,
                    rewardCoins: rewardCoins,
                    actionType,
                    nextMilestone,
                    nextReward
                });
            }
        } catch (err) {
            console.error("Failed to record activity:", err);
        }
    };

    // Track state from Firebase Auth
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: any) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                getAccessToken().then(token => setAccessToken(token));
                const userDocRef = doc(db, 'users', firebaseUser.uid);
                
                const unsubProfile = onSnapshot(userDocRef, async (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const today = getFormattedDate(0);
                        const yesterday = getFormattedDate(-1);
                        let calculatedStreak = data.streakCount || 0;
                        if (data.lastActiveDate && data.lastActiveDate !== today && data.lastActiveDate !== yesterday) {
                            // If user was last active before yesterday and hasn't logged activity today yet, show streak as 0
                            calculatedStreak = 0;
                        }

                        const userProfile: UserProfile = {
                            userId: firebaseUser.uid,
                            name: data.name || firebaseUser.displayName || '',
                            mobile: data.mobile || '',
                            study: data.study || '',
                            studyFocus: data.studyFocus || '',
                            email: data.email || firebaseUser.email || '',
                            photoURL: firebaseUser.photoURL || undefined,
                            photoUrl: data.photoUrl || '',
                            isManager: data.isManager || (firebaseUser.email && (firebaseUser.email.toLowerCase() === 'sandeepsinghchouhan081@gmail.com' || firebaseUser.email.toLowerCase() === 'bodhak355@gmail.com')) || false,
                            coins: data.coins !== undefined ? data.coins : 50,
                            streakCount: calculatedStreak,
                            lastActiveDate: data.lastActiveDate || '',
                            awPassExpirity: data.awPassExpirity || 0,
                            quizPassExpirity: data.quizPassExpirity || 0,
                            unlimitedExpirity: data.unlimitedExpirity || 0,
                            ipAddress: data.ipAddress || '',
                            deviceFingerprint: data.deviceFingerprint || '',
                            language: data.language || 'hi'
                        };

                        const isManagerEmail = firebaseUser.email && (firebaseUser.email.toLowerCase() === 'sandeepsinghchouhan081@gmail.com' || firebaseUser.email.toLowerCase() === 'bodhak355@gmail.com');
                        
                        // Async check session info ONCE per browser session rather than reactively on snapshot modifications
                        if (!isSessionChecked) {
                            isSessionChecked = true;
                            (async () => {
                                try {
                                    const ip = await getIP();
                                    const fingerprint = getFingerprint();
                                    
                                    let needsDocUpdate = false;
                                    const docUpdatePayload: any = {};

                                    if (data.ipAddress !== ip || data.deviceFingerprint !== fingerprint) {
                                        docUpdatePayload.ipAddress = ip;
                                        docUpdatePayload.deviceFingerprint = fingerprint;
                                        needsDocUpdate = true;
                                    }

                                    if (isManagerEmail && !data.isManager) {
                                        docUpdatePayload.isManager = true;
                                        needsDocUpdate = true;
                                    }

                                    if (needsDocUpdate) {
                                        docUpdatePayload.updatedAt = serverTimestamp();
                                        await setDoc(userDocRef, docUpdatePayload, { merge: true });
                                    }
                                } catch (e) {
                                    console.error("Session update error:", e);
                                }
                            })();
                        }

                        setProfile(userProfile);
                        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
                    } else if (!registering) {
                        handleNewUserRegistration(firebaseUser);
                    }
                    setLoading(false);
                }, (err) => {
                    console.error("Firestore snapshot error:", err);
                    setLoading(false);
                });

                return () => unsubProfile();
            } else {
                setUser(null);
                setProfile(null);
                localStorage.removeItem(PROFILE_STORAGE_KEY);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const handleNewUserRegistration = async (firebaseUser: any) => {
        // Prevent double registration
        if (registering === firebaseUser.uid) return;
        
        setRegistering(firebaseUser.uid);
        try {
            const isManagerEmail = firebaseUser.email === 'sandeepsinghchouhan081@gmail.com';
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            
            // Check if already exists just in case of race sessions
            const existingCheck = await getDoc(userDocRef);
            if (existingCheck.exists()) {
                setRegistering(null);
                return existingCheck.data() as UserProfile;
            }

            const ip = await getIP();
            const fingerprint = getFingerprint();

            // Check for fraud (Device fingerprint)
            try {
                const q = query(collection(db, 'users'), where('deviceFingerprint', '==', fingerprint));
                const fraudSnap = await getDocs(q);
                if (!fraudSnap.empty && !isManagerEmail) {
                   setError("Registration blocked: Multiple accounts from same device detected / उसी डिवाइस से एकाधिक खाते मिले।");
                   await signOut(auth);
                   setRegistering(null);
                   throw new Error("Fraud detected: multiple accounts from same device");
                }
            } catch (queryErr) {
                console.warn("Fraud check query failed (permissions?):", queryErr);
            }

            // Check for repeated IP signups (limit e.g. 5)
            try {
                const ipQ = query(collection(db, 'users'), where('ipAddress', '==', ip));
                const ipSnap = await getDocs(ipQ);
                if (ipSnap.size >= 5 && !isManagerEmail) {
                    console.warn("Multiple signups from IP:", ip);
                }
            } catch (ipErr) {
                console.warn("IP check query failed:", ipErr);
            }

        const newProfile: UserProfile = {
            userId: firebaseUser.uid,
            name: firebaseUser.displayName || '',
            mobile: '',
            study: '',
            studyFocus: '',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || undefined,
            photoUrl: firebaseUser.photoURL || '',
            isManager: isManagerEmail,
            coins: 50,
            streakCount: 0,
            lastActiveDate: new Date().toISOString().split('T')[0],
            unlimitedExpirity: 0,
            awPassExpirity: 0,
            quizPassExpirity: 0,
            ipAddress: ip,
            deviceFingerprint: fingerprint,
            language: 'hi'
        };
        
        await setDoc(userDocRef, {
            ...newProfile,
            updatedAt: serverTimestamp()
        });
        
        setProfile(newProfile);
        setRegistering(null);
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
        return newProfile;
    } catch (err: any) {
        console.error("Registration error:", err);
        setRegistering(null);
        throw err;
    }
    };

    // Signs in with Google Popup
    const signInWithGoogle = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await googleSignIn();
            if (result?.user) {
                const userDocRef = doc(db, 'users', result.user.uid);
                const userSnap = await getDoc(userDocRef);
                if (!userSnap.exists()) {
                    await handleNewUserRegistration(result.user);
                }
            }
            setLoading(false);
            return result?.user;
        } catch (err: any) {
            setLoading(false);
            const msg = err?.message || String(err);
            if (msg.includes("resource-exhausted") || msg.includes("Quota limit exceeded") || msg.includes("quota")) {
                setError("Daily database usage limits reached (Quota Exceeded). It will reset shortly. Please try again later. / दैनिक डेटाबेस सीमा समाप्त हो गई है (Quota Exceeded)। कृपया कुछ समय बाद पुनः प्रयास करें।");
            } else if (msg.includes("permission-denied") || msg.includes("sufficient permissions")) {
                setError("Access Denied: Missing or insufficient permissions. / पहुंच अस्वीकृत: आवश्यक अनुमति नहीं है।");
            } else {
                setError(msg);
            }
            throw err;
        }
    };

    // Log Out
    const logout = async () => {
        setLoading(true);
        try {
            await firebaseLogout();
            setUser(null);
            setProfile(null);
            localStorage.removeItem(PROFILE_STORAGE_KEY);
        } catch (err: any) {
            console.error("Error signing out:", err);
        } finally {
            setLoading(false);
        }
    };

    // Update Profile details in Firestore and state
    const updateProfile = async (newProfile: Partial<UserProfile>) => {
        if (!auth.currentUser) return;
        setLoading(true);
        setError(null);
        const path = `users/${auth.currentUser.uid}`;
        try {
            const currentProfile = profile || {} as UserProfile;
            
            // Explicitly map fields to avoid undefined values
            const profileData: any = {
                userId: auth.currentUser.uid,
                name: newProfile.name ?? currentProfile.name ?? auth.currentUser.displayName ?? '',
                mobile: newProfile.mobile ?? currentProfile.mobile ?? '',
                study: newProfile.study ?? currentProfile.study ?? '',
                studyFocus: newProfile.studyFocus ?? currentProfile.studyFocus ?? '',
                email: newProfile.email ?? currentProfile.email ?? auth.currentUser.email ?? '',
                isManager: (newProfile.isManager !== undefined) ? newProfile.isManager : (currentProfile.isManager ?? false),
                photoUrl: newProfile.photoUrl ?? currentProfile.photoUrl ?? auth.currentUser.photoURL ?? '',
                coins: (newProfile.coins !== undefined) ? newProfile.coins : (currentProfile.coins ?? 50),
                streakCount: (newProfile.streakCount !== undefined) ? newProfile.streakCount : (currentProfile.streakCount ?? 0),
                lastActiveDate: newProfile.lastActiveDate ?? currentProfile.lastActiveDate ?? '',
                awPassExpirity: newProfile.awPassExpirity ?? currentProfile.awPassExpirity ?? 0,
                quizPassExpirity: newProfile.quizPassExpirity ?? currentProfile.quizPassExpirity ?? 0,
                language: newProfile.language ?? currentProfile.language ?? 'hi',
                updatedAt: serverTimestamp()
            };
            
            // Preserve other system fields
            if (currentProfile.ipAddress) profileData.ipAddress = currentProfile.ipAddress;
            if (currentProfile.deviceFingerprint) profileData.deviceFingerprint = currentProfile.deviceFingerprint;
            
            const exp = newProfile.unlimitedExpirity ?? currentProfile.unlimitedExpirity;
            if (exp !== undefined) profileData.unlimitedExpirity = exp;

            const userDocRef = doc(db, 'users', auth.currentUser.uid);
            
            // Sanitize payload before sending to Firestore to prevent "undefined" errors
            const sanitizedData = Object.fromEntries(
                Object.entries(profileData).filter(([_, v]) => v !== undefined)
            );
            
            await setDoc(userDocRef, sanitizedData, { merge: true });

            // If displayName changed, update in Firebase Auth
            if (profileData.name && profileData.name !== auth.currentUser.displayName) {
                await firebaseUpdateProfile(auth.currentUser, { displayName: profileData.name });
            }
            
            // If photoUrl changed and is not a base64 (too large for auth), update in Firebase Auth too
            if (profileData.photoUrl && !profileData.photoUrl.startsWith('data:') && profileData.photoUrl !== auth.currentUser.photoURL) {
                 await firebaseUpdateProfile(auth.currentUser, { photoURL: profileData.photoUrl });
            }

            // Local state update
            setProfile(prev => ({ ...prev, ...profileData } as UserProfile));
        } catch (err: any) {
            handleFirestoreError(err, OperationType.WRITE, path);
        } finally {
            setLoading(false);
        }
    };

    const createGuestProfile = (): UserProfile => {
        const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
        return {
            userId: guestId,
            name: 'Guest Student / अतिथि छात्र',
            mobile: '',
            study: 'General Competitive Exams',
            studyFocus: 'UPSC / SSC / State PCS',
            email: 'guest@bodhak.app',
            isManager: false,
            coins: 100,
            streakCount: 1,
            lastActiveDate: new Date().toISOString().split('T')[0],
            unlimitedExpirity: 0,
            awPassExpirity: 0,
            quizPassExpirity: 0,
            language: 'hi'
        };
    };

    const signInAsGuest = () => {
        let currentProfile = profile;
        if (!currentProfile) {
            currentProfile = createGuestProfile();
            setProfile(currentProfile);
            try {
                localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(currentProfile));
            } catch (e) {}
        }
        setUser({ uid: currentProfile.userId, isAnonymous: true, displayName: currentProfile.name, email: currentProfile.email });
        setLoading(false);
        return currentProfile;
    };

    // Deducts coins for user actions (10 coins per action) with reliable local fallback
    const deductCoins = async (amount: number = 10): Promise<boolean> => {
        let activeProfile = profile;
        if (!activeProfile) {
            try {
                const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
                if (saved) activeProfile = JSON.parse(saved);
            } catch (e) {}
        }

        // Auto-initialize guest profile if user interacts without prior profile
        if (!activeProfile) {
            activeProfile = signInAsGuest();
        }

        // Managers have infinite/unlimited coins, so no deduction needed
        if (activeProfile.isManager) return true;

        // Check for active Unlimited Pass (6-day feature)
        const now = Date.now();
        if (activeProfile.unlimitedExpirity && activeProfile.unlimitedExpirity > now) {
            console.log("[Auth] Active Unlimited Pass detected. Skipping coin deduction.");
            return true;
        }
        
        const currentCoins = activeProfile.coins !== undefined ? activeProfile.coins : 50;
        if (currentCoins < amount) {
            return false;
        }
        
        const newCoins = currentCoins - amount;
        const updatedProfile = { ...activeProfile, coins: newCoins };
        setProfile(updatedProfile);
        try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
        } catch (e) {}

        if (auth.currentUser && !auth.currentUser.uid.startsWith('guest_')) {
            try {
                const userRef = doc(db, 'users', auth.currentUser.uid);
                await updateDoc(userRef, { 
                    coins: newCoins,
                    updatedAt: serverTimestamp() 
                });

                // Log the deduction
                await logCoinTransaction(auth.currentUser.uid, {
                    amount: -amount,
                    type: 'deduction',
                    reason: `Feature Usage (${amount} coins)`
                });
            } catch (err) {
                console.warn("[Auth] Firestore coin sync failed, using local deduction:", err);
            }
        }

        return true;
    };

    return { 
        user,
        profile, 
        accessToken,
        loading, 
        error,
        streakRewardInfo,
        authorizeDrive,
        clearStreakReward,
        recordDailyActivity,
        signInWithGoogle,
        signInAsGuest,
        logout,
        updateProfile,
        deductCoins
    };
};
