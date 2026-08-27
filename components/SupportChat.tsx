import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, X, MessageSquare, Loader2, Award, Zap, Image, Sparkles, User, HelpCircle } from 'lucide-react';
import { collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { translations, Language } from '../translations';

interface SupportChatProps {
    currentStep?: string;
}

export const SupportChat: React.FC<SupportChatProps> = ({ currentStep }) => {
    const { user, profile, recordDailyActivity } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'ai' | 'support'>('ai');
    
    const lang: Language = profile?.language || 'hi';
    const t = translations[lang];

    // AI Chat State (local, loaded from localStorage for persistence)
    const [aiMessages, setAiMessages] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem('bodhak_ai_chat_history');
            return saved ? JSON.parse(saved) : [
                {
                    id: 'welcome-ai',
                    text: lang === 'hi' 
                        ? 'नमस्ते! मैं बोधक AI सहायक हूँ। 🤖\n\nआप मुझसे किसी भी विषय पर शंका पूछ सकते हैं, प्रश्न की फोटो अपलोड कर सकते हैं, या कॉइन्स से जुड़े सवाल पूछ सकते हैं। मैं आपकी तुरंत मदद करूँगा!' 
                        : 'Hello! I am your Bodhak AI Study Assistant. 🤖\n\nAsk me any study doubts, upload a question screenshot, or query about dynamic coin balances. I will answer you instantly!',
                    isAi: true,
                    createdAt: Date.now()
                }
            ];
        } catch {
            return [];
        }
    });
    
    const [aiInput, setAiInput] = useState('');
    const [aiImage, setAiImage] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Support Chat State (Firestore database real-time synced)
    const [supportMessages, setSupportMessages] = useState<any[]>([]);
    const [supportInput, setSupportInput] = useState('');
    const [supportImage, setSupportImage] = useState<string | null>(null);
    const [isSupportSending, setIsSupportSending] = useState(false);
    const [supportLoading, setSupportLoading] = useState(false);
    const [unreadSupportCount, setUnreadSupportCount] = useState(0);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const supportEndRef = useRef<HTMLDivElement>(null);
    const isOpenRef = useRef(isOpen);

    // Draggable position state for floating AI chat icon
    const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number }>({ startX: 0, startY: 0, initialX: 0, initialY: 0 });
    const hasDraggedRef = useRef(false);

    // Save AI history on change
    useEffect(() => {
        try {
            localStorage.setItem('bodhak_ai_chat_history', JSON.stringify(aiMessages));
        } catch (e) {
            console.warn(e);
        }
    }, [aiMessages]);

    // Handle unread counts & status notifications
    useEffect(() => {
        isOpenRef.current = isOpen;
        if (isOpen && activeTab === 'support') {
            setUnreadSupportCount(0);
        }
    }, [isOpen, activeTab]);

    // Fast handle buy-coin presets
    useEffect(() => {
        const handleOpenSupportChat = (event: Event) => {
            const customEvent = event as CustomEvent;
            setIsOpen(true);
            setActiveTab('support');
            if (customEvent.detail && customEvent.detail.text) {
                setSupportInput(customEvent.detail.text);
            }
        };

        const handleOpenAiChat = () => {
            setIsOpen(true);
            setActiveTab('ai');
        };

        window.addEventListener('open-support-chat', handleOpenSupportChat);
        window.addEventListener('open-ai-chat', handleOpenAiChat);
        return () => {
            window.removeEventListener('open-support-chat', handleOpenSupportChat);
            window.removeEventListener('open-ai-chat', handleOpenAiChat);
        };
    }, []);

    // Subscribe to Firestore Support Messages
    useEffect(() => {
        if (!user) return;

        setSupportLoading(true);
        const messagesColRef = collection(db, 'users', user.uid, 'messages');
        const q = query(messagesColRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded: any[] = [];
            snapshot.forEach((doc) => {
                loaded.push({ id: doc.id, ...doc.data() });
            });
            
            // Check for new incoming support alerts
            if (supportMessages.length > 0 && loaded.length > supportMessages.length) {
                const newMsgs = loaded.slice(supportMessages.length);
                const receivedFromAdmin = newMsgs.filter(m => m.isAdminSender);
                if (receivedFromAdmin.length > 0) {
                    playChime();
                    if (!isOpenRef.current || activeTab !== 'support') {
                        setUnreadSupportCount(prev => prev + receivedFromAdmin.length);
                    }
                }
            }

            setSupportMessages(loaded);
            setSupportLoading(false);
            
            setTimeout(() => {
                supportEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 80);
        }, (error) => {
            console.error('Support snapshot error:', error);
            setSupportLoading(false);
        });

        return () => unsubscribe();
    }, [user, supportMessages.length, activeTab]);

    // Scroll to bottom helper
    useEffect(() => {
        if (isOpen) {
            if (activeTab === 'ai') {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            } else {
                supportEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [isOpen, activeTab, aiMessages.length, supportMessages.length]);

    const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>, target: 'ai' | 'support') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressed = canvas.toDataURL('image/jpeg', 0.82);
                    if (target === 'ai') {
                        setAiImage(compressed);
                    } else {
                        setSupportImage(compressed);
                    }
                } else {
                    // Fallback
                    if (target === 'ai') {
                        setAiImage(dataUrl);
                    } else {
                        setSupportImage(dataUrl);
                    }
                }
            };
            img.onerror = () => {
                // Fallback
                if (target === 'ai') {
                    setAiImage(dataUrl);
                } else {
                    setSupportImage(dataUrl);
                }
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    // AI Doubt Query Trigger
    const handleSendAiMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!aiInput.trim() && !aiImage) || isAiLoading) return;

        const textToSend = aiInput.trim();
        const imageToSend = aiImage;
        const msgId = 'user-' + Date.now();

        // 1. Append User Message
        const userMsg = {
            id: msgId,
            text: textToSend || (lang === 'hi' ? 'संलग्न फोटो का हल' : 'Solve this question'),
            isAi: false,
            imageUrl: imageToSend,
            createdAt: Date.now()
        };
        
        setAiMessages(prev => [...prev, userMsg]);
        setAiInput('');
        setAiImage(null);
        setIsAiLoading(true);

        try {
            // Build the dynamic instruction sets for Gemini
            const systemPrompt = `You are "Bodhak AI", a highly friendly, warm, and expert study buddy and app support assistant for the Bodhak app.
Your key responsibilities:
1. NORMAL CONVERSATION & CHIT-CHAT (नॉर्मल बातचीत):
- Engage in warm, natural conversation. Answer greetings, small talk, jokes, and check-ins (e.g., "hi", "how are you?", "kaise ho", "kya haal hai", "namaste") enthusiastically.
- Ask how their study/preparation is going and keep them motivated as their preparation companion!

2. ABSOLUTE LANGUAGE MATCHING (भाषा मिलान):
- Match the user's language, vocabulary, and writing style exactly.
- If the user writes in Devanagari Hindi, respond in fluent Devanagari Hindi.
- If the user writes in English, respond in English.
- If the user writes in HINGLISH (Hindi using Latin letters/words, e.g., "mujhe quiz play karna hai", "coins kaise buy kare", "aap kaise ho?", "koi issue hai kya"), you MUST reply in natural, friendly, and supportive HINGLISH! Do not reply in pure Devanagari or English - communicate exactly how they speak.

3. SOLVING QUIZZES, QUESTIONS, AND IMAGE RECOGNITION:
- If the user posts/uploads a study question, mock question, or exam question, solve it step-by-step.
- Present solutions with elegant, easy-to-read markdown formatting. Explain concepts clearly.
- CRITICAL: DO NOT use LaTeX formatting or math markers like dollar signs ($ or $$) anywhere in your output. Always express equations, math formulas and values in plain text markdown. (e.g., write "x^2" instead of "$x^2$", write "A = pi * r^2" instead of "$$A = \\pi r^2$$").

4. APP SUPPORT & TROUBLESHOOTING (समस्या समाधान):
- If the user reports any bugs, issues, or has questions about Bodhak App:
  - Coin Balance / Coins: Explain that they can buy coins using the 'Buy Coins / कॉइन्स खरीदें' or 'Buy Now / अभी खरीदें' button at the top bar of the page. Each key study tool (asking doubts, generating quizzes) costs 10 coins.
  - If they face any issue or payment failure, suggest switching to the "Support Team / सहायता टीम" tab at the top of this chat dialog to discuss their issues directly with a human admin/manager.
  - For common glitches: Advise them to try refreshing the page, confirming their internet connection, or checking their profile.`;

            // Build multi-turn conversational chat history payload for continuous chatting memory
            const contentsPayload: any[] = [];
            const relevantMessages = [...aiMessages, userMsg].filter(
                msg => msg.id !== 'welcome-ai' && !msg.isError
            );

            relevantMessages.forEach((msg) => {
                const role = msg.isAi ? 'model' : 'user';
                const parts: any[] = [];

                if (msg.imageUrl) {
                    const match = msg.imageUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
                    if (match) {
                        parts.push({
                            inlineData: {
                                mimeType: match[1],
                                data: match[2]
                            }
                        });
                    }
                }

                if (msg.text) {
                    parts.push({ text: msg.text });
                } else if (msg.imageUrl) {
                    parts.push({ text: lang === 'hi' ? 'कृपया संलग्न फोटो का हल करें।' : 'Please solve this question image.' });
                }

                if (parts.length > 0) {
                    contentsPayload.push({ role, parts });
                }
            });

            const aiResponse = await fetch('/api/gemini/generate-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-3.7-flash',
                    contents: contentsPayload,
                    category: 'other',
                    config: {
                        systemInstruction: systemPrompt
                    }
                })
            });

            if (!aiResponse.ok) {
                throw new Error('Gemini query returned status ' + aiResponse.status);
            }

            const data = await aiResponse.json();
            const rawAiText = data.text || (lang === 'hi' ? 'क्षमा करें, मैं इस प्रश्न का सटीक उत्तर नहीं ढूंढ पाया। कृपया स्पष्ट छवि भेजें।' : 'Sorry, I couldn\'t solve this doubt. Please try again with details.');

            // Programmatically strip LaTeX math dollar sign markers ($ and $$) from response text
            let aiText = rawAiText;
            aiText = aiText.replace(/\$\$/g, '');
            aiText = aiText.replace(/\$/g, '');

            // Append AI response
            setAiMessages(prev => [...prev, {
                id: 'ai-' + Date.now(),
                text: aiText,
                isAi: true,
                createdAt: Date.now()
            }]);

            if (recordDailyActivity) {
                recordDailyActivity('chat');
            }

        } catch (error) {
            console.error('Gemini solver error:', error);
            setAiMessages(prev => [...prev, {
                id: 'ai-error-' + Date.now(),
                text: lang === 'hi' 
                    ? 'कनेक्शन टूटने के कारण उत्तर प्राप्त नहीं हो सका। कृपया पुनः प्रयास करें।' 
                    : 'A connection issue occurred. Please check your internet and try again.',
                isAi: true,
                isError: true,
                createdAt: Date.now()
            }]);
        } finally {
            setIsAiLoading(false);
        }
    };

    // Human Support Query Trigger
    const handleSendSupportMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || (!supportInput.trim() && !supportImage) || isSupportSending) return;

        setIsSupportSending(true);
        const textToSend = supportInput.trim() || (supportImage ? "Attachment" : "");
        const imageToSend = supportImage;
        setSupportInput('');
        setSupportImage(null);

        try {
            const messagesColRef = collection(db, 'users', user.uid, 'messages');
            await addDoc(messagesColRef, {
                text: textToSend,
                senderId: user.uid,
                senderName: profile?.name || user.email || 'Anonymous User',
                isAdminSender: false,
                imageUrl: imageToSend || null,
                createdAt: Date.now()
            });

            setTimeout(() => {
                supportEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 80);
        } catch (err) {
            console.error('Failed to send support message:', err);
            setSupportInput(textToSend === "Attachment" ? "" : textToSend);
            setSupportImage(imageToSend);
            alert('Could not send message. Please try again.');
        } finally {
            setIsSupportSending(false);
        }
    };

    const handleClearAiHistory = () => {
        const welcome = [
            {
                id: 'welcome-ai',
                text: lang === 'hi' 
                    ? 'नमस्ते! मैं बोधक AI सहायक हूँ। 🤖\n\nआप मुझसे किसी भी विषय पर शंका पूछ सकते हैं, प्रश्न की फोटो अपलोड कर सकते हैं, या कॉइन्स से जुड़े सवाल पूछ सकते हैं। मैं आपकी तुरंत मदद करूँगा!' 
                    : 'Hello! I am your Bodhak AI Study Assistant. 🤖\n\nAsk me any study doubts, upload a question screenshot, or query about dynamic coin balances. I will answer you instantly!',
                isAi: true,
                createdAt: Date.now()
            }
        ];
        try {
            localStorage.setItem('bodhak_ai_chat_history', JSON.stringify(welcome));
        } catch (e) {
            console.warn(e);
        }
        setAiMessages(welcome);
        setShowClearConfirm(false);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        const target = e.currentTarget;
        try {
            target.setPointerCapture(e.pointerId);
        } catch {}

        const rect = target.getBoundingClientRect();
        const currentX = btnPos ? btnPos.x : rect.left;
        const currentY = btnPos ? btnPos.y : rect.top;

        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: currentX,
            initialY: currentY
        };
        hasDraggedRef.current = false;
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartRef.current.startX;
        const deltaY = e.clientY - dragStartRef.current.startY;

        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
            hasDraggedRef.current = true;
        }

        const newX = Math.max(10, Math.min(window.innerWidth - 65, dragStartRef.current.initialX + deltaX));
        const newY = Math.max(10, Math.min(window.innerHeight - 65, dragStartRef.current.initialY + deltaY));

        setBtnPos({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!isDragging) return;
        setIsDragging(false);
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}

        if (!hasDraggedRef.current) {
            setActiveTab('ai');
            setIsOpen(true);
        }
    };

    if (!user) {
        return null;
    }

    return (
        <div 
            style={!isOpen && btnPos ? { left: `${btnPos.x}px`, top: `${btnPos.y}px` } : undefined}
            className={`${isOpen ? 'fixed inset-0 z-[150]' : btnPos ? 'fixed z-[140] touch-none select-none' : 'fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[140] touch-none select-none'} font-sans`}
        >
            {/* Floater Trigger Button */}
            {!isOpen && (
                <button
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="h-12 w-12 md:h-14 md:w-14 bg-gradient-to-tr from-indigo-600 via-indigo-700 to-indigo-800 hover:brightness-110 text-white rounded-full flex items-center justify-center shadow-2xl transition-transform active:scale-95 duration-200 relative cursor-grab active:cursor-grabbing border border-white/20 group select-none"
                    title={lang === 'hi' ? 'बोधक AI चैट सहायक 🤖' : 'Bodhak AI Chat Assistant 🤖'}
                >
                    <MessageCircle className="w-6 h-6 md:w-7 md:h-7 text-white animate-[pulse_2s_infinite]" />
                    <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center shadow animate-bounce border border-white">
                        AI
                    </span>
                    {unreadSupportCount > 0 && (
                        <span className="absolute -bottom-1 -left-1 bg-red-650 text-white text-[9px] font-black h-4.5 w-4.5 rounded-full flex items-center justify-center shadow">
                            {unreadSupportCount}
                        </span>
                    )}
                    {/* Tooltip hint */}
                    <div className="absolute right-16 bg-slate-900/90 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition duration-300 whitespace-nowrap shadow-md flex items-center gap-1 pointer-events-none">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>{lang === 'hi' ? 'AI चैट पूछें' : 'Ask AI Chat'}</span>
                    </div>
                </button>
            )}

            {/* Main Chat Overlay Window */}
            {isOpen && (
                <div className="w-full h-full bg-white flex flex-col overflow-hidden animate-in fade-in duration-300">
                    
                    {/* Header with App Logo in Top Corner */}
                    <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between select-none shrink-0 border-b border-indigo-950 shadow-md">
                        <div className="flex items-center gap-2.5">
                            {/* Bodhak App Logo in top corner */}
                            <div className="w-9 h-9 rounded-xl bg-white/10 p-1 border border-white/20 flex items-center justify-center shrink-0 shadow-sm">
                                <img src="/icon.svg" alt="Bodhak Logo" className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5 text-white">
                                    <span>
                                        {activeTab === 'ai' 
                                            ? (lang === 'hi' ? 'बोधक AI चैट असिस्टेंट 🤖' : 'Bodhak AI Chat Assistant 🤖') 
                                            : (lang === 'hi' ? 'बोधक सपोर्ट टीम 💬' : 'Bodhak Support Team 💬')
                                        }
                                    </span>
                                </h3>
                                <p className="text-[9.5px] text-indigo-200 font-bold leading-none mt-0.5">
                                    {activeTab === 'ai' 
                                        ? (lang === 'hi' ? '24x7 डाउट्स और पढ़ाई का AI साथी' : '24x7 AI Study & Doubt Solver') 
                                        : (lang === 'hi' ? 'मैनेजर से सीधी सहायता' : 'Direct Support Desk')
                                    }
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition active:scale-95 cursor-pointer"
                            title={lang === 'hi' ? 'बंद करें' : 'Close'}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                        {activeTab === 'ai' ? (
                            /* AI TAB */
                            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
                                {/* Clear Button */}
                                <div className="flex justify-end">
                                    {showClearConfirm ? (
                                        <div className="flex items-center gap-1.5 bg-red-50 border border-red-150 px-2 py-1 rounded-xl shadow-sm">
                                            <span className="text-[10px] font-black text-red-650">Sure? / मिटाएं?</span>
                                            <button
                                                onClick={handleClearAiHistory}
                                                className="text-[9.5px] bg-red-600 font-extrabold text-white px-2 py-0.5 rounded-lg hover:bg-red-750 transition"
                                            >
                                                Yes
                                            </button>
                                            <button
                                                onClick={() => setShowClearConfirm(false)}
                                                className="text-[9.5px] bg-slate-200 font-extrabold text-slate-700 px-2 py-0.5 rounded-lg hover:bg-slate-300 transition"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setShowClearConfirm(true)}
                                            className="text-[9.5px] font-bold text-slate-400 hover:text-red-500 px-2 py-0.5 rounded border border-slate-200/50 hover:bg-slate-150 transition"
                                        >
                                            {lang === 'hi' ? 'इतिहास मिटाएं 🗑️' : 'Clear History 🗑️'}
                                        </button>
                                    )}
                                </div>

                                {aiMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex flex-col max-w-[85%] ${msg.isAi ? 'mr-auto items-start animate-in fade-in duration-300' : 'ml-auto items-end'}`}
                                    >
                                        <div
                                            className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm border ${
                                                msg.isAi 
                                                    ? 'bg-white text-slate-800 rounded-tl-none border-slate-150' 
                                                    : 'bg-indigo-600 text-white rounded-tr-none border-indigo-650'
                                            }`}
                                        >
                                            {/* AI Header Tag */}
                                            {msg.isAi && (
                                                <div className="flex items-center gap-1.5 mb-1.5 text-[8.5px] font-black text-indigo-600 uppercase tracking-wider">
                                                    <Sparkles className="w-3 h-3 text-amber-500 animate-spin" />
                                                    <span>BODHAK AI WRITER</span>
                                                </div>
                                            )}

                                            {/* Image Attachments */}
                                            {msg.imageUrl && (
                                                <div className="mb-2 max-w-full overflow-hidden rounded-xl bg-white border border-slate-200 shadow-inner">
                                                    <img 
                                                        src={msg.imageUrl} 
                                                        alt="Doubt attachment" 
                                                        className="max-h-48 w-full object-contain rounded-xl select-none"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                </div>
                                            )}

                                            <p className="whitespace-pre-line leading-relaxed text-[11.5px] md:text-xs">
                                                {msg.text}
                                            </p>
                                        </div>
                                        <span className="text-[8.5px] font-bold text-slate-400 mt-1 px-1">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}

                                {isAiLoading && (
                                    <div className="flex flex-col max-w-[80%] mr-auto items-start animate-pulse">
                                        <div className="px-3.5 py-3 rounded-2xl text-xs font-semibold leading-relaxed bg-white text-slate-850 rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                            <span className="text-[11.5px] font-bold text-indigo-900">{t.solvingDoubt}</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                        ) : (
                            /* SUPPORT TAB */
                            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
                                {/* Buy Coins Preset help bar */}
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 flex items-center justify-between shadow-sm shrink-0">
                                    <div className="flex items-center gap-1">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-[9.5px] font-extrabold text-amber-900">{t.quickBuyCoins}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSupportInput("Hi, I want to quickly buy premium exam coins for Bodhak / नमस्ते, मैं बोधक के लिए कॉइन्स खरीदना चाहता हूँ।");
                                            playChime();
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full shadow-sm transition active:scale-95"
                                    >
                                        {t.buyNow}
                                    </button>
                                </div>

                                {supportLoading && supportMessages.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                        <span>Syncing chat...</span>
                                    </div>
                                ) : supportMessages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                                        <HelpCircle className="w-8 h-8 text-indigo-500 animate-bounce" />
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{t.supportDesk}</h4>
                                        <p className="text-[11px] text-slate-500 font-bold max-w-[210px] leading-relaxed">
                                            Write messages, payment receipts, or any other query to our operational managers here.
                                        </p>
                                    </div>
                                ) : (
                                    supportMessages.map((msg) => {
                                        const isMe = !msg.isAdminSender;
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                                            >
                                                <div
                                                    className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm border ${
                                                        isMe 
                                                            ? 'bg-indigo-600 text-white rounded-tr-none border-indigo-650' 
                                                            : 'bg-white text-slate-805 rounded-tl-none border-slate-200'
                                                    }`}
                                                >
                                                    {!isMe && (
                                                        <div className="flex items-center gap-1 mb-1 text-[8px] font-black tracking-widest text-indigo-600 uppercase">
                                                            <Award className="w-3 h-3 text-indigo-500" />
                                                            <span>MANAGER</span>
                                                        </div>
                                                    )}
                                                    {msg.imageUrl && (
                                                        <div className="mb-2 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                                                            <img 
                                                                src={msg.imageUrl} 
                                                                alt="Attached screen" 
                                                                className="max-h-48 w-full object-contain rounded-xl select-none"
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        </div>
                                                    )}
                                                    {msg.text && msg.text !== "Attachment" && (
                                                        <p className="whitespace-pre-line text-[11.5px] md:text-xs">{msg.text}</p>
                                                    )}
                                                </div>
                                                <span className="text-[8.5px] font-bold text-slate-400 mt-1 px-1">
                                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={supportEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Image Attachment Thumbnail Previews */}
                    {activeTab === 'ai' && aiImage && (
                        <div className="px-3.5 py-1.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0 select-none animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-extrabold uppercase flex items-center gap-1">
                                    <Image className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                                    <span>{t.attachImage}</span>
                                </span>
                                <div className="w-7 h-7 rounded border border-slate-300 overflow-hidden bg-white shadow-sm">
                                    <img src={aiImage} alt="" className="w-full h-full object-cover" />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAiImage(null)}
                                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {activeTab === 'support' && supportImage && (
                        <div className="px-3.5 py-1.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0 select-none animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-extrabold uppercase flex items-center gap-1">
                                    <Image className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                                    <span>{t.attachImage}</span>
                                </span>
                                <div className="w-7 h-7 rounded border border-slate-300 overflow-hidden bg-white shadow-sm">
                                    <img src={supportImage} alt="" className="w-full h-full object-cover" />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSupportImage(null)}
                                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Chat Input form triggers */}
                    {activeTab === 'ai' ? (
                        <form onSubmit={handleSendAiMessage} className="p-2.5 bg-white border-t border-slate-200 flex gap-2 items-center shrink-0">
                            <label className="p-2.5 bg-slate-100 border border-slate-200 hover:bg-slate-200/80 rounded-2xl flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer text-slate-600" title={t.attachImage}>
                                <Image className="w-5 h-5 text-indigo-600" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleImageAttach(e, 'ai')}
                                    className="hidden"
                                />
                            </label>
                            <input
                                type="text"
                                value={aiInput}
                                onChange={(e) => setAiInput(e.target.value)}
                                placeholder={aiImage ? t.typeMessage : t.askAnythingPrompt}
                                className="flex-1 bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-slate-900 border border-slate-250 px-3.5 py-2.5 rounded-2xl text-xs md:text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition"
                            />
                            <button
                                type="submit"
                                disabled={(!aiInput.trim() && !aiImage) || isAiLoading}
                                className={`px-4 h-10 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
                                    (!aiInput.trim() && !aiImage) || isAiLoading
                                        ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-70 shadow-none'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
                                }`}
                            >
                                {isAiLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                        <span className="font-black">{lang === 'hi' ? 'भेज रहे हैं...' : 'Sending...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 text-white" />
                                        <span className="font-black text-xs">{lang === 'hi' ? 'भेजें' : 'Send'}</span>
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSendSupportMessage} className="p-2.5 bg-white border-t border-slate-200 flex gap-2 items-center shrink-0">
                            <label className="p-2.5 bg-slate-100 border border-slate-200 hover:bg-slate-200/80 rounded-2xl flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer text-slate-600" title={t.attachImage}>
                                <Image className="w-5 h-5 text-indigo-600" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleImageAttach(e, 'support')}
                                    className="hidden"
                                />
                            </label>
                            <input
                                type="text"
                                value={supportInput}
                                onChange={(e) => setSupportInput(e.target.value)}
                                placeholder={supportImage ? t.typeMessage : t.typeMessage}
                                className="flex-1 bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-slate-900 border border-slate-250 px-3.5 py-2.5 rounded-2xl text-xs md:text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition"
                            />
                            <button
                                type="submit"
                                disabled={(!supportInput.trim() && !supportImage) || isSupportSending}
                                className={`px-4 h-10 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
                                    (!supportInput.trim() && !supportImage) || isSupportSending
                                        ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-70 shadow-none'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
                                }`}
                            >
                                {isSupportSending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                        <span className="font-black">{lang === 'hi' ? 'भेज रहे हैं...' : 'Sending...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 text-white" />
                                        <span className="font-black text-xs">{lang === 'hi' ? 'भेजें' : 'Send'}</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            )}
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

export default SupportChat;
