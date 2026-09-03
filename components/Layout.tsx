import React, { useState, useEffect } from 'react';
import { ArrowLeft, Zap, History, LayoutGrid, FileText, CheckCircle, Check, FileSearch, User, Newspaper, Crown, X, Share2, Download, Coins, MessageSquare, Bell, Trash2, Home, MoreVertical, Globe, Settings, QrCode, Copy, Loader2, Lock, FolderOpen, ShoppingBag, BookOpen, Trophy, Sparkles, TrendingUp, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppStep } from '../types';
import { useAuth } from '../hooks/useAuth';
import SupportChat from './SupportChat';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { doc, onSnapshot, collection, collectionGroup, query, orderBy, limit, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { translations, Language } from '../translations';

interface LayoutProps {
    children: React.ReactNode;
    currentStep: AppStep;
    title: string;
    onBack?: () => void;
    onNavigate: (step: AppStep) => void;
    onProfileClick?: () => void;
    onLogoDoubleClick?: () => void;
}

export const BodhakLogo = ({ 
  onClick, 
  onDoubleClick, 
  title 
}: { 
  onClick?: () => void; 
  onDoubleClick?: () => void; 
  title?: string;
}) => {
  const lastClickRef = React.useRef<number>(0);
  const clickTimerRef = React.useRef<any>(null);

  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const diff = now - lastClickRef.current;

    // Fast double-tap or double-click detected (< 450ms)
    if (diff > 0 && diff < 450) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      lastClickRef.current = 0;
      if (onDoubleClick) {
        onDoubleClick();
        return;
      }
    }

    lastClickRef.current = now;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      if (onClick) onClick();
      clickTimerRef.current = null;
    }, 260);
  };

  return (
    <div 
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (onDoubleClick) onDoubleClick();
      }}
      title={title || 'Bodhak (Double-click: Anti-Sleep PiP 👁️📺)'}
      className={`h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center relative overflow-hidden shrink-0 select-none ${onClick || onDoubleClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
    >
      <img 
        src="/icon.svg" 
        alt="Bodhak Logo" 
        className="w-full h-full object-contain pointer-events-none"
      />
    </div>
  );
};

const playChime = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        gain1.gain.setValueAtTime(0.06, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.08); // A5
        gain2.gain.setValueAtTime(0.08, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08 + 0.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.08 + 0.4);
    } catch (e) {
        console.warn('Audio play block:', e);
    }
};

const Layout: React.FC<LayoutProps> = ({ children, currentStep, title, onBack, onNavigate, onProfileClick, onLogoDoubleClick }) => {
    const { user, profile, updateProfile, streakRewardInfo, clearStreakReward } = useAuth();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const lang: Language = profile?.language || 'hi';
    const t = translations[lang];
    const [newNotificationTitle, setNewNotificationTitle] = useState('');
    const [newNotificationText, setNewNotificationText] = useState('');
    const [newNotificationImage, setNewNotificationImage] = useState('');
    const [isSubmittingNotification, setIsSubmittingNotification] = useState(false);
    const [isUploadingNewNotifImg, setIsUploadingNewNotifImg] = useState(false);
    const [lastReadNotificationTime, setLastReadNotificationTime] = useState<number>(() => {
        return Number(localStorage.getItem('bodhak_notifications_last_read') || '0');
    });

    const [quotaExceeded, setQuotaExceeded] = useState(false);

    useEffect(() => {
        const handleQuota = () => setQuotaExceeded(true);
        window.addEventListener('bodhak:quota_exceeded', handleQuota);
        return () => window.removeEventListener('bodhak:quota_exceeded', handleQuota);
    }, []);

    // Manager Pop-up Alert state
    const [managerAlert, setManagerAlert] = useState<{
        type: 'payment' | 'chat';
        id: string;
        title: string;
        userName: string;
        userEmail?: string;
        amount?: number;
        text?: string;
        note?: string;
        senderId?: string;
        timestamp: number;
    } | null>(null);

    const [dismissedPayId, setDismissedPayId] = useState<string>(() => localStorage.getItem('bodhak_mgr_dismissed_pay_id') || '');
    const [dismissedChatId, setDismissedChatId] = useState<string>(() => localStorage.getItem('bodhak_mgr_dismissed_chat_id') || '');

    const handleDismissManagerAlert = () => {
        if (!managerAlert) return;
        if (managerAlert.type === 'payment') {
            localStorage.setItem('bodhak_mgr_dismissed_pay_id', managerAlert.id);
            setDismissedPayId(managerAlert.id);
        } else if (managerAlert.type === 'chat') {
            localStorage.setItem('bodhak_mgr_dismissed_chat_id', managerAlert.id);
            setDismissedChatId(managerAlert.id);
        }
        setManagerAlert(null);
    };

    const handleOpenFromManagerAlert = () => {
        if (!managerAlert) return;
        const currentType = managerAlert.type;
        const currentSenderId = managerAlert.senderId;
        handleDismissManagerAlert();
        
        onNavigate('manager');
        if (currentType === 'payment') {
            window.dispatchEvent(new CustomEvent('open-manager-portal-tab', { detail: { tab: 'payment_requests' } }));
        } else if (currentType === 'chat') {
            window.dispatchEvent(new CustomEvent('open-manager-portal-tab', { detail: { tab: 'support_chat', userId: currentSenderId } }));
        }
    };

    // States for target audience in notification sending
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [notifTargetType, setNotifTargetType] = useState<'all' | 'specific'>('all');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');

    // Load registered accounts for notifications target dropdown
    useEffect(() => {
        if (!user || !profile?.isManager) {
            setAllUsers([]);
            return;
        }

        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ userId: doc.id, ...doc.data() });
            });
            setAllUsers(list);
        }, (error) => {
            console.error('Error listening to all users for notifications:', error);
        });

        return () => unsubscribe();
    }, [user, profile?.isManager]);

    useEffect(() => {
        if (!user) return;

        // Request browser notification permission
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(25));
        let isFirstLoad = true;
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // If manager, load all to allow monitoring / management
                if (profile?.isManager) {
                    list.push({ id: doc.id, ...data });
                } else {
                    // For regular users, filter so they only see global ones or those targeted to them
                    const isForMe = !data.targetUserId || 
                                     data.targetUserId === 'all' || 
                                     data.targetUserId === user.uid ||
                                     (data.targetUserIds && data.targetUserIds.includes(user.uid));
                    if (isForMe) {
                        list.push({ id: doc.id, ...data });
                    }
                }
            });
            
            if (!isFirstLoad && list.length > 0) {
                const latest = list[0];
                // Only notify if it's a new one created recently
                if (latest.createdAt > Date.now() - 30000) {
                    playChime();
                    if (!profile?.isManager) {
                        setPriorityNotif(latest);
                    }
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("New Announcement / नई घोषणा 📢", {
                            body: `${latest.title}: ${latest.text.substring(0, 50)}...`,
                            icon: "/icon.svg"
                        });
                    }
                }
            }
            isFirstLoad = false;
            setNotifications(list);
        }, (error) => {
            console.error('Error listening to notifications:', error);
        });
        return () => unsubscribe();
    }, [user, profile?.isManager]);

    // Manager Specific Listeners for Payment & Support Alerts Popup
    useEffect(() => {
        if (!user || !profile?.isManager) {
            setManagerAlert(null);
            return;
        }

        // Listener for Pending Payment Requests
        const paymentsQ = query(
            collection(db, 'paymentRequests'), 
            orderBy('createdAt', 'desc'), 
            limit(10)
        );
        const unsubPayments = onSnapshot(paymentsQ, (snap) => {
            const pendingList: any[] = [];
            snap.forEach((d) => {
                const data = d.data();
                if (data.status === 'pending') {
                    pendingList.push({ id: d.id, ...data });
                }
            });

            if (pendingList.length > 0) {
                const latestPay = pendingList[0];
                const payId = latestPay.id || latestPay.requestId;
                const currentDismissed = localStorage.getItem('bodhak_mgr_dismissed_pay_id') || '';
                
                if (payId && payId !== currentDismissed) {
                    setManagerAlert({
                        type: 'payment',
                        id: payId,
                        title: 'New Payment Request Received / नया भुगतान अनुरोध 💰',
                        userName: latestPay.userName || 'User',
                        userEmail: latestPay.userEmail || '',
                        amount: latestPay.amount || 0,
                        note: latestPay.note || '',
                        timestamp: latestPay.createdAt?.toMillis ? latestPay.createdAt.toMillis() : Date.now()
                    });
                    playChime();
                    return;
                }
            } else {
                // If there are no pending payment requests at all, clear payment alert if active
                setManagerAlert(prev => prev?.type === 'payment' ? null : prev);
            }
        }, (err) => {
            console.warn("[Notification Service] Payment request listening notice:", err.message);
        });

        // Listener for Support Messages from ALL users
        const supportQ = query(
            collectionGroup(db, 'messages'), 
            orderBy('createdAt', 'desc'), 
            limit(10)
        );
        const unsubSupport = onSnapshot(supportQ, (snap) => {
            let latestUserMsg: any = null;
            snap.forEach((d) => {
                const data = d.data();
                if (!data.isAdminSender && !latestUserMsg) {
                    latestUserMsg = { id: d.id, ...data };
                }
            });

            if (latestUserMsg) {
                const msgId = latestUserMsg.id || (latestUserMsg.senderId + '_' + latestUserMsg.createdAt);
                const currentDismissedChat = localStorage.getItem('bodhak_mgr_dismissed_chat_id') || '';
                
                if (msgId && msgId !== currentDismissedChat) {
                    setManagerAlert((prev) => {
                        // If no active alert or current alert is chat, update to this chat alert
                        if (!prev || prev.type === 'chat') {
                            playChime();
                            return {
                                type: 'chat',
                                id: msgId,
                                title: 'New Support Chat Message / नया सहायता संदेश 💬',
                                userName: latestUserMsg.senderName || latestUserMsg.userName || 'User',
                                text: latestUserMsg.text || 'Sent an attachment / फोटो या अटैचमेंट',
                                senderId: latestUserMsg.senderId || latestUserMsg.userId,
                                timestamp: latestUserMsg.createdAt || Date.now()
                            };
                        }
                        return prev;
                    });
                }
            }
        }, (err) => {
            console.warn("[Notification Service] Support messages listening notice:", err.message);
        });

        return () => {
            unsubPayments();
            unsubSupport();
        };
    }, [user, profile?.isManager, dismissedPayId, dismissedChatId]);

    const unreadCount = notifications.filter(n => n.createdAt > lastReadNotificationTime).length;

    const handleOpenNotifications = () => {
        setIsNotificationOpen(true);
        const now = Date.now();
        setLastReadNotificationTime(now);
        localStorage.setItem('bodhak_notifications_last_read', String(now));
    };

    const handleNewNotifImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select valid image for notification. / कृपया अधिसूचना के लिए वैध फोटो चुनें।');
            return;
        }
        if (file.size > 1024 * 1024) { // 1MB limit check
            alert('Notification image too large. Max 1MB allowed. / अधिसूचना फोटो 1MB से कम होनी चाहिए।');
            return;
        }

        setIsUploadingNewNotifImg(true);
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setNewNotificationImage(result);
            setIsUploadingNewNotifImg(false);
        };
        reader.onerror = () => {
            alert('Failed to upload notification image.');
            setIsUploadingNewNotifImg(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNotificationTitle.trim() || !newNotificationText.trim()) return;
        if (notifTargetType === 'specific' && selectedUserIds.length === 0) {
            alert('Please select at least one target user! / कृपया कम से कम एक लक्षित उपयोगकर्ता चुनें!');
            return;
        }

        setIsSubmittingNotification(true);
        try {
            const freshId = 'notif_' + Math.random().toString(36).substr(2, 9);
            const ref = doc(db, 'notifications', freshId);
            
            let targetNames = 'Selected Users';
            if (notifTargetType === 'specific') {
                const selectedNames = allUsers
                    .filter(u => selectedUserIds.includes(u.userId))
                    .map(u => u.name || 'Anonymous');
                targetNames = selectedNames.join(', ');
                if (targetNames.length > 50) {
                    targetNames = `${selectedNames.length} Users (${targetNames.substring(0, 45)}...)`;
                }
            }
            
            const payload = {
                id: freshId,
                title: newNotificationTitle.trim(),
                text: newNotificationText.trim(),
                imageUrl: newNotificationImage || "",
                createdAt: Date.now(),
                senderId: user?.uid || '',
                senderName: profile?.name || user?.displayName || 'Manager',
                targetUserId: notifTargetType === 'all' ? 'all' : (selectedUserIds.length === 1 ? selectedUserIds[0] : 'multiple'),
                targetUserIds: notifTargetType === 'all' ? ['all'] : selectedUserIds,
                targetUserName: notifTargetType === 'all' ? 'All Users' : targetNames
            };
            await setDoc(ref, payload);
            setNewNotificationTitle('');
            setNewNotificationText('');
            setNewNotificationImage('');
            setNotifTargetType('all');
            setSelectedUserIds([]);
            setUserSearchQuery('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'notifications');
            alert('Failed to send announcement: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsSubmittingNotification(false);
        }
    };

    const [pendingDeleteNotifId, setPendingDeleteNotifId] = useState<string | null>(null);

    const handleDeleteNotification = async (notifId: string) => {
        try {
            const ref = doc(db, 'notifications', notifId);
            await deleteDoc(ref);
            setPendingDeleteNotifId(null);
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `notifications/${notifId}`);
            alert('Deletion failed!');
        }
    };

    const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
    const [showAppShareModal, setShowAppShareModal] = useState(false);
    const [appShareCopied, setAppShareCopied] = useState(false);
    const [priorityNotif, setPriorityNotif] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState<boolean>(() => {
        return localStorage.getItem('bodhak_app_downloaded') === 'true';
    });
    const [showPoster, setShowPoster] = useState<boolean>(() => {
        if (localStorage.getItem('bodhak_app_downloaded') === 'true') {
            return false;
        }
        return sessionStorage.getItem('bodhak_poster_closed') !== 'true';
    });
    const [showTopBlinkingIcon, setShowTopBlinkingIcon] = useState<boolean>(() => {
        if (localStorage.getItem('bodhak_app_downloaded') === 'true') {
            return false;
        }
        return sessionStorage.getItem('bodhak_poster_closed') === 'true';
    });
    const [appSettings, setAppSettings] = useState({ 
        pricePerCoin: 0.4, 
        minCoins: 10,
        unlimitedPassPrice: 100,
        unlimitedPassDays: 6,
        awPassPrice: 49,
        awPassDays: 30,
        quizPassPrice: 49,
        quizPassDays: 30,
        upiId: '9828030263@axl',
        couponCode: '',
        couponDiscount: 0,
        shareText: '',
        shareImageUrl: '',
        shareAppLink: '',
        coupons: [] as Array<{code: string, discount: number}>,
        coinPacks: [] as Array<{days: number, price: number, id: string}>,
        offerDiscountPct: 0,
        offerExpiresAt: 0
    });
    const [customCoinsAmount, setCustomCoinsAmount] = useState<number>(50);
    const [offerTimeLeft, setOfferTimeLeft] = useState('');

    const [streakRewardsConfig, setStreakRewardsConfig] = useState<{ day7: number; day15: number; day30: number }>({
        day7: 50,
        day15: 150,
        day30: 500
    });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'streakRewards'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setStreakRewardsConfig({
                    day7: data.day7 ?? 50,
                    day15: data.day15 ?? 150,
                    day30: data.day30 ?? 500
                });
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const updateTimer = () => {
            if (!appSettings.offerExpiresAt) {
                setOfferTimeLeft(appSettings.offerDiscountPct > 0 ? 'Active' : '');
                return;
            }
            const diff = appSettings.offerExpiresAt - Date.now();
            if (diff <= 0) {
                setOfferTimeLeft(appSettings.offerDiscountPct > 0 ? 'Active' : '');
                return;
            }
            const hrs = Math.floor(diff / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            
            const hrsStr = hrs > 0 ? `${hrs}h ` : '';
            setOfferTimeLeft(`${hrsStr}${mins}m ${secs}s`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [appSettings.offerExpiresAt, appSettings.offerDiscountPct]);

    const [couponInput, setCouponInput] = useState('');
    const [isCouponApplied, setIsCouponApplied] = useState(false);
    const [couponError, setCouponError] = useState('');
    const [qrPaymentDetails, setQrPaymentDetails] = useState<{ amount: number; note: string } | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<'verifying' | 'submitted_pending' | 'success' | 'failed' | 'expired' | 'upi_choice' | null>(null);
    const [paymentType, setPaymentType] = useState<'qr' | 'upi_app' | null>(null);
    const [paymentTimer, setPaymentTimer] = useState(600); // 10 minutes in seconds
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentNote, setPaymentNote] = useState('');
    const [coinsToAddState, setCoinsToAddState] = useState(0);
    const [isUnlimitedPassState, setIsUnlimitedPassState] = useState(false);
    const [unlimitedDaysState, setUnlimitedDaysState] = useState(0);
    const [verifyingProgress, setVerifyingProgress] = useState(0);

    // Secure UTR verification states
    const [utrNumber, setUtrNumber] = useState('');
    const [isSubmittingUtr, setIsSubmittingUtr] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [activePaymentRequestId, setActivePaymentRequestId] = useState<string | null>(null);

    const resetPaymentStates = () => {
        setQrPaymentDetails(null);
        setPaymentStatus(null);
        setPaymentType(null);
        setPaymentTimer(600);
        setVerifyingProgress(0);
        setUtrNumber('');
        setIsSubmittingUtr(false);
        setSubmitError('');
        setActivePaymentRequestId(null);
        setUnlimitedDaysState(0);
    };

    const startPaymentVerification = (amount: number, note: string, type: 'qr' | 'upi_app', coins: number, isUnlimited: boolean, days: number = 0) => {
        setPaymentStatus('verifying');
        setPaymentType(type);
        setPaymentTimer(type === 'upi_app' ? 60 : 600);
        setPaymentAmount(amount);
        setPaymentNote(note);
        setCoinsToAddState(coins);
        setIsUnlimitedPassState(isUnlimited);
        setUnlimitedDaysState(days);
    };

    // Submits the payment request for direct UPI app payment when they click "Payment Done"
    const handleUpiAppPaymentDone = async () => {
        setIsSubmittingUtr(true);
        setSubmitError('');

        try {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const autoGeneratedUtr = 'UPI_' + Math.floor(10000000 + Math.random() * 90000000);
            setUtrNumber(autoGeneratedUtr);
            
            const noteLower = paymentNote.toLowerCase();
            const computedPlanType = isUnlimitedPassState
                ? (noteLower.includes('ans. chak') || noteLower.includes('aw') ? 'aw' : noteLower.includes('quiz') ? 'quiz' : 'all')
                : 'coins';

            const payload = {
                id: requestId,
                requestId,
                userId: user?.uid || '',
                userName: profile?.name || user?.email || 'Anonymous User',
                userEmail: user?.email || '',
                amount: paymentAmount,
                note: paymentNote,
                utr: autoGeneratedUtr,
                status: 'pending',
                coins: coinsToAddState,
                isUnlimited: isUnlimitedPassState,
                planType: computedPlanType,
                unlimitedDays: isUnlimitedPassState ? (unlimitedDaysState || (computedPlanType === 'aw' ? appSettings.awPassDays : computedPlanType === 'quiz' ? appSettings.quizPassDays : appSettings.unlimitedPassDays) || 30) : 0,
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, 'paymentRequests', requestId), payload);
            setActivePaymentRequestId(requestId);
            setPaymentStatus('submitted_pending');
        } catch (err: any) {
            console.error("Failed to submit UPI App payment request:", err);
            setSubmitError("Failed to submit UPI App payment: " + (err.message || err));
        } finally {
            setIsSubmittingUtr(false);
        }
    };

    // 10 minutes countdown timer for payment session / 1 minute for UPI app
    useEffect(() => {
        if (paymentStatus !== 'verifying') return;
        
        const interval = setInterval(() => {
            setPaymentTimer((prev) => {
                if (prev <= 1) {
                    if (paymentType === 'upi_app') {
                        setPaymentStatus('upi_choice');
                    } else {
                        setPaymentStatus('expired');
                    }
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [paymentStatus, paymentType]);

    // Secure manual UTR verification submission handler
    const handleSubmitPaymentRequest = async () => {
        setIsSubmittingUtr(true);
        setSubmitError('');

        try {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            // Auto-generate a beautiful tracking ID
            const autoGeneratedUtr = 'QR_' + Math.floor(10000000 + Math.random() * 90000000);
            setUtrNumber(autoGeneratedUtr);
            
            const noteLower = paymentNote.toLowerCase();
            const computedPlanType = isUnlimitedPassState
                ? (noteLower.includes('ans. chak') || noteLower.includes('aw') ? 'aw' : noteLower.includes('quiz') ? 'quiz' : 'all')
                : 'coins';

            const payload = {
                requestId,
                userId: user?.uid || '',
                userName: profile?.name || user?.email || 'Anonymous User',
                userEmail: user?.email || '',
                amount: paymentAmount,
                note: paymentNote,
                utr: autoGeneratedUtr,
                status: 'pending',
                coins: coinsToAddState,
                isUnlimited: isUnlimitedPassState,
                planType: computedPlanType,
                unlimitedDays: isUnlimitedPassState ? (unlimitedDaysState || (computedPlanType === 'aw' ? appSettings.awPassDays : computedPlanType === 'quiz' ? appSettings.quizPassDays : appSettings.unlimitedPassDays) || 30) : 0,
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, 'paymentRequests', requestId), payload);
            
            setActivePaymentRequestId(requestId);
            setPaymentStatus('submitted_pending');
            
        } catch (err: any) {
            console.error("Failed to submit payment verification request:", err);
            setSubmitError("Failed to submit request: " + (err.message || err));
        } finally {
            setIsSubmittingUtr(false);
        }
    };

    // Real-time secure listener matching submitted transaction document state
    useEffect(() => {
        if (!activePaymentRequestId) return;

        const requestDocRef = doc(db, 'paymentRequests', activePaymentRequestId);
        const unsubscribe = onSnapshot(requestDocRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.status === 'approved') {
                    playChime();
                    setPaymentStatus('success');
                    setActivePaymentRequestId(null);
                } else if (data.status === 'rejected') {
                    setPaymentStatus('failed');
                    setActivePaymentRequestId(null);
                }
            }
        }, (err) => {
            console.error("Error listening to payment request status:", err);
        });

        return () => unsubscribe();
    }, [activePaymentRequestId]);

    const triggerUPIPayment = async (amount: number, note: string, days: number = 0) => {
        const isUnlimited = note.toLowerCase().includes('pass') || note.toLowerCase().includes('unlimited');
        let coins = 0;
        if (!isUnlimited) {
            const coinsMatch = note.match(/(\d+)\s*coins/i);
            if (coinsMatch) {
                coins = parseInt(coinsMatch[1]);
            } else {
                coins = Math.round((customCoinsAmount || 50) / appSettings.pricePerCoin);
            }
        }

        const upiIdStr = appSettings.upiId || '9828030263@axl';
        const upiUrl = `upi://pay?pa=${upiIdStr}&pn=Bodhak&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
        
        startPaymentVerification(amount, note, 'upi_app', coins, isUnlimited, days);

        try {
            const link = document.createElement('a');
            link.href = upiUrl;
            link.rel = 'noreferrer';
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("UPI Intent redirect error:", e);
        }
    };

    const triggerQrPayment = (amount: number, note: string, days: number = 0) => {
        const isUnlimited = note.toLowerCase().includes('pass') || note.toLowerCase().includes('unlimited');
        let coins = 0;
        if (!isUnlimited) {
            const coinsMatch = note.match(/(\d+)\s*coins/i);
            if (coinsMatch) {
                coins = parseInt(coinsMatch[1]);
            } else {
                coins = Math.round((customCoinsAmount || 50) / appSettings.pricePerCoin);
            }
        }

        setQrPaymentDetails({ amount, note });
        startPaymentVerification(amount, note, 'qr', coins, isUnlimited, days);
    };

    useEffect(() => {
        const settingsDocRef = doc(db, 'settings', 'config');
        const unsubscribe = onSnapshot(settingsDocRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setAppSettings({
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
            }
        }, (err) => {
            console.error('Error listening to global settings:', err);
        });

        const handleInstallAvailable = () => setIsInstallable(true);
        const handleInstalled = () => {
            setIsInstallable(false);
            setIsDownloaded(true);
            localStorage.setItem('bodhak_app_downloaded', 'true');
            setShowPoster(false);
            setShowTopBlinkingIcon(false);
        };

        window.addEventListener('pwa-installavailable', handleInstallAvailable);
        window.addEventListener('pwa-installed', handleInstalled);

        return () => {
            unsubscribe();
            window.removeEventListener('pwa-installavailable', handleInstallAvailable);
            window.removeEventListener('pwa-installed', handleInstalled);
        };
    }, []);

    const handleInstallClick = () => {
        if ((window as any).triggerPwaInstall) {
            (window as any).triggerPwaInstall();
        }
    };

    const handleDownloadClick = async () => {
        if ((window as any).triggerPwaInstall) {
            await (window as any).triggerPwaInstall();
        }
        setIsDownloaded(true);
        localStorage.setItem('bodhak_app_downloaded', 'true');
        setShowPoster(false);
        setShowTopBlinkingIcon(false);
    };
    const showHeader = currentStep !== 'loading';
    const showBack = currentStep !== 'create' && currentStep !== 'history' && onBack;

    const handleShare = () => {
        setShowAppShareModal(true);
    };

    const handleApplyCoupon = () => {
        setCouponError('');
        if (!couponInput.trim()) {
            setCouponError('Please enter a coupon code / कूपन कोड दर्ज करें');
            setIsCouponApplied(false);
            return;
        }
        
        const inputCode = couponInput.toUpperCase().trim();
        const mainCode = (appSettings.couponCode || '').toUpperCase().trim();
        
        // Find if any coupon matches
        let foundCoupon: { code: string, discount: number } | null = null;
        
        if (mainCode && inputCode === mainCode) {
            foundCoupon = { code: mainCode, discount: appSettings.couponDiscount || 0 };
        } else {
            const extraMatch = (appSettings.coupons || []).find(c => c.code.toUpperCase() === inputCode);
            if (extraMatch) {
                foundCoupon = extraMatch;
            }
        }

        if (foundCoupon) {
            setIsCouponApplied(true);
            setAppSettings(prev => ({ ...prev, couponDiscount: foundCoupon!.discount }));
            setCouponError('');
            alert(`Coupon Applied: ${foundCoupon.discount}% Off!`);
        } else {
            setIsCouponApplied(false);
            setCouponError('Invalid Coupon Code / अमान्य कूपन कोड');
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-800 overflow-hidden">
            {showHeader && (
                <header className="flex items-center justify-between px-4 h-14 md:h-16 bg-white border-b border-slate-200/80 backdrop-blur-md pt-[env(safe-area-inset-top,0px)] z-20 shadow-sm gap-2 shrink-0">
                    <div className="flex items-center space-x-2 overflow-hidden flex-1 h-full">
                        {showBack && (
                            <button 
                                onClick={onBack} 
                                className="text-slate-600 p-1.5 hover:bg-slate-100 rounded-full transition active:scale-95 shrink-0"
                            >
                                <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
                            </button>
                        )}
                        {!showBack && (
                            <BodhakLogo 
                                onClick={() => onNavigate('home')} 
                                onDoubleClick={onLogoDoubleClick}
                                title="Bodhak (Double-click: Anti-Sleep PiP 👁️📺)"
                            />
                        )}
                        <h1 
                            onClick={!showBack ? () => onNavigate('home') : undefined}
                            onDoubleClick={!showBack ? onLogoDoubleClick : undefined}
                            title={!showBack ? "Bodhak (Double-click: Anti-Sleep PiP 👁️📺)" : undefined}
                            className={`font-extrabold text-base md:text-xl truncate select-none text-slate-900 tracking-tight flex items-center ${!showBack ? 'cursor-pointer hover:text-indigo-655 transition-colors' : ''}`}
                        >
                            {title}
                        </h1>
                    </div>

                    <div className="flex items-center gap-1 md:gap-2">
                        {/* Install / Pulsing Download Button */}
                        {showTopBlinkingIcon && !isDownloaded ? (
                            <button
                                id="header-pulsing-download-btn"
                                onClick={handleDownloadClick}
                                title="Download Bodhak App / बोधक ऐप डाउनलोड करें 📲"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-500 via-pink-600 to-indigo-600 text-white rounded-full text-[10px] md:text-xs font-black shadow-md hover:brightness-110 active:scale-95 transition-all shrink-0 animate-pulse border border-white/20 cursor-pointer"
                            >
                                <Download className="h-3.5 w-3.5 animate-bounce text-white" />
                                <span className="hidden xs:inline uppercase tracking-tight">Download App</span>
                            </button>
                        ) : (
                            isInstallable && !isDownloaded && (
                                <button
                                    id="install-btn"
                                    onClick={handleInstallClick}
                                    title="Install Bodhak App"
                                    className="flex items-center gap-1.5 md:gap-2 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-indigo-600 text-white rounded-full text-[10px] md:text-xs font-bold hover:bg-indigo-700 transition active:scale-95 shadow-sm animate-pulse"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    <span className="hidden xs:inline">Install</span>
                                </button>
                            )
                        )}

                        {/* Notification Button */}
                        {user && (
                            <button
                                onClick={handleOpenNotifications}
                                title="Notifications / घोषणाएं 📢"
                                className="p-2 md:p-2.5 text-slate-650 hover:bg-slate-100 rounded-full transition active:scale-95 shrink-0 bg-white border border-slate-200 shadow-sm relative cursor-pointer flex items-center justify-center"
                            >
                                <Bell className="h-4 w-4 md:h-5 md:w-5" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-600 text-white font-extrabold text-[9px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center animate-bounce shadow-md">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Share Button */}
                        <button
                            onClick={handleShare}
                            title="Share App"
                            className="p-2 md:p-2.5 text-slate-600 hover:bg-slate-100 rounded-full transition active:scale-95 shrink-0 bg-white border border-slate-200 shadow-sm flex items-center justify-center"
                        >
                            <Share2 className="h-4 w-4 md:h-5 md:w-5" />
                        </button>

                        {/* Coin Count Pill (Icon Only) */}
                        {user && (
                            <button 
                                id="coin-pill-button"
                                onClick={() => setIsCoinModalOpen(true)}
                                title={(profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now())) 
                                    ? (profile?.language === 'en' ? "Unlimited Coins Active" : "असीमित कॉइन्स सक्रिय")
                                    : (profile?.language === 'en' ? "View or Buy Coins" : "कॉइन्स देखें या खरीदें")}
                                className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 border border-amber-200 rounded-full shadow-sm bg-white hover:bg-amber-50 text-amber-600 transition active:scale-95 cursor-pointer shrink-0"
                            >
                                <span className="text-sm md:text-base mb-0.5">🪙</span>
                            </button>
                        )}

                        {/* Manager Button */}
                        {profile?.isManager && (
                            <button
                                onClick={() => onNavigate('manager')}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-amber-200 text-amber-800 font-bold text-xs transition-all shrink-0 bg-amber-50 hover:bg-amber-100 shadow-sm ${currentStep === 'manager' ? 'ring-2 ring-amber-500' : ''}`}
                            >
                                <Crown className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                                <span className="hidden sm:inline">Manager</span>
                            </button>
                        )}

                        {/* Profile Button */}
                        <button
                            onClick={onProfileClick}
                            className="flex items-center justify-center px-3 py-1.5 md:py-2 md:px-4 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs md:text-sm transition-all shrink-0 bg-white shadow-sm"
                        >
                            <span className="hidden md:inline mr-2">{user ? (profile?.name || user.displayName || 'Me') : 'Login'}</span>
                            {profile?.photoUrl ? (
                                <img src={profile.photoUrl} alt="" className="h-5 w-5 md:h-6 md:w-6 rounded-full border border-slate-200 object-cover" referrerPolicy="no-referrer" />
                            ) : user?.photoURL ? (
                                <img src={user.photoURL} alt="" className="h-5 w-5 md:h-6 md:w-6 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                            ) : (
                                <User className="h-4 w-4 md:h-5 md:w-5 text-slate-500" />
                            )}
                        </button>

                        {/* Interactive 3-Dot settings & language dropdown */}
                        {user && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                    title="More Options & Language Settings / अधिक विकल्प और भाषा सेटिंग"
                                    className={`p-2 md:p-2.5 hover:bg-slate-100 rounded-full transition active:scale-95 shrink-0 bg-white border shadow-sm relative cursor-pointer flex items-center justify-center ${isMenuOpen ? 'border-indigo-550 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-500/10' : 'border-slate-200 text-slate-650'}`}
                                >
                                    <MoreVertical className="h-4 w-4 md:h-5 md:w-5" />
                                </button>

                                {isMenuOpen && (
                                    <>
                                        {/* Overlay boundary backdrop for auto-close */}
                                        <div 
                                            className="fixed inset-0 z-[110]" 
                                            onClick={() => setIsMenuOpen(false)}
                                        />

                                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-2xl z-[120] p-1.5 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                                            {/* Language Setter */}
                                            <div className="p-2 border-b border-slate-100">
                                                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-wider mb-2 flex items-center gap-1">
                                                    <Globe className="w-3.5 h-3.5 text-indigo-550 shrink-0" />
                                                    <span>{t.selectLanguage}</span>
                                                </span>
                                                
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <button
                                                        onClick={async () => {
                                                            if (profile) {
                                                                await updateProfile({ ...profile, language: 'hi' });
                                                            }
                                                            setIsMenuOpen(false);
                                                        }}
                                                        className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer select-none border ${
                                                            lang === 'hi' 
                                                                ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm' 
                                                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/50'
                                                        }`}
                                                    >
                                                        🇮🇳 हिंदी
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (profile) {
                                                                await updateProfile({ ...profile, language: 'en' });
                                                            }
                                                            setIsMenuOpen(false);
                                                        }}
                                                        className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer select-none border ${
                                                            lang === 'en' 
                                                                ? 'bg-indigo-600 border-indigo-650 text-white shadow-sm' 
                                                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/50'
                                                        }`}
                                                    >
                                                        🇺🇸 Eng
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Navigation Links inside 3dot Dropdown */}
                                            <div className="py-1.5 space-y-0.5">
                                                <button
                                                    onClick={() => {
                                                        onNavigate('home');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'home' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <Home className="w-4 h-4 text-slate-400" />
                                                    <span>{t.home}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('notes');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'notes' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <FileText className="w-4 h-4 text-slate-400" />
                                                    <span>{t.notes}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('ans-chak');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'ans-chak' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <CheckCircle className="w-4 h-4 text-slate-400" />
                                                    <span>{t.ansChak}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('create');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'create' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <Zap className="w-4 h-4 text-slate-400" />
                                                    <span>{t.quizGen}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('pyq');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'pyq' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <FileSearch className="w-4 h-4 text-slate-400" />
                                                    <span>{t.pyqScanner}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('current-affairs');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'current-affairs' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <Newspaper className="w-4 h-4 text-slate-400" />
                                                    <span>{t.currentAffairs}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('buy-m');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'buy-m' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                                                    <span>{t.buyM}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('free-m');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'free-m' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <BookOpen className="w-4 h-4 text-slate-400" />
                                                    <span>{t.freeM}</span>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        onNavigate('anti-sleep');
                                                        setIsMenuOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl text-left flex items-center gap-2 hover:bg-slate-50 transition active:scale-[0.98] ${currentStep === 'anti-sleep' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-705'}`}
                                                >
                                                    <Eye className="w-4 h-4 text-cyan-500" />
                                                    <span>{t.antiSleepAlarm}</span>
                                                </button>
                                            </div>

                                            {/* Manager Portal option (if active) */}
                                            {profile?.isManager && (
                                                <div className="pt-1.5 border-t border-slate-100">
                                                    <button
                                                        onClick={() => {
                                                            onNavigate('manager');
                                                            setIsMenuOpen(false);
                                                        }}
                                                        className="w-full px-3 py-2 text-xs font-extrabold rounded-xl text-left flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition"
                                                    >
                                                        <Crown className="w-4 h-4 text-amber-600 animate-pulse" />
                                                        <span>{t.managerPortal}</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </header>
            )}

            {/* Quota Exceeded Banner */}
            {quotaExceeded && (
                <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 px-4 py-3 text-xs md:text-sm flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xs z-30 shrink-0 backdrop-blur-md">
                    <div className="flex items-center gap-2.5 font-medium">
                        <span className="text-lg shrink-0">⚠️</span>
                        <div>
                            <p className="font-extrabold text-amber-950">
                                Daily Database Usage Limit Reached (Free Tier Quota Exceeded) / दैनिक डेटाबेस सीमा समाप्त हो गई है (Quota Exceeded)
                            </p>
                            <p className="text-[11px] md:text-xs text-amber-800">
                                Database online reads/writes are temporarily paused and will automatically reset tomorrow. AI generation and cached offline features remain fully operational.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <a
                            href="https://console.firebase.google.com/project/aqueous-mercury-gr5vm/firestore/databases/ai-studio-e8939051-3910-4db6-be71-bdc5d97a870d/data?openUpgradeDialog=true"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs flex items-center gap-1"
                        >
                            <span>Upgrade / Console</span>
                            <span>→</span>
                        </a>
                        <button
                            onClick={() => setQuotaExceeded(false)}
                            className="p-1 hover:bg-amber-200/60 rounded-full text-amber-900 transition cursor-pointer"
                            title="Dismiss warning"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <main className={`flex-grow overflow-y-auto pb-[90px] md:pb-0 scroll-smooth ${currentStep === 'notes' ? '' : 'px-3 md:px-6 pt-3'}`}>
                {profile && !profile.isManager && !(profile.unlimitedExpirity && profile.unlimitedExpirity > Date.now()) && (profile.coins !== undefined ? profile.coins <= 0 : false) && (
                    <div className="mb-4 mx-3 md:mx-0 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-red-800 shadow-sm">
                        <div className="flex items-center gap-3 text-center sm:text-left">
                            <span className="text-2xl shrink-0">⚠️</span>
                            <div>
                                <p className="font-black text-sm text-slate-900">Your Coin Balance is 0! / आपका कॉइन बैलेंस 0 है!</p>
                                <p className="text-xs font-semibold text-red-600 mt-0.5 leading-relaxed">Please buy coins to perform any operations, quizzes, notes, or evaluations on Bodhak. / बोधक पर काम करने या अभ्यास करने हेतु कृपया अतिरिक्त कॉइन्स खरीदें।</p>
                            </div>
                        </div>
                        <button 
                            id="zero-coins-buy-now-btn"
                            onClick={() => {
                                setIsCoinModalOpen(true);
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shrink-0 shadow transition active:scale-95 cursor-pointer"
                        >
                            <span>Buy Now  🪙</span>
                        </button>
                    </div>
                )}
                {children}
            </main>

            {/* Mobile Footer Navigation */}
            {showHeader && (
                <footer className="md:hidden fixed bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 flex justify-around items-center p-1.5 z-30 pb-[env(safe-area-inset-bottom,20px)] h-16 shadow-lg">
                    {/* Buy Study Material */}
                    <button 
                        onClick={() => onNavigate('buy-m')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'buy-m' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600 active:scale-95 cursor-pointer'}`}
                    >
                        <ShoppingBag className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">Study M.</span>
                    </button>

                    {/* Notes */}
                    <button 
                        onClick={() => onNavigate('notes')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'notes' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <FileText className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">Notes</span>
                    </button>

                    {/* Ans Chak */}
                    <button 
                        onClick={() => onNavigate('ans-chak')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'ans-chak' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">Ans. Chak</span>
                    </button>

                    {/* Home (Centered - Bicho bich!) */}
                    <button 
                        onClick={() => onNavigate('home')}
                        className={`flex flex-col items-center justify-center p-1 rounded-2xl transition w-16 h-12 ${currentStep === 'home' ? 'bg-indigo-50 border border-indigo-100/40 text-indigo-705 scale-110 shadow-sm font-black' : 'text-indigo-600 font-extrabold bg-slate-50/50 hover:bg-slate-100'}`}
                    >
                        <Home className="h-5 w-5" />
                        <span className="text-[9px] mt-1 font-black truncate">Home</span>
                    </button>

                    {/* Quiz (Standard Size!) */}
                    <button 
                        onClick={() => onNavigate('create')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'create' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Zap className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">Quiz</span>
                    </button>

                    {/* PYQ */}
                    <button 
                        onClick={() => onNavigate('pyq')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'pyq' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <FileSearch className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">PYQs</span>
                    </button>

                    {/* CA */}
                    <button 
                        onClick={() => onNavigate('current-affairs')}
                        className={`flex flex-col items-center justify-center p-1 rounded-md transition w-14 ${currentStep === 'current-affairs' ? 'text-indigo-655 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Newspaper className="h-4 w-4" />
                        <span className="text-[9px] mt-1 font-extrabold truncate">CA</span>
                    </button>
                </footer>
            )}

            {isCoinModalOpen && (
                <div 
                    id="coin-details-overlay"
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300"
                    onClick={() => { 
                        if ((paymentStatus === 'verifying' || paymentStatus === 'upi_choice') && paymentType === 'upi_app') return; // Prevent closing during direct UPI countdown or choice
                        setIsCoinModalOpen(false); 
                        resetPaymentStates(); 
                    }}
                >
                    <div 
                        id="coin-details-card"
                        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 text-slate-800 flex flex-col max-h-[85vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close button */}
                        {!((paymentStatus === 'verifying' || paymentStatus === 'upi_choice') && paymentType === 'upi_app') && (
                            <button 
                                id="coin-modal-close"
                                onClick={() => { setIsCoinModalOpen(false); resetPaymentStates(); }}
                                className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition active:scale-95 z-10"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar min-h-0">
                             {paymentStatus ? (
                                <div className="space-y-6 text-center py-4">
                                    {paymentStatus === 'verifying' && (
                                        <div className="space-y-6">
                                            {/* Header with back button to cancel/go back */}
                                            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 text-left">
                                                {(paymentStatus === 'verifying' || paymentStatus === 'upi_choice') && paymentType === 'upi_app' ? (
                                                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-600 animate-pulse">
                                                        <Lock className="w-4 h-4 shrink-0" />
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => resetPaymentStates()}
                                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-650 transition"
                                                    >
                                                        <ArrowLeft className="w-5 h-5 flex-shrink-0" />
                                                    </button>
                                                )}
                                                <div>
                                                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                                                        {paymentType === 'qr' ? 'UPI QR Payment / क्यूआर कोड भुगतान' : 'Secure UPI Payment / सुरक्षित यूपीआई भुगतान'}
                                                    </h3>
                                                    <p className="text-[10px] text-slate-500 font-semibold">Do not close this window</p>
                                                </div>
                                            </div>

                                            {paymentType === 'qr' && qrPaymentDetails && (
                                                <div className="flex flex-col items-center space-y-4">
                                                    {/* ONLY QR visual and Timer! */}
                                                    <div className="bg-slate-50 border border-slate-200/85 rounded-2xl p-4 flex flex-col items-center justify-center space-y-3.5 relative overflow-hidden shadow-inner w-full">
                                                        {/* Dynamic glowing timer bar */}
                                                        <div className="font-mono text-xs bg-indigo-50 border border-indigo-150 rounded-full px-3 py-1 font-black text-indigo-700 animate-pulse flex items-center gap-1.5 shrink-0 select-none">
                                                            <span className="w-2 h-2 bg-indigo-600 rounded-full animate-ping"></span>
                                                            <span>Session Active: {Math.floor(paymentTimer / 60)}:{(paymentTimer % 60).toString().padStart(2, '0')}</span>
                                                        </div>

                                                        {/* QR Image */}
                                                        <div className="bg-white border border-slate-250 p-2.5 rounded-2xl shadow-sm relative transition hover:scale-105 duration-300">
                                                            <img 
                                                                referrerPolicy="no-referrer"
                                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                                                                    `upi://pay?pa=${appSettings.upiId || '9828030263@axl'}&pn=Bodhak&am=${paymentAmount}&cu=INR&tn=${encodeURIComponent(paymentNote)}`
                                                                )}`}
                                                                alt="UPI QR Code"
                                                                className="w-44 h-44 rounded"
                                                            />
                                                        </div>

                                                        <div className="text-center">
                                                            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Amount to Pay / राशि</p>
                                                            <p className="text-2xl font-black text-indigo-950 mt-1">₹{paymentAmount}</p>
                                                            <p className="text-[10px] text-slate-500 font-bold mt-1">Payee Name: <span className="font-extrabold text-indigo-600">Bodhak</span></p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {paymentType === 'upi_app' && (
                                                <div className="space-y-6 animate-[scaleUp_0.3s_ease-out]">
                                                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-center space-y-4">
                                                        {/* Pulsing secure lock visual */}
                                                        <div className="relative flex items-center justify-center">
                                                            <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping w-16 h-16 mx-auto"></div>
                                                            <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-white relative shadow-md">
                                                                <Lock className="w-7 h-7 animate-pulse" />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <h4 className="font-black text-amber-900 text-base md:text-lg uppercase tracking-tight animate-pulse leading-snug">
                                                                {profile?.language === 'hi' ? '⚠️ कृपया प्रतीक्षा करें / PLEASE WAIT ⚠️' : '⚠️ PLEASE WAIT / कृपया प्रतीक्षा करें ⚠️'}
                                                            </h4>
                                                            <div className="bg-amber-100/70 inline-block px-3.5 py-1.5 rounded-full border border-amber-250">
                                                                <p className="text-[11px] font-black text-amber-900 animate-pulse">
                                                                    {profile?.language === 'hi' 
                                                                        ? 'कृपया बैक बटन न दबाएं और विंडो बंद न करें!' 
                                                                        : 'Do not press back or close this window!'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Linear progressive progress bar */}
                                                        <div className="space-y-2 max-w-[280px] mx-auto pt-1">
                                                            <div className="flex justify-between items-center text-xs font-black text-slate-700">
                                                                <span>{profile?.language === 'hi' ? 'सत्यापन प्रगति' : 'Verification Progress'}</span>
                                                                <span className="font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md animate-pulse">{paymentTimer}s</span>
                                                            </div>
                                                            <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden border border-slate-250 p-0.5">
                                                                <div 
                                                                    className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-650 h-full rounded-full transition-all duration-1000 ease-linear shadow-inner"
                                                                    style={{ width: `${Math.max(5, Math.min(100, ((60 - paymentTimer) / 60) * 100))}%` }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Animated status text ticker */}
                                                        <div className="bg-white border border-amber-200/80 p-3 rounded-2xl shadow-sm text-center min-h-[50px] flex items-center justify-center">
                                                            <p className="text-xs font-black text-slate-700 leading-normal">
                                                                {(() => {
                                                                    const isHindi = profile?.language === 'hi';
                                                                    if (paymentTimer > 45) {
                                                                        return isHindi 
                                                                            ? "🔄 यूपीआई ऐप भुगतान की पुष्टि की जा रही है..." 
                                                                            : "🔄 Confirming payment from UPI app...";
                                                                    } else if (paymentTimer > 30) {
                                                                        return isHindi 
                                                                            ? "🏦 बैंक पेमेंट गेटवे से सिंक किया जा रहा है..." 
                                                                            : "🏦 Synchronizing with bank payment gateway...";
                                                                    } else if (paymentTimer > 15) {
                                                                        return isHindi 
                                                                            ? "⚙️ सर्वर डेटाबेस में रिकॉर्ड दर्ज किया जा रहा है..." 
                                                                            : "⚙️ Recording transaction logs in secure database...";
                                                                    } else {
                                                                        return isHindi 
                                                                            ? "🛡️ अंतिम सुरक्षा सत्यापन प्रक्रिया चल रही है..." 
                                                                            : "🛡️ Final security checks and validation...";
                                                                    }
                                                                })()}
                                                            </p>
                                                        </div>

                                                        <p className="text-[10px] text-slate-400 font-extrabold leading-normal max-w-[320px] mx-auto">
                                                            {profile?.language === 'hi'
                                                                ? 'यूपीआई ऐप से भुगतान पूरा करें। ऐप पृष्ठभूमि में स्वचालित रूप से भुगतान की पुष्टि करेगा।'
                                                                : 'Complete the payment in your UPI app. The system is auto-verifying your transaction in the background.'}
                                                        </p>
                                                    </div>

                                                    {/* Collapsible fail-safe copy options if PhonePe did not launch */}
                                                    <details className="group border border-slate-200 rounded-2xl bg-slate-50/50 p-3 text-left">
                                                        <summary className="text-[11px] font-black text-slate-600 cursor-pointer hover:text-indigo-650 list-none flex items-center justify-between">
                                                            <span>📋 UPI Details Backup (यदि ऐप नहीं खुला)</span>
                                                            <span className="transition-transform group-open:rotate-180 text-slate-400">▼</span>
                                                        </summary>
                                                        <div className="mt-2.5 space-y-2 animate-in slide-in-from-top-1">
                                                            <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
                                                                <div className="truncate pr-2">
                                                                    <p className="text-[8px] text-slate-400 font-extrabold uppercase">UPI ID</p>
                                                                    <p className="text-xs font-mono font-black text-slate-800 truncate select-all">{appSettings.upiId || '9828030263@axl'}</p>
                                                                </div>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(appSettings.upiId || '9828030263@axl');
                                                                        alert("UPI ID Copied! / यूपीआई आईडी कॉपी हो गई है!");
                                                                    }}
                                                                    className="px-2.5 py-1 text-[9px] bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700 font-black border border-indigo-150 shrink-0"
                                                                >
                                                                    Copy
                                                                </button>
                                                            </div>
                                                            <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200">
                                                                <div>
                                                                    <p className="text-[8px] text-slate-400 font-extrabold uppercase">Amount</p>
                                                                    <p className="text-xs font-black text-slate-800">₹{paymentAmount}</p>
                                                                </div>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(String(paymentAmount));
                                                                        alert("Amount Copied! / राशि कॉपी हो गई है!");
                                                                    }}
                                                                    className="px-2.5 py-1 text-[9px] bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700 font-black border border-indigo-150 shrink-0"
                                                                >
                                                                    Copy
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </details>

                                                    {/* Cancel button during active direct UPI countdown */}
                                                    <div className="pt-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => { resetPaymentStates(); }}
                                                            className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 hover:text-rose-800 font-black text-xs rounded-xl transition active:scale-[0.97] flex items-center justify-center gap-1 shadow-sm"
                                                        >
                                                            Cancel Payment / भुगतान रद्द करें ❌
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Done and Cancel buttons */}
                                            {paymentType !== 'upi_app' && (
                                                <div className="space-y-3 mt-4 text-left">
                                                    {submitError && <p className="text-[10px] text-rose-600 font-bold leading-normal">{submitError}</p>}
                                                    
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => { resetPaymentStates(); }}
                                                            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl transition active:scale-[0.97] border border-slate-200 text-center"
                                                        >
                                                            Cancel / रद्द करें ❌
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isSubmittingUtr}
                                                            onClick={() => handleSubmitPaymentRequest()}
                                                            className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition active:scale-[0.97] flex items-center justify-center gap-1 shadow-md text-center"
                                                        >
                                                            {isSubmittingUtr ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    <span>Sending...</span>
                                                                </>
                                                            ) : (
                                                                <span>Done / भुगतान किया ✅</span>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <p className="text-[9.5px] text-slate-400 font-semibold text-center leading-normal">
                                                        Please pay via UPI app first, then click "Done". Coins/Pass will credit as soon as the manager approves.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {paymentStatus === 'upi_choice' && (
                                        <div className="space-y-6 animate-in zoom-in-95 duration-200 my-4 text-center">
                                            <div className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto shadow-sm text-amber-600 animate-bounce">
                                                <Lock className="w-8 h-8 text-amber-650" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black text-indigo-950 tracking-tight">Payment Completed? / भुगतान पूर्ण किया? 🤔</h3>
                                                <p className="text-slate-600 font-bold text-xs leading-normal">
                                                    The automatic verification timer has completed. Please select whether your payment was successful or not.
                                                </p>
                                                <p className="text-slate-500 font-bold text-[11px] leading-normal bg-amber-50/50 p-3 rounded-2xl border border-amber-250">
                                                    {profile?.language === 'hi' 
                                                        ? 'यदि आपने भुगतान पूरा कर लिया है, तो "Payment Done" पर क्लिक करें। यदि नहीं या आप रद्द करना चाहते हैं, तो "Payment Cancel" पर क्लिक करें।' 
                                                        : 'If you successfully completed the payment in your UPI app, click "Payment Done". Otherwise, click "Payment Cancel".'}
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2.5 text-left">
                                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                                    <span>Amount / राशि:</span>
                                                    <span className="font-extrabold text-slate-900">₹{paymentAmount}</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                                    <span>Benefit / लाभ:</span>
                                                    <span className="font-extrabold text-indigo-700">
                                                        {isUnlimitedPassState ? `${unlimitedDaysState || appSettings.unlimitedPassDays} Days Pass Unlimited` : `+${coinsToAddState} Coins`}
                                                    </span>
                                                </div>
                                            </div>

                                            {submitError && (
                                                <p className="text-xs text-rose-600 font-bold text-left bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                                                    {submitError}
                                                </p>
                                            )}

                                            <div className="grid grid-cols-2 gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { resetPaymentStates(); }}
                                                    className="py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl transition active:scale-[0.97] shadow-md border border-rose-700 text-center uppercase tracking-tight"
                                                >
                                                    Payment Cancel / रद्द करें ❌
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSubmittingUtr}
                                                    onClick={() => handleUpiAppPaymentDone()}
                                                    className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl transition active:scale-[0.97] shadow-md border border-emerald-700 text-center uppercase tracking-tight flex items-center justify-center gap-1.5"
                                                >
                                                    {isSubmittingUtr ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin animate-infinite" />
                                                            <span>Sending...</span>
                                                        </>
                                                    ) : (
                                                        <span>Payment Done / पूर्ण किया ✅</span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {paymentStatus === 'submitted_pending' && (
                                        <div className="space-y-6 animate-in zoom-in-95 duration-200 my-4 text-center">
                                            <div className="w-20 h-20 bg-indigo-50 border border-indigo-200 rounded-full flex items-center justify-center mx-auto shadow-sm text-indigo-650">
                                                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black text-indigo-950 tracking-tight">Payment Verification / भुगतान सत्यापन किया जा रहा है ⏳</h3>
                                                <p className="text-slate-900 font-extrabold text-sm">कृपया प्रतीक्षा करें: आपका भुगतान सत्यापन प्रक्रिया में है</p>
                                                <div className="text-slate-500 text-xs font-semibold space-y-1 mt-2">
                                                    <p>Our team is verifying the bank settlement reference:</p>
                                                    <p className="font-mono bg-slate-100 py-1.5 px-3 rounded-lg text-slate-800 font-bold inline-block text-sm border tracking-widest mt-1">UTR: {utrNumber}</p>
                                                </div>
                                                <p className="text-xs text-indigo-600 font-black mt-2 animate-pulse">
                                                    ⌛ Verifying with Manager / मैनेजर द्वारा जाँच की जा रही है...
                                                </p>
                                            </div>

                                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2.5 text-left">
                                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                                    <span>Amount / राशि:</span>
                                                    <span className="font-extrabold text-slate-900">₹{paymentAmount}</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                                    <span>Requested Benefit:</span>
                                                    <span className="font-extrabold text-slate-900">
                                                        {isUnlimitedPassState ? `${unlimitedDaysState || appSettings.unlimitedPassDays} Days Pass Unlimited` : `+${coinsToAddState} Coins`}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                                                You will see "Success" and receive coins automatically on this screen within 1-2 minutes! Please keep this window open or chat with support if you face any issues.
                                            </p>
                                        </div>
                                    )}

                                    {paymentStatus === 'success' && (
                                        <div className="space-y-5 animate-in zoom-in-95 duration-200 my-4">
                                            <div className="w-20 h-20 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-4xl shadow-sm text-emerald-600 animate-bounce">
                                                ✅
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-black text-emerald-950 tracking-tight">Payment Success! / भुगतान सफल 🎉</h3>
                                                <p className="text-slate-500 text-xs font-semibold">Automatic real-time settlement accomplished successfully.</p>
                                            </div>

                                            <div className="bg-emerald-50/60 rounded-2xl border border-emerald-150 p-4 space-y-2 text-left">
                                                <div className="flex justify-between text-xs font-bold text-emerald-900 border-b border-emerald-205/40 pb-2">
                                                    <span>Payee:</span>
                                                    <span className="font-extrabold uppercase">Bodhak</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-bold text-emerald-900 border-b border-emerald-205/40 pb-2">
                                                    <span>Amount Received:</span>
                                                    <span>₹{paymentAmount}</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-bold text-emerald-900 pt-1">
                                                    <span>Credited Benefit:</span>
                                                    <span className="font-black text-emerald-700">
                                                        {isUnlimitedPassState ? `${unlimitedDaysState || appSettings.unlimitedPassDays} Days Pass Unlimited` : `+${coinsToAddState} Coins`}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => resetPaymentStates()}
                                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-750 text-white font-black text-xs rounded-xl shadow-md transition active:scale-[0.98] cursor-pointer"
                                            >
                                                Start Using Bodhak / उपयोग शुरू करें ✅
                                            </button>
                                        </div>
                                    )}

                                    {paymentStatus === 'expired' && (
                                        <div className="space-y-5 animate-in zoom-in-95 duration-200 my-4">
                                            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm text-rose-600">
                                                ⏱️
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-black text-rose-950 tracking-tight">QR Expired / भुगतान समय समाप्त</h3>
                                                <p className="text-slate-500 text-xs font-semibold">The 10-minute session has timed out. Please try again.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => resetPaymentStates()}
                                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-755 text-white font-black text-xs rounded-xl transition active:scale-[0.98] cursor-pointer"
                                            >
                                                Try Again / पुनः प्रयास करें
                                            </button>
                                        </div>
                                    )}

                                    {paymentStatus === 'failed' && (
                                        <div className="space-y-5 animate-in zoom-in-95 duration-200 my-4">
                                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm text-amber-700">
                                                ⚠️
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-black text-amber-950 tracking-tight">Server Verification Error</h3>
                                                <p className="text-slate-500 text-xs font-semibold">We had trouble confirming with bank servers automatically.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => resetPaymentStates()}
                                                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl border border-slate-200 transition active:scale-[0.98] cursor-pointer text-center"
                                            >
                                                Go Back / वापस जाएँ
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center space-y-4 pb-4">
                                    <div>
                                        <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner animate-bounce">
                                            🪙
                                        </div>
                                        
                                        <div className="mt-2">
                                            <h3 className="text-xl font-black text-slate-950 tracking-tight">Coins Package Details</h3>
                                            <p className="text-slate-500 text-xs font-semibold mt-0.5">कॉइन पैकेज और रिचार्ज जानकारी</p>
                                        </div>
                                    </div>

                                    {!!(profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now()) && (
                                        <div className="p-4 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-3xl text-white text-center shadow-md border border-amber-400/30">
                                            <Crown className="w-5 h-5 text-yellow-200 mx-auto mb-1 animate-spin" style={{ animationDuration: '4s' }} />
                                            <p className="text-xs font-black uppercase tracking-wider">Unlimited Pass Active! / अनलिमिटेड पास सक्रिय है!</p>
                                            <p className="text-[11px] text-amber-100 font-bold mt-0.5">
                                                Expiry / समाप्ति: {new Date(profile.unlimitedExpirity).toLocaleString()}
                                            </p>
                                            <div className="mt-1.5 inline-block text-[10px] bg-amber-700/40 text-amber-50 px-2 py-0.5 rounded-full font-black">
                                                Remaining / शेष: {Math.max(1, Math.ceil((profile.unlimitedExpirity - Date.now()) / (24 * 60 * 60 * 1000)))} day(s)
                                            </div>
                                        </div>
                                    )}

                                    {/* Information List */}
                                    <div className="border border-slate-150 rounded-2xl p-3 bg-slate-50/50 space-y-2 text-left text-xs text-slate-600">
                                        <p className="font-bold text-slate-700 flex items-center gap-1.5">
                                            <span>⚡</span> 
                                            <span>10 coins required per action / प्रत्येक काम के लिए 10 कॉइन आवश्यक हैं।</span>
                                        </p>
                                    </div>

                                    <div className="space-y-4 text-left">
                                        {/* Coupon Code Section */}
                                        <div className="bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-150 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-black text-indigo-950 flex items-center gap-1.5">
                                                    <span>🎫</span> Apply Promo Code / कूपन कोड
                                                </span>
                                                {isCouponApplied && (
                                                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full animate-pulse">
                                                        {appSettings.couponDiscount}% OFF ACTIVE
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text"
                                                    value={couponInput}
                                                    onChange={(e) => {
                                                        setCouponInput(e.target.value);
                                                        if (isCouponApplied) setIsCouponApplied(false);
                                                    }}
                                                    placeholder="Coupon (e.g. BODHAK50)"
                                                    className="flex-grow bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/20 uppercase"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleApplyCoupon}
                                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-black rounded-xl transition cursor-pointer active:scale-95"
                                                >
                                                    Apply
                                                </button>
                                            </div>
                                            {couponError && <p className="text-[10px] text-rose-500 font-bold pl-0.5">{couponError}</p>}
                                            {isCouponApplied && (
                                                <p className="text-[10px] text-emerald-600 font-bold pl-0.5">
                                                    Code applied! {appSettings.couponDiscount}% Discount on purchase.
                                                </p>
                                            )}
                                        </div>

                                        {/* Calculated variables */}
                                        {(() => {
                                            const isOfferActive = !!(appSettings.offerDiscountPct > 0 && (!appSettings.offerExpiresAt || appSettings.offerExpiresAt > Date.now()));
                                            const activeDiscountPct = isCouponApplied 
                                                ? (appSettings.couponDiscount || 0) 
                                                : (isOfferActive ? (appSettings.offerDiscountPct || 0) : 0);
                                            const finalPassPrice = Math.max(1, Math.round(appSettings.unlimitedPassPrice * (100 - activeDiscountPct) / 100));
                                            const finalAwPrice = Math.max(1, Math.round((appSettings.awPassPrice || 49) * (100 - activeDiscountPct) / 100));
                                            const finalQuizPrice = Math.max(1, Math.round((appSettings.quizPassPrice || 49) * (100 - activeDiscountPct) / 100));
                                            const finalCoinsPrice = Math.max(1, Math.round((customCoinsAmount || 0) * (100 - activeDiscountPct) / 100));
                                            return (
                                                <>
                                                    {isOfferActive && (
                                                        <div className="bg-gradient-to-r from-red-500 via-amber-500 to-red-600 text-white rounded-2xl p-4 text-center space-y-2 shadow-md border border-red-400 animate-pulse relative overflow-hidden my-1">
                                                            <div className="absolute top-0 left-0 w-full h-full bg-white/5 pointer-events-none" />
                                                            <div className="flex items-center justify-center gap-1.5 font-black text-[11px] uppercase tracking-wider">
                                                                 <span className="text-xs">🔥</span>
                                                                 <span>SPECIAL OFFER / सीमित समय का ऑफर!</span>
                                                                 <span className="text-xs">🔥</span>
                                                            </div>
                                                            <p className="text-[11px] font-bold leading-normal">
                                                                 Get Flat <span className="text-xs font-black underline">{appSettings.offerDiscountPct}% OFF</span> on all packages automatically!
                                                            </p>
                                                            <div className="inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full text-[10px] font-mono font-black border border-white/25">
                                                                 <span>⌛ Ends in:</span>
                                                                 <span className="tracking-widest">{offerTimeLeft || 'Expired'}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Buy Unlimited Packs */}
                                                    {(appSettings.coinPacks && appSettings.coinPacks.length > 0) ? (
                                                        <div className="space-y-3">
                                                            {appSettings.coinPacks.map(pack => {
                                                                const isOfferActive = !!(appSettings.offerDiscountPct > 0 && (!appSettings.offerExpiresAt || appSettings.offerExpiresAt > Date.now()));
                                                                const activeDiscountPct = isCouponApplied 
                                                                    ? (appSettings.couponDiscount || 0) 
                                                                    : (isOfferActive ? (appSettings.offerDiscountPct || 0) : 0);
                                                                const finalPackPrice = Math.max(1, Math.round(pack.price * (100 - activeDiscountPct) / 100));
                                                                
                                                                return (
                                                                    <div key={pack.id} className="bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-amber-600/5 rounded-2xl p-4 border border-amber-200 shadow-sm space-y-3">
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <div className="flex gap-2.5">
                                                                                <Crown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                                                                <div>
                                                                                    <h4 className="font-extrabold text-sm text-slate-900 leading-snug"> Buy Unlimited Coins / Pass</h4>
                                                                                    <p className="text-[11px] text-amber-800 font-bold mb-1"> {pack.days} Days</p>
                                                                                    <p className="text-xs text-slate-500 font-medium leading-normal">Everything free for {pack.days} days. No coin deductions / 100% निशुल्क उपयोग!</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                                            <button 
                                                                                onClick={() => triggerUPIPayment(finalPackPrice, `Bodhak Unlimited Pass (${pack.days} days)`, pack.days)}
                                                                                className="flex items-center justify-center gap-1.5 flex-[2] py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] transition-all text-white rounded-xl font-black text-xs shadow-md shadow-amber-500/10 cursor-pointer"
                                                                            >
                                                                                <Crown className="w-3.5 h-3.5" />
                                                                                <span>
                                                                                    Pay UPI App: {(isCouponApplied || isOfferActive) ? (
                                                                                        <span>
                                                                                            <span className="line-through text-amber-800/65 mr-1.5">₹{pack.price}</span>
                                                                                            <span className="underline select-all font-extrabold">₹{finalPackPrice}</span>
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span>₹<span className="underline select-all">{pack.price}</span></span>
                                                                                    )}
                                                                                </span>
                                                                            </button>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => triggerQrPayment(finalPackPrice, `Bodhak Unlimited Pass (${pack.days} days)`, pack.days)}
                                                                                className="flex-1 py-3 px-3 bg-white hover:bg-slate-50 border border-amber-250 active:scale-[0.98] transition-all text-amber-900 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                                                            >
                                                                                <QrCode className="w-4 h-4 text-amber-650" />
                                                                                <span>QR</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-amber-600/5 rounded-2xl p-4 border border-amber-200 shadow-sm space-y-3">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex gap-2.5">
                                                                    <Crown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                                                    <div>
                                                                        <h4 className="font-extrabold text-sm text-slate-900 leading-snug"> Buy Unlimited Coins / Pass</h4>
                                                                        <p className="text-[11px] text-amber-800 font-bold mb-1"> {appSettings.unlimitedPassDays} Days</p>
                                                                        <p className="text-xs text-slate-500 font-medium leading-normal">Everything free for {appSettings.unlimitedPassDays} days. No coin deductions / 100% निशुल्क उपयोग!</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                <button 
                                                                    onClick={() => triggerUPIPayment(finalPassPrice, `Bodhak Unlimited Pass (${appSettings.unlimitedPassDays} days)`, appSettings.unlimitedPassDays)}
                                                                    className="flex items-center justify-center gap-1.5 flex-[2] py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] transition-all text-white rounded-xl font-black text-xs shadow-md shadow-amber-500/10 cursor-pointer"
                                                                >
                                                                    <Crown className="w-3.5 h-3.5" />
                                                                    <span>
                                                                        Pay UPI App: {(isCouponApplied || isOfferActive) ? (
                                                                            <span>
                                                                                <span className="line-through text-amber-800/65 mr-1.5">₹{appSettings.unlimitedPassPrice}</span>
                                                                                <span className="underline select-all font-extrabold">₹{finalPassPrice}</span>
                                                                            </span>
                                                                        ) : (
                                                                            <span>₹<span className="underline select-all">{appSettings.unlimitedPassPrice}</span></span>
                                                                        )}
                                                                    </span>
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => triggerQrPayment(finalPassPrice, `Bodhak Unlimited Pass (${appSettings.unlimitedPassDays} days)`, appSettings.unlimitedPassDays)}
                                                                    className="flex-1 py-3 px-3 bg-white hover:bg-slate-50 border border-amber-250 active:scale-[0.98] transition-all text-amber-900 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                                                >
                                                                     <QrCode className="w-4 h-4 text-amber-650" />
                                                                     <span>QR</span>
                                                                 </button>
                                                             </div>
                                                         </div>
                                                     )}

                                                     {/* Buy Ans. Chak Unlimited Pass */}
                                                     <div className="bg-gradient-to-tr from-emerald-500/10 via-teal-500/5 to-emerald-600/5 rounded-2xl p-4 border border-emerald-200 shadow-sm space-y-3">
                                                         <div className="flex items-start justify-between gap-2">
                                                             <div className="flex gap-2.5">
                                                                 <span className="text-xl shrink-0 mt-0.5">✍️</span>
                                                                 <div>
                                                                     <h4 className="font-extrabold text-sm text-slate-900 leading-snug"> Buy Ans. Chak Pass (AW Coins)</h4>
                                                                     <p className="text-[11px] text-emerald-800 font-bold mb-1"> {appSettings.awPassDays || 30} Days Unlimited</p>
                                                                     <p className="text-xs text-slate-500 font-medium leading-normal">Unlimited Ans. Chak (उत्तर जांच) evaluation for {appSettings.awPassDays || 30} days. Only works for Ans. Chak!</p>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="flex flex-col sm:flex-row gap-2">
                                                             <button 
                                                                 onClick={() => triggerUPIPayment(finalAwPrice, `Bodhak Ans. Chak Pass (${appSettings.awPassDays || 30} days)`, appSettings.awPassDays || 30)}
                                                                 className="flex items-center justify-center gap-1.5 flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white rounded-xl font-black text-xs shadow-md shadow-emerald-500/10 cursor-pointer"
                                                             >
                                                                 <Crown className="w-3.5 h-3.5" />
                                                                 <span>
                                                                     Pay UPI App: {(isCouponApplied || isOfferActive) ? (
                                                                         <span>
                                                                             <span className="line-through text-emerald-200 mr-1.5">₹{appSettings.awPassPrice || 49}</span>
                                                                             <span className="underline select-all font-extrabold">₹{finalAwPrice}</span>
                                                                         </span>
                                                                     ) : (
                                                                         <span>₹<span className="underline select-all">{appSettings.awPassPrice || 49}</span></span>
                                                                     )}
                                                                 </span>
                                                             </button>
                                                             <button 
                                                                 type="button"
                                                                 onClick={() => triggerQrPayment(finalAwPrice, `Bodhak Ans. Chak Pass (${appSettings.awPassDays || 30} days)`, appSettings.awPassDays || 30)}
                                                                 className="flex-1 py-3 px-3 bg-white hover:bg-slate-50 border border-emerald-300 active:scale-[0.98] transition-all text-emerald-900 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                                             >
                                                                 <QrCode className="w-4 h-4 text-emerald-600" />
                                                                 <span>QR</span>
                                                             </button>
                                                         </div>
                                                     </div>

                                                     {/* Buy Quiz Unlimited Pass */}
                                                     <div className="bg-gradient-to-tr from-purple-500/10 via-indigo-500/5 to-purple-600/5 rounded-2xl p-4 border border-purple-200 shadow-sm space-y-3">
                                                         <div className="flex items-start justify-between gap-2">
                                                             <div className="flex gap-2.5">
                                                                 <span className="text-xl shrink-0 mt-0.5">🎯</span>
                                                                 <div>
                                                                     <h4 className="font-extrabold text-sm text-slate-900 leading-snug"> Buy Quiz Pass (Quiz Coins)</h4>
                                                                     <p className="text-[11px] text-purple-800 font-bold mb-1"> {appSettings.quizPassDays || 30} Days Unlimited</p>
                                                                     <p className="text-xs text-slate-500 font-medium leading-normal">Unlimited AI Mock Quiz generation for {appSettings.quizPassDays || 30} days. Only works for Quiz!</p>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="flex flex-col sm:flex-row gap-2">
                                                             <button 
                                                                 onClick={() => triggerUPIPayment(finalQuizPrice, `Bodhak Quiz Pass (${appSettings.quizPassDays || 30} days)`, appSettings.quizPassDays || 30)}
                                                                 className="flex items-center justify-center gap-1.5 flex-[2] py-3 bg-purple-600 hover:bg-purple-700 active:scale-[0.98] transition-all text-white rounded-xl font-black text-xs shadow-md shadow-purple-500/10 cursor-pointer"
                                                             >
                                                                 <Crown className="w-3.5 h-3.5" />
                                                                 <span>
                                                                     Pay UPI App: {(isCouponApplied || isOfferActive) ? (
                                                                         <span>
                                                                             <span className="line-through text-purple-200 mr-1.5">₹{appSettings.quizPassPrice || 49}</span>
                                                                             <span className="underline select-all font-extrabold">₹{finalQuizPrice}</span>
                                                                         </span>
                                                                     ) : (
                                                                         <span>₹<span className="underline select-all">{appSettings.quizPassPrice || 49}</span></span>
                                                                     )}
                                                                 </span>
                                                             </button>
                                                             <button 
                                                                 type="button"
                                                                 onClick={() => triggerQrPayment(finalQuizPrice, `Bodhak Quiz Pass (${appSettings.quizPassDays || 30} days)`, appSettings.quizPassDays || 30)}
                                                                 className="flex-1 py-3 px-3 bg-white hover:bg-slate-50 border border-purple-300 active:scale-[0.98] transition-all text-purple-900 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                                             >
                                                                 <QrCode className="w-4 h-4 text-purple-600" />
                                                                 <span>QR</span>
                                                             </button>
                                                         </div>
                                                     </div>

                                                     {/* Buy Custom Coins */}
                                                    <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3.5">
                                                        <div className="flex gap-2.5">
                                                            <Coins className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                                                            <div className="flex-1">
                                                                <h4 className="font-extrabold text-sm text-slate-900 leading-snug"> Buy Coins </h4>
                                                                <p className="text-[11px] text-indigo-700 font-bold">कॉइन्स रिचार्ज पैकेज 10₹ = 100 coins </p>
                                                            </div>
                                                        </div>

                                                        {/* Editable money input */}
                                                        <div className="space-y-1.5">
                                                            <label className="text-[10px] font-black text-slate-450 uppercase tracking-widest block pl-0.5">
                                                                Enter Amount (INR):
                                                            </label>
                                                            <div className="flex items-center gap-2 bg-white border border-slate-250 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                                                                <span 
                                                                    className="font-black text-slate-600 text-sm cursor-pointer hover:text-indigo-650"
                                                                    onClick={() => triggerUPIPayment(finalCoinsPrice, `Bodhak ${Math.round(customCoinsAmount / appSettings.pricePerCoin)} Coins`)}
                                                                    title="Tap to pay custom amount"
                                                                >
                                                                    ₹
                                                                </span>
                                                                <input 
                                                                    type="number"
                                                                    min="10"
                                                                    max="5000"
                                                                    value={customCoinsAmount || ''}
                                                                    onChange={(e) => {
                                                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                                                        setCustomCoinsAmount(val);
                                                                    }}
                                                                    className="w-full bg-transparent font-black text-slate-900 outline-none text-base"
                                                                    placeholder="e.g. 50"
                                                                />
                                                            </div>
                                                            <div className="flex justify-between items-center px-0.5">
                                                                <span className="text-[11px] text-emerald-600 font-black">
                                                                    🪙 Coins you'll get: {Math.round((customCoinsAmount || 0) / appSettings.pricePerCoin)} Coins
                                                                </span>
                                                                {customCoinsAmount < 50 && (
                                                                    <span className="text-[9px] text-amber-600 font-bold">Recharge is ₹50 (edit to change)</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <button 
                                                                disabled={customCoinsAmount <= 0}
                                                                onClick={() => triggerUPIPayment(finalCoinsPrice, `Bodhak ${Math.round(customCoinsAmount / appSettings.pricePerCoin)} Coins`)}
                                                                className="flex items-center justify-center gap-1.5 flex-[2] py-3 bg-indigo-600 hover:bg-indigo-750 disabled:opacity-50 active:scale-[0.98] transition-all text-white rounded-xl font-black text-xs shadow-md shadow-indigo-600/10 cursor-pointer"
                                                            >
                                                                <Coins className="w-3.5 h-3.5" />
                                                                <span>
                                                                    Pay UPI App: {(isCouponApplied || isOfferActive) ? (
                                                                        <span>
                                                                            <span className="line-through text-indigo-400/80 mr-1.5">₹{customCoinsAmount}</span>
                                                                            <span className="underline select-all font-extrabold">₹{finalCoinsPrice}</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span>₹<span className="underline select-all">{customCoinsAmount || '0'}</span></span>
                                                                    )}
                                                                </span>
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                disabled={customCoinsAmount <= 0}
                                                                onClick={() => triggerQrPayment(finalCoinsPrice, `Bodhak ${Math.round(customCoinsAmount / appSettings.pricePerCoin)} Coins`)}
                                                                className="flex-1 py-3 px-3 bg-white hover:bg-slate-50 border border-indigo-250 active:scale-[0.98] transition-all text-indigo-900 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                                                            >
                                                                <QrCode className="w-4 h-4 text-indigo-650" />
                                                                <span>QR Code</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        {/* Bodhak Support Team */}
                                        <div className="pt-2 border-t border-slate-100">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 text-center">Need any custom coin recharge or help?</h4>
                                            <button 
                                                id="support-chat-trigger-btn"
                                                onClick={() => {
                                                    setIsCoinModalOpen(false);
                                                    window.dispatchEvent(new CustomEvent('open-support-chat', { 
                                                        detail: { text: "Hi Bodhak Support Team, I want to recharge my coins or need help regarding payment " } 
                                                    }));
                                                }}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl border border-slate-200 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                                            >
                                                <MessageSquare className="w-4 h-4 text-indigo-600 animate-pulse" />
                                                <span> Bodhak Support Team  💬</span>
                                            </button>
                                        </div>

                                        {/* UPI details highlight and direct click indicator */}
                                        <div className="text-center px-1 pt-1">
                                            <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                                                Note: Tapping payment amount buttons launches <span className="font-black text-indigo-600 cursor-pointer hover:underline" onClick={() => triggerUPIPayment(isCouponApplied ? Math.max(1, Math.round((customCoinsAmount || 50) * (100 - (appSettings.couponDiscount || 0)) / 100)) : (customCoinsAmount || 50), "Bodhak Coins")}>PhonePe</span> directly prefilled with UPI ID <span className="font-mono bg-slate-100 text-slate-600 px-1 py-0.5 rounded select-all font-black">{appSettings.upiId || '9828030263@axl'}</span>.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <SupportChat currentStep={currentStep} />

            {/* App Download Poster Overlay */}
            {showPoster && !isDownloaded && (
                <div id="pwa-download-poster-backdrop" className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full overflow-hidden shadow-2xl relative animate-[fadeIn_0.3s_ease-out]">
                        {/* Close button inside poster */}
                        <button 
                            id="pwa-download-poster-close-btn"
                            onClick={() => {
                                setShowPoster(false);
                                setShowTopBlinkingIcon(true);
                                sessionStorage.setItem('bodhak_poster_closed', 'true');
                            }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-all active:scale-[0.93] z-[210] cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="p-6 text-center space-y-6">
                            {/* App Icon/Banner Header with custom ambient effect */}
                            <div className="flex flex-col items-center justify-center pt-2">
                                <div className="h-20 w-20 rounded-3xl overflow-hidden shadow-xl ring-4 ring-indigo-50 bg-indigo-50/50 flex items-center justify-center relative group">
                                    <img 
                                        src="/icon.svg" 
                                        alt="Bodhak Logo" 
                                        className="h-full w-full object-contain p-1"
                                    />
                                    {/* Small floating badge */}
                                    <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-[9px] text-white font-black px-1.5 py-0.5 rounded-full uppercase border border-white">
                                        App
                                    </div>
                                </div>
                                <h3 className="font-extrabold text-xl text-slate-900 mt-4 leading-tight">
                                    Bodhak App / बोधक ऐप 📲
                                </h3>
                                <p className="text-xs text-indigo-650 font-black tracking-wide uppercase mt-1">
                                    आपकी तैयारी का स्मार्ट साथी!
                                </p>
                            </div>

                            {/* Features Bento list */}
                            <div className="bg-slate-50/70 border border-slate-150/60 rounded-2xl p-4 text-left space-y-3.5">
                                <div className="flex items-start gap-3">
                                    <span className="text-lg mt-0.5">✨</span>
                                    <div>
                                        <p className="font-extrabold text-xs md:text-sm text-slate-800">Smart Notes & Daily Quiz</p>
                                        <p className="text-[10px] md:text-xs text-slate-500 font-semibold">कठिन टॉपिक्स का आसान सार और रोज़ाना तैयारी परखें।</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-slate-200/50"></div>
                                <div className="flex items-start gap-3">
                                    <span className="text-lg mt-0.5">📊</span>
                                    <div>
                                        <p className="font-extrabold text-xs md:text-sm text-slate-800">PYQ Analysis & Answer Check</p>
                                        <p className="text-[10px] md:text-xs text-slate-500 font-semibold">परीक्षा के असली पैटर्न को समझें और तुरंत उत्तर सुधार करवाएं।</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-slate-200/50"></div>
                                <div className="flex items-start gap-3">
                                    <span className="text-lg mt-0.5">📰</span>
                                    <div>
                                        <p className="font-extrabold text-xs md:text-sm text-slate-800">Topic-wise & Daily Current Affairs</p>
                                        <p className="text-[10px] md:text-xs text-slate-500 font-semibold">करंट अफेयर्स की सबसे बेहतरीन और सरल तैयारी।</p>
                                    </div>
                                </div>
                            </div>

                            {/* Prompt text */}
                            <div className="space-y-1 text-center">
                                <p className="text-xs font-bold text-slate-600">
                                    Install once and access our advanced services instantly anywhere!
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    इस ऐप को फोन में जोड़ें और बिना रुकावट के सभी सुविधाओं का लाभ लें।
                                </p>
                            </div>

                            {/* Download Action Wrapper */}
                            <div className="pt-2">
                                <button 
                                    id="poster-download-now-btn"
                                    onClick={handleDownloadClick}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black rounded-2xl shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm font-black"
                                >
                                    <Download className="h-5 w-5 animate-bounce" />
                                    <span>Download Now / अभी डाउनलोड करें 🚀</span>
                                </button>
                                <p className="text-[9px] text-slate-400 font-bold mt-2.5">
                                    Tapping installs Bodhak on your mobile device instantly / टैप करने पर डाउनलोड शुरू होगा।
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Notifications Modal */}
            {isNotificationOpen && (
                <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-3xl border border-slate-100 max-w-lg w-full overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh] animate-[scaleUp_0.3s_ease-out]">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="bg-rose-50 p-2 rounded-xl">
                                    <Bell className="h-5 w-5 text-rose-600 animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-sm md:text-base text-slate-900 leading-tight">
                                        Announcements / घोषणाएं 📢
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        Latest notifications from manager
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsNotificationOpen(false)}
                                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-full transition active:scale-95 cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Scrolling Content Area */}
                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            {/* Manager Add Announcement Form (Only shown to Manager) */}
                            {profile?.isManager && (
                                <form onSubmit={handleSendNotification} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/60 space-y-3.5 text-left">
                                    <div className="flex items-center gap-1.5 text-indigo-900 font-black text-xs uppercase tracking-wider">
                                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                                        <span>Send New Announcement / नई घोषणा भेजें</span>
                                    </div>

                                    {/* Audience target selection */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-indigo-950 font-black uppercase block tracking-wider">Target / लक्ष्य</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setNotifTargetType('all')}
                                                className={`py-1.5 px-2.5 text-[10px] font-black rounded-lg border transition-all cursor-pointer ${
                                                    notifTargetType === 'all'
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                📢 All Users (सभी)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNotifTargetType('specific')}
                                                className={`py-1.5 px-2.5 text-[10px] font-black rounded-lg border transition-all cursor-pointer ${
                                                    notifTargetType === 'specific'
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                👤 Selected User (चुनिंदा)
                                            </button>
                                        </div>
                                    </div>

                                    {notifTargetType === 'specific' && (
                                        <div className="space-y-2 animate-in slide-in-from-top-1 duration-150 text-left">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[9px] text-indigo-950 font-black uppercase block">Choose Recipients / प्राप्तकर्ता चुनें</label>
                                                <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">Multi-Select Enabled</span>
                                            </div>
                                            
                                            <input 
                                                type="text"
                                                value={userSearchQuery}
                                                onChange={(e) => setUserSearchQuery(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl text-[11px] bg-white border border-indigo-150 outline-none focus:border-indigo-500 font-bold text-slate-850"
                                                placeholder="🔎 Search by name, email or mobile..."
                                            />

                                            <div className="max-h-[150px] overflow-y-auto border border-indigo-100 rounded-xl bg-white p-2 space-y-1 custom-scrollbar">
                                                {(() => {
                                                    const filtered = allUsers.filter(u => {
                                                        const q = userSearchQuery.toLowerCase();
                                                        const name = (u.name || '').toLowerCase();
                                                        const email = (u.email || '').toLowerCase();
                                                        const mobile = (u.mobile || '').toLowerCase();
                                                        return name.includes(q) || email.includes(q) || mobile.includes(q);
                                                    });
                                                    if (filtered.length === 0) {
                                                        return (
                                                            <div className="text-center py-4 text-[10px] text-slate-400 font-bold">No matching users found.</div>
                                                        );
                                                    }
                                                    return filtered.map(u => {
                                                        const isChecked = selectedUserIds.includes(u.userId);
                                                        return (
                                                            <label 
                                                                key={u.userId}
                                                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-indigo-50/40 rounded-lg cursor-pointer transition select-none text-left"
                                                            >
                                                                <input 
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        if (isChecked) {
                                                                            setSelectedUserIds(prev => prev.filter(id => id !== u.userId));
                                                                        } else {
                                                                            setSelectedUserIds(prev => [...prev, u.userId]);
                                                                        }
                                                                    }}
                                                                    className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5 border-slate-300"
                                                                />
                                                                <div className="flex-1 min-w-0 text-[11px]">
                                                                    <p className="font-extrabold text-slate-800 truncate">{u.name || 'Anonymous'}</p>
                                                                    <p className="text-[9px] text-slate-400 truncate">{u.email || u.mobile || 'No Contact Info'}</p>
                                                                </div>
                                                            </label>
                                                        );
                                                    });
                                                })()}
                                            </div>

                                            <div className="flex items-center justify-between text-[10px] px-1 font-bold">
                                                <span className="text-indigo-950">Selected: <strong className="text-indigo-650 font-black">{selectedUserIds.length} users</strong></span>
                                                {selectedUserIds.length > 0 && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setSelectedUserIds([])}
                                                        className="text-rose-600 hover:underline cursor-pointer"
                                                    >
                                                        Clear All (साफ़ करें)
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-indigo-900 font-bold uppercase block">शीर्षक / Title</label>
                                        <input
                                            type="text"
                                            required
                                            value={newNotificationTitle}
                                            onChange={(e) => setNewNotificationTitle(e.target.value)}
                                            placeholder="e.g., Target Exam Dates Announced!"
                                            className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-indigo-200 outline-none focus:border-indigo-500 font-bold"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] text-indigo-900 font-bold uppercase block">घोषणा विवरण / Announcement Text</label>
                                        <textarea
                                            required
                                            rows={3}
                                            value={newNotificationText}
                                            onChange={(e) => setNewNotificationText(e.target.value)}
                                            placeholder="Type details in English/Hindi here..."
                                            className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-indigo-200 outline-none focus:border-indigo-500 font-medium leading-relaxed"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] text-indigo-900 font-bold uppercase block">Photo / फोटो (Optional)</label>
                                        <div className="flex items-center gap-3">
                                            {newNotificationImage ? (
                                                <div className="w-14 h-10 rounded-lg overflow-hidden border border-indigo-200 flex-shrink-0">
                                                    <img src={newNotificationImage} alt="Preview" className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-14 h-10 rounded-lg bg-white border border-dashed border-indigo-200 flex items-center justify-center flex-shrink-0">
                                                    <Bell className="w-4 h-4 text-indigo-200" />
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    id="new-notif-image-input" 
                                                    className="hidden" 
                                                    onChange={handleNewNotifImageUpload} 
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => document.getElementById('new-notif-image-input')?.click()}
                                                    className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[10px] rounded-lg transition border border-indigo-150 uppercase tracking-wider"
                                                >
                                                    {isUploadingNewNotifImg ? 'Uploading...' : 'Choose / चुनें'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        disabled={isSubmittingNotification}
                                        type="submit"
                                        className="w-full py-3.5 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
                                    >
                                        {isSubmittingNotification ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                        {lang === 'hi' ? 'घोषणा भेजें / Broadcast' : 'Send Announcement'}
                                    </motion.button>
                                </form>
                            )}

                            <div className="space-y-4 mt-8">
                                    <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-[0.2em] px-2">Recent Announcements</h4>
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                            <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">No history found</p>
                                        </div>
                                    ) : (
                                        notifications.map((notif) => (
                                        <div key={notif.id} className="p-4 bg-slate-50 border border-slate-150 rounded-2xl relative group overflow-hidden">
                                            {/* Top Info */}
                                            <div className="flex justify-between items-start gap-3">
                                                <h4 className="font-extrabold text-sm text-indigo-900 pr-6 leading-tight">
                                                    {notif.title}
                                                </h4>
                                                
                                                {/* Delete button (only seen by Manager) */}
                                                {profile?.isManager && (
                                                    pendingDeleteNotifId === notif.id ? (
                                                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-red-50 border border-red-200/85 px-2 py-1 rounded-xl shadow-sm z-10 animate-in fade-in duration-200">
                                                            <span className="text-[10px] font-black text-red-650">Sure? / मिटाएं?</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteNotification(notif.id)}
                                                                className="text-[9.5px] bg-red-600 font-extrabold text-white px-2 py-0.5 rounded-lg hover:bg-red-750 transition"
                                                            >
                                                                Yes
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPendingDeleteNotifId(null)}
                                                                className="text-[9.5px] bg-slate-200 font-extrabold text-slate-700 px-2 py-0.5 rounded-lg hover:bg-slate-300 transition"
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingDeleteNotifId(notif.id)}
                                                            title="Delete announcement"
                                                            className="absolute top-3.5 right-3.5 text-slate-400 hover:text-red-650 opacity-100 sm:opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-red-50 transition active:scale-[0.9] cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )
                                                )}
                                            </div>

                                            {/* Image Preview */}
                                            {notif.imageUrl && (
                                                <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm transition-transform hover:scale-[1.01] duration-300 bg-slate-50">
                                                    <img src={notif.imageUrl} alt="Announcement" className="w-full h-auto object-contain" />
                                                </div>
                                            )}

                                            {/* Text Content */}
                                            <p className="text-xs text-slate-700 font-bold whitespace-pre-wrap leading-relaxed mt-2">
                                                {notif.text}
                                            </p>

                                            {/* Footer details */}
                                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold pt-2.5 border-t border-slate-100/50 mt-3 flex-wrap gap-2">
                                                <span>Prep Admin / प्रेषक: <strong className="text-slate-500 font-extrabold">{notif.senderName || 'Manager'}</strong></span>
                                                <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
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
            )}

            {/* Custom App Share Modal */}
            <AnimatePresence>
                {showAppShareModal && (
                    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[3rem] w-full max-w-sm p-8 shadow-2xl relative overflow-hidden"
                        >
                            <button 
                                onClick={() => { setShowAppShareModal(false); setAppShareCopied(false); }}
                                className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="text-center space-y-6">
                                <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] mx-auto flex items-center justify-center shadow-xl shadow-indigo-200 rotate-12">
                                    <Share2 className="w-10 h-10 text-white -rotate-12" />
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-slate-900">
                                        {lang === 'hi' ? 'ऐप शेयर करें 🚀' : 'Share Bodhak App 🚀'}
                                    </h3>
                                    <p className="text-sm font-bold text-slate-400 px-4 leading-tight uppercase tracking-widest">
                                        {lang === 'hi' ? 'अपने दोस्तों को भेजें!' : 'Tell your friends!'}
                                    </p>
                                </div>

                                <div className="flex justify-center gap-6 py-4">
                                    {/* WhatsApp 3D Button */}
                                    <motion.a 
                                        whileHover={{ y: -5 }}
                                        whileTap={{ y: 2 }}
                                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                                            `${appSettings?.shareText || 'Bodhak: आपकी सफलता का स्मार्ट साथी! 🚀'}\n📲 App Link: ${appSettings?.shareAppLink || window.location.origin}`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex flex-col items-center gap-2"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_8px_0_rgb(5,150,105)] active:shadow-none active:translate-y-2 transition-all duration-75 cursor-pointer">
                                            <span className="text-3xl">💬</span>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">WhatsApp</span>
                                    </motion.a>

                                    {/* Telegram 3D Button */}
                                    <motion.a 
                                        whileHover={{ y: -5 }}
                                        whileTap={{ y: 2 }}
                                        href={`https://t.me/share/url?url=${encodeURIComponent(appSettings?.shareAppLink || window.location.origin)}&text=${encodeURIComponent(
                                            appSettings?.shareText || 'Bodhak: आपकी सफलता का स्मार्ट साथी! 🚀'
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex flex-col items-center gap-2"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-white shadow-[0_8px_0_rgb(2,132,199)] active:shadow-none active:translate-y-2 transition-all duration-75 cursor-pointer">
                                            <span className="text-3xl">✈️</span>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Telegram</span>
                                    </motion.a>

                                    {/* System Share 3D Button */}
                                    <motion.button 
                                        whileHover={{ y: -5 }}
                                        whileTap={{ y: 2 }}
                                        onClick={async () => {
                                            const fullMsg = `${appSettings?.shareText || 'Bodhak: आपकी सफलता का स्मार्ट साथी! 🚀'}\n📲 App Link: ${appSettings?.shareAppLink || window.location.origin}`;
                                            if (navigator.share) {
                                                try {
                                                    await navigator.share({
                                                        title: 'Bodhak App',
                                                        text: fullMsg,
                                                        url: appSettings?.shareAppLink || window.location.origin
                                                    });
                                                } catch (err) {
                                                    await navigator.clipboard.writeText(fullMsg);
                                                    setAppShareCopied(true);
                                                    setTimeout(() => setAppShareCopied(false), 2500);
                                                }
                                            } else {
                                                await navigator.clipboard.writeText(fullMsg);
                                                setAppShareCopied(true);
                                                setTimeout(() => setAppShareCopied(false), 2500);
                                            }
                                        }}
                                        className="group flex flex-col items-center gap-2"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-white shadow-[0_8px_0_rgb(30,41,59)] active:shadow-none active:translate-y-2 transition-all duration-75 cursor-pointer">
                                            <Share2 className="w-8 h-8" />
                                        </div>
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Other</span>
                                    </motion.button>
                                </div>

                                {appShareCopied && (
                                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-black animate-in fade-in zoom-in">
                                        ✅ {lang === 'hi' ? 'लिंक कॉपी हो गया!' : 'Link copied successfully!'}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Daily Streak Reward Modal */}
            <AnimatePresence>
                {streakRewardInfo && (
                    <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-md z-[250] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            exit={{ scale: 0.8, opacity: 0, scaleY: 0 }}
                            className="bg-white rounded-[3rem] w-full max-w-md p-8 shadow-[0_30px_60px_rgba(0,0,0,0.3)] text-center relative"
                        >
                            {/* Decorative background sparkles */}
                            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
                                <Sparkles className="absolute top-10 left-10 w-20 h-20 text-indigo-500 animate-pulse" />
                                <Sparkles className="absolute bottom-10 right-10 w-16 h-16 text-yellow-500 animate-pulse delay-700" />
                            </div>

                            <div className="mb-6 relative">
                                <motion.div 
                                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                                    transition={{ repeat: Infinity, duration: 3 }}
                                    className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-orange-200 border-4 border-white"
                                >
                                    <Trophy className="w-12 h-12 text-white" />
                                </motion.div>
                                <motion.div 
                                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute -top-2 -right-2 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg"
                                >
                                    +{streakRewardInfo.rewardCoins > 0 ? streakRewardInfo.rewardCoins : '1'}
                                </motion.div>
                            </div>

                            <h2 className="text-3xl font-black text-slate-900 mb-2 leading-tight">
                                {lang === 'hi' ? 'शानदार काम! 🎉' : 'Amazing Work! 🎉'}
                            </h2>
                            <p className="text-slate-500 font-bold mb-4">
                                {lang === 'hi' 
                                    ? `आपने आज का काम पूरा कर लिया है। आपका डेली स्ट्रैक अब ${streakRewardInfo.streakCount} दिन का है!` 
                                    : `Daily activity completed! Your streak is now ${streakRewardInfo.streakCount} days.`}
                            </p>

                            <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-4 mb-6 text-left">
                                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-2">Next Rewards / अगले रिवॉर्ड्स</p>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center bg-white/50 px-3 py-2 rounded-xl border border-indigo-100/50">
                                        <span className="text-xs font-bold text-slate-700">7 Days Streak</span>
                                        <span className="text-xs font-black text-indigo-600">
                                            {streakRewardInfo.streakRewardsConfig?.day7 ?? streakRewardsConfig.day7 ?? 50} Coins 🪙
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/50 px-3 py-2 rounded-xl border border-indigo-100/50">
                                        <span className="text-xs font-bold text-slate-700">15 Days Streak</span>
                                        <span className="text-xs font-black text-indigo-600">
                                            {streakRewardInfo.streakRewardsConfig?.day15 ?? streakRewardsConfig.day15 ?? 150} Coins 🪙
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/50 px-3 py-2 rounded-xl border border-indigo-100/50">
                                        <span className="text-xs font-bold text-slate-700">30 Days Streak</span>
                                        <span className="text-xs font-black text-indigo-600">
                                            {streakRewardInfo.streakRewardsConfig?.day30 ?? streakRewardsConfig.day30 ?? 500} Coins 🪙
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-indigo-400 font-bold mt-3 text-center italic">
                                    {lang === 'hi' ? 'कल फिर से काम पूरा करें और अपनी स्ट्रैक जारी रखें!' : 'Complete tomorrow\'s work to keep your streak alive!'}
                                </p>
                            </div>

                            {streakRewardInfo.rewardCoins > 0 && (
                                <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-6 mb-8 shadow-inner">
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Streak Reward / स्ट्रैक रिवॉर्ड</p>
                                    <h4 className="text-2xl font-black text-emerald-700">
                                        {streakRewardInfo.rewardCoins} {lang === 'hi' ? 'कॉइन्स मिल गए!' : 'Coins Rewarded!'}
                                    </h4>
                                </div>
                            )}

                            <div className="bg-indigo-50 border-2 border-indigo-100 rounded-3xl p-6 mb-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-10">
                                    <TrendingUp className="w-12 h-12 text-indigo-600" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Next Goal / अगला लक्ष्य</p>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-slate-800 font-black text-lg leading-tight">
                                                {lang === 'hi' ? `${streakRewardInfo.nextMilestone} दिन का स्ट्रैक` : `${streakRewardInfo.nextMilestone} Day Streak`}
                                            </p>
                                            <p className="text-indigo-600 font-bold text-sm">
                                                {lang === 'hi' ? `इनाम: ${streakRewardInfo.nextReward} सिक्के` : `Reward: ${streakRewardInfo.nextReward} Coins`}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl font-black text-indigo-900">{streakRewardInfo.streakCount}/{streakRewardInfo.nextMilestone}</span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-indigo-200 h-2.5 rounded-full mt-4 overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(streakRewardInfo.streakCount / streakRewardInfo.nextMilestone) * 100}%` }}
                                            className="h-full bg-indigo-600 rounded-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={clearStreakReward}
                                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_0_0_#1e293b] active:shadow-none active:translate-y-2 transition-all"
                            >
                                {lang === 'hi' ? 'जारी रखें' : 'Continue Learning'}
                            </motion.button>
                            
                            <p className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {lang === 'hi' ? 'कल वापस आएं और अपना स्ट्रैक बनाए रखें!' : 'Come back tomorrow to keep your streak!'}
                            </p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {!profile?.isManager && priorityNotif && (
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[260] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl relative"
                        >
                            <div className="p-10 pb-6 text-center">
                                <div className="w-20 h-20 bg-rose-50 rounded-full mx-auto flex items-center justify-center mb-6 ring-8 ring-rose-50/50">
                                    <Bell className="w-10 h-10 text-rose-600 animate-bounce" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                                    {priorityNotif.title}
                                </h3>
                                <p className="text-sm font-bold text-slate-500 leading-relaxed">
                                    {priorityNotif.text}
                                </p>
                            </div>
                            
                            {priorityNotif.imageUrl && (
                                <div className="px-10 pb-6">
                                    <img 
                                        src={priorityNotif.imageUrl} 
                                        alt="" 
                                        className="w-full h-48 object-cover rounded-[2rem] border-4 border-slate-50 shadow-lg" 
                                    />
                                </div>
                            )}

                            <div className="p-10 pt-4">
                                <motion.button 
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setPriorityNotif(null)}
                                    className="w-full py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-xl shadow-indigo-100 active:scale-95 transition-all text-sm uppercase tracking-widest"
                                >
                                    {lang === 'hi' ? 'ठीक है / OK' : 'Got it!'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Manager Home Page Pop-up Alert Modal for Payment & Support Messages */}
            {profile?.isManager && managerAlert && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 text-left">
                        {/* Header banner */}
                        <div className={`p-4 flex items-center justify-between ${
                            managerAlert.type === 'payment' ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white' : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md shrink-0">
                                    {managerAlert.type === 'payment' ? <Crown className="w-5 h-5 text-yellow-100" /> : <MessageSquare className="w-5 h-5 text-indigo-100" />}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-sm md:text-base leading-tight">
                                        {managerAlert.title}
                                    </h3>
                                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
                                        Manager Notification / मैनेजर अलर्ट
                                    </p>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={handleDismissManagerAlert}
                                className="p-1.5 hover:bg-white/20 rounded-full transition active:scale-95 text-white/80 hover:text-white cursor-pointer"
                                title="Close / बंद करें"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content Details */}
                        <div className="p-5 space-y-4 bg-slate-50/50">
                            {managerAlert.type === 'payment' ? (
                                <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs font-black text-slate-900">{managerAlert.userName}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold">{managerAlert.userEmail || 'Registered User'}</p>
                                        </div>
                                        <span className="text-base font-black text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                                            ₹{managerAlert.amount}
                                        </span>
                                    </div>
                                    {managerAlert.note && (
                                        <p className="text-xs text-slate-600 font-bold bg-slate-50 p-2 rounded-xl border border-slate-150">
                                            📌 Plan: <span className="text-indigo-700">{managerAlert.note}</span>
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                                        <p className="text-xs font-black text-slate-900">{managerAlert.userName}</p>
                                    </div>
                                    <p className="text-xs text-slate-700 font-medium bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 leading-relaxed italic">
                                        "{managerAlert.text}"
                                    </p>
                                </div>
                            )}

                            {/* Helper instruction */}
                            <p className="text-[11px] text-slate-500 font-bold text-center leading-normal">
                                {managerAlert.type === 'payment' 
                                    ? 'नया भुगतान अनुरोध प्राप्त हुआ है! इसे स्वीकार/अस्वीकार करने के लिए नीचे बटन पर क्लिक करें।' 
                                    : 'नया सहायता संदेश प्राप्त हुआ है! चैट में उत्तर देने के लिए नीचे बटन पर क्लिक करें।'}
                            </p>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-2.5 pt-1">
                                <button
                                    type="button"
                                    onClick={handleDismissManagerAlert}
                                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl transition active:scale-[0.97] border border-slate-200 text-center cursor-pointer"
                                >
                                    Cancel / बंद करें ❌
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOpenFromManagerAlert}
                                    className={`py-3 px-4 text-white font-black text-xs rounded-xl transition active:scale-[0.97] shadow-md text-center cursor-pointer ${
                                        managerAlert.type === 'payment' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                                >
                                    {managerAlert.type === 'payment' ? 'Review / स्वीकृत करें 👑' : 'Open Chat / उत्तर दें 💬'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
