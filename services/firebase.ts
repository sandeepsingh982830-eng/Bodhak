import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  collection, 
  collectionGroup,
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  getDocFromServer,
  updateDoc,
  increment,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Scopes will be added dynamically when needed to avoid forcing Drive permissions on every login.

// Cache the access token in memory.
let cachedAccessToken: string | null = ((): string | null => {
    try {
        return localStorage.getItem('bodhak_gdrive_access_token');
    } catch {
        return null;
    }
})();
let isSigningIn = false;
let pendingPopupPromise: Promise<any> | null = null;

export const googleSignIn = async () => {
    if (pendingPopupPromise) {
        return pendingPopupPromise;
    }
    isSigningIn = true;
    pendingPopupPromise = (async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                cachedAccessToken = credential.accessToken;
                try {
                    localStorage.setItem('bodhak_gdrive_access_token', cachedAccessToken);
                } catch (e) {}
            }
            return { user: result.user, accessToken: cachedAccessToken };
        } catch (error: any) {
            if (error?.code !== 'auth/cancelled-popup-request' && error?.code !== 'auth/popup-closed-by-user') {
                console.error('Sign in error:', error);
            }
            throw error;
        } finally {
            isSigningIn = false;
            pendingPopupPromise = null;
        }
    })();
    return pendingPopupPromise;
};

export const getAccessToken = async (force: boolean = false): Promise<string | null> => {
    if (!cachedAccessToken) {
        try {
            cachedAccessToken = localStorage.getItem('bodhak_gdrive_access_token');
        } catch {}
    }

    if (cachedAccessToken && !force) return cachedAccessToken;
    
    if (pendingPopupPromise) {
        try {
            await pendingPopupPromise;
        } catch {
            // ignore cancelled promise
        }
        return cachedAccessToken;
    }
    
    // Trigger popup ONLY if explicitly forced by user action
    if (force) {
        pendingPopupPromise = (async () => {
            try {
                const driveProvider = new GoogleAuthProvider();
                driveProvider.addScope('https://www.googleapis.com/auth/drive');
                driveProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
                driveProvider.addScope('https://www.googleapis.com/auth/drive.file');
                driveProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
                
                const result = await signInWithPopup(auth, driveProvider);
                const credential = GoogleAuthProvider.credentialFromResult(result);
                if (credential?.accessToken) {
                    cachedAccessToken = credential.accessToken;
                    try {
                        localStorage.setItem('bodhak_gdrive_access_token', cachedAccessToken);
                    } catch (e) {}
                }
            } catch (error: any) {
                if (error?.code !== 'auth/cancelled-popup-request' && error?.code !== 'auth/popup-closed-by-user') {
                    console.error('Error getting access token:', error);
                }
            } finally {
                pendingPopupPromise = null;
            }
        })();
        await pendingPopupPromise;
    }
    
    return cachedAccessToken;
};

export const initAuthListener = (
    onAuthSuccess?: (user: any, token: string | null) => void,
    onAuthFailure?: () => void
) => {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else {
            cachedAccessToken = null;
            try {
                localStorage.removeItem('bodhak_gdrive_access_token');
            } catch {}
            if (onAuthFailure) onAuthFailure();
        }
    });
};

export const logout = async () => {
    await signOut(auth);
    cachedAccessToken = null;
    try {
        localStorage.removeItem('bodhak_gdrive_access_token');
        localStorage.removeItem('bodhak_user_profile');
    } catch {}
};

// Test connection on boot as mandated by skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Define operations enum & error handling helper as mandated by skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed: ', JSON.stringify(errInfo));
  
  let friendlyMsg = errMessage;
  if (errMessage.includes("resource-exhausted") || errMessage.includes("Quota limit exceeded") || errMessage.includes("quota")) {
    friendlyMsg = "Daily database usage limits reached (Quota Exceeded). It will reset shortly. Please try again later or contact support. / दैनिक डेटाबेस सीमा समाप्त हो गई है (Quota Exceeded)। यह जल्द ही रीसेट हो जाएगी, कृपया कुछ समय बाद पुनः प्रयास करें।";
  } else if (errMessage.includes("permission-denied") || errMessage.includes("sufficient permissions")) {
    friendlyMsg = "Access Denied: Missing or insufficient permissions. / पहुंच अस्वीकृत: आवश्यक अनुमति नहीं है।";
  }
  
  throw new Error(friendlyMsg);
}

export function sanitizeForFirestore<T>(data: T): T {
    if (data === null || typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => sanitizeForFirestore(item)) as unknown as T;
    }

    const sanitized: any = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            const value = (data as any)[key];
            if (value !== undefined) {
                sanitized[key] = sanitizeForFirestore(value);
            }
        }
    }
    return sanitized as T;
}

export { 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  firebaseUpdateProfile,
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  collection, 
  collectionGroup,
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  updateDoc,
  increment,
  onSnapshot,
  orderBy,
  limit
};
