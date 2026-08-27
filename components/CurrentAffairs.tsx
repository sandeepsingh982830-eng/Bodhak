import React, { useState, useEffect } from 'react';
import { 
    Sparkles, Calendar, Bookmark, BookmarkCheck, Search, Share2, Loader2, 
    Newspaper, ArrowUpRight, Clock, Tag, Brain, ChevronRight, CheckCircle2, 
    XCircle, RotateCcw, Copy, Send, MessageCircle, Check, ChevronDown, ChevronUp, ExternalLink 
} from 'lucide-react';
import { fetchDailyAffairs, fetchSavedAffairs, saveAffair, deleteSavedAffair, CurrentAffair, generateQuiz, QuizQuestion, fetchTheHinduNews } from '../services/currentAffairsService';
import { useAuth } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import { BookRecommendations } from './BookRecommendations';

const renderBoldText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
    return parts.map((part, index) => {
        if (index % 2 === 1) {
            return (
                <strong key={index} className="font-extrabold text-slate-900 border-b-2 border-yellow-300 bg-yellow-100/70 px-1 rounded mx-0.5 shadow-sm">
                    {part}
                </strong>
            );
        }
        return part;
    });
};

interface CurrentAffairsProps {
    initialViewMode?: 'search' | 'saved' | 'the_hindu';
}

const CurrentAffairs: React.FC<CurrentAffairsProps> = ({ initialViewMode }) => {
    const { user, profile, deductCoins, recordDailyActivity } = useAuth();
    const [topic, setTopic] = useState('');
    const [language, setLanguage] = useState<'en' | 'hi'>(() => {
        if (profile?.language === 'hi' || profile?.language === 'en') {
            return profile.language;
        }
        return 'en';
    });
    const [timeRange, setTimeRange] = useState<string>('all');
    const [affairs, setAffairs] = useState<CurrentAffair[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [savedAffairs, setSavedAffairs] = useState<CurrentAffair[]>([]);
    const [viewMode, setViewMode] = useState<'search' | 'saved' | 'the_hindu'>(initialViewMode || 'search');
    const [theHinduArticles, setTheHinduArticles] = useState<CurrentAffair[]>([]);
    const [theHinduLoading, setTheHinduLoading] = useState(false);
    const [expandedHinduIndex, setExpandedHinduIndex] = useState<number | null>(null);
    const [expandAllHindu, setExpandAllHindu] = useState<boolean>(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [shareToast, setShareToast] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            loadSaved();
            if (recordDailyActivity) {
                recordDailyActivity("view");
            }
        }
    }, [user]);

    const loadSaved = async () => {
        if (!user) return;
        try {
            const saved = await fetchSavedAffairs(user.uid);
            setSavedAffairs(saved);
        } catch (err) {
            console.error("Error loading saved affairs:", err);
        }
    };

    const loadTheHinduNews = async (lang: 'en' | 'hi' = language) => {
        setTheHinduLoading(true);
        setError(null);
        setExpandedHinduIndex(null);
        try {
            const data = await fetchTheHinduNews(lang);
            setTheHinduArticles(data);
        } catch (err: any) {
            console.error("Error in loadTheHinduNews:", err);
            setError(err.message || "Failed to load The Hindu study material.");
        } finally {
            setTheHinduLoading(false);
        }
    };

    const isItemSaved = (title: string) => savedAffairs.some(a => a.title === title);

    const toggleSave = async (item: CurrentAffair) => {
        if (!user) {
            alert("Please sign in to save current affairs.");
            return;
        }
        const isSaved = isItemSaved(item.title);
        try {
            if (isSaved) {
                const target = savedAffairs.find(a => a.title === item.title);
                if (target?.id) {
                    await deleteSavedAffair(user.uid, target.id);
                }
            } else {
                await saveAffair(user.uid, item);
            }
            await loadSaved();
        } catch (err) {
            console.error("Error toggling save:", err);
            alert("Failed to update saved affairs.");
        }
    };

    const formatAllHinduDigestText = () => {
        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        let text = `📰 *THE HINDU - UPSC DAILY CURRENT AFFAIRS DIGEST*\n📅 *${today}* | Bodhak AI\n` +
                   `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        theHinduArticles.forEach((item, idx) => {
            text += `🔹 *${idx + 1}. ${item.title}*\n`;
            text += `🏷️ *Category:* ${item.category} | 🏛️ *Source:* ${item.source || 'The Hindu'}\n`;
            if (item.syllabus_tags && item.syllabus_tags.length > 0) {
                text += `📚 *Syllabus:* ${item.syllabus_tags.join(', ')}\n`;
            }
            text += `\n📝 *Comprehensive Context & Analysis / विस्तृत विश्लेषण:*\n${item.description}\n\n`;
            if (item.points && item.points.length > 0) {
                text += `📌 *Key Examination Points / मुख्य बिंदु:*\n`;
                item.points.forEach((pt, pIdx) => {
                    text += `  ${pIdx + 1}. ${pt.replace(/\*\*/g, '')}\n`;
                });
                text += `\n`;
            }
            text += `──────────────────────────\n\n`;
        });

        text += `📲 Prepared with Bodhak Smart Notes & AI Test Prep\n`;
        return text;
    };

    const handleShareAllHindu = async (target: 'whatsapp' | 'telegram' | 'native' | 'copy') => {
        if (theHinduArticles.length === 0) return;
        const text = formatAllHinduDigestText();
        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        if (target === 'whatsapp') {
            const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (target === 'telegram') {
            const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(text)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (target === 'native') {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `The Hindu Daily Current Affairs (${today})`,
                        text: text
                    });
                } catch (err) {
                    console.log('Native share closed/canceled', err);
                }
            } else {
                await navigator.clipboard.writeText(text);
                setShareToast(language === 'hi' ? 'द हिन्दू के सभी 10 समाचार कॉपी हो गए हैं!' : 'All 10 news items copied to clipboard!');
                setTimeout(() => setShareToast(null), 3000);
            }
        } else if (target === 'copy') {
            await navigator.clipboard.writeText(text);
            setShareToast(language === 'hi' ? 'द हिन्दू के सभी 10 समाचार क्लिपबोर्ड पर कॉपी हो गए हैं!' : 'All 10 news items copied to clipboard!');
            setTimeout(() => setShareToast(null), 3000);
        }
    };

    const handleShareSingleItem = (item: CurrentAffair, target: 'whatsapp' | 'telegram') => {
        let text = `📰 *THE HINDU: ${item.title}*\n`;
        text += `🏷️ ${item.category} | ${item.source || 'The Hindu'}\n\n`;
        if (item.syllabus_tags && item.syllabus_tags.length > 0) {
            text += `📚 Syllabus: ${item.syllabus_tags.join(', ')}\n\n`;
        }
        text += `📝 *Analysis:*\n${item.description}\n\n`;
        if (item.points && item.points.length > 0) {
            text += `📌 *Key Points:*\n`;
            item.points.forEach((pt, idx) => {
                text += `${idx + 1}. ${pt.replace(/\*\*/g, '')}\n`;
            });
        }
        text += `\n📲 Bodhak Smart Notes`;

        if (target === 'whatsapp') {
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        } else {
            window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCopyItem = async (item: CurrentAffair, uniqueId: string) => {
        const title = item.title;
        const category = item.category;
        const source = item.source || 'The Hindu';
        const date = item.date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        let contentText = `${title}\n`;
        contentText += `${category} | ${source} | ${date}\n\n`;
        if (item.syllabus_tags && item.syllabus_tags.length > 0) {
            contentText += `Syllabus: ${item.syllabus_tags.join(', ')}\n\n`;
        }
        contentText += `Context & Overview:\n${item.description}\n\n`;

        if (item.points && item.points.length > 0) {
            contentText += `Key Examination Points:\n`;
            item.points.forEach((point, idx) => {
                contentText += `${idx + 1}. ${point.replace(/\*\*/g, '')}\n`;
            });
        }
        contentText += `\nGenerated by Bodhak Smart Notes`;

        try {
            await navigator.clipboard.writeText(contentText);
            setCopiedId(uniqueId);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Clipboard write failed', err);
        }
    };

    // Quiz State
    const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
    const [showQuiz, setShowQuiz] = useState(false);
    const [quizLoading, setQuizLoading] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [quizCompleted, setQuizCompleted] = useState(false);

    useEffect(() => {
        if (profile?.language === 'hi' || profile?.language === 'en') {
            setLanguage(profile.language);
        }
    }, [profile?.language]);

    useEffect(() => {
        if (hasSearched && topic.trim()) {
            loadAffairs(topic.trim());
        }
    }, [language]);

    useEffect(() => {
        if (viewMode === 'the_hindu') {
            loadTheHinduNews(language);
        }
    }, [viewMode, language]);

    useEffect(() => {
        if (initialViewMode) {
            setViewMode(initialViewMode);
        }
    }, [initialViewMode]);

    const loadAffairs = async (searchTopic: string = "", range: string = timeRange) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchDailyAffairs(language, searchTopic, range);
            setAffairs(data);
        } catch (err: any) {
            if (err.message?.includes('offline')) {
                setError("Network error: You appear to be offline.");
            } else if (err.message?.includes('Quota') || err.message?.includes('429')) {
                setError("Server Busy: API limit reached. Please try in 1 minute.");
            } else {
                setError(err.message || "Failed to load current affairs.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTopicSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic.trim()) {
            setError(language === 'hi' ? "कृपया पहले कोई विषय दर्ज करें।" : "Please enter a topic first.");
            return;
        }
        setHasSearched(true);
        loadAffairs(topic.trim());
    };

    const handleStartQuiz = async () => {
        if (affairs.length === 0) return;

        const isUnlimited = profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                const warnMsg = language === 'hi'
                    ? "🪙 अपर्याप्त कॉइन!\n\nसमीक्षा क्विज़ जनरेट करने के लिए आपके पास पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। आपका वर्तमान बैलेंस: " + currentCoins + " कॉइन।"
                    : "🪙 Inadequate Coins!\n\nYou don't have enough coins to generate a quiz (needs 10 coins). Your current balance is " + currentCoins + ".";
                alert(warnMsg);
                return;
            }
        }

        setQuizLoading(true);
        try {
            const success = await deductCoins(10);
            if (!success) {
                alert("Coin deduction failed.");
                setQuizLoading(false);
                return;
            }

            const questions = await generateQuiz(affairs, language);
            setQuiz(questions);
            setShowQuiz(true);
            setCurrentQuestionIndex(0);
            setScore(0);
            setSelectedAnswer(null);
            setShowExplanation(false);
            setQuizCompleted(false);
        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Failed to generate quiz.";
            alert(msg);
        } finally {
            setQuizLoading(false);
        }
    };

    const handleGenerateHinduQuiz = async () => {
        if (theHinduArticles.length === 0) return;

        const isUnlimited = profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                const warnMsg = language === 'hi'
                    ? "🪙 अपर्याप्त कॉइन!\n\nद हिन्दू क्विज़ जनरेट करने के लिए आपके पास पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। आपका वर्तमान बैलेंस: " + currentCoins + " कॉइन।"
                    : "🪙 Inadequate Coins!\n\nYou don't have enough coins to generate The Hindu quiz (needs 10 coins). Your current balance is " + currentCoins + ".";
                alert(warnMsg);
                return;
            }
        }

        setQuizLoading(true);
        try {
            const success = await deductCoins(10);
            if (!success) {
                alert("Coin deduction failed.");
                setQuizLoading(false);
                return;
            }

            // Generate exactly 20 questions based on The Hindu articles
            const questions = await generateQuiz(theHinduArticles, language, 20);
            setQuiz(questions);
            setShowQuiz(true);
            setCurrentQuestionIndex(0);
            setScore(0);
            setSelectedAnswer(null);
            setShowExplanation(false);
            setQuizCompleted(false);
        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Failed to generate 20 questions quiz. Please try again.";
            alert(msg);
        } finally {
            setQuizLoading(false);
        }
    };

    const handleAnswerSelect = (option: string) => {
        if (selectedAnswer) return;
        setSelectedAnswer(option);
        if (option === quiz[currentQuestionIndex].correctAnswer) {
            setScore(s => s + 1);
        }
        setShowExplanation(true);
    };

    const nextQuestion = () => {
        if (currentQuestionIndex < quiz.length - 1) {
            setCurrentQuestionIndex(i => i + 1);
            setSelectedAnswer(null);
            setShowExplanation(false);
        } else {
            setQuizCompleted(true);
        }
    };

    const t = language === 'hi' ? {
        title: 'सामयिकी नोट्स (CA)',
        subtitle: 'आपके विषय के आधार पर गतिशील सामयिकी',
        topicPlaceholder: 'विषय दर्ज करें (जैसे: भारत-अमेरिका संबंध)',
        noResults: 'कोई सामयिकी जानकारी नहीं मिली',
        tryElse: 'अलग विषय खोजने का प्रयास करें या सामान्य समाचारों से अपडेट रहें।',
        fetching: "प्रासंगिक सामयिकी जानकारी खोजी जा रही है...",
        stayUpdated: 'गतिशील ज्ञान मैपर (AI)',
        fetchDesc: 'हमारा AI समाचारों को आपके विशिष्ट विषय के लिए अध्ययन नोट्स में बदलता है।',
        tryAgain: 'पुनः प्रयास करें',
        unableFetch: 'अपडेट प्राप्त करने में असमर्थ',
        learnMore: 'अधिक जानें',
        updatedAt: 'रीयल-टाइम नॉलेज इंजन'
    } : {
        title: 'Current Affairs Notes',
        subtitle: 'Dynamic current affairs based on your topic',
        topicPlaceholder: 'Enter a topic (e.g. India-US Relations)',
        noResults: 'No current affairs found',
        tryElse: 'Try searching for a different topic or stay updated with general news.',
        fetching: "Fetching relevant current affairs...",
        stayUpdated: 'Dynamic Knowledge Mapper',
        fetchDesc: 'Our AI converts news into structured study notes for your specific topic.',
        tryAgain: 'Try Again',
        unableFetch: 'Unable to Fetch Updates',
        learnMore: 'Learn More',
        updatedAt: 'Real-time Knowledge Engine'
    };

    const renderCard = (item: CurrentAffair, idx: number, viewType: string) => {
        const isSaved = isItemSaved(item.title);
        const hasPoints = item.points && item.points.length > 0;
        const hasSyllabus = item.syllabus_tags && item.syllabus_tags.length > 0;
        const isHindu = viewType === 'the_hindu';
        const isExpanded = !isHindu ? true : (expandAllHindu ? (expandedHinduIndex !== -idx - 1) : expandedHinduIndex === idx);

        return (
            <motion.div
                key={`${viewType}-${idx}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className={`bg-white border rounded-2xl p-5 md:p-6 transition-all relative overflow-hidden text-slate-800 shadow-sm ${
                    hasPoints 
                        ? 'border-l-4 border-l-red-600 border-slate-205 hover:shadow-md' 
                        : 'border-slate-205 hover:border-indigo-400'
                }`}
            >
                {/* Card Header & Badges */}
                <div className="flex justify-between items-start gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border ${
                            hasPoints 
                                ? 'bg-red-50 text-red-700 border-red-100' 
                                : 'bg-indigo-50 text-indigo-650 border-indigo-150 animate-pulse'
                        }`}>
                            <Tag className="h-2.5 w-2.5" />
                            {item.category}
                        </span>
                        
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-650 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-slate-200">
                            <Newspaper className={`h-2.5 w-2.5 ${hasPoints ? 'text-red-650' : 'text-indigo-600'}`} />
                            {item.source || 'The Hindu'}
                        </span>
                        
                        <span className="flex items-center gap-1 text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                            <Calendar className="h-2.5 w-2.5" />
                            {item.date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {isHindu && (
                            <>
                                <button
                                    onClick={() => handleShareSingleItem(item, 'whatsapp')}
                                    title="Share to WhatsApp"
                                    className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all border border-emerald-200"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => handleShareSingleItem(item, 'telegram')}
                                    title="Share to Telegram"
                                    className="p-1.5 sm:p-2 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-600 hover:text-white transition-all border border-sky-200"
                                >
                                    <Send className="h-4 w-4" />
                                </button>
                            </>
                        )}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCopyItem(item, `${viewType}-${idx}`);
                            }}
                            title="Copy Note"
                            className={`p-1.5 sm:p-2 rounded-xl transition-all border flex items-center gap-1 ${copiedId === `${viewType}-${idx}` ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-450 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200'}`}
                        >
                            <Copy className="h-4 w-4" />
                            {copiedId === `${viewType}-${idx}` && <span className="text-[10px] font-black uppercase">Copied!</span>}
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSave(item);
                            }}
                            title="Bookmark"
                            className={`p-1.5 sm:p-2 rounded-xl transition-all ${isSaved ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-50 text-slate-450 hover:bg-slate-100 hover:text-slate-850 border border-slate-200'}`}
                        >
                            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
                
                {/* Title */}
                <h3 className={`text-base md:text-lg font-bold leading-tight ${
                    hasPoints 
                        ? 'font-serif text-slate-900' 
                        : 'text-slate-850'
                } ${isHindu ? 'mb-2' : 'mb-3'}`}>
                    <span className="text-red-600 font-sans mr-2 font-black">#{idx + 1}</span>
                    {item.title}
                </h3>

                {/* UPSC GS Syllabus Tags */}
                {hasSyllabus && item.syllabus_tags && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 mb-3">
                        {item.syllabus_tags.map((tag, tagIdx) => (
                            <span key={tagIdx} className="px-2.5 py-0.5 rounded-lg bg-indigo-50/80 text-indigo-750 text-[10px] font-extrabold border border-indigo-150 flex items-center gap-1">
                                📚 {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Collapsible Content Trigger (for The Hindu) */}
                {isHindu && (
                    <div className="flex items-center justify-between my-2 pt-1">
                        <button
                            onClick={() => {
                                if (expandAllHindu) {
                                    setExpandedHinduIndex(expandedHinduIndex === -idx - 1 ? null : -idx - 1);
                                } else {
                                    setExpandedHinduIndex(expandedHinduIndex === idx ? null : idx);
                                }
                            }}
                            className="text-xs font-bold text-red-650 hover:text-red-700 flex items-center gap-1.5 bg-red-50/80 px-3 py-1 rounded-lg border border-red-150 transition-colors"
                        >
                            {isExpanded ? (
                                <>
                                    <span>{language === 'hi' ? 'संक्षिप्त विवरण छुपाएं' : 'Hide Detailed Analysis'}</span>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                </>
                            ) : (
                                <>
                                    <span>{language === 'hi' ? 'विस्तृत विश्लेषण व 5+ बिंदु देखें' : 'View Detailed Analysis & 5+ Points'}</span>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </>
                            )}
                        </button>
                    </div>
                )}

                {isExpanded && (
                    <div className="mt-3 space-y-4">
                        {/* 100+ Words Context & Analytical Overview */}
                        {item.description && (
                            <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-4 text-xs md:text-sm">
                                <div className="text-[11px] font-black uppercase tracking-wider text-amber-900 mb-1.5 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                    {language === 'hi' ? 'विस्तृत संदर्भ व विश्लेषण (Overview)' : 'Detailed Context & Analytical Background'}
                                </div>
                                <p className="text-slate-700 leading-relaxed font-semibold">
                                    {renderBoldText(item.description)}
                                </p>
                            </div>
                        )}

                        {/* Structured 5+ Points with custom badge and bold terms */}
                        {hasPoints && item.points && (
                            <div className="space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs md:text-sm">
                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-red-600" />
                                    {language === 'hi' ? 'मुख्य परीक्षा बिंदु (Minimum 5 Key Points)' : 'Key Examination Points (5+ Structured Points)'}
                                </div>
                                {item.points.map((point, pIdx) => (
                                    <div key={pIdx} className="flex items-start gap-2.5 bg-white p-2.5 rounded-lg border border-slate-150 shadow-2xs">
                                        <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-black flex items-center justify-center text-[10px] mt-0.5 shrink-0 shadow-2xs border border-red-200">
                                            {pIdx + 1}
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-slate-800 font-semibold leading-relaxed">
                                                {renderBoldText(point)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-450 font-bold">
                    <div className="flex items-center gap-1.5">
                        <Clock className={`h-3 w-3 ${hasPoints ? 'text-red-500' : 'text-slate-400'}`} />
                        <span>{hasPoints ? (language === 'hi' ? 'द हिन्दू दैनिक विश्लेषण' : 'The Hindu Daily Analysis') : t.updatedAt}</span>
                    </div>

                    {isHindu && (
                        <span className="text-slate-500 font-bold">
                            {item.points ? `${item.points.length} Points` : ''} • UPSC GS Mains/Prelims
                        </span>
                    )}
                </div>
            </motion.div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 text-slate-850">
            {/* Header section with Topic Search and Language */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 rounded-2xl p-3 shadow-md shadow-indigo-600/10">
                        <Newspaper className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight leading-tight">
                            {t.title}
                        </h1>
                        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-semibold">{t.subtitle}</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Language Switcher */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
                        <button
                            onClick={() => setLanguage('en')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${language === 'en' ? 'bg-white text-indigo-700 shadow-sm border border-slate-205/40' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <span className="text-sm">🇬🇧</span> English
                        </button>
                        <button
                            onClick={() => setLanguage('hi')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${language === 'hi' ? 'bg-white text-indigo-700 shadow-sm border border-slate-205/40' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <span className="text-sm">🇮🇳</span> हिंदी
                        </button>
                    </div>

                    {/* View mode Switcher */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
                        <button
                            onClick={() => setViewMode('search')}
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${viewMode === 'search' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {language === 'hi' ? 'खोजें' : 'SEARCH'}
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('the_hindu');
                                if (theHinduArticles.length === 0) {
                                    loadTheHinduNews();
                                }
                            }}
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${viewMode === 'the_hindu' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Newspaper className="w-3.5 h-3.5" />
                            THE HINDU
                        </button>
                        <button
                            onClick={() => setViewMode('saved')}
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${viewMode === 'saved' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {language === 'hi' ? 'सुरक्षित' : 'SAVED'}
                        </button>
                    </div>

                    {/* Today CA Button */}
                    <button 
                        onClick={() => {
                            setTimeRange('today');
                            setViewMode('search');
                            setTopic('');
                            loadAffairs('', 'today');
                        }}
                        className={`px-4 py-2 rounded-2xl text-[10px] md:text-xs font-black transition-all flex items-center gap-2 border shadow-sm ${
                            timeRange === 'today' 
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-200' 
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        <Newspaper className="w-3.5 h-3.5" />
                        <span>TODAY CA </span>
                    </button>
                </div>
            </div>

            {/* Topic Input Form */}
            {viewMode === 'search' && (
                <form onSubmit={handleTopicSearch} className="flex gap-2">
                    <div className="relative flex-1 group">
                        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-500/60 group-focus-within:text-indigo-600 transition-colors" />
                        <input
                            type="text"
                            placeholder={t.topicPlaceholder}
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-slate-800 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-400 font-bold shadow-sm"
                        />
                    </div>
                    <button 
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-2xl font-black transition-all shadow-md shadow-indigo-600/10 active:scale-95 text-xs md:text-sm"
                    >
                        GET NOTES
                    </button>
                </form>
            )}

            {topic && <BookRecommendations topic={topic} />}

            {/* Content Area */}
            <div className="space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-250 rounded-3xl p-6 text-center">
                        <div className="flex justify-center mb-3">
                            <div className="bg-red-100 p-2.5 rounded-full text-red-600">
                                <Clock className="h-6 w-6" />
                            </div>
                        </div>
                        <h3 className="text-slate-800 font-extrabold mb-1">{t.unableFetch}</h3>
                        <p className="text-red-600 text-xs md:text-sm mb-4 font-semibold">{error}</p>
                        <button 
                            onClick={() => loadAffairs(topic)}
                            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm"
                        >
                            {t.tryAgain}
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
                        <p className="text-slate-450 font-mono text-sm animate-pulse font-bold">{t.fetching}</p>
                    </div>
                ) : (viewMode === 'search' && !hasSearched) ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <div className="w-16 h-16 bg-indigo-50 text-indigo-505 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-150">
                            <Sparkles className="h-8 w-8 animate-pulse text-indigo-500" />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold text-slate-800">
                            {language === 'hi' ? "विषय-वार नोट्स प्राप्त करें" : "Generate Topic-wise Notes"}
                        </h3>
                        <p className="text-slate-500 text-xs md:text-sm mt-2 max-w-sm mx-auto leading-relaxed px-4 font-semibold">
                            {language === 'hi'
                                ? "ऊपर दिए गए बॉक्स में कोई भी विषय (जैसे: भारत-अमेरिका संबंध, वित्तीय बजट 2026) दर्ज करें और विस्तृत नोट्स प्राप्त करने के लिए 'GET NOTES' पर क्लिक करें।"
                                : "Enter any topic (e.g. India-US Relations, Union Budget 2026) in the field above and click 'GET NOTES' to generate detailed, curated study notes."}
                        </p>
                    </div>
                ) : (viewMode === 'search' && affairs.length === 0) ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <Search className="h-8 w-8" />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold text-slate-800">{t.noResults}</h3>
                        <p className="text-slate-500 text-xs md:text-sm mt-2 px-4 font-semibold">{t.tryElse}</p>
                    </div>
                ) : (viewMode === 'saved' && savedAffairs.length === 0) ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-250 shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <Bookmark className="h-8 w-8" />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold text-slate-650">No saved notes yet</h3>
                        <p className="text-slate-450 text-xs md:text-sm mt-2 px-4 font-semibold">Saved topics will appear here for quick access.</p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {viewMode === 'the_hindu' ? (
                            theHinduLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4 w-full">
                                    <Loader2 className="h-10 w-10 text-red-500 animate-spin" />
                                    <p className="text-slate-500 font-bold text-sm animate-pulse">
                                        
                                    </p>
                                </div>
                            ) : theHinduArticles.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm w-full">
                                    <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-550">
                                        <Newspaper className="h-8 w-8 text-red-650" />
                                    </div>
                                    <h3 className="text-lg md:text-xl font-bold text-slate-800">कोई नोट्स उपलब्ध नहीं हैं</h3>
                                    <p className="text-slate-500 text-xs md:text-sm mt-2 px-4 font-semibold">कृपया पुनः प्रयास करें।</p>
                                    <button 
                                        onClick={() => loadTheHinduNews()}
                                        className="mt-4 px-5 py-2.5 bg-red-650 hover:bg-red-700 bg-red-600 text-white rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm"
                                    >
                                        पुनः प्राप्त करें (Fetch)
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-5 w-full">
                                    {/* The Hindu Sharing & Control Toolbar */}
                                    <div className="bg-gradient-to-r from-red-900 via-slate-900 to-slate-900 text-white p-5 rounded-3xl shadow-md border border-red-800/40 relative overflow-hidden">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-md text-[10px] font-black uppercase tracking-wider">
                                                        THE HINDU DAILY
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-300">
                                                        {theHinduArticles.length} {language === 'hi' ? 'महत्वपूर्ण समाचार व 5+ बिंदु' : 'Curated Articles with 5+ Points'}
                                                    </span>
                                                </div>
                                                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                                                    {language === 'hi' ? 'द हिन्दू दैनिक समाचार डाइजेस्ट' : 'The Hindu Daily UPSC Digest'}
                                                </h3>
                                                <p className="text-xs text-slate-300 font-medium mt-0.5">
                                                    {language === 'hi' 
                                                        ? 'सभी 10 समाचारों को एक साथ अपने WhatsApp, Telegram पर शेयर करें' 
                                                        : 'Share all daily news analysis in 1-click via WhatsApp, Telegram or Copy'}
                                                </p>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                                {/* WhatsApp Share All */}
                                                <button
                                                    onClick={() => handleShareAllHindu('whatsapp')}
                                                    className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                                                    title="Share All to WhatsApp"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                    <span>WhatsApp</span>
                                                </button>

                                                {/* Telegram Share All */}
                                                <button
                                                    onClick={() => handleShareAllHindu('telegram')}
                                                    className="flex-1 sm:flex-none px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                                                    title="Share All to Telegram"
                                                >
                                                    <Send className="w-4 h-4" />
                                                    <span>Telegram</span>
                                                </button>

                                                {/* Native Share / Copy All */}
                                                <button
                                                    onClick={() => handleShareAllHindu('native')}
                                                    className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 backdrop-blur-sm border border-white/20 active:scale-95"
                                                    title="Share All / Copy"
                                                >
                                                    <Share2 className="w-4 h-4" />
                                                    <span className="hidden sm:inline">{language === 'hi' ? 'शेयर' : 'Share All'}</span>
                                                </button>

                                                <button
                                                    onClick={() => handleShareAllHindu('copy')}
                                                    className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 backdrop-blur-sm border border-white/20 active:scale-95"
                                                    title="Copy all 10 items"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                    <span className="hidden sm:inline">{language === 'hi' ? 'सभी कॉपी' : 'Copy All'}</span>
                                                </button>

                                                {/* Expand / Collapse All Toggle */}
                                                <button
                                                    onClick={() => {
                                                        setExpandAllHindu(prev => !prev);
                                                        setExpandedHinduIndex(null);
                                                    }}
                                                    className="px-3 py-2 bg-black/30 hover:bg-black/50 text-slate-200 rounded-xl text-[11px] font-bold border border-white/10 flex items-center gap-1 transition-all"
                                                >
                                                    {expandAllHindu ? (
                                                        <>
                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                            <span>{language === 'hi' ? 'सभी संक्षिप्त करें' : 'Collapse'}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                            <span>{language === 'hi' ? 'सभी विस्तार करें' : 'Expand'}</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Toast Feedback */}
                                        {shareToast && (
                                            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center gap-2 text-xs font-bold text-emerald-300 animate-fadeIn">
                                                <Check className="w-4 h-4" />
                                                <span>{shareToast}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Articles List */}
                                    <div className="space-y-4">
                                        {theHinduArticles.map((item, idx) => renderCard(item, idx, 'the_hindu'))}
                                    </div>
                                    
                                    <div className="flex justify-center pt-6 pb-2">
                                        <button
                                            onClick={handleGenerateHinduQuiz}
                                            disabled={quizLoading}
                                            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                                        >
                                            {quizLoading ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    <span>{language === 'hi' ? '20 प्रश्नों का टेस्ट तैयार हो रहा है...' : 'GENERATING 20 MCQ TEST...'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Brain className="w-5 h-5" />
                                                    <span>{language === 'hi' ? 'आज का द हिन्दू टेस्ट जनरेट करें (20 प्रश्न)' : 'GENERATE TODAY\'S THE HINDU TEST (20 MCQs)'}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )
                        ) : (
                            (viewMode === 'saved' ? savedAffairs : affairs).map((item, idx) => renderCard(item, idx, viewMode))
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Daily stats/footer */}
            {affairs.length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50/50 border border-indigo-150 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm text-slate-800">
                    <div className="flex items-center gap-4">
                        <div className="bg-indigo-600 rounded-xl p-3.5 text-white flex-shrink-0 shadow-md">
                            <Brain className="h-6 w-6" />
                        </div>
                        <div>
                            <h4 className="text-slate-850 font-extrabold">{t.stayUpdated}</h4>
                            <p className="text-slate-500 text-xs mt-1 font-semibold">{t.fetchDesc}</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleStartQuiz}
                        disabled={quizLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-black flex items-center gap-3 shadow-md shadow-indigo-100/80 transition-all active:scale-95 disabled:opacity-50 h-fit text-xs md:text-sm"
                    >
                        {quizLoading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Sparkles className="h-5 w-5" />}
                        <span>{language === 'hi' ? 'ज्ञान का परीक्षण (मॉक टेस्ट)' : 'Check Knowledge (Quiz)'}</span>
                    </button>
                </div>
            )}

            {/* Quiz Overlay */}
            <AnimatePresence>
                {showQuiz && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
                    >
                        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-2xl relative text-slate-800">
                            <button 
                                onClick={() => setShowQuiz(false)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <XCircle className="h-8 w-8" />
                            </button>

                            {!quizCompleted ? (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="bg-indigo-50 text-indigo-650 px-4 py-1.5 rounded-xl text-[11px] font-extrabold border border-indigo-150">
                                            {language === 'hi' ? `प्रश्न ${currentQuestionIndex + 1} / ${quiz.length}` : `Question ${currentQuestionIndex + 1} / ${quiz.length}`}
                                        </div>
                                        <div className="text-slate-450 text-xs font-black tracking-widest font-mono">
                                            {language === 'hi' ? 'स्कोर:' : 'SCORE:'} {score}
                                        </div>
                                    </div>

                                    <h2 className="text-lg md:text-xl font-black text-slate-850 leading-tight">
                                        {quiz[currentQuestionIndex].question}
                                    </h2>

                                    <div className="grid gap-2.5">
                                        {quiz[currentQuestionIndex].options.map((option, idx) => {
                                            const isCorrect = option === quiz[currentQuestionIndex].correctAnswer;
                                            const isSelected = option === selectedAnswer;
                                            
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleAnswerSelect(option)}
                                                    className={`w-full p-4 rounded-xl text-left font-black transition-all border flex justify-between items-center text-xs md:text-sm ${
                                                        !selectedAnswer 
                                                            ? 'bg-slate-50 border-slate-200 hover:border-indigo-400 hover:bg-slate-100/50' 
                                                            : isCorrect 
                                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm' 
                                                                : isSelected 
                                                                    ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-sm' 
                                                                    : 'bg-slate-50 border-slate-200 opacity-50'
                                                    }`}
                                                >
                                                    <span>{option}</span>
                                                    {selectedAnswer && isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-650 flex-shrink-0 ml-2" />}
                                                    {selectedAnswer && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-rose-600 flex-shrink-0 ml-2" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <AnimatePresence>
                                        {showExplanation && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl text-left"
                                            >
                                                <h4 className="text-indigo-650 font-black text-[10px] mb-2 uppercase tracking-widest">{language === 'hi' ? 'स्पष्टीकरण' : 'EXPLANATION'}</h4>
                                                <p className="text-slate-755 text-xs md:text-sm leading-relaxed font-semibold">
                                                    {quiz[currentQuestionIndex].explanation}
                                                </p>
                                                <button 
                                                    onClick={nextQuestion}
                                                    className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 text-xs md:text-sm"
                                                >
                                                    {currentQuestionIndex < quiz.length - 1 
                                                        ? (language === 'hi' ? 'अगला प्रश्न' : 'Next Question') 
                                                        : (language === 'hi' ? 'परिणाम देखें' : 'View Results')}
                                                    <ChevronRight className="h-4 w-4" />
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                <div className="text-center py-6 space-y-6">
                                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-550 border border-indigo-150 shadow-sm">
                                        <Sparkles className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800 mb-1">{language === 'hi' ? 'प्रश्नोत्तरी पूर्ण!' : 'Quiz Completed!'}</h2>
                                        <p className="text-slate-450 font-semibold text-xs md:text-sm">{language === 'hi' ? 'आपका अंतिम स्कोर:' : 'Your final score:'}</p>
                                        <div className="text-5xl font-black text-indigo-600 mt-3 animate-bounce">
                                            {score} <span className="text-xl text-slate-400">/ {quiz.length}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3.5">
                                        <button 
                                            onClick={handleStartQuiz}
                                            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-extrabold py-3.5 rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition-all text-xs md:text-sm shadow-inner"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            {language === 'hi' ? 'पुनः प्रयास करें' : 'Try Again'}
                                        </button>
                                        <button 
                                            onClick={() => setShowQuiz(false)}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3.5 rounded-xl shadow-md transition-all text-xs md:text-sm"
                                        >
                                            {language === 'hi' ? 'बंद करें' : 'Close'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CurrentAffairs;
