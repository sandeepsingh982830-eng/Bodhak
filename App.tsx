
import React, { useState, useEffect, useRef } from 'react';
import { QuizConfig, Question, AppStep, QuizHistoryItem } from './types';
import { generateQuizQuestions, evaluateSubjectiveQuiz } from './services/geminiService';
import { useAuth } from './hooks/useAuth';
import { saveQuizToHistory, getQuizHistory, removeQuizFromHistory } from './services/storageService';
import { X, ClipboardList, Play, FileText, History, Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import ProfileModal from './components/ProfileModal';
import QuizConfigForm from './components/QuizConfigForm';
import QuizQuestion from './components/QuizQuestion';
import QuizResult from './components/QuizResult';
import HistoryList from './components/HistoryList';
import QuestionPalette from './components/QuestionPalette';
import SmartNotes from './components/SmartNotes';
import AnsChak from './components/AnsChak';
import PYQScanner from './components/PYQScanner';
import CurrentAffairs from './components/CurrentAffairs';
import ManagerPortal from './components/ManagerPortal';
import AuthScreen from './components/AuthScreen';
import { BuyMaterial } from './components/BuyMaterial';
import { FreeMaterial } from './components/FreeMaterial';
import HomeDashboard from './components/HomeDashboard';
import { db } from './services/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { translations } from './translations';

const INITIAL_CONFIG: QuizConfig = {
    subject: '',
    topic: '',
    additionalTopics: [],
    topicCounts: [],
    splitTopics: false,
    numTopics: 2,
    difficulty: 'Medium',
    language: 'English',
    type: 'objective',
    count: 5,
    mode: 'test',
    sourceMode: 'exact',
    includeImages: false,
    includeCurrentAffairs: false,
    includePYQ: false,
    negativeMarking: false,
    timeLimit: 10,
    timerEnabled: false,
    marksPerQuestion: 1,
    minQuestionWords: 30, // Default minimum words for question content
    wordLimit: 150, // Default subjective answer word limit
    preserveSourceLanguage: false,
};

const DEFAULT_APP_SETTINGS = {
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
    coupons: [],
    coinPacks: [],
    offerDiscountPct: 0,
    offerExpiresAt: 0
};

const App: React.FC = () => {
    const { user, profile, loading, deductCoins } = useAuth();
    const [step, setStep] = useState<AppStep>('home');
    const [notifications, setNotifications] = useState<any[]>([]);
    const [appSettings, setAppSettings] = useState<any>(DEFAULT_APP_SETTINGS);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'app'), (snap) => {
            if (snap.exists()) {
                setAppSettings((prev: any) => ({ ...DEFAULT_APP_SETTINGS, ...prev, ...snap.data() }));
            }
        }, (error) => {
            console.error('Error listening to app settings:', error);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(10));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setNotifications(list);
        }, (error) => {
            console.error('Error listening to notifications in App:', error);
        });
        return () => unsubscribe();
    }, [user]);

    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [config, setConfig] = useState<QuizConfig>(INITIAL_CONFIG);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
    const [reviewStatus, setReviewStatus] = useState<boolean[]>([]);
    const [visitedStatus, setVisitedStatus] = useState<boolean[]>([]);
    const [quizScore, setQuizScore] = useState<number>(0);
    const [timeTaken, setTimeTaken] = useState<number>(0);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [navDirection, setNavDirection] = useState<'next' | 'prev'>('next');
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<QuizHistoryItem[]>([]);
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(() => {
        return localStorage.getItem('bodhak_current_quiz_id');
    });
    
    const [showPalette, setShowPalette] = useState(true);
    
    // Timer states
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const timerRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);
    const sessionExclusions = useRef<Record<string, string[]>>({});

    useEffect(() => {
        const fetchHistory = async () => {
            const h = await getQuizHistory();
            setHistory(h);
        };
        fetchHistory();
    }, [step]);

    useEffect(() => {
        if (currentQuizId) {
            localStorage.setItem('bodhak_current_quiz_id', currentQuizId);
        } else {
            localStorage.removeItem('bodhak_current_quiz_id');
        }
    }, [currentQuizId]);

    // Save progress helper
    const saveProgress = async (overrides?: Partial<QuizHistoryItem>) => {
        if (!currentQuizId || step !== 'quiz') return;
        
        const data = {
            id: currentQuizId,
            config: overrides?.config || config,
            questions: overrides?.questions || questions,
            userAnswers: overrides?.userAnswers || userAnswers,
            reviewStatus: overrides?.reviewStatus || reviewStatus,
            visitedStatus: overrides?.visitedStatus || visitedStatus,
            lastIndex: overrides?.lastIndex !== undefined ? overrides?.lastIndex : currentQIndex,
            isFinished: overrides?.isFinished !== undefined ? overrides?.isFinished : false,
            feedback: overrides?.feedback !== undefined ? overrides?.feedback : null,
            timeTaken: overrides?.timeTaken !== undefined 
                ? overrides.timeTaken 
                : Math.floor((Date.now() - startTimeRef.current) / 1000),
            score: overrides?.score
        };

        await saveQuizToHistory(data);
    };

    // Handle timer
    useEffect(() => {
        if (step === 'quiz' && config.timerEnabled && timeLeft !== null && timeLeft > 0) {
            timerRef.current = window.setInterval(() => {
                setTimeLeft(prev => {
                    if (prev === null || prev <= 1) {
                        if (timerRef.current) clearInterval(timerRef.current);
                        finishQuiz();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [step, config.timerEnabled, timeLeft]);


    const handleGenerate = async () => {
        const isUnlimited = profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                alert("🪙 Inadequate Coins / अपर्याप्त कॉइन!\n\nYou don't have enough coins to generate a Quiz (needs 10 coins). Your current balance is " + currentCoins + ".\n\nआपके पास मॉक टेस्ट जनरेट करने के लिए पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। वर्तमान बैलेंस: " + currentCoins + " कॉइन। कृपया अधिक कॉइन प्राप्त करने के लिए मैनेजर से संपर्क करें।");
                return;
            }
        }

        setIsLoading(true);
        try {
            const success = await deductCoins(10);
            if (!success) {
                alert("🪙 Coin deduction failed. Please check your balance.");
                setIsLoading(false);
                return;
            }

            // Prepare exclusion list if we have existing questions on the same topic (bypass in exact source mode)
            const isExactPdfMode = Boolean(config.sourceMaterial && config.sourceMode === 'exact');
            const existingTopic = config.topic;
            const previousForTopic = isExactPdfMode ? [] : (sessionExclusions.current[existingTopic] || []);
            
            const configWithExclusions: QuizConfig = {
                ...config,
                excludeQuestions: previousForTopic
            };

            const generatedQuestions = await generateQuizQuestions(configWithExclusions);

            // Update session exclusions
            if (!isExactPdfMode) {
                const newQuestions = generatedQuestions.map(q => q.question);
                sessionExclusions.current[existingTopic] = [...previousForTopic, ...newQuestions];
            }

            setQuestions(generatedQuestions);
            setUserAnswers(new Array(generatedQuestions.length).fill(null));
            setReviewStatus(new Array(generatedQuestions.length).fill(false));
            const initialVisited = new Array(generatedQuestions.length).fill(false);
            initialVisited[0] = true;
            setVisitedStatus(initialVisited);
            
            setCurrentQIndex(0);
            setNavDirection('next');
            if (config.timerEnabled) {
                setTimeLeft(config.timeLimit * 60);
            } else {
                setTimeLeft(null);
            }
            startTimeRef.current = Date.now();
            
            // Save to history immediately
            const initialItem = await saveQuizToHistory({ 
                config, 
                questions: generatedQuestions, 
                userAnswers: new Array(generatedQuestions.length).fill(null), 
                feedback: null, 
                score: 0, 
                lastIndex: 0,
                isFinished: false,
                timeTaken: 0 
            });
            setCurrentQuizId(initialItem.id);
            
            setStep('quiz');
        } catch (error) {
            alert(error instanceof Error ? error.message : "An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswer = (answer: string) => {
        const newAnswers = [...userAnswers];
        newAnswers[currentQIndex] = answer;
        setUserAnswers(newAnswers);
        saveProgress({ userAnswers: newAnswers });
    };

    const handleToggleReview = () => {
        const newReview = [...reviewStatus];
        newReview[currentQIndex] = !newReview[currentQIndex];
        setReviewStatus(newReview);
        saveProgress({ reviewStatus: newReview });
    };

    const markAsVisited = (index: number) => {
        setVisitedStatus(prev => {
            const next = [...prev];
            next[index] = true;
            return next;
        });
    };

    const handleUpdateQuestion = (updatedQuestion: Question) => {
        const newQuestions = [...questions];
        newQuestions[currentQIndex] = updatedQuestion;
        setQuestions(newQuestions);
    };

    const handleNextQuestion = async () => {
        if (currentQIndex < questions.length - 1) {
            const nextIndex = currentQIndex + 1;
            setNavDirection('next');
            setCurrentQIndex(nextIndex);
            
            const nextVisited = [...visitedStatus];
            nextVisited[nextIndex] = true;
            setVisitedStatus(nextVisited);
            
            saveProgress({ lastIndex: nextIndex, visitedStatus: nextVisited });
        } else {
            await finishQuiz();
        }
    };

    const handlePrevQuestion = () => {
        if (currentQIndex > 0) {
            const prevIndex = currentQIndex - 1;
            setNavDirection('prev');
            setCurrentQIndex(prevIndex);
            
            const nextVisited = [...visitedStatus];
            nextVisited[prevIndex] = true;
            setVisitedStatus(nextVisited);
            
            saveProgress({ lastIndex: prevIndex, visitedStatus: nextVisited });
        }
    };

    const goToQuestion = (index: number) => {
        if (index === currentQIndex) return;
        setNavDirection(index > currentQIndex ? 'next' : 'prev');
        setCurrentQIndex(index);
        
        const nextVisited = [...visitedStatus];
        nextVisited[index] = true;
        setVisitedStatus(nextVisited);
        
        saveProgress({ lastIndex: index, visitedStatus: nextVisited });
    };

    const normalize = (s: string | null | undefined) => s?.trim().toLowerCase() || '';

    const finishQuiz = async () => {
        setIsLoading(true);
        if (timerRef.current) clearInterval(timerRef.current);
        const totalTimeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setTimeTaken(totalTimeSpent);
        
        try {
            let score = 0;
            if (config.type === 'objective') {
                if (config.negativeMarking) {
                    score = questions.reduce((acc, q, i) => {
                        if (userAnswers[i] === null) return acc;
                        const isCorrect = normalize(userAnswers[i]) === normalize(q.correct_answer);
                        return acc + (isCorrect ? config.marksPerQuestion : -(config.marksPerQuestion / 3));
                    }, 0);
                    score = Math.max(0, score);
                } else {
                    score = questions.reduce((acc, q, i) => {
                        const isCorrect = normalize(userAnswers[i]) === normalize(q.correct_answer);
                        return acc + (isCorrect ? config.marksPerQuestion : 0);
                    }, 0);
                }
            } else {
                const percentageScore = await evaluateSubjectiveQuiz(questions, userAnswers, config.subject);
                score = (percentageScore / 100) * (questions.length * config.marksPerQuestion);
            }
            setQuizScore(score);
            await saveQuizToHistory({ 
                id: currentQuizId || undefined,
                config, 
                questions, 
                userAnswers, 
                feedback: null, 
                score, 
                isFinished: true,
                timeTaken: totalTimeSpent 
            });
            setStep('result');
            setCurrentQuizId(null); // Clear active quiz
            setTimeLeft(null);
        } catch (error) {
            console.error("Error finishing quiz:", error);
            alert("There was an error submitting your quiz.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleHistorySelect = (item: QuizHistoryItem) => {
        setConfig(item.config);
        setQuestions(item.questions);
        setUserAnswers(item.userAnswers);
        setQuizScore(item.score || 0);
        setTimeTaken(item.timeTaken || 0);
        setStep('result');
    };

    const handleRemoveHistory = async (id: string) => {
        await removeQuizFromHistory(id);
        const h = await getQuizHistory();
        setHistory(h);
    };

    const handleContinue = (item: QuizHistoryItem) => {
        setConfig(item.config);
        setQuestions(item.questions);
        setUserAnswers(item.userAnswers);
        
        // Restore visited and review status
        const resumeIndex = item.lastIndex || 0;
        setVisitedStatus(item.visitedStatus || item.questions.map((_, i) => item.userAnswers[i] !== null || i === resumeIndex));
        setReviewStatus(item.reviewStatus || new Array(item.questions.length).fill(false));
        
        setCurrentQuizId(item.id);
        setCurrentQIndex(resumeIndex);
        setNavDirection('next');
        
        if (item.config.timerEnabled) {
            // Recalculate time left if possible, or just restart last known
            setTimeLeft(item.config.timeLimit * 60 - (item.timeTaken || 0));
        } else {
            setTimeLeft(null);
        }
        startTimeRef.current = Date.now() - (item.timeTaken || 0) * 1000;
        
        setStep('quiz');
    };

    const handleReattempt = async (item: QuizHistoryItem) => {
        setConfig(item.config);
        setQuestions(item.questions);
        setUserAnswers(new Array(item.questions.length).fill(null));
        setReviewStatus(new Array(item.questions.length).fill(false));
        const initialVisited = new Array(item.questions.length).fill(false);
        initialVisited[0] = true;
        setVisitedStatus(initialVisited);
        
        setCurrentQIndex(0);
        setNavDirection('next');
        if (item.config.timerEnabled) {
            setTimeLeft(item.config.timeLimit * 60);
        } else {
            setTimeLeft(null);
        }
        startTimeRef.current = Date.now();
        
        // Save to history immediately
        const initialItem = await saveQuizToHistory({ 
            config: item.config, 
            questions: item.questions, 
            userAnswers: new Array(item.questions.length).fill(null), 
            feedback: null, 
            score: 0, 
            lastIndex: 0,
            isFinished: false,
            timeTaken: 0 
        });
        setCurrentQuizId(initialItem.id);
        
        setStep('quiz');
    };

    const handleReattemptCurrent = async () => {
        setUserAnswers(new Array(questions.length).fill(null));
        setReviewStatus(new Array(questions.length).fill(false));
        const initialVisited = new Array(questions.length).fill(false);
        initialVisited[0] = true;
        setVisitedStatus(initialVisited);
        
        setCurrentQIndex(0);
        setNavDirection('next');
        if (config.timerEnabled) {
            setTimeLeft(config.timeLimit * 60);
        } else {
            setTimeLeft(null);
        }
        startTimeRef.current = Date.now();
        
        // Save to history immediately
        const initialItem = await saveQuizToHistory({ 
            config, 
            questions, 
            userAnswers: new Array(questions.length).fill(null), 
            feedback: null, 
            score: 0, 
            lastIndex: 0,
            isFinished: false,
            timeTaken: 0 
        });
        setCurrentQuizId(initialItem.id);
        
        setStep('quiz');
    };

    const reset = () => {
        setStep('create');
        // Clear current quiz state but preserve configuration
        setQuestions([]);
        setUserAnswers([]);
        setReviewStatus([]);
        setVisitedStatus([]);
        setQuizScore(0);
        setTimeLeft(null);
        setTimeTaken(0);
    };

    const getTitle = () => {
        const lang: 'en' | 'hi' = profile?.language || 'hi';
        const t = translations[lang];
        switch(step) {
            case 'home': return 'Bodhak';
            case 'create': return t.quizGen;
            case 'quiz': return config.subject;
            case 'result': return t.history;
            case 'history': return t.history;
            case 'notes': return t.notes;
            case 'ans-chak': return t.ansChak;
            case 'pyq': return t.pyqScanner;
            case 'current-affairs': return t.currentAffairs;
            case 'manager': return t.managerPortal;
            default: return 'Bodhak';
        }
    };

    useEffect(() => {
        // Auto-resume logic if needed? 
        // For now, let-s just make it available in History
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                    <p className="text-sm font-black text-slate-700 tracking-tight animate-pulse">Loading Bodhak...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <AuthScreen />;
    }

    return (
        <Layout 
            currentStep={step} 
            title={getTitle()}
            onBack={step === 'quiz' || step === 'result' ? reset : (step !== 'home' ? () => setStep('home') : undefined)}
            onProfileClick={() => setIsProfileOpen(true)}
            onNavigate={(s) => {
                setStep(s);
            }}
        >
            <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

            {step === 'home' && (
                <HomeDashboard 
                    onNavigate={(s) => setStep(s)}
                    profile={profile}
                    onBuyCoins={() => {
                        const btn = document.getElementById('coin-pill-button');
                        if (btn) btn.click();
                    }}
                    notifications={notifications}
                    appSettings={appSettings}
                />
            )}

            {step === 'buy-m' && (
                <BuyMaterial 
                    profile={profile} 
                    appSettings={appSettings} 
                />
            )}

            {step === 'free-m' && (
                <FreeMaterial 
                    profile={profile} 
                />
            )}

            {step === 'create' && (
                <div className="relative h-full text-slate-800">
                    {/* Left Sidebar Drawer for History */}
                    <div className={`fixed top-0 left-0 h-full w-full sm:w-[400px] bg-white/95 backdrop-blur-xl border-r border-slate-200/80 z-[100] transform transition-transform duration-300 ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 pt-[env(safe-area-inset-top,20px)] mt-4">
                            <h2 className="text-lg font-bold flex items-center gap-2 pr-2 text-slate-800"><History className="w-5 h-5 text-indigo-600"/> Quiz History</h2>
                            <button onClick={() => setIsHistoryOpen(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition"><X className="w-5 h-5 text-slate-600"/></button>
                        </div>
                        <div className="h-[calc(100%-80px)] overflow-y-auto custom-scrollbar pb-20">
                            <HistoryList 
                                history={history}
                                onSelect={(i) => { handleHistorySelect(i); setIsHistoryOpen(false); }}
                                onReattempt={(i) => { handleReattempt(i); setIsHistoryOpen(false); }}
                                onContinue={(i) => { handleContinue(i); setIsHistoryOpen(false); }}
                                onRemove={handleRemoveHistory}
                            />
                        </div>
                    </div>
                    {/* Dark overlay to close sidebar */}
                    {isHistoryOpen && (
                        <div className="fixed inset-0 bg-slate-900/40 z-[90] cursor-pointer backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}></div>
                    )}

                    <div className="space-y-6 h-full overflow-y-auto custom-scrollbar pb-10">
                        <div className="flex justify-start max-w-4xl mx-auto px-4 w-full">
                            <button 
                                onClick={() => setIsHistoryOpen(true)}
                                className="bg-white hover:bg-slate-50 text-slate-800 px-4 py-2.5 rounded-xl flex items-center gap-2 transition text-sm font-semibold border border-slate-200/85 shadow-sm mt-2"
                            >
                                <History className="w-4 h-4 text-indigo-600" /> <span>Quiz History</span>
                            </button>
                        </div>
                        {currentQuizId && history.find(h => h.id === currentQuizId && !h.isFinished) && (
                        <div className="max-w-xl mx-auto bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-4 md:p-6 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-emerald-500/20 p-2 rounded-xl">
                                        <Play className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-slate-800 font-bold text-sm md:text-base">Ongoing Quiz detected</h3>
                                        <p className="text-slate-500 text-[10px] md:text-xs">Resume where you left off</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        const item = history.find(h => h.id === currentQuizId);
                                        if (item) handleContinue(item);
                                    }}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-sm font-black rounded-xl shadow-md transition-all active:scale-95"
                                >
                                    RESUME
                                </button>
                            </div>
                        </div>
                    )}
                    <QuizConfigForm 
                        config={config} 
                        setConfig={setConfig} 
                        onGenerate={handleGenerate} 
                        isLoading={isLoading} 
                    />
                    </div>
                </div>
            )}

            {step === 'quiz' && questions.length > 0 && (
                <div className="flex flex-col md:flex-row gap-4 h-full max-w-[1600px] mx-auto overflow-hidden relative">
                    {/* Main Quiz Content (Left) */}
                    <div className={`flex-grow overflow-y-auto custom-scrollbar h-full bg-white rounded-3xl border border-slate-200 transition-all duration-300`}>
                        <div className="absolute top-4 right-4 z-[60] md:hidden">
                            <button 
                                onClick={() => setShowPalette(!showPalette)}
                                className="p-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 backdrop-blur-md transition-all shadow-md"
                                title={showPalette ? "Hide Palette" : "Show Palette"}
                            >
                                {showPalette ? (
                                    <X className="h-4 w-4" />
                                ) : (
                                    <ClipboardList className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                        <QuizQuestion 
                            key={currentQIndex}
                            question={questions[currentQIndex]}
                            currentAnswer={userAnswers[currentQIndex]}
                            index={currentQIndex}
                            total={questions.length}
                            onAnswer={handleAnswer}
                            onNext={handleNextQuestion}
                            onPrev={handlePrevQuestion}
                            onUpdateQuestion={handleUpdateQuestion}
                            onToggleReview={handleToggleReview}
                            isMarkedForReview={reviewStatus[currentQIndex]}
                            isSubmitting={isLoading} 
                            mode={config.mode}
                            subject={config.subject}
                            language={config.language}
                            timeLeft={timeLeft}
                            navDirection={navDirection}
                        />
                    </div>

                    {/* Question Palette (Right on Desktop) */}
                    {showPalette && (
                        <div className="hidden md:block w-[320px] shrink-0 animate-in slide-in-from-right duration-300">
                            <QuestionPalette 
                                total={questions.length}
                                currentIndex={currentQIndex}
                                userAnswers={userAnswers}
                                reviewStatus={reviewStatus}
                                visitedStatus={visitedStatus}
                                onSelect={goToQuestion}
                                questions={questions}
                                mode={config.mode}
                            />
                        </div>
                    )}

                    {/* Mobile Bottom Quick Palette */}
                    {showPalette && (
                        <div className="md:hidden w-full pb-6 px-2 animate-in slide-in-from-bottom duration-300">
                            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-2">
                                <div className="flex overflow-x-auto gap-2 p-1 no-scrollbar">
                                    {Array.from({ length: questions.length }).map((_, i) => {
                                        const isAnswered = userAnswers[i] !== null;
                                        const isMarked = reviewStatus[i];
                                        const isVisited = visitedStatus[i];
                                        const isPractice = config.mode === 'practice';
                                        const isWrong = isPractice && isAnswered && questions[i].options && normalize(userAnswers[i]) !== normalize(questions[i].correct_answer);
                                        
                                        let color = "bg-white text-slate-500 border-gray-200";
                                        if (currentQIndex === i) color = "bg-red-50 text-red-700 border-red-700 ring-1 ring-red-700";
                                        else if (isWrong) color = "bg-orange-600 text-white border-orange-700";
                                        else if (isAnswered && isMarked) color = "bg-gradient-to-tr from-indigo-600 to-emerald-600 text-white border-indigo-800";
                                        else if (isMarked) color = "bg-indigo-600 text-white border-indigo-800";
                                        else if (isAnswered) color = "bg-emerald-700 text-white border-emerald-800";
                                        else if (isVisited) color = "bg-red-700 text-white border-red-800";
                                        else color = "bg-gray-400 text-white border-gray-500";

                                        return (
                                            <button 
                                                key={i} 
                                                onClick={() => goToQuestion(i)}
                                                className={`w-10 h-10 md:w-12 md:h-12 rounded flex items-center justify-center text-xs md:text-sm font-bold border shrink-0 transition-transform active:scale-95 ${color}`}
                                            >
                                                {i + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {step === 'result' && (
                <QuizResult 
                    config={config}
                    questions={questions}
                    userAnswers={userAnswers}
                    score={quizScore}
                    timeTaken={timeTaken}
                    onNewQuiz={reset}
                    onReattempt={handleReattemptCurrent}
                    onGenerateSimilar={handleGenerate}
                    isGeneratingSimilar={isLoading}
                />
            )}

            {step === 'notes' && (
                <SmartNotes />
            )}

            {step === 'ans-chak' && (
                <AnsChak />
            )}

            {step === 'pyq' && (
                <PYQScanner />
            )}

            {step === 'current-affairs' && (
                <CurrentAffairs />
            )}

            {step === 'current-affairs-hindu' && (
                <CurrentAffairs initialViewMode="the_hindu" />
            )}

            {step === 'manager' && (
                <ManagerPortal onBack={() => setStep('create')} />
            )}

            {step === 'history' && (
                <HistoryList 
                    history={history}
                    onSelect={handleHistorySelect}
                    onReattempt={handleReattempt}
                    onContinue={handleContinue}
                    onRemove={handleRemoveHistory}
                />
            )}
        </Layout>
    );
};

export default App;
