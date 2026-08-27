import React, { useState, useEffect } from 'react';
import { AppStep, NoteTemplate } from '../types';
import { 
    Zap, FileText, FileSearch, CheckCircle, Newspaper, ArrowRight, Coins, 
    Bell, Sparkles, BookOpen, Clock, FolderOpen, ShoppingBag, Pin, ChevronLeft, ChevronRight, X,
    Share2, Copy, Check, Star, ExternalLink, MessageSquare,
    Award, CheckCircle2, XCircle, Download, AlertCircle, RotateCcw
} from 'lucide-react';
import { translations, Language } from '../translations';
import { db } from '../services/firebase';
import { collection, query, onSnapshot, deleteDoc, doc, setDoc, orderBy, limit, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import NoteTemplateRenderer, { TEMPLATE_OPTIONS } from './NoteTemplateRenderer';
import html2pdf from 'html2pdf.js';

interface HomeDashboardProps {
    onNavigate: (step: AppStep) => void;
    profile: any;
    onBuyCoins: () => void;
    notifications: any[];
    appSettings?: {
        offerDiscountPct: number;
        offerExpiresAt: number;
        shareAppLink?: string;
        shareText?: string;
    };
    pendingPaymentRequest?: any;
}

const MOTIVATIONAL_QUOTES = {
    hi: [
        { quote: "सफलता का कोई शॉर्टकट नहीं होता, इसके लिए कड़ी मेहनत ही एकमात्र रास्ता है। ✍️", author: "बोधक मार्गदर्शक" },
        { quote: "उद्यमेन ही सिध्यन्ति कार्याणि न मनोरथैः। बिना परिश्रम के कोई लक्ष्य हासिल नहीं होता। 💪", author: "संस्कृत सुभाषितानि" },
        { quote: "कल की तैयारी आज की मेहनत से ही शुरू होती है। उठो, जागो और तब तक मत रुको जब तक लक्ष्य प्राप्त न हो! 🎯", author: "स्वामी विवेकानंद" },
        { quote: "सफलता हमारा परिचय दुनिया को करवाती है और असफलता हमें दुनिया का परिचय करवाती है। 🌟", author: "ए. पी. जे. अब्दुल कलाम" }
    ],
    en: [
        { quote: "There are no shortcuts to success. It is the result of preparation, hard work, and learning from failure. ✍️", author: "Bodhak Mentor" },
        { quote: "Your preparation today determines your achievement tomorrow. Keep pushing forward! 💪", author: "Anonymous" },
        { quote: "Arise, awake, and stop not until the goal is reached! 🎯", author: "Swami Vivekananda" },
        { quote: "Learning is not attained by chance, it must be sought for with ardor and attended to with diligence. 🌟", author: "Abigail Adams" }
    ]
};

interface PinnedMaterialCardProps {
    item: {
        id: string;
        name: string;
        type?: string;
        url?: string;
        logoUrl?: string;
        quizData?: any;
        fileData?: string;
        folderName?: string;
    };
    isManager?: boolean;
    onUnpin?: (id: string) => void;
    onOpen?: (item: any) => void;
    lang: Language;
}

const PinnedMaterialTiltCard: React.FC<PinnedMaterialCardProps> = ({ item, isManager, onUnpin, onOpen, lang }) => {
    const cardRef = React.useRef<HTMLDivElement>(null);
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const [glowPos, setGlowPos] = useState({ x: 50, y: 50, opacity: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMove = (clientX: number, clientY: number) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const px = Math.max(0, Math.min(1, x / rect.width));
        const py = Math.max(0, Math.min(1, y / rect.height));

        // 3D tilt angles (10 - 15 deg)
        const tiltX = (py - 0.5) * -26;
        const tiltY = (px - 0.5) * 26;

        setRotateX(tiltX);
        setRotateY(tiltY);
        setGlowPos({ x: px * 100, y: py * 100, opacity: 0.85 });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length > 0) {
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    const handleMouseEnter = () => {
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        setRotateX(0);
        setRotateY(0);
        setGlowPos({ x: 50, y: 50, opacity: 0 });
    };

    const handleClick = () => {
        if (onOpen) {
            onOpen(item);
        } else if (item.url && /^https?:\/\//i.test(item.url)) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div style={{ perspective: '1000px' }} className="w-full">
            <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onTouchMove={handleTouchMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onTouchEnd={handleMouseLeave}
                onClick={handleClick}
                style={{
                    transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${isHovered ? 1.05 : 1}, ${isHovered ? 1.05 : 1}, 1)`,
                    transition: isHovered ? 'transform 0.08s ease-out, box-shadow 0.2s ease' : 'transform 0.5s ease, box-shadow 0.5s ease',
                    transformStyle: 'preserve-3d',
                }}
                className="relative bg-gradient-to-b from-white via-slate-50/90 to-indigo-50/40 border border-slate-200/90 rounded-3xl p-3 shadow-sm hover:shadow-2xl cursor-pointer overflow-hidden group select-none flex flex-col items-center justify-between min-h-[155px] transition-all text-center"
            >
                {/* Subtle Light Glow Shimmer Overlay passing across cover */}
                <div 
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300 rounded-3xl z-20"
                    style={{
                        background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 65%)`,
                        opacity: glowPos.opacity,
                    }}
                />

                {/* Light Glare Shimmer Sweep Line */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none z-10" />

                {/* Manager Unpin Button */}
                {isManager && onUnpin && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnpin(item.id);
                        }}
                        className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-650 transition shadow-2xs border border-red-200 cursor-pointer"
                        title={lang === 'hi' ? 'होम से हटाएं' : 'Unpin'}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Pinned Link Content */}
                <div className="flex flex-col items-center justify-center z-10 w-full my-auto p-1">
                    {item.logoUrl ? (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border border-slate-200/80 p-2 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform duration-300 overflow-hidden mb-1.5">
                            <img 
                                src={item.logoUrl} 
                                alt="" 
                                className="w-full h-full object-contain rounded-xl"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    ) : (
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${
                            item.type === 'note' || item.quizData ? 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-700' : 'bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600'
                        } text-white p-3 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300 mb-1.5`}>
                            {item.type === 'link' ? (
                                <ExternalLink className="w-8 h-8" />
                            ) : item.type === 'quiz' ? (
                                <Award className="w-8 h-8 text-amber-300" />
                            ) : item.type === 'note' ? (
                                <BookOpen className="w-8 h-8 text-emerald-200" />
                            ) : (
                                <FileText className="w-8 h-8" />
                            )}
                        </div>
                    )}

                    <p className="font-extrabold text-[11px] sm:text-xs text-slate-800 line-clamp-1 leading-tight group-hover:text-indigo-600 transition-colors w-full px-1">
                        {item.name || (item.type === 'quiz' ? 'Quiz Material' : (item.type === 'note' ? 'Study Note' : 'Study Link'))}
                    </p>
                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50/90 px-2.5 py-0.5 rounded-full mt-1.5 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {item.type === 'quiz' ? (lang === 'hi' ? 'क्विज़ खोलें' : 'Open Quiz') : (item.type === 'note' ? (lang === 'hi' ? 'नोट्स पढ़ें 📖' : 'Read Notes 📖') : (lang === 'hi' ? 'खोलें ↗' : 'Open ↗'))}
                    </span>
                </div>
            </div>
        </div>
    );
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onNavigate, profile, onBuyCoins, notifications, appSettings, pendingPaymentRequest }) => {
    const lang: Language = profile?.language || 'hi';
    const t = translations[lang];

    const [offerTimeLeft, setOfferTimeLeft] = useState('');

    // Manager status
    const isManager = profile?.isManager || 
                     ['sandeepsinghchouhan081@gmail.com', 'bodhak355@gmail.com'].includes(profile?.email?.toLowerCase() || '');

    // Pinned books and carousel states
    const [pinnedBooks, setPinnedBooks] = useState<any[]>([]);
    const [pinnedFreeMaterials, setPinnedFreeMaterials] = useState<any[]>([]);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [shareModalBook, setShareModalBook] = useState<any | null>(null);
    const [shareCopied, setShareCopied] = useState(false);
    const [showStreakInfoModal, setShowStreakInfoModal] = useState(false);

    // Modal viewers for Pinned Materials and Books opened from Home Dashboard
    const [activeQuizFile, setActiveQuizFile] = useState<any | null>(null);
    const [quizIndex, setQuizIndex] = useState<number>(0);
    const [quizAnswers, setQuizAnswers] = useState<Record<number, number | string>>({});
    const [showQuizResult, setShowQuizResult] = useState<boolean>(false);
    const [activePreviewFile, setActivePreviewFile] = useState<any | null>(null);
    const [activeNoteFile, setActiveNoteFile] = useState<any | null>(null);
    const [freeNoteTemplate, setFreeNoteTemplate] = useState<NoteTemplate>('infographic');
    const [noteCopied, setNoteCopied] = useState<boolean>(false);

    const [streakSettings, setStreakSettings] = useState<any>({
        day7: 50,
        day15: 150,
        day30: 500
    });

    const formatQuizText = (text: string) => {
        if (!text) return '';
        // Handle numbered points or bullet points to ensure they are on new lines
        let formatted = text.replace(/(?:\s|^)(\d+\.)\s/g, '\n\n$1 ');
        formatted = formatted.replace(/(?:\s|^)([•\-\*])\s/g, '\n\n$1 ');
        return formatted;
    };

    const handleOpenPinnedMaterial = (item: any) => {
        if (item.type === 'quiz' || item.quizData) {
            setQuizIndex(0);
            setQuizAnswers({});
            setShowQuizResult(false);
            setActiveQuizFile(item);
        } else if (item.type === 'note' || item.noteData) {
            setActiveNoteFile(item);
            setNoteCopied(false);
        } else if (item.url && /^https?:\/\//i.test(item.url)) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        } else if (item.fileData || (item.url && item.url.startsWith('data:'))) {
            // Check if file is note format
            const raw = item.fileData || item.url || '';
            if (raw.includes('# ') || raw.includes('## ') || raw.includes('{"content"')) {
                setActiveNoteFile(item);
                setNoteCopied(false);
            } else {
                setActivePreviewFile({
                    name: item.name,
                    fileData: item.fileData || item.url,
                    fileName: item.name
                });
            }
        } else {
            onNavigate('free-m');
        }
    };

    const handleOpenPinnedBook = (book: any) => {
        if (book.url && /^https?:\/\//i.test(book.url)) {
            window.open(book.url, '_blank', 'noopener,noreferrer');
        } else if (book.fileData || (book.url && book.url.startsWith('data:'))) {
            setActivePreviewFile({
                name: book.name,
                fileData: book.fileData || book.url,
                fileName: book.fileName || book.name
            });
        } else {
            onNavigate('buy-m');
        }
    };

    const { recordDailyActivity } = useAuth();

    useEffect(() => {
        if (profile?.userId || profile?.uid) {
            recordDailyActivity('dashboard');
        }
    }, [profile?.userId, profile?.uid]);

    // Fetch Streak Settings
    useEffect(() => {
        const docRef = doc(db, 'settings', 'streakRewards');
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setStreakSettings(snap.data());
            }
        });
        return () => unsub();
    }, []);

    const handleShareBook = (book: any) => {
        setShareModalBook(book);
    };

    useEffect(() => {
        const q = query(collection(db, 'pinnedBooks'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            // Sort by pin creation time
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setPinnedBooks(list);
            setCurrentSlide(0);
        }, (err) => {
            console.error("Error loading pinned books in HomeDashboard: ", err);
            if (err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('resource-exhausted')) {
                window.dispatchEvent(new CustomEvent('bodhak:quota_exceeded', { detail: err.message }));
            }
        });
        return () => unsubscribe();
    }, []);

    // Listen to pinnedFreeMaterials collection
    useEffect(() => {
        const q = query(collection(db, 'pinnedFreeMaterials'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setPinnedFreeMaterials(list);
        }, (err) => {
            console.error("Error loading pinned free materials in HomeDashboard: ", err);
            if (err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('resource-exhausted')) {
                window.dispatchEvent(new CustomEvent('bodhak:quota_exceeded', { detail: err.message }));
            }
        });
        return () => unsubscribe();
    }, []);

    // Auto switch slide back and forth
    useEffect(() => {
        if (pinnedBooks.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % pinnedBooks.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [pinnedBooks.length]);

    // App Rating state
    const [userRating, setUserRating] = useState<number>(0);
    const [hoverRating, setHoverRating] = useState<number>(0);
    const [userFeedback, setUserFeedback] = useState<string>('');
    const [isSavingRating, setIsSavingRating] = useState<boolean>(false);
    const [ratingSuccessMsg, setRatingSuccessMsg] = useState<string>('');

    const userId = profile?.userId || profile?.uid || 'guest_user';

    useEffect(() => {
        if (!userId || userId === 'guest_user') return;
        const ratingDocRef = doc(db, 'appRatings', userId);
        const unsub = onSnapshot(ratingDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setUserRating(data.rating || 0);
            }
        }, (err) => {
            console.error("Error fetching rating:", err);
        });
        return () => unsub();
    }, [userId]);

    const handleSaveRating = async (stars: number, customFeedback?: string) => {
        if (!userId || userId === 'guest_user') return;
        setIsSavingRating(true);
        try {
            const finalFeedback = customFeedback !== undefined ? customFeedback : userFeedback;
            await setDoc(doc(db, 'appRatings', userId), {
                id: userId,
                userId: userId,
                userName: profile?.name || profile?.displayName || profile?.email?.split('@')[0] || 'User',
                userEmail: profile?.email || '',
                rating: stars,
                feedback: finalFeedback,
                updatedAt: Date.now()
            }, { merge: true });
            setUserRating(stars);
            setUserFeedback(''); // Reset feedback input so user can write a new review cleanly
            setRatingSuccessMsg(lang === 'hi' ? 'आपकी रेटिंग दर्ज हो गई है! धन्यवाद ⭐' : 'Rating submitted successfully! Thank you ⭐');
            setTimeout(() => setRatingSuccessMsg(''), 3000);
        } catch (err) {
            console.error("Error saving rating:", err);
        } finally {
            setIsSavingRating(false);
        }
    };

    useEffect(() => {
        const updateTimer = () => {
            if (!appSettings?.offerExpiresAt) {
                setOfferTimeLeft((appSettings?.offerDiscountPct || 0) > 0 ? (lang === 'hi' ? 'विशेष ऑफर चालू है' : 'Special Offer Active') : '');
                return;
            }
            const diff = (appSettings?.offerExpiresAt || 0) - Date.now();
            if (diff <= 0) {
                setOfferTimeLeft((appSettings?.offerDiscountPct || 0) > 0 ? (lang === 'hi' ? 'विशेष ऑफर चालू है' : 'Special Offer Active') : '');
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
    }, [appSettings?.offerExpiresAt, appSettings?.offerDiscountPct, lang]);

    const isOfferActive = !!(appSettings && appSettings.offerDiscountPct > 0 && (!appSettings.offerExpiresAt || appSettings.offerExpiresAt > Date.now()));

    // Pick quote based on date day
    const day = new Date().getDate();
    const quotesList = MOTIVATIONAL_QUOTES[lang];
    const quoteObj = quotesList[day % quotesList.length];

    const tools = [
        {
            id: 'create' as AppStep,
            title: lang === 'hi' ? 'Quiz / मॉक टेस्ट ⚡' : 'Quiz / Mock Test ⚡',
            desc: lang === 'hi' 
                ? 'विषय और कठिन स्तर चुनकर नए डायनामिक टेस्ट पेपर जनरेट करें।' 
                : 'Generate premium dynamic test papers customized to your targets.',
            badge: lang === 'hi' ? 'लोकप्रिय / Popular' : 'Popular',
            icon: Zap,
            color: 'from-blue-600 via-indigo-600 to-indigo-800',
            iconBg: 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-600/5',
        },
        {
            id: 'ans-chak' as AppStep,
            title: lang === 'hi' ? 'Ans. Chak / उत्तर जाँचे 📝' : 'Ans. Chak / Answer Evaluator 📝',
            desc: lang === 'hi' 
                ? 'अपने लिखित उत्तर अपलोड करें और विस्तृत विश्लेषण व प्राप्तांक पायें।' 
                : 'Upload written copies to get precise grades, AI reviews & corrections.',
            badge: lang === 'hi' ? 'विशेषज्ञ मूल्यांकन / AI Review' : 'AI Review',
            icon: CheckCircle,
            color: 'from-emerald-500 via-teal-600 to-emerald-750',
            iconBg: 'bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-500/5',
        },
        {
            id: 'notes' as AppStep,
            title: lang === 'hi' ? 'Smart Notes / नोट्स 📚' : 'Smart Notes / Instant Summaries 📚',
            desc: lang === 'hi' 
                ? 'जटिल विषयों और टॉपिक्स के सरल व सटीक नोट्स तुरंत प्राप्त करें।' 
                : 'Get structured customized context notes for complex topics instantly.',
            badge: lang === 'hi' ? 'त्वरित / Instant' : 'Instant',
            icon: FileText,
            color: 'from-purple-500 via-fuchsia-600 to-violet-850',
            iconBg: 'bg-violet-50 text-violet-600 shadow-sm shadow-violet-500/5',
        },
        {
            id: 'pyq' as AppStep,
            title: lang === 'hi' ? 'PYQ Scanner / विगत प्रश्न 🔍' : 'PYQ Scanner / Solved Papers 🔍',
            desc: lang === 'hi' 
                ? 'विगत वर्षों के प्रश्न-पत्र हल करें और असली परीक्षा पैटर्न का अभ्यास करें।' 
                : 'Search and scan previous year questions for rigorous practice.',
            badge: lang === 'hi' ? 'हल सहित / Solved' : 'Solved',
            icon: FileSearch,
            color: 'from-amber-500 via-orange-600 to-amber-700',
            iconBg: 'bg-amber-50 text-amber-600 shadow-sm shadow-amber-500/5',
        },
        {
            id: 'current-affairs' as AppStep,
            title: lang === 'hi' ? 'Current Affairs / समसामयिकी 📰' : 'Current Affairs / Daily News 📰',
            desc: lang === 'hi' 
                ? 'राज्य व राष्ट्रीय परीक्षाओं के लिए दैनिक और विषयवार करंट अफेयर्स अपडेट्स।' 
                : 'Stay ahead with tailored daily exam current affairs updates.',
            badge: lang === 'hi' ? 'दैनिक अपडेट / Daily' : 'Daily Tracker',
            icon: Newspaper,
            color: 'from-rose-500 via-rose-600 to-pink-700',
            iconBg: 'bg-rose-50 text-rose-600 shadow-sm shadow-rose-500/5',
        },
        {
            id: 'current-affairs-hindu' as AppStep,
            title: lang === 'hi' ? 'The Hindu / द हिन्दू 📰' : 'The Hindu / UPSC CA 📰',
            desc: lang === 'hi' 
                ? 'द हिन्दू अख़बार के दैनिक यूपीएससी विशेष परीक्षा उपयोगी नोट्स।' 
                : 'Daily UPSC-oriented analytical notes compiled from The Hindu Newspaper.',
            badge: lang === 'hi' ? 'द हिन्दू / The Hindu' : 'UPSC Special',
            icon: Newspaper,
            color: 'from-red-500 via-red-650 to-red-700',
            iconBg: 'bg-red-50 text-red-600 shadow-sm shadow-red-500/5',
        },
        {
            id: 'buy-m' as AppStep,
            title: lang === 'hi' ? 'Buy Study Material / मटीरियल खरीदें 🛒' : 'Buy Study Material / Buy Books 🛒',
            desc: lang === 'hi' 
                ? 'बेस्ट परीक्षा पुस्तकें, नोट्स व अन्य सामग्री सीधे ऑनलाइन लिंक से खरीदें।' 
                : 'Browse and purchase curated books, prep notes, and study material with online links.',
            badge: lang === 'hi' ? 'बुक्स व लिंक्स / Shop' : 'Store',
            icon: ShoppingBag,
            color: 'from-violet-600 via-indigo-600 to-indigo-800',
            iconBg: 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-500/5',
        },
        {
            id: 'free-m' as AppStep,
            title: lang === 'hi' ? 'Free Study Material / फ्री मटीरियल 📚' : 'Free Study Material / PDF Docs 📚',
            desc: lang === 'hi' 
                ? 'निःशुल्क परीक्षा पीडीएफ, सिलेबस, नोट्स एवं फ्री पीडीएफ फाइलें डाउनलोड करें।' 
                : 'Download free exam prep PDFs, hand-written notes, and syllabus files.',
            badge: lang === 'hi' ? 'फ्री पीडीएफ / Free' : 'Free PDFs',
            icon: BookOpen,
            color: 'from-amber-500 via-orange-600 to-amber-700',
            iconBg: 'bg-amber-50 text-amber-600 shadow-sm shadow-amber-500/5',
        }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-7 pb-16 px-1.5 md:px-3 animate-[fadeIn_0.35s_ease-out]">
            
            {/* Elegant Hero Dynamic Welcome Card with smooth animation */}
            <div className="bg-gradient-to-tr from-indigo-950 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-9 text-white shadow-2xl relative overflow-hidden ring-1 ring-white/10 group transition-all duration-300">
                {/* Visual Background Accents */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-24 -mt-24 group-hover:scale-110 transition-transform duration-700"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/5 rounded-full blur-2xl -ml-12 -mb-10"></div>
                <div className="absolute top-1/2 left-1/3 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl animate-pulse"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div className="space-y-3 max-w-[500px]">
                        <div className="flex items-center gap-2 text-indigo-300">
                            <div className="bg-indigo-500/20 p-1.5 rounded-lg border border-indigo-400/25">
                                <Sparkles className="h-4.5 w-4.5 text-indigo-400 animate-pulse" />
                            </div>
                            <span className="text-xs uppercase tracking-widest font-black leading-none">{t.slogan}</span>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
                            {lang === 'hi' ? `नमस्ते, ${profile?.name || 'विद्वान'}! 👋` : `Hello, ${profile?.name || 'Scholar'}! 👋`}
                        </h2>
                        <p className="text-sm text-indigo-100 font-medium leading-relaxed">
                            {lang === 'hi' 
                                ? 'बोधक ऐप में आपका स्वागत है। कृत्रिम बुद्धिमत्ता (AI) के सहयोग से अपनी जटिल प्रतियोगिता परीक्षाओं की तैयारी आसान करें।' 
                                : 'Welcome to Bodhak. Supercharge your government exam prep with high-precision visual and analytical AI mentoring.'}
                        </p>

                        {/* Daily Streak, Rank, and Coins in single straight line with matching size */}
                        <div className="mt-3.5 pt-3.5 border-t border-indigo-400/20 flex flex-row items-center gap-2 md:gap-2.5 overflow-x-auto no-scrollbar">
                            {/* 1. Daily Streak Badge */}
                            <button 
                                onClick={() => setShowStreakInfoModal(true)}
                                className="flex-1 bg-white/10 hover:bg-white/15 border border-white/10 pl-2 pr-3 py-1.5 rounded-xl flex items-center gap-2 transition-all duration-300 shadow-md h-11 min-w-[95px] shrink-0 sm:shrink active:scale-95 cursor-pointer"
                            >
                                <div className="bg-gradient-to-tr from-orange-500 to-red-500 p-1.5 rounded-lg flex items-center justify-center shrink-0 w-7.5 h-7.5 select-none">
                                    <span className="text-xs leading-none">🔥</span>
                                </div>
                                <div className="text-left select-none overflow-hidden">
                                    <p className="text-[9px] text-indigo-200 uppercase font-black tracking-wider leading-none truncate">{lang === 'hi' ? 'स्ट्रैक' : 'Streak'}</p>
                                    <p className="text-xs text-white font-black font-mono mt-0.5 leading-none truncate">
                                        {profile?.streakCount || 0} {lang === 'hi' ? 'दिन' : 'Days'}
                                    </p>
                                </div>
                            </button>

                            {/* 3. Coins Badge */}
                            <div className="flex-1 bg-white/10 hover:bg-white/15 border border-white/10 pl-2 pr-3 py-1.5 rounded-xl flex items-center gap-2 transition-all duration-300 shadow-md h-11 min-w-[95px] shrink-0 sm:shrink">
                                <div className="bg-gradient-to-tr from-amber-400 to-yellow-500 p-1.5 rounded-lg flex items-center justify-center shrink-0 w-7.5 h-7.5">
                                    <Coins className="h-4 w-4 text-slate-900 stroke-[2.5]" />
                                </div>
                                <div className="text-left select-none overflow-hidden">
                                    <p className="text-[9px] text-indigo-200 uppercase tracking-wider font-black leading-none truncate">{lang === 'hi' ? 'सिक्के' : 'Coins'}</p>
                                    <div className="flex items-center gap-1 mt-0.5 leading-none">
                                        <span className="text-xs font-black font-mono text-white leading-none truncate">
                                            {(profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now())) ? '∞' : (profile?.coins !== undefined ? profile.coins : 50)}
                                        </span>
                                        {!!(!profile?.isManager && profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now()) && (
                                            <span className="text-[8px] bg-amber-400 text-amber-950 px-1 py-0.5 rounded font-bold shrink-0 leading-none">
                                                {Math.max(1, Math.ceil((profile.unlimitedExpirity - Date.now()) / (24 * 60 * 60 * 1000)))}d
                                            </span>
                                        )}
                                        {!(profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now())) && (
                                            <button 
                                                onClick={onBuyCoins}
                                                className="text-[7px] bg-amber-400 hover:bg-amber-500 text-slate-950 font-black px-1 py-0.5 rounded transition-all active:scale-95 cursor-pointer leading-none shrink-0"
                                            >
                                                +
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 4. AW Coins Badge */}
                            {!!(profile?.isManager || (profile?.awPassExpirity && profile.awPassExpirity > Date.now())) && (
                                <div className="flex-1 bg-white/10 hover:bg-white/15 border border-emerald-400/30 pl-2 pr-3 py-1.5 rounded-xl flex items-center gap-2 transition-all duration-300 shadow-md h-11 min-w-[95px] shrink-0 sm:shrink">
                                    <div className="bg-gradient-to-tr from-emerald-400 to-teal-500 p-1.5 rounded-lg flex items-center justify-center shrink-0 w-7.5 h-7.5">
                                        <span className="text-xs font-black leading-none text-slate-950 select-none">✍️</span>
                                    </div>
                                    <div className="text-left select-none overflow-hidden">
                                        <p className="text-[9px] text-emerald-200 uppercase tracking-wider font-black leading-none truncate">AW Coins</p>
                                        <div className="flex items-center gap-1 mt-0.5 leading-none">
                                            <span className="text-xs font-black font-mono text-emerald-300 leading-none truncate">∞</span>
                                            {!!(!profile?.isManager && profile?.awPassExpirity && profile.awPassExpirity > Date.now()) && (
                                                <span className="text-[8px] bg-emerald-400 text-emerald-950 px-1 py-0.5 rounded font-bold shrink-0 leading-none">
                                                    {Math.max(1, Math.ceil((profile.awPassExpirity - Date.now()) / (24 * 60 * 60 * 1000)))}d
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 5. Quiz Coins Badge */}
                            {!!(profile?.isManager || (profile?.quizPassExpirity && profile.quizPassExpirity > Date.now())) && (
                                <div className="flex-1 bg-white/10 hover:bg-white/15 border border-purple-400/30 pl-2 pr-3 py-1.5 rounded-xl flex items-center gap-2 transition-all duration-300 shadow-md h-11 min-w-[95px] shrink-0 sm:shrink">
                                    <div className="bg-gradient-to-tr from-purple-400 to-indigo-500 p-1.5 rounded-lg flex items-center justify-center shrink-0 w-7.5 h-7.5">
                                        <span className="text-xs font-black leading-none text-white select-none">🎯</span>
                                    </div>
                                    <div className="text-left select-none overflow-hidden">
                                        <p className="text-[9px] text-purple-200 uppercase tracking-wider font-black leading-none truncate">Quiz Coins</p>
                                        <div className="flex items-center gap-1 mt-0.5 leading-none">
                                            <span className="text-xs font-black font-mono text-purple-300 leading-none truncate">∞</span>
                                            {!!(!profile?.isManager && profile?.quizPassExpirity && profile.quizPassExpirity > Date.now()) && (
                                                <span className="text-[8px] bg-purple-400 text-purple-950 px-1 py-0.5 rounded font-bold shrink-0 leading-none">
                                                    {Math.max(1, Math.ceil((profile.quizPassExpirity - Date.now()) / (24 * 60 * 60 * 1000)))}d
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Small Rule Text */}
                        <p className="text-[10px] text-indigo-200/80 font-semibold mt-2 select-none">
                            {lang === 'hi' 
                                ? '⚠️ एक दिन भी काम न करने पर डेली टास्क दोबारा 0 से शुरू होगा।' 
                                : '⚠️ Failing to work for 1 day resets the daily task to 0.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Payment Verification Pending Banner */}
            {pendingPaymentRequest && (
                <div className="bg-amber-50 border border-amber-200/90 rounded-3xl p-5 md:p-6 shadow-xl relative overflow-hidden animate-[scaleUp_0.3s_ease-out] text-left">
                    <div className="absolute -top-12 -right-12 w-24 h-24 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex gap-4 items-start relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 animate-pulse">
                            <Clock className="w-6 h-6 animate-spin duration-3000" />
                        </div>
                        <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base md:text-lg font-black text-amber-950 tracking-tight leading-none">
                                    {lang === 'hi' ? 'भुगतान सत्यापन किया जा रहा है... ⏳' : 'Payment Verification Pending... ⏳'}
                                </h3>
                                <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                                    {lang === 'hi' ? 'मैनेजर जांच जारी है' : 'Under Review'}
                                </span>
                            </div>
                            
                            <p className="text-xs md:text-sm text-amber-900 font-bold leading-relaxed">
                                {lang === 'hi'
                                    ? `₹${pendingPaymentRequest.amount} का आपका भुगतान सत्यापन अनुरोध अभी मैनेजर की अनुमति की प्रतीक्षा में है।`
                                    : `Your payment verification request of ₹${pendingPaymentRequest.amount} is currently under manager review.`}
                            </p>
                            
                            <p className="text-[11px] text-amber-800 font-medium bg-white/45 p-3.5 rounded-2xl border border-amber-150/60 leading-normal">
                                {lang === 'hi'
                                    ? `सत्यापन पूर्ण होते ही आपके खाते में ${pendingPaymentRequest.isUnlimited ? `${pendingPaymentRequest.unlimitedDays} दिनों का असीमित पास` : `+${pendingPaymentRequest.coins} कॉइन्स`} स्वतः जोड़ दिए जाएंगे। कृपया प्रतीक्षा करें!`
                                    : `Upon successful verification, ${pendingPaymentRequest.isUnlimited ? `${pendingPaymentRequest.unlimitedDays} Days Unlimited Pass` : `+${pendingPaymentRequest.coins} Coins`} will be automatically credited to your account. Thank you for your patience!`}
                            </p>

                            <div className="flex gap-4 text-[10px] font-mono text-amber-700 pt-1.5 flex-wrap">
                                <div>
                                    <span className="font-extrabold uppercase">{lang === 'hi' ? 'सदर्भ संख्या (UTR):' : 'Reference (UTR):'}</span>{' '}
                                    <span className="bg-amber-100/70 px-2 py-0.5 rounded font-black border border-amber-200/50">{pendingPaymentRequest.utr}</span>
                                </div>
                                {pendingPaymentRequest.createdAt && (
                                    <div>
                                        <span className="font-extrabold uppercase">{lang === 'hi' ? 'समय:' : 'Submitted:'}</span>{' '}
                                        <span className="bg-amber-100/70 px-2 py-0.5 rounded font-black border border-amber-200/50">
                                            {new Date(pendingPaymentRequest.createdAt?.seconds ? (pendingPaymentRequest.createdAt.seconds * 1000) : pendingPaymentRequest.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Motivational Quote banner (Modern Card Layout) */}
            <div className="bg-amber-50/60 border border-amber-100/80 rounded-2xl p-4.5 flex gap-4 items-center shadow-sm hover:shadow transition-shadow animate-[scaleUp_0.3s_ease-out]">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-xl animate-bounce">💡</span>
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-xs md:text-sm text-amber-900 font-extrabold italic leading-relaxed">
                        "{quoteObj.quote}"
                    </p>
                    <p className="text-[10px] text-amber-605/90 font-black uppercase tracking-widest flex items-center gap-1">
                        <span>— {quoteObj.author}</span>
                    </p>
                </div>
            </div>

            {/* Special Discount Offer Countdown banner */}
            {isOfferActive && (
                <div 
                    onClick={onBuyCoins}
                    className="bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600 text-white rounded-3xl p-5 md:p-6 shadow-xl border border-red-400 relative overflow-hidden animate-[scaleUp_0.35s_ease-out] cursor-pointer group hover:scale-[1.01] transition-all duration-300"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
                        <div className="space-y-1.5 text-left">
                            <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider bg-white/15 px-3 py-1 rounded-full w-fit border border-white/20">
                                <span className="text-sm">🔥</span>
                                <span>LIMITED TIME SUPER OFFER / सीमित समय का विशेष ऑफर!</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-black tracking-tight pt-1">
                                {lang === 'hi' 
                                    ? `पाइए फ्लैट ${appSettings?.offerDiscountPct || 0}% की अतिरिक्त छूट! ✨` 
                                    : `Get Flat ${appSettings?.offerDiscountPct || 0}% EXTRA OFF! ✨`}
                            </h3>
                            <p className="text-xs text-white/90 font-bold max-w-[500px] leading-relaxed">
                                {lang === 'hi'
                                    ? 'सभी कॉइन पैक्स और पास रिचार्ज पर फ्लैट डिस्काउंट आटोमेटिक चालू है। देर न करें!'
                                    : 'Special discount automatically applied to all coin packages and passes. Tap to buy now!'}
                            </p>
                        </div>
                        
                        <div className="flex flex-col items-start sm:items-end justify-center shrink-0 bg-black/15 backdrop-blur-md border border-white/15 px-4.5 py-3 rounded-2xl min-w-[160px] text-left sm:text-right">
                            <span className="text-[10px] text-indigo-100 uppercase tracking-widest font-black flex items-center gap-1">
                                ⌛ {lang === 'hi' ? 'ऑफर समाप्त होने का समय:' : 'ENDS IN:'}
                            </span>
                            <span className="text-xl md:text-2xl font-black font-mono tracking-widest text-amber-300 animate-pulse drop-shadow-sm pt-0.5">
                                {offerTimeLeft || 'Expired'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Pinned Books Section (Aayat box) - Only visible when 1 or more books are pinned */}
            {pinnedBooks.length > 0 && (
                <div id="pinned-books-banner" className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-905 tracking-tight flex items-center gap-2 uppercase tracking-wider">
                            <Pin className="w-4 h-4 text-amber-500 fill-amber-500" />
                            <span>{lang === 'hi' ? 'विशेष रेकमेंडेड पुस्तकें 📚' : 'Featured Study Books 📚'}</span>
                        </h3>
                        {pinnedBooks.length > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={() => setCurrentSlide((prev) => (prev - 1 + pinnedBooks.length) % pinnedBooks.length)}
                                    className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[10px] font-mono font-black text-slate-500">
                                    {currentSlide + 1}/{pinnedBooks.length}
                                </span>
                                <button 
                                    onClick={() => setCurrentSlide((prev) => (prev + 1) % pinnedBooks.length)}
                                    className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-gradient-to-tr from-violet-600/10 via-indigo-650/10 to-violet-500/5 border border-violet-200/60 rounded-3xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden h-40 sm:h-44 flex flex-col justify-center">
                        {/* Background subtle blur circles */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-400/15 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-20 h-20 bg-indigo-400/10 rounded-full blur-xl -ml-6 -mb-6 pointer-events-none" />

                        <AnimatePresence mode="wait">
                            {pinnedBooks.map((book, idx) => {
                                if (idx !== currentSlide) return null;
                                return (
                                    <motion.div 
                                        key={book.id}
                                        initial={{ opacity: 0, x: 15 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -15 }}
                                        transition={{ duration: 0.25, ease: "easeInOut" }}
                                        className="w-full h-full flex items-center gap-4 text-left relative z-10"
                                    >
                                        {/* Book cover (Left) */}
                                        <div 
                                            onClick={() => handleOpenPinnedBook(book)}
                                            className="w-24 sm:w-28 h-full rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 relative shadow-sm cursor-pointer group"
                                        >
                                            {book.fileData ? (
                                                <img 
                                                    src={book.fileData} 
                                                    alt={book.name} 
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                    referrerPolicy="no-referrer"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-violet-50 flex flex-col items-center justify-center text-violet-500">
                                                    <ShoppingBag className="w-5 h-5 mb-1" />
                                                    <span className="text-[8px] font-black uppercase">Book</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Book details (Right) */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                                            <div className="space-y-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h4 
                                                        onClick={() => handleOpenPinnedBook(book)}
                                                        className="font-black text-slate-900 text-xs sm:text-sm md:text-base leading-snug line-clamp-1 cursor-pointer hover:text-indigo-650 transition"
                                                    >
                                                        {book.name}
                                                    </h4>
                                                    
                                                    {/* If manager, show Unpin action directly here */}
                                                    {isManager && (
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                try {
                                                                    await deleteDoc(doc(db, 'pinnedBooks', book.id));
                                                                } catch (err) {
                                                                    console.error("Error unpinning from home: ", err);
                                                                }
                                                            }}
                                                            className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-800 transition cursor-pointer shrink-0"
                                                            title={lang === 'hi' ? 'होम से हटाएं' : 'Remove Pin'}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[10px] sm:text-xs text-slate-500 font-bold leading-normal line-clamp-2 md:line-clamp-3">
                                                    {book.description || (lang === 'hi' ? 'मैनेजर द्वारा चुनी गई विशेष परीक्षा उपयोगी पुस्तक।' : 'Special exam-oriented study book curated by manager.')}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 pt-1">
                                                <button 
                                                    onClick={() => handleOpenPinnedBook(book)}
                                                    className="inline-flex items-center gap-1 bg-violet-650 hover:bg-violet-750 text-white font-black text-[10px] sm:text-xs px-3 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                                >
                                                    <span>
                                                        {book.url && /^https?:\/\//i.test(book.url) 
                                                            ? (lang === 'hi' ? 'खरीदें 🛒' : 'Buy 🛒') 
                                                            : (lang === 'hi' ? 'खोलें 📖' : 'Open 📖')}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShareBook(book);
                                                    }}
                                                    className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[10px] sm:text-xs px-2.5 py-1.5 rounded-xl transition cursor-pointer border border-indigo-200/80 active:scale-95"
                                                    title={lang === 'hi' ? 'शेयर करें' : 'Share'}
                                                >
                                                    <Share2 className="w-3.5 h-3.5" />
                                                    <span>{lang === 'hi' ? 'शेयर' : 'Share'}</span>
                                                </button>
                                                <button 
                                                    onClick={() => onNavigate('buy-m')}
                                                    className="text-[10px] sm:text-xs font-black text-violet-650 hover:text-violet-850 hover:underline transition ml-auto"
                                                >
                                                    {lang === 'hi' ? 'सभी देखें →' : 'View All →'}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Core Utilities Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                        <span>{t.activeTitle}</span>
                    </h3>
                    <span className="text-[10px] font-black text-indigo-700 bg-indigo-50/85 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {lang === 'hi' ? 'सभी टूल्स सक्रिय' : 'ALL ACTIVE'}
                    </span>
                </div>

                {/* Staggered Modern Grid with beautiful hover and transition mechanics */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {tools.map((tool, idx) => {
                        const IconComponent = tool.icon;
                        return (
                            <div 
                                key={tool.id}
                                onClick={() => onNavigate(tool.id)}
                                style={{ animationDelay: `${idx * 75}ms` }}
                                className="group bg-white rounded-2xl border border-slate-200/90 hover:border-indigo-400 p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 active:scale-[0.99] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center text-center aspect-square hover:-translate-y-0.5"
                            >
                                {/* Tool Color Accent slide */}
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                {/* Badge */}
                                <span className="absolute top-2 right-2 text-[7px] sm:text-[8.5px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 sm:scale-100">
                                    {tool.badge}
                                </span>

                                <div className={`${tool.iconBg} p-2 sm:p-3 rounded-2xl h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                                    <IconComponent className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5]" />
                                </div>
                                
                                <div className="mt-2 sm:mt-3 space-y-1 w-full px-1">
                                    <h4 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors line-clamp-2">
                                        {tool.title}
                                    </h4>
                                    <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-500 font-bold leading-normal line-clamp-2 opacity-90">
                                        {tool.desc}
                                    </p>
                                </div>
                                
                                <div className="absolute right-3 bottom-3 text-slate-300 group-hover:text-indigo-600 transition-all duration-300 hidden sm:block">
                                    <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Doubts Solver Section (Square Cards for AI Chat & Support Team Chat) */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>{lang === 'hi' ? 'डाउट्स सॉल्वर / Doubts Solver 🤖' : 'Doubts Solver 🤖'}</span>
                    </h3>
                    <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                        {lang === 'hi' ? '24x7 सहायता' : '24x7 Help'}
                    </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {/* 1st Square Card: AI Chat */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-ai-chat'))}
                        className="group bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 text-white rounded-2xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 active:scale-[0.99] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center text-center aspect-square border border-indigo-500/30 hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
                        
                        <div className="bg-white/15 backdrop-blur-md border border-white/20 p-2 sm:p-3 rounded-2xl h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 relative mb-2 sm:mb-3">
                            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-300 animate-pulse stroke-[2.5]" />
                            <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[8px] sm:text-[9px] font-black px-1 sm:px-1.5 py-0.5 rounded-full shadow border border-white uppercase">
                                AI
                            </span>
                        </div>

                        <div className="space-y-1 w-full px-1">
                            <h4 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-white leading-snug line-clamp-2">
                                {lang === 'hi' ? 'एआई चैट असिस्टेंट' : 'AI Chat Assistant'}
                            </h4>
                            <p className="text-[9px] sm:text-[10px] md:text-xs text-indigo-100 font-medium leading-normal line-clamp-2 opacity-90">
                                {lang === 'hi' ? 'तुरंत सवाल का जवाब पाएं 🤖' : 'Instant answers for any doubt 🤖'}
                            </p>
                        </div>
                    </button>

                    {/* 2nd Square Card: Support Team Chat */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-support-chat'))}
                        className="group bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 active:scale-[0.99] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center text-center aspect-square border border-slate-700/50 hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />
                        
                        <div className="bg-indigo-500/20 backdrop-blur-md border border-indigo-400/30 p-2 sm:p-3 rounded-2xl h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 mb-2 sm:mb-3">
                            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-300 stroke-[2.5]" />
                        </div>

                        <div className="space-y-1 w-full px-1">
                            <h4 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-white leading-snug line-clamp-2">
                                {lang === 'hi' ? 'सपोर्ट टीम चैट' : 'Support Team Chat'}
                            </h4>
                            <p className="text-[9px] sm:text-[10px] md:text-xs text-slate-300 font-medium leading-normal line-clamp-2 opacity-90">
                                {lang === 'hi' ? 'मैनेजर से सीधे बात करें 💬' : 'Chat directly with support manager 💬'}
                            </p>
                        </div>
                    </button>
                </div>
            </div>

            {/* Pinned Free Study Materials / Links Section with 3D Dynamic Tilt Cards */}
            {pinnedFreeMaterials.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Pin className="w-4 h-4 text-indigo-600 fill-indigo-600" />
                            <span>{lang === 'hi' ? 'विशेष पिन लिंक व स्टडी मटेरियल 📌' : 'Pinned Study Links & Material 📌'}</span>
                        </h3>
                        <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/80">
                            {pinnedFreeMaterials.length} {lang === 'hi' ? 'पिन' : 'Pinned'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                        {pinnedFreeMaterials.map((item) => (
                            <PinnedMaterialTiltCard 
                                key={item.id}
                                item={item}
                                isManager={isManager}
                                onUnpin={async (id) => {
                                    try {
                                        await deleteDoc(doc(db, 'pinnedFreeMaterials', id));
                                    } catch (err) {
                                        console.error("Error unpinning material: ", err);
                                    }
                                }}
                                onOpen={handleOpenPinnedMaterial}
                                lang={lang}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* App Rating Section (1 to 5 Stars ⭐) */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 md:p-6 text-left space-y-4 animate-[scaleUp_0.35s_ease-out]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-500 shadow-2xs">
                            <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 tracking-tight">
                                {lang === 'hi' ? 'ऐप को रेटिंग दें' : 'Rate Bodhak App'}
                            </h3>
                            <p className="text-[11px] text-slate-500 font-bold">
                                {lang === 'hi' ? 'आपका अनुभव कैसा रहा? स्टार चुनें और बदलें ⭐' : 'How is your experience? Choose stars ⭐'}
                            </p>
                        </div>
                    </div>
                    {userRating > 0 && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2.5 py-1 rounded-full border border-amber-200/80 flex items-center gap-1">
                            <span>{userRating}/5</span>
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                        </span>
                    )}
                </div>

                {/* Star Picker */}
                <div className="flex flex-col items-center justify-center py-3 space-y-2 bg-slate-50/80 rounded-2xl p-4 border border-slate-150">
                    <p className="text-xs font-extrabold text-slate-700 text-center">
                        {userRating === 0 
                            ? (lang === 'hi' ? 'अपना फीडबैक स्टार चुनें (1 से 5 स्टार):' : 'Select your rating (1 to 5 stars):')
                            : (lang === 'hi' ? `आपकी मौजूदा रेटिंग: ${userRating} स्टार (बदलने के लिए किसी भी स्टार पर क्लिक करें):` : `Your current rating: ${userRating} Stars (Click any star to change):`)}
                    </p>

                    <div className="flex items-center gap-2 md:gap-3 py-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                            const active = star <= (hoverRating || userRating);
                            return (
                                <button
                                    key={star}
                                    type="button"
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => handleSaveRating(star)}
                                    disabled={isSavingRating}
                                    className="p-1.5 transition-transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-hidden"
                                    title={`${star} Star`}
                                >
                                    <Star 
                                        className={`w-8 h-8 md:w-9 md:h-9 transition-colors ${
                                            active 
                                                ? 'fill-amber-400 text-amber-500 drop-shadow-xs' 
                                                : 'fill-slate-200 text-slate-300'
                                        }`} 
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <div className="text-[11px] font-black text-amber-600 h-4">
                        {(hoverRating || userRating) === 1 && (lang === 'hi' ? 'सुधार की आवश्यकता / Needs Improvement 😞' : 'Needs Improvement 😞')}
                        {(hoverRating || userRating) === 2 && (lang === 'hi' ? 'औसत / Fair 😐' : 'Fair 😐')}
                        {(hoverRating || userRating) === 3 && (lang === 'hi' ? 'अच्छा / Good 🙂' : 'Good 🙂')}
                        {(hoverRating || userRating) === 4 && (lang === 'hi' ? 'बहुत अच्छा / Very Good 😊' : 'Very Good 😊')}
                        {(hoverRating || userRating) === 5 && (lang === 'hi' ? 'शानदार! / Excellent 🚀' : 'Excellent 🚀')}
                    </div>
                </div>

                {/* Feedback Input & Update Button */}
                <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                        {lang === 'hi' ? 'अपनी राय / प्रतिक्रिया लिखें (ऐच्छिक):' : 'Write Feedback / Review (Optional):'}
                    </label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={userFeedback}
                            onChange={(e) => setUserFeedback(e.target.value)}
                            placeholder={lang === 'hi' ? 'जैसे: ऐप बहुत उपयोगी है...' : 'e.g. Very helpful app...'}
                            className="flex-grow bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-amber-400 focus:bg-white transition"
                        />
                        <button
                            type="button"
                            onClick={() => handleSaveRating(userRating || 5)}
                            disabled={isSavingRating}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
                        >
                            <span>{userRating > 0 ? (lang === 'hi' ? 'अपडेट' : 'Update') : (lang === 'hi' ? 'सबमिट' : 'Submit')}</span>
                        </button>
                    </div>
                </div>

                {ratingSuccessMsg && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-extrabold flex items-center justify-center gap-2 animate-in fade-in">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>{ratingSuccessMsg}</span>
                    </div>
                )}
            </div>

            {/* Custom Book Share Modal */}
            <AnimatePresence>
                {shareModalBook && (
                <div className="fixed inset-0 bg-slate-900/80 z-55 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-5 border-2 border-slate-200 shadow-2xl text-left relative overflow-hidden bg-white text-slate-900">
                        <button 
                            onClick={() => { setShareModalBook(null); setShareCopied(false); }}
                            className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650">
                                <Share2 className="w-4 h-4" />
                            </div>
                            <h3 className="font-black text-slate-900 text-base">
                                {lang === 'hi' ? 'पुस्तक शेयर करें 📚' : 'Share Book 📚'}
                            </h3>
                        </div>

                        {/* Book Preview Card */}
                        <div className="flex gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-200/80 mb-4">
                            <div className="w-16 h-20 bg-white rounded-xl overflow-hidden border border-slate-200 shrink-0 shadow-xs">
                                {shareModalBook.fileData ? (
                                    <img 
                                        src={shareModalBook.fileData} 
                                        alt={shareModalBook.name} 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-violet-50 flex items-center justify-center text-violet-500">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h4 className="font-extrabold text-xs text-slate-900 line-clamp-2 leading-snug">
                                    {shareModalBook.name}
                                </h4>
                                {shareModalBook.description && (
                                    <p className="text-[10px] text-slate-500 font-semibold line-clamp-2 mt-1">
                                        {shareModalBook.description}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Share Platform Buttons */}
                        <div className="space-y-2">
                            {/* WhatsApp Button */}
                            <a 
                                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                                    `📚 *${shareModalBook.name}*\n\n${shareModalBook.description ? shareModalBook.description + '\n\n' : ''}👉 *Book Link / बुक लिंक:* ${shareModalBook.url || window.location.href}\n📲 *Bodhak App Link / बोधक ऐप लिंक:* ${appSettings?.shareAppLink || window.location.origin}\n\nShared via Bodhak App`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-98 cursor-pointer"
                            >
                                <span className="text-base">💬</span>
                                <span>{lang === 'hi' ? 'व्हाट्सएप पर शेयर करें (WhatsApp)' : 'Share via WhatsApp'}</span>
                            </a>

                            {/* Telegram Button */}
                            <a 
                                href={`https://t.me/share/url?url=${encodeURIComponent(shareModalBook.url || window.location.href)}&text=${encodeURIComponent(
                                    `📚 *${shareModalBook.name}*\n${shareModalBook.description ? shareModalBook.description + '\n' : ''}\n👉 *Book Link:* ${shareModalBook.url || window.location.href}\n📲 *Bodhak App Link:* ${appSettings?.shareAppLink || window.location.origin}`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-98 cursor-pointer"
                            >
                                <span className="text-base">✈️</span>
                                <span>{lang === 'hi' ? 'टेलीग्राम पर शेयर करें (Telegram)' : 'Share via Telegram'}</span>
                            </a>

                            {/* Copy Link & Details */}
                            <button
                                onClick={async () => {
                                    const link = shareModalBook.url || window.location.href;
                                    const appUrl = appSettings?.shareAppLink || window.location.origin;
                                    const text = `📚 ${shareModalBook.name}\n${shareModalBook.description ? shareModalBook.description + '\n' : ''}\n👉 Book Link: ${link}\n📲 Bodhak App Link: ${appUrl}`;
                                    try {
                                        await navigator.clipboard.writeText(text);
                                        setShareCopied(true);
                                        setTimeout(() => setShareCopied(false), 2500);
                                    } catch (e) {
                                        console.error("Failed to copy", e);
                                    }
                                }}
                                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition active:scale-98 cursor-pointer"
                            >
                                {shareCopied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-600" />
                                        <span className="text-emerald-700 font-black">
                                            {lang === 'hi' ? 'लिंक व विवरण कॉपी हो गया!' : 'Link & Info Copied!'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 text-slate-600" />
                                        <span>
                                            {lang === 'hi' ? 'लिंक व विवरण कॉपी करें (Instagram/Others)' : 'Copy Link & Info (Instagram/Others)'}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </AnimatePresence>
            {/* Streak Info Modal */}
            <AnimatePresence>
                {showStreakInfoModal && (
                    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh]"
                        >
                            <div className="p-8 pb-4 text-center">
                                <div className="w-16 h-16 bg-orange-100 rounded-2xl mx-auto flex items-center justify-center mb-4 -rotate-3">
                                    <span className="text-3xl">🔥</span>
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 leading-tight">
                                    {lang === 'hi' ? 'डेली स्ट्रैक रिवार्ड्स' : 'Daily Streak Rewards'}
                                </h3>
                                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest leading-relaxed">
                                    {lang === 'hi' ? 'लगातार काम करें और इनाम जीतें!' : 'Keep working to earn big rewards!'}
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                                <div className="bg-orange-50 rounded-3xl p-5 mb-6 border border-orange-100 text-center">
                                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Current Streak</p>
                                    <h4 className="text-4xl font-black text-slate-900">{profile?.streakCount || 0} {lang === 'hi' ? 'दिन' : 'Days'}</h4>
                                </div>

                                <div className="space-y-4">
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-lg font-black text-slate-900 shrink-0">7</div>
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-slate-900">{lang === 'hi' ? '7 दिन का स्ट्रैक' : '7 Day Streak'}</p>
                                            <p className="text-xs font-bold text-indigo-600">{lang === 'hi' ? `इनाम: ${streakSettings.day7 || 50} सिक्के` : `Reward: ${streakSettings.day7 || 50} Coins`}</p>
                                        </div>
                                        {profile?.streakCount >= 7 ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <div className="w-6 h-6 rounded-full border-2 border-slate-200" />}
                                    </div>

                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-lg font-black text-slate-900 shrink-0">15</div>
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-slate-900">{lang === 'hi' ? '15 दिन का स्ट्रैक' : '15 Day Streak'}</p>
                                            <p className="text-xs font-bold text-indigo-600">{lang === 'hi' ? `इनाम: ${streakSettings.day15 || 150} सिक्के` : `Reward: ${streakSettings.day15 || 150} Coins`}</p>
                                        </div>
                                        {profile?.streakCount >= 15 ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <div className="w-6 h-6 rounded-full border-2 border-slate-200" />}
                                    </div>

                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-lg font-black text-slate-900 shrink-0">30</div>
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-slate-900">{lang === 'hi' ? '30 दिन का स्ट्रैक' : '30 Day Streak'}</p>
                                            <p className="text-xs font-bold text-indigo-600">{lang === 'hi' ? `इनाम: ${streakSettings.day30 || 500} सिक्के` : `Reward: ${streakSettings.day30 || 500} Coins`}</p>
                                        </div>
                                        {profile?.streakCount >= 30 ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <div className="w-6 h-6 rounded-full border-2 border-slate-200" />}
                                    </div>
                                </div>

                                <p className="text-[10px] text-slate-400 font-bold mt-6 text-center italic leading-relaxed">
                                    {lang === 'hi' 
                                        ? 'सूचना: एक दिन भी काम न करने पर डेली स्ट्रैक दोबारा 0 से शुरू होगा।' 
                                        : 'Note: Failing to work for even 1 day resets the daily streak to 0.'}
                                </p>
                            </div>

                            <div className="p-6 pt-2">
                                <button 
                                    onClick={() => setShowStreakInfoModal(false)}
                                    className="w-full py-4 bg-orange-600 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all text-xs uppercase tracking-widest"
                                >
                                    {lang === 'hi' ? 'बहुत खूब!' : 'AWESOME!'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Interactive Quiz Runner Modal for Pinned Free Quizzes */}
            {activeQuizFile && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[180] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-100 shadow-2xl overflow-hidden text-left">
                        {(() => {
                            const getCorrectOptionIndex = (q: any): number => {
                                if (!q) return -1;
                                let target = q.correctAnswer ?? q.correct_answer ?? q.correctIndex ?? q.correct_index ?? q.answer ?? q.answerIndex;
                                if (target === undefined || target === null) return -1;
                                
                                if (typeof target === 'number' && target >= 0) return target;
                                
                                if (typeof target === 'string') {
                                    const trimmed = target.trim();
                                    if (/^\d+$/.test(trimmed)) {
                                        const parsed = parseInt(trimmed, 10);
                                        if (parsed >= 0 && parsed < (q.options?.length || 4)) return parsed;
                                    }
                                    if (/^[a-dA-D]$/.test(trimmed)) {
                                        const charCode = trimmed.toUpperCase().charCodeAt(0);
                                        return charCode - 65;
                                    }
                                    if (Array.isArray(q.options)) {
                                        const matchIdx = q.options.findIndex((opt: string) => 
                                            opt && opt.trim().toLowerCase() === trimmed.toLowerCase()
                                        );
                                        if (matchIdx !== -1) return matchIdx;

                                        const matchIdxClean = q.options.findIndex((opt: string) => {
                                            const cleanOpt = opt.replace(/^[A-Da-d0-9][\.\)\:]\s*/, '').trim().toLowerCase();
                                            const cleanTarget = trimmed.replace(/^[A-Da-d0-9][\.\)\:]\s*/, '').trim().toLowerCase();
                                            return cleanOpt === cleanTarget;
                                        });
                                        if (matchIdxClean !== -1) return matchIdxClean;
                                    }
                                }
                                return -1;
                            };

                            let questions: any[] = activeQuizFile.quizData?.questions || [];
                            if (!questions || questions.length === 0) {
                                if (activeQuizFile.fileData) {
                                    try {
                                        let rawStr = activeQuizFile.fileData;
                                        if (rawStr.startsWith('data:')) {
                                            const base64Content = rawStr.split(',')[1];
                                            if (base64Content) {
                                                try {
                                                    rawStr = decodeURIComponent(escape(atob(base64Content)));
                                                } catch (e) {
                                                    rawStr = atob(base64Content);
                                                }
                                            }
                                        }
                                        const parsed = JSON.parse(rawStr);
                                        if (Array.isArray(parsed)) questions = parsed;
                                        else if (parsed.questions) questions = parsed.questions;
                                    } catch (e) {
                                        console.error("Error parsing quiz questions JSON:", e);
                                    }
                                }
                            }

                            return (
                                <>
                                    <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                                                <Award className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-extrabold text-base md:text-lg leading-tight text-amber-300">
                                                    {activeQuizFile.name}
                                                </h3>
                                                <p className="text-[11px] text-slate-300 font-medium">
                                                    {questions.length} Questions • Pinned Study Quiz
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setActiveQuizFile(null)}
                                            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                        {!showQuizResult ? (
                                            (() => {
                                                const q = questions[quizIndex];
                                                if (!q) return (
                                                    <div className="text-center text-slate-500 py-12 space-y-3">
                                                        <p className="font-bold text-base">कोई प्रश्न नहीं मिला / No questions available in this quiz.</p>
                                                        <p className="text-xs text-slate-400">यह क्विज़ संभवतः सही प्रारूप में नहीं था या खाली है।</p>
                                                    </div>
                                                );

                                                const selectedOpt = quizAnswers[quizIndex];
                                                const isAnswered = selectedOpt !== undefined;
                                                const correctIdx = getCorrectOptionIndex(q);

                                                return (
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs font-black text-slate-400 mb-2">
                                                            <span>Question {quizIndex + 1} of {questions.length}</span>
                                                            <span>{Math.round(((quizIndex + 1) / questions.length) * 100)}% Completed</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-6">
                                                            <div 
                                                                className="bg-amber-500 h-full transition-all duration-300"
                                                                style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }}
                                                            />
                                                        </div>

                                                        <h4 className="font-extrabold text-slate-850 text-base md:text-lg mb-5 leading-snug whitespace-pre-wrap">
                                                            {formatQuizText(q.questionText || q.question)}
                                                        </h4>

                                                        <div className="space-y-3">
                                                            {(q.options || []).map((opt: string, optIdx: number) => {
                                                                let btnClass = "border-slate-200 bg-slate-50/70 hover:bg-amber-50/50 text-slate-800";
                                                                if (isAnswered) {
                                                                    if (optIdx === correctIdx) {
                                                                        btnClass = "border-emerald-500 bg-emerald-50 text-emerald-900 font-extrabold";
                                                                    } else if (selectedOpt === optIdx) {
                                                                        btnClass = "border-rose-500 bg-rose-50 text-rose-900 font-extrabold";
                                                                    } else {
                                                                        btnClass = "border-slate-100 bg-slate-50/40 text-slate-400 opacity-60";
                                                                    }
                                                                }

                                                                return (
                                                                    <button
                                                                        key={optIdx}
                                                                        onClick={() => {
                                                                            if (!isAnswered) {
                                                                                setQuizAnswers(prev => ({ ...prev, [quizIndex]: optIdx }));
                                                                            }
                                                                        }}
                                                                        className={`w-full p-4 rounded-2xl border text-left transition flex items-center justify-between font-semibold text-sm cursor-pointer ${btnClass}`}
                                                                    >
                                                                        <div className="flex items-start gap-3">
                                                                            <span className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-xs text-slate-600 shrink-0 mt-0.5">
                                                                                {String.fromCharCode(65 + optIdx)}
                                                                            </span>
                                                                            <span className="whitespace-pre-wrap leading-snug">{opt}</span>
                                                                        </div>
                                                                        {isAnswered && optIdx === correctIdx && (
                                                                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-2" />
                                                                        )}
                                                                        {isAnswered && selectedOpt === optIdx && optIdx !== correctIdx && (
                                                                            <XCircle className="w-5 h-5 text-rose-600 shrink-0 ml-2" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {isAnswered && (q.explanation || (q.points && q.points.length > 0)) && (
                                                            <div className="mt-5 p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs text-indigo-900 leading-relaxed animate-in fade-in space-y-2">
                                                                <span className="font-extrabold block text-indigo-950">💡 Explanation / व्याख्या:</span>
                                                                {q.explanation && <p className="whitespace-pre-wrap">{formatQuizText(q.explanation)}</p>}
                                                                {q.points && Array.isArray(q.points) && q.points.length > 0 && (
                                                                    <div className="pt-2 border-t border-indigo-100/80 space-y-1">
                                                                        {q.points.map((pt: string, pIdx: number) => (
                                                                            <div key={pIdx} className="flex items-start gap-1.5 font-medium">
                                                                                <span className="text-indigo-600 font-bold">•</span>
                                                                                <span className="whitespace-pre-wrap">{pt}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                let correctCount = 0;
                                                questions.forEach((q: any, idx: number) => {
                                                    const correctIdx = getCorrectOptionIndex(q);
                                                    if (quizAnswers[idx] === correctIdx) {
                                                        correctCount++;
                                                    }
                                                });
                                                const percentage = Math.round((correctCount / (questions.length || 1)) * 100);

                                                return (
                                                    <div className="text-center py-6 space-y-5 animate-in fade-in">
                                                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600 border-2 border-amber-300">
                                                            <Award className="w-10 h-10" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-2xl font-black text-slate-900">Quiz Completed! 🎉</h4>
                                                            <p className="text-xs text-slate-500 font-semibold mt-1">Great job attempting this quiz!</p>
                                                        </div>

                                                        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 max-w-sm mx-auto flex items-center justify-around">
                                                            <div>
                                                                <p className="text-[11px] font-black uppercase text-slate-400">Score</p>
                                                                <p className="text-3xl font-black text-amber-600">{percentage}%</p>
                                                            </div>
                                                            <div className="w-px h-10 bg-slate-200" />
                                                            <div>
                                                                <p className="text-[11px] font-black uppercase text-slate-400">Correct</p>
                                                                <p className="text-3xl font-black text-emerald-600">{correctCount} / {questions.length}</p>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => {
                                                                setQuizIndex(0);
                                                                setQuizAnswers({});
                                                                setShowQuizResult(false);
                                                            }}
                                                            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-2xl shadow-md inline-flex items-center gap-2 transition cursor-pointer"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                            <span>Re-attempt Quiz / फिर से हल करें</span>
                                                        </button>
                                                    </div>
                                                );
                                            })()
                                        )}
                                    </div>

                                    {!showQuizResult && questions.length > 0 && (
                                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                            <button
                                                onClick={() => setQuizIndex(prev => Math.max(0, prev - 1))}
                                                disabled={quizIndex === 0}
                                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-white transition cursor-pointer disabled:opacity-40"
                                            >
                                                Previous
                                            </button>

                                            {quizIndex < questions.length - 1 ? (
                                                <button
                                                    onClick={() => setQuizIndex(prev => prev + 1)}
                                                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer"
                                                >
                                                    Next Question
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setShowQuizResult(true)}
                                                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer"
                                                >
                                                    Finish Quiz
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* File / PDF / Image Preview Modal */}
            {activePreviewFile && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[180] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-3xl h-[85vh] flex flex-col border border-slate-100 shadow-2xl overflow-hidden text-left">
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <FileText className="w-5 h-5 text-indigo-400" />
                                <h3 className="font-extrabold text-sm sm:text-base text-slate-100 line-clamp-1">
                                    {activePreviewFile.name}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setActivePreviewFile(null)}
                                className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-grow overflow-auto p-4 bg-slate-100 min-h-[350px]">
                            {activePreviewFile.fileData?.startsWith('data:application/pdf') ? (
                                <iframe 
                                    src={activePreviewFile.fileData} 
                                    className="w-full h-full rounded-2xl border border-slate-200 shadow-xs"
                                    title={activePreviewFile.name}
                                />
                            ) : activePreviewFile.fileData?.startsWith('data:image') ? (
                                <div className="flex items-center justify-center h-full max-h-[70vh]">
                                    <img 
                                        src={activePreviewFile.fileData} 
                                        alt={activePreviewFile.name} 
                                        className="max-w-full max-h-full object-contain rounded-2xl shadow-md"
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                                    <AlertCircle className="w-12 h-12 text-slate-400" />
                                    <p className="text-xs text-slate-500 font-bold text-center">
                                        {lang === 'hi' ? 'फाइल देखें या डाउनलोड करें' : 'View or Download File'}
                                    </p>
                                    {activePreviewFile.fileData && (
                                        <a 
                                            href={activePreviewFile.fileData} 
                                            download={activePreviewFile.fileName || activePreviewFile.name}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition"
                                        >
                                            <Download className="w-4 h-4" />
                                            <span>{lang === 'hi' ? 'डाउनलोड करें' : 'Download File'}</span>
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            {activePreviewFile.fileData && (
                                <a 
                                    href={activePreviewFile.fileData} 
                                    download={activePreviewFile.fileName || activePreviewFile.name}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>{lang === 'hi' ? 'डाउनलोड' : 'Download'}</span>
                                </a>
                            )}
                            <button 
                                onClick={() => setActivePreviewFile(null)}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'बंद करें' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Interactive Note Reader Modal for Pinned Free Notes */}
            {activeNoteFile && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[180] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-100 shadow-2xl overflow-hidden text-left">
                        {(() => {
                            const noteContent = activeNoteFile.noteData?.content || activeNoteFile.fileData || activeNoteFile.url || '';
                            const handwrittenImg = activeNoteFile.noteData?.handwrittenImageUrl || '';
                            const noteSubject = activeNoteFile.noteData?.config?.subject || activeNoteFile.folderName || 'Study Material';

                            return (
                                <>
                                    <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                                                <BookOpen className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-extrabold text-sm sm:text-base leading-tight text-emerald-300">
                                                    {activeNoteFile.name}
                                                </h3>
                                                <p className="text-[11px] text-slate-300 font-medium">
                                                    {noteSubject} • Pinned Study Notes
                                                </p>
                                            </div>
                                        </div>

                                        {/* Template Switcher Pills in Modal */}
                                        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 overflow-x-auto">
                                            {TEMPLATE_OPTIONS.map(tmpl => (
                                                <button
                                                    key={tmpl.id}
                                                    onClick={() => setFreeNoteTemplate(tmpl.id)}
                                                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                                                        freeNoteTemplate === tmpl.id ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-xs' : 'text-slate-300 hover:text-white'
                                                    }`}
                                                >
                                                    <span>{tmpl.icon}</span>
                                                    <span className="hidden sm:inline">{tmpl.name.split(' ')[0]}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (noteContent) {
                                                        navigator.clipboard.writeText(noteContent);
                                                        setNoteCopied(true);
                                                        setTimeout(() => setNoteCopied(false), 2000);
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                                title="Copy Text"
                                            >
                                                {noteCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{noteCopied ? 'Copied!' : 'Copy'}</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    const el = document.getElementById('home-pinned-note-content-area');
                                                    if (!el) return;
                                                    const opt = {
                                                        margin: 10,
                                                        filename: `${activeNoteFile.name.replace(/[^a-zA-Z0-9]/g, '_')}_Notes.pdf`,
                                                        image: { type: 'jpeg' as const, quality: 0.98 },
                                                        html2canvas: { scale: 2, useCORS: true },
                                                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                                                    };
                                                    html2pdf().set(opt).from(el).save();
                                                }}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                                title="Download PDF"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>PDF</span>
                                            </button>

                                            <button 
                                                onClick={() => setActiveNoteFile(null)}
                                                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div id="home-pinned-note-content-area" className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100/70">
                                        <div className="w-full max-w-4xl mx-auto">
                                            <NoteTemplateRenderer 
                                                note={{
                                                    config: activeNoteFile.noteData?.config || { subject: noteSubject, topic: activeNoteFile.name, language: 'English', format: 'Detail' },
                                                    content: noteContent,
                                                    handwrittenImageUrl: handwrittenImg,
                                                    createdAt: activeNoteFile.createdAt
                                                }}
                                                activeTemplate={freeNoteTemplate}
                                                onSelectTemplate={(t) => setFreeNoteTemplate(t)}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                                        <button
                                            onClick={() => setActiveNoteFile(null)}
                                            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                                        >
                                            {lang === 'hi' ? 'बंद करें' : 'Close'}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomeDashboard;
