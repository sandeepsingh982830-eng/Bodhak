import React, { useState, useEffect } from 'react';
import { 
    Users, 
    ShieldCheck, 
    Search, 
    Crown, 
    Smartphone, 
    BookOpen, 
    Mail, 
    RefreshCw, 
    AlertCircle, 
    CheckCircle,
    UserCircle,
    ArrowLeft,
    MessageCircle,
    Trash2,
    Bell,
    Loader2,
    Coins,
    Star,
    Key
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, serverTimestamp, getDoc, setDoc, onSnapshot, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../services/firebase';
import { UserProfile, useAuth } from '../hooks/useAuth';
import ManagerChatPortal from './ManagerChatPortal';
import ManagerGeminiKeys from './ManagerGeminiKeys';

import { logCoinTransaction } from '../services/storageService';

interface GlobalSettings {
    pricePerCoin: number;
    minCoins: number;
    unlimitedPassPrice: number;
    unlimitedPassDays: number;
    awPassPrice?: number;
    awPassDays?: number;
    quizPassPrice?: number;
    quizPassDays?: number;
    upiId: string;
    couponCode?: string;
    couponDiscount?: number;
    // New fields
    shareText?: string;
    shareImageUrl?: string;
    shareAppLink?: string;
    coupons?: Array<{ code: string; discount: number }>;
    coinPacks?: Array<{ days: number; price: number; id: string }>;
    offerDiscountPct?: number;
    offerExpiresAt?: number;
}

const PaymentRequestsTab: React.FC<{ settings: GlobalSettings }> = ({ settings }) => {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Custom inline confirmations state to avoid sandboxed iframe dialog blocks
    const [confirmingApproveId, setConfirmingApproveId] = useState<string | null>(null);
    const [confirmingRejectId, setConfirmingRejectId] = useState<string | null>(null);
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

    // Custom inline notifications
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'paymentRequests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setRequests(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching payment requests:", err);
            setError("Failed to monitor payment requests in real time.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const executeApprove = async (req: any) => {
        const targetId = req.id || req.requestId;
        if (!targetId) {
            setErrorMsg("Invalid request ID, cannot approve.");
            return;
        }
        setActionLoadingId(targetId);
        setConfirmingApproveId(null);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            const userDocRef = doc(db, 'users', req.userId);
            const userSnap = await getDoc(userDocRef);
            
            if (!userSnap.exists()) {
                setErrorMsg("Target user profile does not exist in Firestore! Can't approve.");
                setActionLoadingId(null);
                return;
            }

            const userData = userSnap.data();
            const now = Date.now();

            if (req.isUnlimited) {
                const planType = req.planType || (req.note?.toLowerCase().includes('ans. chak') || req.note?.toLowerCase().includes('aw') ? 'aw' : req.note?.toLowerCase().includes('quiz') ? 'quiz' : 'all');
                
                if (planType === 'aw') {
                    const days = req.unlimitedDays || settings.awPassDays || 30;
                    const currentExpirity = (userData.awPassExpirity && userData.awPassExpirity > now) ? userData.awPassExpirity : now;
                    const newExpirity = currentExpirity + (days * 24 * 60 * 60 * 1000);
                    
                    await updateDoc(userDocRef, {
                        awPassExpirity: newExpirity,
                        updatedAt: serverTimestamp()
                    });

                    await logCoinTransaction(req.userId, {
                        amount: 0,
                        type: 'reward',
                        reason: `Approved manual pay: ${days}-Day Ans. Chak Pass (Ref: ${req.utr})`
                    });
                } else if (planType === 'quiz') {
                    const days = req.unlimitedDays || settings.quizPassDays || 30;
                    const currentExpirity = (userData.quizPassExpirity && userData.quizPassExpirity > now) ? userData.quizPassExpirity : now;
                    const newExpirity = currentExpirity + (days * 24 * 60 * 60 * 1000);
                    
                    await updateDoc(userDocRef, {
                        quizPassExpirity: newExpirity,
                        updatedAt: serverTimestamp()
                    });

                    await logCoinTransaction(req.userId, {
                        amount: 0,
                        type: 'reward',
                        reason: `Approved manual pay: ${days}-Day Quiz Pass (Ref: ${req.utr})`
                    });
                } else {
                    const days = req.unlimitedDays || settings.unlimitedPassDays || 6;
                    const currentExpirity = (userData.unlimitedExpirity && userData.unlimitedExpirity > now) ? userData.unlimitedExpirity : now;
                    const newExpirity = currentExpirity + (days * 24 * 60 * 60 * 1000);
                    
                    await updateDoc(userDocRef, {
                        unlimitedExpirity: newExpirity,
                        updatedAt: serverTimestamp()
                    });

                    await logCoinTransaction(req.userId, {
                        amount: 0,
                        type: 'reward',
                        reason: `Approved manual pay: ${days}-Day Full Unlimited Pass (Ref: ${req.utr})`
                    });
                }
            } else {
                const currentCoins = userData.coins !== undefined ? userData.coins : 50;
                const coinsToAdd = req.coins || 0;
                const newCoins = currentCoins + coinsToAdd;

                await updateDoc(userDocRef, {
                    coins: newCoins,
                    updatedAt: serverTimestamp()
                });

                await logCoinTransaction(req.userId, {
                    amount: coinsToAdd,
                    type: 'addition',
                    reason: `Approved manual pay: +${coinsToAdd} Coins`
                });
            }

            // First update request status to 'approved' so user's real-time listener gets notified instantly
            const requestDocRef = doc(db, 'paymentRequests', targetId);
            await updateDoc(requestDocRef, {
                status: 'approved',
                updatedAt: serverTimestamp()
            });

            // Delete request document after 3.5 seconds so user real-time listener gets the approved signal
            setTimeout(async () => {
                try {
                    await deleteDoc(requestDocRef);
                } catch (e) {
                    console.error("Cleanup approved payment request error:", e);
                }
            }, 3500);

            setSuccessMsg("Payment approved and coins/pass credited successfully! Request cleared. / भुगतान को स्वीकृत किया गया और कॉइन्स क्रेडिट हो गए हैं! अनुरोध संदेश सफ़लतापूर्वक हटा दिया गया है।");
            setTimeout(() => setSuccessMsg(null), 8000);
        } catch (err: any) {
            console.error("Failed to approve request:", err);
            setErrorMsg("Approve action failed: " + err.message);
            setTimeout(() => setErrorMsg(null), 8000);
        } finally {
            setActionLoadingId(null);
        }
    };

    const executeReject = async (req: any) => {
        const targetId = req.id || req.requestId;
        if (!targetId) {
            setErrorMsg("Invalid request ID, cannot reject.");
            return;
        }
        setActionLoadingId(targetId);
        setConfirmingRejectId(null);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            // Update request document status to 'rejected' first so client gets real-time notification
            const requestDocRef = doc(db, 'paymentRequests', targetId);
            await updateDoc(requestDocRef, {
                status: 'rejected',
                updatedAt: serverTimestamp()
            });
            
            setTimeout(async () => {
                try {
                    await deleteDoc(requestDocRef);
                } catch (e) {
                    console.error("Cleanup rejected payment request error:", e);
                }
            }, 3500);
            
            setSuccessMsg("Payment request rejected and message deleted successfully! / भुगतान अनुरोध अस्वीकृत किया गया और संदेश हटा दिया गया है।");
            setTimeout(() => setSuccessMsg(null), 8000);
        } catch (err: any) {
            console.error("Failed to reject request:", err);
            setErrorMsg("Reject action failed: " + err.message);
            setTimeout(() => setErrorMsg(null), 8000);
        } finally {
            setActionLoadingId(null);
        }
    };

    const executeDelete = async (requestId: string) => {
        if (!requestId) return;
        setConfirmingDeleteId(null);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            await deleteDoc(doc(db, 'paymentRequests', requestId));
            setSuccessMsg("Request record permanently deleted. / अनुरोध रिकॉर्ड स्थायी रूप से हटा दिया गया है।");
            setTimeout(() => setSuccessMsg(null), 5000);
        } catch (err: any) {
            setErrorMsg("Deletion failed: " + err.message);
            setTimeout(() => setErrorMsg(null), 5000);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl text-left">
            <div className="bg-gradient-to-r from-amber-600 to-amber-750 p-6 rounded-3xl text-white shadow-md flex items-center justify-between">
                <div className="space-y-1">
                    <h3 className="text-lg font-black tracking-tight flex items-center gap-2 font-sans font-medium">
                        💳 Manual UPI Ref / UTR Payment Verification Requests
                    </h3>
                    <p className="text-white/85 text-xs font-semibold leading-relaxed">
                        Verify and approve coin/pass credit requests submitted by users after bank UPI payments. Real-time automatic synchronization!
                    </p>
                </div>
            </div>

            {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-250 text-emerald-850 text-xs font-bold rounded-2xl flex items-center gap-2 animate-in fade-in zoom-in-95">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}

            {errorMsg && (
                <div className="p-3.5 bg-red-50 border border-red-250 text-red-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-in fade-in zoom-in-95">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {error && (
                <p className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">{error}</p>
            )}

            {loading ? (
                <div className="p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
                    <p className="text-slate-400 text-xs font-extrabold mt-3 animate-pulse">Loading payment requests...</p>
                </div>
            ) : requests.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-450 text-xs font-extrabold">
                    No payment verification requests found.
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/85 border-b border-slate-200 text-[10px] tracking-widest font-mono text-slate-450 uppercase font-black">
                                    <th className="px-4 py-3 pl-6">User Details</th>
                                    <th className="px-4 py-3">Benefit Requested</th>
                                    <th className="px-4 py-3">Settlement / UTR No</th>
                                    <th className="px-4 py-3">Submitted At</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right pr-6">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map((req) => {
                                    const createdDate = req.createdAt?.seconds 
                                        ? new Date(req.createdAt.seconds * 1000) 
                                        : req.createdAt?.toDate ? req.createdAt.toDate() : new Date();

                                    return (
                                        <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                                            <td className="px-4 py-4 pl-6">
                                                <p className="font-extrabold text-slate-800 text-xs">{req.userName}</p>
                                                <p className="text-[10px] text-slate-450 font-semibold">{req.userEmail || 'No Email'}</p>
                                                <p className="text-[9px] font-mono text-slate-400 mt-0.5">UID: {req.userId}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider ${req.isUnlimited ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' : 'bg-amber-50 text-amber-700 border border-amber-150'}`}>
                                                    {req.isUnlimited ? `${req.unlimitedDays || settings.unlimitedPassDays}d Pass` : `+${req.coins} Coins`}
                                                </span>
                                                <p className="text-[10px] font-black text-slate-700 mt-1">₹{req.amount}</p>
                                            </td>
                                            <td className="px-4 py-4 font-mono">
                                                <p className="text-xs font-black text-slate-800 select-all">{req.utr}</p>
                                                {req.note && <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Note: {req.note}</p>}
                                            </td>
                                            <td className="px-4 py-4 text-[10px] text-slate-500 font-semibold leading-relaxed">
                                                {createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                {req.status === 'pending' && (
                                                    <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse">Pending</span>
                                                )}
                                                {req.status === 'approved' && (
                                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2.5 py-1 rounded-full">Approved</span>
                                                )}
                                                {req.status === 'rejected' && (
                                                    <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2.5 py-1 rounded-full">Rejected</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-right pr-6">
                                                <div className="flex items-center justify-end gap-2">
                                                    {req.status === 'pending' ? (
                                                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                                                            {confirmingApproveId === (req.id || req.requestId) ? (
                                                                <div className="flex items-center gap-1 bg-emerald-50 p-1.5 rounded-xl border border-emerald-200">
                                                                    <button
                                                                        type="button"
                                                                        disabled={actionLoadingId === (req.id || req.requestId)}
                                                                        onClick={() => executeApprove(req)}
                                                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg transition duration-150 active:scale-[0.93]"
                                                                    >
                                                                        Yes, Approve / हाँ, स्वीकृत करें
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmingApproveId(null)}
                                                                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10px] rounded-lg border border-slate-200 transition duration-150"
                                                                    >
                                                                        Cancel / रद्द
                                                                    </button>
                                                                </div>
                                                            ) : confirmingRejectId === (req.id || req.requestId) ? (
                                                                <div className="flex items-center gap-1 bg-rose-50 p-1.5 rounded-xl border border-rose-200">
                                                                    <button
                                                                        type="button"
                                                                        disabled={actionLoadingId === (req.id || req.requestId)}
                                                                        onClick={() => executeReject(req)}
                                                                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] rounded-lg transition duration-150 active:scale-[0.93]"
                                                                    >
                                                                        Yes, Reject & Delete / हाँ, हटाएँ
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmingRejectId(null)}
                                                                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10px] rounded-lg border border-slate-200 transition duration-150"
                                                                    >
                                                                        Cancel / रद्द
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        disabled={actionLoadingId !== null}
                                                                        onClick={() => {
                                                                            setConfirmingApproveId(req.id || req.requestId);
                                                                            setConfirmingRejectId(null);
                                                                        }}
                                                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg transition hover:scale-[1.03] active:scale-[0.95]"
                                                                    >
                                                                        Approve / स्वीकृत
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={actionLoadingId !== null}
                                                                        onClick={() => {
                                                                            setConfirmingRejectId(req.id || req.requestId);
                                                                            setConfirmingApproveId(null);
                                                                        }}
                                                                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] rounded-lg transition hover:scale-[1.03] active:scale-[0.95]"
                                                                    >
                                                                        Reject / अस्वीकृत
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        confirmingDeleteId === (req.id || req.requestId) ? (
                                                            <div className="flex items-center gap-1 bg-red-50 p-1.5 rounded-xl border border-red-200">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => executeDelete(req.id || req.requestId)}
                                                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[9px] rounded-lg transition duration-150"
                                                                >
                                                                    SURE / पक्का हटाएँ
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmingDeleteId(null)}
                                                                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[9px] rounded-lg border border-slate-200 transition duration-150"
                                                                >
                                                                    No
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmingDeleteId(req.id || req.requestId)}
                                                                className="p-1 hover:bg-slate-100 hover:text-red-700 rounded text-slate-400 transition"
                                                                title="Delete request record"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

interface ManagerPortalProps {
    onBack: () => void;
}

interface UserStorageStats {
    quizzes: number;
    notes: number;
    savedAffairs: number;
}

export const ManagerPortal: React.FC<ManagerPortalProps> = ({ onBack }) => {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<UserProfile[]>([]);
    const [storageStats, setStorageStats] = useState<Record<string, UserStorageStats>>({});
    const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // UID of user whose action is performing
    const [activeTab, setActiveTab] = useState<'accounts' | 'support_chat' | 'payment_requests' | 'broadcast' | 'ratings' | 'settings' | 'gemini_keys'>('accounts');

    // Listen for custom tab switch events from manager pop-up notifications
    useEffect(() => {
        const handleTabSwitch = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.tab) {
                setActiveTab(detail.tab);
            }
        };
        window.addEventListener('open-manager-portal-tab', handleTabSwitch);
        return () => window.removeEventListener('open-manager-portal-tab', handleTabSwitch);
    }, []);

    // App Ratings state
    const [appRatings, setAppRatings] = useState<any[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'appRatings'));
        const unsub = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            setAppRatings(list);
        }, (err) => {
            console.error("Error fetching app ratings in ManagerPortal:", err);
        });
        return () => unsub();
    }, []);

    // Broadcast states
    const [managerNotifications, setManagerNotifications] = useState<any[]>([]);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifText, setNotifText] = useState('');
    const [notifImage, setNotifImage] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [isUploadingNotifImg, setIsUploadingNotifImg] = useState(false);
    const [pendingDeleteBroadcastId, setPendingDeleteBroadcastId] = useState<string | null>(null);

    // Settings state
    const [settings, setSettings] = useState<GlobalSettings>({
        pricePerCoin: 0.4,
        minCoins: 10,
        unlimitedPassPrice: 100,
        unlimitedPassDays: 6,
        awPassPrice: 49,
        awPassDays: 30,
        quizPassPrice: 49,
        quizPassDays: 30,
        upiId: '9828030263@axl',
        couponCode: 'BODHAK50',
        couponDiscount: 50,
        shareText: '',
        shareImageUrl: '',
        shareAppLink: '',
        coupons: [],
        coinPacks: [],
        offerDiscountPct: 0,
        offerExpiresAt: 0
    });
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [offerHoursInput, setOfferHoursInput] = useState<string>('');
    const [isUploadingShareImg, setIsUploadingShareImg] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);

    const [streakRewards, setStreakRewards] = useState<any>({
        day7: 50,
        day15: 150,
        day30: 500
    });
    const [isSavingStreakRewards, setIsSavingStreakRewards] = useState(false);

    useEffect(() => {
        const docRef = doc(db, 'settings', 'streakRewards');
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setStreakRewards(snap.data());
            }
        });
        return () => unsub();
    }, []);

    const handleSaveStreakRewards = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingStreakRewards(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const sanitizedRewards = sanitizeForFirestore(streakRewards);
            await setDoc(doc(db, 'settings', 'streakRewards'), sanitizedRewards);
            setFeedbackSuccess("Streak rewards updated successfully! / स्ट्रैक रिवार्ड्स अपडेट कर दिए गए हैं।");
        } catch (err) {
            console.error("Error saving streak rewards:", err);
            setFeedbackError("Failed to save streak rewards.");
        } finally {
            setIsSavingStreakRewards(false);
        }
    };

    const handleShareImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setSettingsError('Please select an valid image file. / कृपया फोटो चुनें।');
            return;
        }
        if (file.size > 600 * 1024) { // 600KB limit check for base64 safety
            setSettingsError('Share image too large. Max 600KB allowed. / शेयर फोटो 600KB से कम होनी चाहिए।');
            return;
        }

        setIsUploadingShareImg(true);
        setSettingsError(null);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setSettings(prev => ({ ...prev, shareImageUrl: result }));
            setIsUploadingShareImg(false);
        };
        reader.onerror = () => {
            setSettingsError('Failed to upload share image.');
            setIsUploadingShareImg(false);
        };
        reader.readAsDataURL(file);
    };

    const handleNotifImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setFeedbackError('Please select valid image for notification. / कृपया अधिसूचना के लिए वैध फोटो चुनें।');
            return;
        }
        if (file.size > 600 * 1024) { // 600KB limit check
            setFeedbackError('Notification image too large. Max 600KB allowed. / अधिसूचना फोटो 600KB से कम होनी चाहिए।');
            return;
        }

        setIsUploadingNotifImg(true);
        setFeedbackError(null);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setNotifImage(result);
            setIsUploadingNotifImg(false);
        };
        reader.onerror = () => {
            setFeedbackError('Failed to upload notification image.');
            setIsUploadingNotifImg(false);
        };
        reader.readAsDataURL(file);
    };

    const fetchStorageInfo = async (userId: string) => {
        setLoadingStats(prev => ({ ...prev, [userId]: true }));
        try {
            const quizCount = (await getDocs(collection(db, `users/${userId}/quizzes`))).size;
            const noteCount = (await getDocs(collection(db, `users/${userId}/notes`))).size;
            const affairCount = (await getDocs(collection(db, `users/${userId}/savedAffairs`))).size;
            
            setStorageStats(prev => ({
                ...prev,
                [userId]: {
                    quizzes: quizCount,
                    notes: noteCount,
                    savedAffairs: affairCount
                }
            }));
        } catch (err) {
            console.warn(`Error fetching storage for ${userId}:`, err);
        } finally {
            setLoadingStats(prev => ({ ...prev, [userId]: false }));
        }
    };

    const deleteUserData = async (userId: string, name: string) => {
        if (!confirm(`⚠️ CRITICAL ACTION: Are you sure you want to PERMANENTLY delete ALL Quizzes and Notes for ${name}? / क्या आप निश्चित रूप से ${name} के सभी क्विज़ और नोट्स को स्थायी रूप से हटाना चाहते हैं?`)) {
            return;
        }

        setActionLoading(userId);
        try {
            // Delete Quizzes
            const quizzes = await getDocs(collection(db, `users/${userId}/quizzes`));
            const quizDel = quizzes.docs.map(d => deleteDoc(doc(db, `users/${userId}/quizzes/${d.id}`)));
            
            // Delete Notes
            const notes = await getDocs(collection(db, `users/${userId}/notes`));
            const noteDel = notes.docs.map(d => deleteDoc(doc(db, `users/${userId}/notes/${d.id}`)));
            
            // Delete Saved Affairs
            const affairs = await getDocs(collection(db, `users/${userId}/savedAffairs`));
            const affairDel = affairs.docs.map(d => deleteDoc(doc(db, `users/${userId}/savedAffairs/${d.id}`)));
            
            await Promise.all([...quizDel, ...noteDel, ...affairDel]);
            
            setFeedbackSuccess(`Successfully wiped storage for ${name}!`);
            // Refresh stats
            fetchStorageInfo(userId);
        } catch (err) {
            console.error("Delete Error:", err);
            setFeedbackError(`Failed to wipe storage for ${name}.`);
        } finally {
            setActionLoading(null);
        }
    };

    const deleteUserFully = async (userId: string, name: string) => {
        if (!confirm(`🚨 EXTREME WARNING: Are you sure you want to PERMANENTLY DELETE the registered user "${name}" and ALL their data / progress? This cannot be undone! \n\nक्या आप सचमुच ${name} का अकाउंट और सारा डेटा हमेशा के लिए डिलीट करना चाहते हैं?`)) {
            return;
        }

        setActionLoading(userId);
        try {
            // Delete Quizzes
            const quizzes = await getDocs(collection(db, `users/${userId}/quizzes`));
            const quizDel = quizzes.docs.map(d => deleteDoc(doc(db, `users/${userId}/quizzes/${d.id}`)));
            
            // Delete Notes
            const notes = await getDocs(collection(db, `users/${userId}/notes`));
            const noteDel = notes.docs.map(d => deleteDoc(doc(db, `users/${userId}/notes/${d.id}`)));
            
            // Delete Saved Affairs
            const affairs = await getDocs(collection(db, `users/${userId}/savedAffairs`));
            const affairDel = affairs.docs.map(d => deleteDoc(doc(db, `users/${userId}/savedAffairs/${d.id}`)));
            
            await Promise.all([...quizDel, ...noteDel, ...affairDel]);
            
            // Delete User Profile doc itself
            await deleteDoc(doc(db, 'users', userId));
            
            setFeedbackSuccess(`Successfully deleted user "${name}" and all associated data! / यूज़र और उसका सारा डेटा डिलीट कर दिया गया है!`);
            setAccounts(prev => prev.filter(acc => acc.userId !== userId));
        } catch (err: any) {
            console.error("Delete Full User Error:", err);
            setFeedbackError(`Failed to delete user profile: ${err?.message || err}`);
        } finally {
            setActionLoading(null);
        }
    };

    const fetchAccounts = async () => {
        setLoading(true);
        setFeedbackError(null);
        try {
            const usersColRef = collection(db, 'users');
            const snapshot = await getDocs(usersColRef);
            const userList: UserProfile[] = [];
            
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                userList.push({
                    userId: docSnap.id,
                    name: data.name || 'Anonymous User',
                    mobile: data.mobile || '',
                    study: data.study || '',
                    email: data.email || 'No Email',
                    photoURL: data.photoURL || undefined,
                    isManager: data.isManager || false,
                    coins: data.coins !== undefined ? data.coins : 50,
                    unlimitedExpirity: data.unlimitedExpirity || 0,
                    awPassExpirity: data.awPassExpirity || 0,
                    quizPassExpirity: data.quizPassExpirity || 0,
                    ipAddress: data.ipAddress || '',
                    deviceFingerprint: data.deviceFingerprint || '',
                    streakCount: data.streakCount !== undefined ? data.streakCount : 0,
                    lastActiveDate: data.lastActiveDate || ''
                });
            });
            
            setAccounts(userList);
        } catch (err: any) {
            console.error('Error fetching registered accounts:', err);
            setFeedbackError('Missing or insufficient permissions in Firestore rules, or database is unprovisioned. Please make sure you are logged in as a Manager.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setFeedbackError(null);
        
        const usersColRef = collection(db, 'users');
        const unsubscribeUsers = onSnapshot(usersColRef, (snapshot) => {
            const userList: UserProfile[] = [];
            
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                userList.push({
                    userId: docSnap.id,
                    name: data.name || 'Anonymous User',
                    mobile: data.mobile || '',
                    study: data.study || '',
                    email: data.email || 'No Email',
                    photoURL: data.photoURL || undefined,
                    isManager: data.isManager || false,
                    coins: data.coins !== undefined ? data.coins : 50,
                    unlimitedExpirity: data.unlimitedExpirity || 0,
                    awPassExpirity: data.awPassExpirity || 0,
                    quizPassExpirity: data.quizPassExpirity || 0,
                    ipAddress: data.ipAddress || '',
                    deviceFingerprint: data.deviceFingerprint || '',
                    streakCount: data.streakCount !== undefined ? data.streakCount : 0,
                    lastActiveDate: data.lastActiveDate || ''
                });
            });
            
            setAccounts(userList);
            setLoading(false);
        }, (err: any) => {
            console.error('Error listening to registered accounts:', err);
            setFeedbackError('Missing or insufficient permissions in Firestore rules, or database is unprovisioned. Please make sure you are logged in as a Manager.');
            setLoading(false);
        });

        const settingsDocRef = doc(db, 'settings', 'config');
        const unsubscribeSettings = onSnapshot(settingsDocRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setSettings({
                    pricePerCoin: data.pricePerCoin || 0.4,
                    minCoins: data.minCoins || 10,
                    unlimitedPassPrice: data.unlimitedPassPrice || 100,
                    unlimitedPassDays: data.unlimitedPassDays || 6,
                    awPassPrice: data.awPassPrice || 49,
                    awPassDays: data.awPassDays || 30,
                    quizPassPrice: data.quizPassPrice || 49,
                    quizPassDays: data.quizPassDays || 30,
                    upiId: data.upiId || '9828030263@axl',
                    couponCode: data.couponCode || '',
                    couponDiscount: data.couponDiscount !== undefined ? data.couponDiscount : 0,
                    shareText: data.shareText || '',
                    shareImageUrl: data.shareImageUrl || '',
                    shareAppLink: data.shareAppLink || '',
                    coupons: data.coupons || [],
                    coinPacks: data.coinPacks || [],
                    offerDiscountPct: data.offerDiscountPct || 0,
                    offerExpiresAt: data.offerExpiresAt || 0
                });
            } else {
                // Initialize default if not exists
                setDoc(settingsDocRef, {
                    pricePerCoin: 0.4,
                    minCoins: 10,
                    unlimitedPassPrice: 100,
                    unlimitedPassDays: 6,
                    upiId: '9828030263@axl',
                    couponCode: 'BODHAK50',
                    couponDiscount: 50,
                    updatedAt: Date.now()
                }).catch(err => console.error('Error initializing settings:', err));
            }
        }, (err) => {
            console.error('Error listening to app settings:', err);
        });

        return () => {
            unsubscribeUsers();
            unsubscribeSettings();
        };
    }, []);

    // Subscribe to notifications in real-time
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setManagerNotifications(list);
        }, (error) => {
            console.error('Error listening to manager notifications:', error);
        });
        return () => unsubscribe();
    }, [user]);

    const handleManagerBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedbackError(null);
        setFeedbackSuccess(null);
        if (!notifTitle.trim() || !notifText.trim() || !user) return;

        setIsBroadcasting(true);
        try {
            const freshId = 'notif_' + Math.random().toString(36).substr(2, 9);
            const ref = doc(db, 'notifications', freshId);
            const payload = sanitizeForFirestore({
                id: freshId,
                title: notifTitle.trim(),
                text: notifText.trim(),
                imageUrl: notifImage || "",
                createdAt: Date.now(),
                senderId: user.uid,
                senderName: profile?.name || user.displayName || 'Manager'
            });
            await setDoc(ref, payload);
            setNotifTitle('');
            setNotifText('');
            setNotifImage('');
            setFeedbackSuccess('Notification broadcasted to all users successfully! / घोषणा सफलतापूर्वक सभी यूज़र्स को भेज दी गई है!');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.WRITE, 'notifications');
            setFeedbackError('Broadcast failed: ' + error.message);
        } finally {
            setIsBroadcasting(false);
        }
    };

    const handleDeleteBroadcast = async (notifId: string) => {
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const ref = doc(db, 'notifications', notifId);
            await deleteDoc(ref);
            setFeedbackSuccess('Notification deleted successfully! / घोषणा हटा दी गई है!');
            setPendingDeleteBroadcastId(null);
        } catch (error: any) {
            setFeedbackError('Deletion failed: ' + error.message);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingSettings(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const settingsDocRef = doc(db, 'settings', 'config');
            
            let finalExpiresAt = settings.offerExpiresAt || 0;
            const trimmedHours = offerHoursInput.trim();
            if (trimmedHours !== '') {
                const hoursVal = parseFloat(trimmedHours);
                if (!isNaN(hoursVal) && hoursVal > 0) {
                    finalExpiresAt = Date.now() + Math.round(hoursVal * 3600 * 1000);
                } else if (hoursVal === 0) {
                    finalExpiresAt = 0;
                }
            } else {
                if (settings.offerDiscountPct > 0) {
                    if (!finalExpiresAt || finalExpiresAt <= Date.now()) {
                        finalExpiresAt = Date.now() + (24 * 3600 * 1000);
                    }
                } else {
                    finalExpiresAt = 0;
                }
            }

            const sanitizedSettings = sanitizeForFirestore({
                ...settings,
                offerExpiresAt: finalExpiresAt,
                updatedAt: Date.now()
            });
            await setDoc(settingsDocRef, sanitizedSettings);
            setFeedbackSuccess('App settings updated successfully! / ऐप सेटिंग्स अपडेट कर दी गई हैं।');
            setOfferHoursInput('');
        } catch (err: any) {
            console.error('Error saving settings:', err);
            setFeedbackError('Failed to save settings. Please check your permissions.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleCancelOffer = async () => {
        setIsSavingSettings(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const settingsDocRef = doc(db, 'settings', 'config');
            const updated = {
                ...settings,
                offerDiscountPct: 0,
                offerExpiresAt: 0,
                updatedAt: Date.now()
            };
            await setDoc(settingsDocRef, sanitizeForFirestore(updated));
            setSettings(updated);
            setOfferHoursInput('');
            setFeedbackSuccess('Offer deactivated successfully! / ऑफर बंद कर दिया गया।');
        } catch (err: any) {
            console.error('Error canceling offer:', err);
            setFeedbackError('Failed to deactivate offer.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const toggleManagerRole = async (targetUserId: string, currentStatus: boolean) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const newStatus = !currentStatus;
            
            await updateDoc(userDocRef, {
                isManager: newStatus,
                updatedAt: serverTimestamp()
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, isManager: newStatus } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully updated role for ${accounts.find(a => a.userId === targetUserId)?.name || 'user'}!`);
        } catch (err: any) {
            console.error('Error updating manager role:', err);
            setFeedbackError('Could not update role. Ensure you have proper manager access privileges.');
            handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
        } finally {
            setActionLoading(null);
        }
    };

    const adjustUserCoins = async (targetUserId: string, increment: number) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const targetUser = accounts.find(a => a.userId === targetUserId);
            if (!targetUser) return;
            const currentCoins = targetUser.coins !== undefined ? targetUser.coins : 50;
            const newCoins = Math.max(0, currentCoins + increment);
            
            await updateDoc(userDocRef, {
                coins: newCoins,
                updatedAt: serverTimestamp()
            });

            // Log the coin adjustment
            await logCoinTransaction(targetUserId, {
                amount: increment,
                type: increment > 0 ? 'addition' : 'deduction',
                reason: `Manager Adjustment (${increment > 0 ? 'Deposit' : 'Withdrawal'})`
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, coins: newCoins } 
                        : acc
                )
            );

            if (increment > 0) {
                setFeedbackSuccess(`Successfully added ${increment} coins to ${targetUser.name}!`);
            } else {
                setFeedbackSuccess(`Successfully deducted ${Math.abs(increment)} coins from ${targetUser.name}!`);
            }
        } catch (err: any) {
            console.error('Error updating profile coins:', err);
            setFeedbackError('Could not update coins. Ensure you have proper manager access privileges.');
            handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
        } finally {
            setActionLoading(null);
        }
    };

    const setUserCoinsDirect = async (targetUserId: string, absoluteValue: number) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const targetUser = accounts.find(a => a.userId === targetUserId);
            if (!targetUser) return;
            
            await updateDoc(userDocRef, {
                coins: absoluteValue,
                updatedAt: serverTimestamp()
            });

            // Log the direct coin set
            await logCoinTransaction(targetUserId, {
                amount: absoluteValue - (targetUser.coins || 0),
                type: absoluteValue > (targetUser.coins || 0) ? 'addition' : 'deduction',
                reason: `Manager Direct Set (New Balance: ${absoluteValue})`
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, coins: absoluteValue } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully set coins to ${absoluteValue} for ${targetUser.name}!`);
        } catch (err: any) {
            console.error('Error updating profile coins:', err);
            setFeedbackError('Could not update coins.');
            handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
        } finally {
            setActionLoading(null);
        }
    };

    const grantUserPass = async (targetUserId: string, passType: 'all' | 'aw' | 'quiz', days: number) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const targetUser = accounts.find(a => a.userId === targetUserId);
            if (!targetUser) return;

            const now = Date.now();
            const fieldName = passType === 'aw' ? 'awPassExpirity' : passType === 'quiz' ? 'quizPassExpirity' : 'unlimitedExpirity';
            const currentExp = (targetUser[fieldName] && targetUser[fieldName]! > now) ? targetUser[fieldName]! : now;
            const newExpirity = days > 0 ? currentExp + (days * 24 * 60 * 60 * 1000) : 0;

            await updateDoc(userDocRef, {
                [fieldName]: newExpirity,
                updatedAt: serverTimestamp()
            });

            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, [fieldName]: newExpirity } 
                        : acc
                )
            );

            const passLabel = passType === 'aw' ? 'Ans. Chak Pass' : passType === 'quiz' ? 'Quiz Pass' : 'Unlimited Pass';
            if (days > 0) {
                setFeedbackSuccess(`Successfully granted ${days} days ${passLabel} to ${targetUser.name}!`);
            } else {
                setFeedbackSuccess(`Successfully cancelled ${passLabel} for ${targetUser.name}.`);
            }
        } catch (err: any) {
            console.error('Error granting pass:', err);
            setFeedbackError('Could not update pass. Ensure manager permissions.');
        } finally {
            setActionLoading(null);
        }
    };

    const resetUserStreak = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const targetUser = accounts.find(a => a.userId === targetUserId);
            if (!targetUser) return;
            
            await updateDoc(userDocRef, {
                streakCount: 0,
                updatedAt: serverTimestamp()
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, streakCount: 0 } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully reset daily task streak to 0 for ${targetUser.name}! / ${targetUser.name} का डेली टास्क सफलतापूर्वक 0 कर दिया गया है!`);
        } catch (err: any) {
            console.error('Error resetting streak:', err);
            setFeedbackError('Could not reset streak. Ensure you have proper manager access privileges.');
        } finally {
            setActionLoading(null);
        }
    };

    const setUserStreakDirect = async (targetUserId: string, count: number) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            await updateDoc(userDocRef, {
                streakCount: count,
                updatedAt: serverTimestamp()
            });
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, streakCount: count } 
                        : acc
                )
            );
            setFeedbackSuccess(`Streak updated to ${count}! / स्ट्रैक अपडेट कर दी गई है।`);
        } catch (err) {
            setFeedbackError("Failed to update streak.");
        } finally {
            setActionLoading(null);
        }
    };

    const grantUnlimitedPass = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const durationMs = settings.unlimitedPassDays * 24 * 60 * 60 * 1000;
            const newExpirity = Date.now() + durationMs;
            
            await updateDoc(userDocRef, {
                unlimitedExpirity: newExpirity,
                updatedAt: serverTimestamp()
            });

            // Log the reward
            await logCoinTransaction(targetUserId, {
                amount: 0,
                type: 'reward',
                reason: `Manager granted ${settings.unlimitedPassDays}-Day Unlimited Pass`
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, unlimitedExpirity: newExpirity } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully granted ${settings.unlimitedPassDays}-day Unlimited Pass to user! / उपयोगकर्ता को ${settings.unlimitedPassDays}-दिन का अनलिमिटेड पास दिया गया।`);
        } catch (err: any) {
            console.error('Error granting unlimited pass:', err);
            setFeedbackError('Could not grant pass.');
            handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
        } finally {
            setActionLoading(null);
        }
    };

    const revokeUnlimitedPass = async (targetUserId: string) => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            
            await updateDoc(userDocRef, {
                unlimitedExpirity: 0,
                updatedAt: serverTimestamp()
            });

            // Log the action
            await logCoinTransaction(targetUserId, {
                amount: 0,
                type: 'deduction',
                reason: 'Manager revoked Unlimited Pass'
            });

            // Update local state
            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, unlimitedExpirity: 0 } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully revoked Unlimited Pass for user! / उपयोगकर्ता का अनलिमिटेड पास हटा दिया गया।`);
        } catch (err: any) {
            console.error('Error revoking unlimited pass:', err);
            setFeedbackError('Could not revoke pass.');
            handleFirestoreError(err, OperationType.UPDATE, `users/${targetUserId}`);
        } finally {
            setActionLoading(null);
        }
    };

    const grantSpecificPass = async (targetUserId: string, passType: 'aw' | 'quiz') => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const days = passType === 'aw' ? (settings.awPassDays || 30) : (settings.quizPassDays || 30);
            const fieldName = passType === 'aw' ? 'awPassExpirity' : 'quizPassExpirity';
            const label = passType === 'aw' ? 'AW Pass (Ans. Chak)' : 'Quiz Pass';
            const durationMs = days * 24 * 60 * 60 * 1000;
            const newExpirity = Date.now() + durationMs;
            
            await updateDoc(userDocRef, {
                [fieldName]: newExpirity,
                updatedAt: serverTimestamp()
            });

            await logCoinTransaction(targetUserId, {
                amount: 0,
                type: 'reward',
                reason: `Manager granted ${days}-Day ${label}`
            });

            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, [fieldName]: newExpirity } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully granted ${days}-day ${label}!`);
        } catch (err: any) {
            console.error('Error granting pass:', err);
            setFeedbackError('Could not grant pass.');
        } finally {
            setActionLoading(null);
        }
    };

    const revokeSpecificPass = async (targetUserId: string, passType: 'aw' | 'quiz') => {
        setActionLoading(targetUserId);
        setFeedbackError(null);
        setFeedbackSuccess(null);
        try {
            const userDocRef = doc(db, 'users', targetUserId);
            const fieldName = passType === 'aw' ? 'awPassExpirity' : 'quizPassExpirity';
            const label = passType === 'aw' ? 'AW Pass' : 'Quiz Pass';
            
            await updateDoc(userDocRef, {
                [fieldName]: 0,
                updatedAt: serverTimestamp()
            });

            await logCoinTransaction(targetUserId, {
                amount: 0,
                type: 'deduction',
                reason: `Manager revoked ${label}`
            });

            setAccounts(prev => 
                prev.map(acc => 
                    acc.userId === targetUserId 
                        ? { ...acc, [fieldName]: 0 } 
                        : acc
                )
            );

            setFeedbackSuccess(`Successfully revoked ${label}!`);
        } catch (err: any) {
            console.error('Error revoking pass:', err);
            setFeedbackError('Could not revoke pass.');
        } finally {
            setActionLoading(null);
        }
    };

    // Filter accounts by query
    const filteredAccounts = accounts.filter(acc => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (
            acc.name.toLowerCase().includes(query) ||
            acc.email.toLowerCase().includes(query) ||
            acc.mobile.toLowerCase().includes(query) ||
            acc.study.toLowerCase().includes(query) ||
            acc.userId.toLowerCase().includes(query)
        );
    });

    const managerCount = accounts.filter(acc => acc.isManager).length;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pt-2 pb-12 px-2 md:px-4">
            
            {/* Header section with back button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="flex items-center space-x-3">
                    <button 
                        onClick={onBack}
                        className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 transition active:scale-95 border border-slate-200 shadow-sm bg-white"
                        title="Back to home"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-850 tracking-tight flex items-center gap-2">
                            <Crown className="w-6 h-6 text-indigo-650" /> Admin / Manager Dashboard
                        </h2>
                        <p className="text-slate-500 text-xs font-semibold">
                            View and manage all user registration accounts logged in Bodhak.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={fetchAccounts}
                        disabled={loading}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-slate-200 shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Accounts
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-2xl max-w-4xl border border-slate-200/50 shadow-inner font-sans overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setActiveTab('accounts')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'accounts' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Users className="w-4 h-4" />
                    <span>MANAGE ACCOUNTS</span>
                </button>
                <button
                    onClick={() => setActiveTab('support_chat')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'support_chat' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <MessageCircle className="w-4 h-4 text-emerald-505" />
                    <span>SUPPORT CHATS</span>
                </button>
                <button
                    onClick={() => setActiveTab('payment_requests')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'payment_requests' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Coins className="w-4 h-4 text-amber-550" />
                    <span>PAYMENTS</span>
                </button>
                <button
                    onClick={() => setActiveTab('broadcast')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'broadcast' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Bell className="w-4 h-4 text-rose-550 animate-pulse" />
                    <span>BROADCAST ALERTS</span>
                </button>
                <button
                    onClick={() => setActiveTab('ratings')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'ratings' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                    <span>APP RATINGS ⭐</span>
                </button>
                <button
                    onClick={() => setActiveTab('gemini_keys')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'gemini_keys' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Key className="w-4 h-4 text-indigo-600" />
                    <span>GEMINI API KEYS 🔑</span>
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`flex-grow py-2.5 px-3 text-[10px] md:text-xs font-black rounded-xl transition duration-200 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                        activeTab === 'settings' 
                            ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/20' 
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <ShieldCheck className="w-4 h-4" />
                    <span>APP SETTINGS</span>
                </button>
            </div>

            {/* Error & Feedback Messages */}
            {feedbackError && (
                <div className="p-4 bg-red-50 border border-red-250 rounded-xl flex items-start gap-3 text-red-700 text-xs font-semibold leading-relaxed animate-in slide-in-from-top-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                    <div>
                        <p className="font-extrabold text-sm mb-0.5">Authorization Error</p>
                        <span>{feedbackError}</span>
                    </div>
                </div>
            )}
            {feedbackSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-250 rounded-xl flex items-start gap-3 text-emerald-850 text-xs font-semibold leading-relaxed animate-in slide-in-from-top-3">
                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                    <div>
                        <p className="font-extrabold text-sm mb-0.5">Success</p>
                        <span>{feedbackSuccess}</span>
                    </div>
                </div>
            )}

            {activeTab === 'support_chat' ? (
                <ManagerChatPortal accounts={accounts} />
            ) : activeTab === 'payment_requests' ? (
                <PaymentRequestsTab settings={settings} />
            ) : activeTab === 'broadcast' ? (
                <div className="space-y-6 max-w-4xl text-left bg-transparent">
                    <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 p-6 rounded-3xl text-white shadow-md flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-400 animate-pulse" />
                                <span>Manager Announcement Broadcast / घोषणा केंद्र 📢</span>
                            </h3>
                            <p className="text-white/75 text-xs font-semibold leading-relaxed">
                                Send global match notices, critical alerts, or welcome updates that appear with an active notification badge on all users' screens!
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Create form */}
                        <form onSubmit={handleManagerBroadcast} className="bg-white border border-slate-200/95 rounded-3xl p-6 shadow-sm space-y-4">
                            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                                Publish New Announcement / नई घोषणा भेजें 🚀
                            </h4>
                            
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-indigo-950 uppercase block tracking-wider">घोषणा शीर्षक / Title</label>
                                <input
                                    type="text"
                                    required
                                    value={notifTitle}
                                    onChange={(e) => setNotifTitle(e.target.value)}
                                    placeholder="e.g. UPSC CSE Mains Mock Test is Active! 📝"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:border-indigo-600 outline-none transition-all placeholder:text-slate-400"
                                />
                            </div>

                            <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-indigo-950 uppercase block tracking-wider font-extrabold">घोषणा विवरण / Details (English / Hindi)</label>
                                 <textarea
                                     required
                                     rows={5}
                                     value={notifText}
                                     onChange={(e) => setNotifText(e.target.value)}
                                     placeholder="Write details for all users..."
                                     className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:bg-white focus:border-indigo-600 outline-none transition-all placeholder:text-slate-400 leading-relaxed"
                                 />
                             </div>

                             <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-indigo-950 uppercase block tracking-wider font-extrabold">Notification Image / फोटो (Optional)</label>
                                 <div className="flex flex-col gap-3">
                                     <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                         {notifImage ? (
                                             <div className="w-20 h-14 rounded-xl overflow-hidden border border-slate-200 bg-white flex-shrink-0">
                                                 <img src={notifImage} alt="Notif" className="w-full h-full object-cover" />
                                             </div>
                                         ) : (
                                             <div className="w-20 h-14 rounded-xl bg-white flex items-center justify-center text-slate-300 border border-dashed border-slate-200 flex-shrink-0">
                                                 <Bell className="w-5 h-5 opacity-30" />
                                             </div>
                                         )}
                                         <div className="flex-1">
                                             <input 
                                                 type="file" 
                                                 accept="image/*" 
                                                 id="notif-image-input" 
                                                 className="hidden" 
                                                 onChange={handleNotifImageUpload}
                                                 disabled={isUploadingNotifImg}
                                             />
                                             <label 
                                                 htmlFor="notif-image-input"
                                                 className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                                                     isUploadingNotifImg ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-white hover:bg-slate-900 shadow-md'
                                                 }`}
                                             >
                                                 {isUploadingNotifImg ? 'Uploading...' : notifImage ? 'Change Image / बदलें' : 'Upload Image / जोड़ें'}
                                             </label>
                                             <p className="text-[9px] text-slate-400 mt-1.5 font-bold">Max 600KB (JPG/PNG)</p>
                                         </div>
                                         {notifImage && (
                                             <button 
                                                 type="button" 
                                                 onClick={() => setNotifImage('')}
                                                 className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                                             >
                                                 <Trash2 className="w-4 h-4" />
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             </div>

                            <button
                                type="submit"
                                disabled={isBroadcasting}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-2xl shadow-md transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isBroadcasting ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                ) : (
                                    <CheckCircle className="w-4 h-4" />
                                )}
                                <span>{isBroadcasting ? 'Broadcasting...' : 'Broadcast to All / सभी यूज़र्स को भेजें 📢'}</span>
                            </button>
                        </form>

                        {/* List & Manage */}
                        <div className="bg-white border border-slate-200/95 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col max-h-[500px]">
                            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex justify-between items-center">
                                <span>Active Announcements ({managerNotifications.length})</span>
                                <span className="text-[9px] lowercase bg-indigo-50 text-indigo-750 px-2 py-0.5 rounded-full font-black">global</span>
                            </h4>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3.5 pr-1">
                                {managerNotifications.length === 0 ? (
                                    <div className="text-center text-slate-400 text-xs py-12 font-bold">
                                        📢 No notifications sent yet / कोई सक्रिय घोषणा नहीं है।
                                    </div>
                                ) : (
                                    managerNotifications.map((notif) => (
                                        <div key={notif.id} className="p-3.5 bg-slate-50/80 border border-slate-150 rounded-2xl relative hover:border-slate-300 hover:bg-slate-50 transition duration-150">
                                            <div className="flex justify-between items-start gap-4">
                                                <h5 className="font-extrabold text-xs text-indigo-950 pr-7 leading-snug">
                                                    {notif.title}
                                                </h5>
                                                {pendingDeleteBroadcastId === notif.id ? (
                                                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-xl shadow-sm z-10 animate-in fade-in duration-200">
                                                        <span className="text-[9px] font-black text-red-650">Sure? / हटाएँ?</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteBroadcast(notif.id)}
                                                            className="text-[9px] bg-red-600 font-extrabold text-white px-2 py-0.5 rounded-lg hover:bg-red-750 transition"
                                                        >
                                                            Yes
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingDeleteBroadcastId(null)}
                                                            className="text-[9px] bg-slate-200 font-extrabold text-slate-700 px-2 py-0.5 rounded-lg hover:bg-slate-300 transition"
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPendingDeleteBroadcastId(notif.id)}
                                                        className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-full transition active:scale-[0.9] cursor-pointer"
                                                        title="Delete Announcement"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                            {notif.imageUrl && (
                                                <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 shadow-sm transition hover:scale-[1.01] duration-300">
                                                    <img src={notif.imageUrl} alt="Notification" className="w-full h-auto max-h-48 object-cover" />
                                                </div>
                                            )}
                                            <p className="text-[11px] text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed mt-2 pl-0.5">
                                                {notif.text}
                                            </p>
                                            <div className="text-[9px] text-slate-400 mt-2.5 pt-1.5 border-t border-slate-200/70 flex justify-between items-center font-mono font-bold">
                                                <span>By: {notif.senderName || 'Manager'}</span>
                                                <span>
                                                    {new Date(notif.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'ratings' ? (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                    {/* Header Card & Rating Summary */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Star className="w-6 h-6 text-amber-500 fill-amber-400" />
                                    <span>User App Ratings & Feedback ⭐</span>
                                </h3>
                                <p className="text-slate-500 text-xs font-semibold mt-1">
                                    यूज़र्स द्वारा ऐप को दी गई स्टार रेटिंग और फीडबैक की समीक्षा करें।
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-2xl text-center">
                                    <span className="text-[10px] text-amber-700 font-extrabold block uppercase tracking-wider">Average Rating</span>
                                    <div className="text-2xl font-black text-amber-600 flex items-center justify-center gap-1">
                                        <span>
                                            {appRatings.length > 0 
                                                ? (appRatings.reduce((sum, r) => sum + (r.rating || 0), 0) / appRatings.length).toFixed(1)
                                                : '0.0'}
                                        </span>
                                        <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
                                    </div>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl text-center">
                                    <span className="text-[10px] text-slate-500 font-extrabold block uppercase tracking-wider">Total Ratings</span>
                                    <span className="text-2xl font-black text-slate-800">{appRatings.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* Rating Distribution Breakdown */}
                        {appRatings.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                                {[5, 4, 3, 2, 1].map((starCount) => {
                                    const count = appRatings.filter(r => r.rating === starCount).length;
                                    const pct = appRatings.length > 0 ? Math.round((count / appRatings.length) * 100) : 0;
                                    return (
                                        <div key={starCount} className="bg-slate-50/80 border border-slate-150 p-3 rounded-2xl space-y-1 text-center">
                                            <div className="flex items-center justify-center gap-1 font-black text-xs text-slate-800">
                                                <span>{starCount} Star</span>
                                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                            </div>
                                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                                <div 
                                                    className="bg-amber-400 h-full rounded-full transition-all duration-500" 
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold px-1 pt-0.5">
                                                <span>{count} votes</span>
                                                <span>{pct}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Ratings Table & List */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                                All User Ratings ({appRatings.length})
                            </h4>
                        </div>

                        {appRatings.length === 0 ? (
                            <div className="py-12 text-center text-slate-400 space-y-2">
                                <Star className="w-10 h-10 text-slate-300 mx-auto" />
                                <p className="text-xs font-bold">अभी तक किसी भी यूज़र ने रेटिंग नहीं दी है।</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {appRatings.map((ratingDoc) => (
                                    <div 
                                        key={ratingDoc.id}
                                        className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 transition"
                                    >
                                        <div className="space-y-1.5 text-left">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="font-extrabold text-xs text-slate-900 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                                                    👤 {ratingDoc.userName || 'Anonymous User'}
                                                </span>
                                                {ratingDoc.userEmail && (
                                                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/60">
                                                        {ratingDoc.userEmail}
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {ratingDoc.updatedAt ? new Date(ratingDoc.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>

                                            {/* Stars display */}
                                            <div className="flex items-center gap-1 py-0.5">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <Star 
                                                        key={s} 
                                                        className={`w-4 h-4 ${
                                                            s <= (ratingDoc.rating || 0) 
                                                                ? 'fill-amber-400 text-amber-500' 
                                                                : 'fill-slate-200 text-slate-300'
                                                        }`}
                                                    />
                                                ))}
                                                <span className="text-xs font-black text-amber-700 ml-1.5">
                                                    {ratingDoc.rating}/5 Stars
                                                </span>
                                            </div>

                                            {/* Feedback comment */}
                                            {ratingDoc.feedback && (
                                                <p className="text-xs text-slate-700 font-semibold bg-white p-3 rounded-xl border border-slate-200/70 whitespace-pre-wrap leading-relaxed">
                                                    💬 "{ratingDoc.feedback}"
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (window.confirm('Delete this rating entry? / क्या आप इस रेटिंग को हटाना चाहते हैं?')) {
                                                    try {
                                                        await deleteDoc(doc(db, 'appRatings', ratingDoc.id));
                                                        setFeedbackSuccess('Rating deleted successfully.');
                                                        setTimeout(() => setFeedbackSuccess(null), 2500);
                                                    } catch (e) {
                                                        console.error("Error deleting rating:", e);
                                                    }
                                                }
                                            }}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-200 cursor-pointer shrink-0 self-end md:self-center"
                                            title="Delete rating record"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : activeTab === 'settings' ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm max-w-2xl">
                    <div className="mb-6">
                        <h3 className="text-xl font-black text-slate-800">Global App Settings</h3>
                        <p className="text-slate-500 text-xs font-semibold">Configure coin pricing and other system parameters.</p>
                    </div>

                    <form onSubmit={handleSaveSettings} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                <label className="text-[11px] font-black text-indigo-600 uppercase tracking-widest pl-1">Share Settings (Text & Image) / शेयर सेटिंग्स</label>
                                {settingsError && <p className="text-[10px] font-bold text-red-500 bg-red-50 p-2 rounded-xl border border-red-100">{settingsError}</p>}
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Share Text / शेयर टेक्स्ट</label>
                                        <textarea 
                                            rows={5}
                                            value={settings.shareText || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, shareText: e.target.value }))}
                                            placeholder="What should users see when they share the app? / ऐप शेयर करने पर क्या दिखना चाहिए?"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Share App Link / ऐप शेयर लिंक</label>
                                        <input 
                                            type="url"
                                            value={settings.shareAppLink || ''}
                                            onChange={(e) => setSettings(prev => ({ ...prev, shareAppLink: e.target.value.trim() }))}
                                            placeholder="https://example.com (Default is current URL)"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Share Image / शेयर इमेज (Upload)</label>
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4">
                                                {settings.shareImageUrl ? (
                                                    <div className="w-24 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0">
                                                        <img src={settings.shareImageUrl} alt="Share Banner" className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-24 h-16 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 border border-dashed border-slate-200 flex-shrink-0 font-bold text-[9px] text-center px-1">
                                                        No Image / कोई फोटो नहीं
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        id="share-image-input" 
                                                        className="hidden" 
                                                        onChange={handleShareImageUpload}
                                                        disabled={isUploadingShareImg}
                                                    />
                                                    <label 
                                                        htmlFor="share-image-input"
                                                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                                                            isUploadingShareImg ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                                                        }`}
                                                    >
                                                        {isUploadingShareImg ? 'Uploading...' : settings.shareImageUrl ? 'Change Banner / फोटो बदलें' : 'Upload Banner / फोटो अपलोड करें'}
                                                    </label>
                                                    <p className="text-[9px] text-slate-400 mt-2 font-bold">Max 600KB (JPG/PNG)</p>
                                                </div>
                                                {settings.shareImageUrl && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setSettings(prev => ({ ...prev, shareImageUrl: '' }))}
                                                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input 
                                                    type="text"
                                                    value={settings.shareImageUrl || ''}
                                                    onChange={(e) => setSettings(prev => ({ ...prev, shareImageUrl: e.target.value.trim() }))}
                                                    placeholder="Or paste direct image URL / या फोटो लिंक डालें"
                                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-300"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-black text-indigo-600 uppercase tracking-widest pl-1">Unlimited Coin Packs / असीमित कॉइन्स पैकेज</label>
                                    <button 
                                        type="button"
                                        onClick={() => setSettings(prev => ({ 
                                            ...prev, 
                                            coinPacks: [...(prev.coinPacks || []), { days: 7, price: 99, id: 'pack_' + Date.now() }] 
                                        }))}
                                        className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-200 transition"
                                    >
                                        + Add New Pack
                                    </button>
                                </div>
                                <div className="space-y-3 mt-3">
                                    {(settings.coinPacks || []).map((pack, idx) => (
                                        <div key={pack.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-150 group">
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Days</label>
                                                    <input 
                                                        type="number"
                                                        value={pack.days}
                                                        onChange={(e) => {
                                                            const newPacks = [...(settings.coinPacks || [])];
                                                            newPacks[idx].days = parseInt(e.target.value) || 0;
                                                            setSettings(prev => ({ ...prev, coinPacks: newPacks }));
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Price (₹)</label>
                                                    <input 
                                                        type="number"
                                                        value={pack.price}
                                                        onChange={(e) => {
                                                            const newPacks = [...(settings.coinPacks || [])];
                                                            newPacks[idx].price = parseInt(e.target.value) || 0;
                                                            setSettings(prev => ({ ...prev, coinPacks: newPacks }));
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black"
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newPacks = (settings.coinPacks || []).filter((_, i) => i !== idx);
                                                    setSettings(prev => ({ ...prev, coinPacks: newPacks }));
                                                }}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {(settings.coinPacks || []).length === 0 && (
                                        <p className="text-[10px] text-slate-400 font-bold italic text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">No custom packs. Default will be used. / कोई कस्टम पैकेज नहीं है।</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-black text-indigo-600 uppercase tracking-widest pl-1">Multiple Coupon Codes / कूपन कोड्स</label>
                                    <button 
                                        type="button"
                                        onClick={() => setSettings(prev => ({ 
                                            ...prev, 
                                            coupons: [...(prev.coupons || []), { code: 'NEW50', discount: 50 }] 
                                        }))}
                                        className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full hover:bg-indigo-200 transition"
                                    >
                                        + Add New Coupon
                                    </button>
                                </div>
                                <div className="space-y-3 mt-3">
                                    {(settings.coupons || []).map((coupon, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-150 group">
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Code</label>
                                                    <input 
                                                        type="text"
                                                        value={coupon.code}
                                                        onChange={(e) => {
                                                            const newCoupons = [...(settings.coupons || [])];
                                                            newCoupons[idx].code = e.target.value.toUpperCase().trim();
                                                            setSettings(prev => ({ ...prev, coupons: newCoupons }));
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Disc (%)</label>
                                                    <input 
                                                        type="number"
                                                        value={coupon.discount}
                                                        onChange={(e) => {
                                                            const newCoupons = [...(settings.coupons || [])];
                                                            newCoupons[idx].discount = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                                            setSettings(prev => ({ ...prev, coupons: newCoupons }));
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black"
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newCoupons = (settings.coupons || []).filter((_, i) => i !== idx);
                                                    setSettings(prev => ({ ...prev, coupons: newCoupons }));
                                                }}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {(settings.coupons || []).length === 0 && (
                                        <p className="text-[10px] text-slate-400 font-bold italic text-center py-4 bg-white rounded-xl border border-dashed border-slate-200">No extra coupons. Default single coupon will be used. / कोई अन्य कूपन नहीं है।</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Price Per Coin (INR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        value={settings.pricePerCoin}
                                        onChange={(e) => setSettings(prev => ({ ...prev, pricePerCoin: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Example: 0.4 means 10 coins cost ₹4
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Min Coins Package</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🪙</span>
                                    <input 
                                        type="number"
                                        value={settings.minCoins}
                                        onChange={(e) => setSettings(prev => ({ ...prev, minCoins: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Used for informational displays
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Full Unlimited Pass Price (INR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                    <input 
                                        type="number"
                                        value={settings.unlimitedPassPrice}
                                        onChange={(e) => setSettings(prev => ({ ...prev, unlimitedPassPrice: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Price for full feature unlimited pass
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Full Unlimited Pass Days</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🗓️</span>
                                    <input 
                                        type="number"
                                        value={settings.unlimitedPassDays}
                                        onChange={(e) => setSettings(prev => ({ ...prev, unlimitedPassDays: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Duration of full pass in days
                                </p>
                            </div>

                            {/* Ans. Chak Pass Settings */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-emerald-600 uppercase tracking-widest pl-1">Ans. Chak Pass Price (INR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                    <input 
                                        type="number"
                                        value={settings.awPassPrice || 49}
                                        onChange={(e) => setSettings(prev => ({ ...prev, awPassPrice: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-emerald-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Price for Ans. Chak (AW) Unlimited Pass
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-emerald-600 uppercase tracking-widest pl-1">Ans. Chak Pass Days</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🗓️</span>
                                    <input 
                                        type="number"
                                        value={settings.awPassDays || 30}
                                        onChange={(e) => setSettings(prev => ({ ...prev, awPassDays: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-emerald-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Duration of Ans. Chak pass in days
                                </p>
                            </div>

                            {/* Quiz Pass Settings */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-purple-600 uppercase tracking-widest pl-1">Quiz Pass Price (INR)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                    <input 
                                        type="number"
                                        value={settings.quizPassPrice || 49}
                                        onChange={(e) => setSettings(prev => ({ ...prev, quizPassPrice: parseFloat(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-purple-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Price for Quiz Unlimited Pass
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-purple-600 uppercase tracking-widest pl-1">Quiz Pass Days</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🗓️</span>
                                    <input 
                                        type="number"
                                        value={settings.quizPassDays || 30}
                                        onChange={(e) => setSettings(prev => ({ ...prev, quizPassDays: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-purple-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Duration of Quiz pass in days
                                </p>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Admin UPI ID / UPI आईडी</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">💳</span>
                                    <input 
                                        type="text"
                                        value={settings.upiId || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, upiId: e.target.value.trim() }))}
                                        placeholder="e.g. 9828030263@axl"
                                        required
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Used for PhonePe direct UPI payment flows (e.g. 9828030263@axl) / यह UPI आईडी भुगतान प्राप्त करने के लिए इस्तेमाल होगी।
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Promo/Coupon Code / कूपन कोड</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🎫</span>
                                    <input 
                                        type="text"
                                        value={settings.couponCode || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, couponCode: e.target.value.toUpperCase().trim() }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="E.g. BODHAK50"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Coupon code for coin purchase discount / कूपन कोड
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Discount Percentage (%) / छूट प्रतिशत</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                    <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={settings.couponDiscount !== undefined ? settings.couponDiscount : 0}
                                        onChange={(e) => setSettings(prev => ({ ...prev, couponDiscount: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                    Percentage discount (e.g., 50 for 50% off) / डिस्काउंट प्रतिशत
                                </p>
                            </div>

                            {/* Special Limited-Time Offer Section */}
                            <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2 space-y-4">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">🔥</span>
                                        <h4 className="font-extrabold text-xs text-indigo-950 uppercase tracking-widest">Limited-Time Offer on Coin Packs & Passes / कॉइन्स पैक पर विशेष समय-सीमित ऑफर</h4>
                                    </div>
                                    {(settings.offerDiscountPct > 0 || (settings.offerExpiresAt && settings.offerExpiresAt > Date.now())) && (
                                        <button
                                            type="button"
                                            onClick={handleCancelOffer}
                                            disabled={isSavingSettings}
                                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold text-[11px] rounded-xl transition cursor-pointer active:scale-95 disabled:opacity-50"
                                        >
                                            🔴 Deactivate Offer Now / ऑफर तुरंत बंद करें
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Offer Discount (%) / विशेष ऑफर छूट (%)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                            <input 
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={settings.offerDiscountPct || 0}
                                                onChange={(e) => setSettings(prev => ({ ...prev, offerDiscountPct: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="e.g. 20 for 20% off"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                            Discount applied automatically to all packs & passes / सभी पैक्स पर ऑटोमेटिक डिस्काउंट
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">Set Duration in Hours / नई समय सीमा (घंटे में)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">⏱️</span>
                                            <input 
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                value={offerHoursInput}
                                                onChange={(e) => setOfferHoursInput(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="e.g. 24 for 24 hours. Leave empty to keep active timer."
                                            />
                                        </div>
                                        {settings.offerDiscountPct > 0 && settings.offerExpiresAt && settings.offerExpiresAt > Date.now() ? (
                                            <p className="text-[10px] text-emerald-600 font-black ml-1 animate-pulse">
                                                🟢 Active! Offer of {settings.offerDiscountPct}% OFF expires at: {new Date(settings.offerExpiresAt).toLocaleString()}
                                            </p>
                                        ) : settings.offerDiscountPct > 0 ? (
                                            <p className="text-[10px] text-amber-600 font-bold ml-1">
                                                ⚡ Offer of {settings.offerDiscountPct}% OFF is active! (Save with hours to add countdown)
                                            </p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-bold italic ml-1">
                                                Inactive (Set discount % and duration hours above and click Save App Settings to launch offer)
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                            <div className="flex items-start gap-3">
                                <Crown className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-black text-indigo-900">Live Preview of Pricing</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-1">
                                        <div>
                                            <p className="text-[11px] text-indigo-700 font-bold">
                                                {settings.minCoins} Coins = ₹{(settings.minCoins * settings.pricePerCoin).toFixed(2)}
                                            </p>
                                            <p className="text-[11px] text-indigo-700 font-bold">
                                                100 Coins = ₹{(100 * settings.pricePerCoin).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="mt-1 sm:mt-0">
                                            <p className="text-[11px] font-black text-indigo-900">
                                                Unlimited Pass: ₹{settings.unlimitedPassPrice}
                                            </p>
                                            <p className="text-[11px] text-indigo-700 font-bold">
                                                Duration: {settings.unlimitedPassDays} Days
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={isSavingSettings}
                            className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSavingSettings ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <ShieldCheck className="w-4 h-4" />
                            )}
                            Save App Configuration
                        </button>
                    </form>

                    {/* Streak Rewards Configuration Section */}
                    <form onSubmit={handleSaveStreakRewards} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl mt-8 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                                <span className="text-xl">🔥</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 leading-tight">Daily Streak Rewards Configuration / स्ट्रैक रिवार्ड्स सेटिंग</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Control how many coins users get for streaks</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">7 Day Streak Coins</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🪙</span>
                                    <input 
                                        type="number"
                                        value={streakRewards.day7 || 50}
                                        onChange={(e) => setStreakRewards(prev => ({ ...prev, day7: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">15 Day Streak Coins</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🪙</span>
                                    <input 
                                        type="number"
                                        value={streakRewards.day15 || 150}
                                        onChange={(e) => setStreakRewards(prev => ({ ...prev, day15: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-450 uppercase tracking-widest pl-1">30 Day Streak Coins</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">🪙</span>
                                    <input 
                                        type="number"
                                        value={streakRewards.day30 || 500}
                                        onChange={(e) => setStreakRewards(prev => ({ ...prev, day30: parseInt(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={isSavingStreakRewards}
                            className="w-full md:w-auto px-8 py-3 bg-orange-600 text-white font-black rounded-2xl shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSavingStreakRewards ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <ShieldCheck className="w-4 h-4" />
                            )}
                            Save Streak Rewards
                        </button>
                    </form>
                </div>
            ) : activeTab === 'gemini_keys' ? (
                <ManagerGeminiKeys />
            ) : (
                <>
            {/* Stat Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-slate-450 text-[10px] uppercase font-black tracking-widest font-mono">Total Registered</p>
                        <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : accounts.length}</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Users in system</p>
                    </div>
                    <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 border border-indigo-100">
                        <Users className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-slate-450 text-[10px] uppercase font-black tracking-widest font-mono">Managers</p>
                        <h3 className="text-2xl font-black text-indigo-700 mt-1">{loading ? '...' : managerCount}</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Authorized Admins</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 border border-emerald-100">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-slate-450 text-[10px] uppercase font-black tracking-widest font-mono">Search Status</p>
                        <h3 className="text-2xl font-black text-slate-800 mt-1">{filteredAccounts.length}</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Matching filter</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl text-slate-600 border border-slate-200/60">
                        <UserCircle className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Filter Search block */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <Search className="w-5 h-5 text-slate-400 shrink-0" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search accounts by name, email, mobile number or exam study focus..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
            </div>

            {/* Account Table */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] tracking-widest font-mono text-slate-450 uppercase font-black">
                                <th className="px-4 py-3.5 pl-6">Profile</th>
                                <th className="px-4 py-3.5">Antifraud / Tech</th>
                                <th className="px-4 py-3.5">Coins</th>
                                <th className="px-4 py-3.5 text-center">Daily Streak 🔥</th>
                                <th className="px-4 py-3.5 text-center">Role</th>
                                <th className="px-4 py-3.5 text-center">Storage</th>
                                <th className="px-4 py-3.5 text-right pr-6">Study Focus</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-650"></div>
                                            <span>Loading Registered Accounts...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredAccounts.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold">
                                        No registered accounts found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredAccounts.map((acc) => {
                                    const sameIPCount = accounts.filter(a => a.ipAddress === acc.ipAddress && a.ipAddress !== 'unknown').length;
                                    const sameFingerprintCount = accounts.filter(a => a.deviceFingerprint === acc.deviceFingerprint && a.deviceFingerprint !== '').length;
                                    
                                    return (
                                        <tr key={acc.userId} className={`hover:bg-slate-50/50 transition ${sameFingerprintCount > 1 ? 'bg-red-50/20' : ''}`}>
                                            
                                            {/* Name & Photo */}
                                            <td className="px-4 py-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden text-slate-600">
                                                        {acc.photoURL ? (
                                                            <img src={acc.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <UserCircle className="w-5 h-5 text-slate-500" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 leading-snug">
                                                            {acc.name}
                                                            {acc.isManager && (
                                                                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase border border-amber-200">
                                                                    Admin
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="text-slate-405 text-[9px] font-mono block tracking-tight truncate max-w-[120px]">{acc.email}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Antifraud / Tech */}
                                            <td className="px-4 py-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-[10px] font-mono font-bold text-slate-600 truncate max-w-[80px]" title={acc.deviceFingerprint}>
                                                            {acc.deviceFingerprint ? acc.deviceFingerprint.substring(0, 8) + '...' : 'Unknown'}
                                                        </span>
                                                        {sameFingerprintCount > 1 && (
                                                            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-[4px] text-[8px] font-black border border-red-200 animate-pulse">
                                                                FRAUD? ({sameFingerprintCount})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-[10px] font-mono font-bold text-slate-600">
                                                            {acc.ipAddress || '0.0.0.0'}
                                                        </span>
                                                        {sameIPCount > 1 && (
                                                            <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-[4px] text-[8px] font-black border border-orange-200">
                                                                IP MULTI ({sameIPCount})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Coins Balance */}
                                             <td className="px-4 py-4">
                                                 <div className="flex flex-col gap-2 min-w-[170px]">
                                                     <div className="flex items-center gap-1.5 font-black text-slate-800 text-xs">
                                                         <span className="text-base">🪙</span>
                                                         <span className="font-mono text-sm font-bold">
                                                             {acc.isManager ? '∞' : (acc.coins !== undefined ? acc.coins : 50)} Coins
                                                         </span>
                                                     </div>

                                                     {/* Pass Badges List */}
                                                     <div className="flex flex-col gap-1">
                                                         {acc.unlimitedExpirity && acc.unlimitedExpirity > Date.now() ? (
                                                             <div className="flex items-center justify-between gap-1 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-indigo-200">
                                                                 <span className="flex items-center gap-1">
                                                                     <Crown className="w-3 h-3 text-indigo-600" />
                                                                     Unlimited Pass
                                                                 </span>
                                                                 <span className="text-[8px] opacity-80">{Math.max(1, Math.ceil((acc.unlimitedExpirity - Date.now()) / (24*60*60*1000)))}d</span>
                                                             </div>
                                                         ) : null}

                                                         {acc.awPassExpirity && acc.awPassExpirity > Date.now() ? (
                                                             <div className="flex items-center justify-between gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-amber-200">
                                                                 <span>✍️ AW Coins/Pass</span>
                                                                 <span className="text-[8px] opacity-80">{Math.max(1, Math.ceil((acc.awPassExpirity - Date.now()) / (24*60*60*1000)))}d</span>
                                                             </div>
                                                         ) : null}

                                                         {acc.quizPassExpirity && acc.quizPassExpirity > Date.now() ? (
                                                             <div className="flex items-center justify-between gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-emerald-200">
                                                                 <span>🧩 Quiz Coins/Pass</span>
                                                                 <span className="text-[8px] opacity-80">{Math.max(1, Math.ceil((acc.quizPassExpirity - Date.now()) / (24*60*60*1000)))}d</span>
                                                             </div>
                                                         ) : null}

                                                         {!(acc.unlimitedExpirity && acc.unlimitedExpirity > Date.now()) &&
                                                          !(acc.awPassExpirity && acc.awPassExpirity > Date.now()) &&
                                                          !(acc.quizPassExpirity && acc.quizPassExpirity > Date.now()) && (
                                                             <span className="text-[9px] font-bold text-slate-400 italic">No Active Pass</span>
                                                         )}
                                                     </div>

                                                     {!acc.isManager && (
                                                         <div className="flex flex-wrap items-center gap-1 shrink-0 pt-1">
                                                             <button
                                                                 onClick={() => adjustUserCoins(acc.userId, 10)}
                                                                 disabled={actionLoading !== null}
                                                                 className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[9px] font-black rounded border border-emerald-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                 title="Add 10 Coins"
                                                             >
                                                                 +10
                                                             </button>
                                                             <button
                                                                 onClick={() => adjustUserCoins(acc.userId, -10)}
                                                                 disabled={actionLoading !== null}
                                                                 className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-black rounded border border-rose-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                 title="Deduct 10 Coins"
                                                             >
                                                                 -10
                                                             </button>
                                                             <button
                                                                 onClick={async () => {
                                                                     const newVal = prompt(`Enter custom coin balance for ${acc.name}:`, String(acc.coins !== undefined ? acc.coins : 50));
                                                                     if (newVal !== null) {
                                                                         const parsedVal = parseInt(newVal, 10);
                                                                         if (!isNaN(parsedVal) && parsedVal >= 0) {
                                                                             await setUserCoinsDirect(acc.userId, parsedVal);
                                                                         }
                                                                     }
                                                                 }}
                                                                 disabled={actionLoading !== null}
                                                                 className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-black rounded border border-slate-300 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                 title="Set Direct Coins"
                                                             >
                                                                 SET
                                                             </button>

                                                             {/* Unlimited Pass */}
                                                             {acc.unlimitedExpirity && acc.unlimitedExpirity > Date.now() ? (
                                                                 <button
                                                                     onClick={() => revokeUnlimitedPass(acc.userId)}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black rounded border border-rose-700 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title="Revoke Unlimited Pass"
                                                                 >
                                                                     -PASS
                                                                 </button>
                                                             ) : (
                                                                 <button
                                                                     onClick={() => grantUnlimitedPass(acc.userId)}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black rounded border border-indigo-700 shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title={`Grant ${settings.unlimitedPassDays}-Day Full Unlimited Pass`}
                                                                 >
                                                                     +PASS
                                                                 </button>
                                                             )}

                                                             {/* AW Pass */}
                                                             {acc.awPassExpirity && acc.awPassExpirity > Date.now() ? (
                                                                 <button
                                                                     onClick={() => revokeSpecificPass(acc.userId, 'aw')}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-amber-700 hover:bg-amber-800 text-white text-[9px] font-black rounded border border-amber-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title="Revoke AW Pass"
                                                                 >
                                                                     -AW
                                                                 </button>
                                                             ) : (
                                                                 <button
                                                                     onClick={() => grantSpecificPass(acc.userId, 'aw')}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black rounded border border-amber-600 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title={`Grant ${settings.awPassDays || 30}-Day AW Pass`}
                                                                 >
                                                                     +AW
                                                                 </button>
                                                             )}

                                                             {/* Quiz Pass */}
                                                             {acc.quizPassExpirity && acc.quizPassExpirity > Date.now() ? (
                                                                 <button
                                                                     onClick={() => revokeSpecificPass(acc.userId, 'quiz')}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[9px] font-black rounded border border-emerald-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title="Revoke Quiz Pass"
                                                                 >
                                                                     -QUIZ
                                                                 </button>
                                                             ) : (
                                                                 <button
                                                                     onClick={() => grantSpecificPass(acc.userId, 'quiz')}
                                                                     disabled={actionLoading !== null}
                                                                     className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black rounded border border-emerald-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                     title={`Grant ${settings.quizPassDays || 30}-Day Quiz Pass`}
                                                                 >
                                                                     +QUIZ
                                                                 </button>
                                                             )}
                                                         </div>
                                                     )}
                                                 </div>
                                             </td>

                                             {/* Daily Streak */}
                                            <td className="px-4 py-4 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-850 px-2.5 py-1 rounded-full text-xs font-black shadow-sm">
                                                            <span>🔥</span>
                                                            <span className="font-mono">{acc.streakCount || 0}D</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap justify-center gap-1">
                                                        <button
                                                            onClick={async () => {
                                                                const newVal = prompt(`Enter custom daily streak for ${acc.name}:`, String(acc.streakCount || 0));
                                                                if (newVal !== null) {
                                                                    const parsedVal = parseInt(newVal, 10);
                                                                    if (!isNaN(parsedVal) && parsedVal >= 0) {
                                                                        await setUserStreakDirect(acc.userId, parsedVal);
                                                                    }
                                                                }
                                                            }}
                                                            disabled={actionLoading !== null}
                                                            className="px-2 py-0.5 bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-700 text-[9px] font-black rounded border border-orange-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                            title="Set Direct Streak"
                                                        >
                                                            EDIT STREAK
                                                        </button>
                                                        {acc.streakCount > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm(`Are you sure you want to reset ${acc.name}'s streak to 0? / क्या आप ${acc.name} का डेली टास्क 0 करना चाहते हैं?`)) {
                                                                        resetUserStreak(acc.userId);
                                                                    }
                                                                }}
                                                                disabled={actionLoading !== null}
                                                                className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 text-[9px] font-black rounded border border-red-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                title="Reset Streak to 0"
                                                            >
                                                                RESET
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    {acc.lastActiveDate && (
                                                        <span className="text-[9px] text-slate-400 font-bold">
                                                            Last: {acc.lastActiveDate}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Role toggle */}
                                            <td className="px-4 py-4 text-center">
                                                <button
                                                    onClick={() => toggleManagerRole(acc.userId, acc.isManager || false)}
                                                    disabled={actionLoading !== null}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all border ${
                                                        acc.isManager 
                                                            ? 'bg-amber-100 text-amber-800 border-amber-200' 
                                                            : 'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}
                                                >
                                                    {actionLoading === acc.userId ? '...' : acc.isManager ? 'ADMIN' : 'USER'}
                                                </button>
                                            </td>

                                            {/* Storage / Data Management */}
                                            <td className="px-4 py-4 text-center">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    {storageStats[acc.userId] ? (
                                                        <div className="text-[10px] font-bold text-slate-600 flex flex-col gap-0.5">
                                                            <span className="bg-slate-100 px-1 py-0.5 rounded">Q: {storageStats[acc.userId].quizzes}</span>
                                                            <span className="bg-slate-100 px-1 py-0.5 rounded">N: {storageStats[acc.userId].notes}</span>
                                                            <div className="flex flex-col gap-0.5 mt-1 items-center">
                                                                <button 
                                                                    onClick={() => deleteUserData(acc.userId, acc.name)}
                                                                    disabled={actionLoading !== null}
                                                                    className="text-red-600 hover:text-red-700 font-black hover:underline text-[9px]"
                                                                    title="Wipe user's quizzes and notes data/progress only"
                                                                >
                                                                    WIPE DATA
                                                                </button>
                                                                <button 
                                                                    onClick={() => deleteUserFully(acc.userId, acc.name)}
                                                                    disabled={actionLoading !== null}
                                                                    className="text-rose-700 hover:text-rose-800 font-black hover:underline flex items-center gap-0.5 mt-1 text-[9px]"
                                                                    title="Permanently delete user profile and ALL data"
                                                                >
                                                                    🗑️ DELETE USER
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <button 
                                                                onClick={() => fetchStorageInfo(acc.userId)}
                                                                disabled={loadingStats[acc.userId] || actionLoading !== null}
                                                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded text-[9px] font-black transition disabled:opacity-50"
                                                            >
                                                                {loadingStats[acc.userId] ? '...' : 'LOAD DATA'}
                                                            </button>
                                                            <button 
                                                                onClick={() => deleteUserFully(acc.userId, acc.name)}
                                                                disabled={actionLoading !== null}
                                                                className="text-[9px] text-rose-700 hover:text-rose-800 font-extrabold hover:underline mt-1"
                                                                title="Permanently Delete User Profile and Data"
                                                            >
                                                                🗑️ DELETE USER
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Study Focus */}
                                            <td className="px-4 py-4 text-right pr-6">
                                                <div className="text-[10px] font-bold text-slate-600 truncate max-w-[100px]">
                                                    {acc.study || 'N/A'}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
                </>
            )}
            
        </div>
    );
};

export default ManagerPortal;
