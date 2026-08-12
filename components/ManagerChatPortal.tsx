import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, 
    User, 
    Send, 
    Loader2, 
    MessageCircle, 
    Check, 
    CheckCheck, 
    Clock, 
    Plus,
    Zap,
    ExternalLink,
    AlertCircle,
    BadgeAlert,
    Trash2,
    Image,
    X,
    ArrowLeft
} from 'lucide-react';
import { collection, addDoc, query, orderBy, limit, getDocs, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../services/firebase';
import { UserProfile } from '../hooks/useAuth';

interface ManagerChatPortalProps {
    accounts: UserProfile[];
}

interface LastMessageInfo {
    text: string;
    createdAt: number;
    isAdminSender: boolean;
}

export const ManagerChatPortal: React.FC<ManagerChatPortalProps> = ({ accounts }) => {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [lastMessages, setLastMessages] = useState<Record<string, LastMessageInfo>>({});
    const [loadingLastMsgs, setLoadingLastMsgs] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 0.6 * 1024 * 1024) {
            alert("Image size should be less than 600KB / चित्र का आकार 600KB से कम होना चाहिए।");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    // List of quick-reply templates for manager
    const QUICK_TEMPLATES = [
        "नमस्ते! बोधक सपोर्ट टीम में आपका स्वागत है। हम आपकी क्या मदद कर सकते हैं? / Hi, welcome to Bodhak support! How can we help you?",
        "आपके अकाउंट में कॉइन्स सफलतापूर्वक जोड़ दिए गए हैं! / Coins have been successfully added to your account!",
        "कृपया भुगतान (Payment) का स्क्रीनशॉट यहाँ साझा करें ताकि हम तुरंत रिचार्ज प्रोसेस कर सकें। / Please share the payment screenshot here so we can process your recharge.",
        "न्यूनतम रिचार्ज ₹50 का है जिसमें आपको 125 कॉइन्स मिलेंगे। / Minimum recharge is ₹50 which gives you 125 coins.",
        "बोधक ऐप को रीस्टार्ट या रिफ्रेश करें, आपका कॉइन बैलेंस अपडेट हो जाएगा। / Restart or refresh Bodhak app, your balance will be updated."
    ];

    // Listen to messages for the SELECTED user in real-time
    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            return;
        }

        setChatLoading(true);
        const messagesColRef = collection(db, 'users', selectedUserId, 'messages');
        const q = query(messagesColRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setMessages(list);
            setChatLoading(false);

            // Scroll to bottom
            setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 80);
        }, (err) => {
            console.error('Error listening to chat messages:', err);
            setChatLoading(false);
        });

        return () => unsubscribe();
    }, [selectedUserId]);

    // Subscribe to the last message of all accounts in real-time to update WhatsApp-style preview and alert manager
    useEffect(() => {
        if (accounts.length === 0) return;

        const unsubscribers: (() => void)[] = [];

        accounts.forEach((acc) => {
            const messagesCol = collection(db, 'users', acc.userId, 'messages');
            const q = query(messagesCol, orderBy('createdAt', 'desc'), limit(1));
            
            const unsub = onSnapshot(q, (snapshot) => {
                if (!snapshot.empty) {
                    const firstMsg = snapshot.docs[0].data();
                    const msgText = firstMsg.text || '';
                    const msgTime = firstMsg.createdAt || 0;
                    const isAdmin = !!firstMsg.isAdminSender;

                    setLastMessages((prev) => {
                        const previousInfo = prev[acc.userId];
                        // If there is a newer message, and it is NOT from admin, play chime & browser notify
                        if (previousInfo && previousInfo.createdAt < msgTime && !isAdmin) {
                            playChime();
                            triggerBrowserNotification(`Bodhak support: New chat from ${acc.name || 'User'}`, msgText || "Sent an attachment");
                        }
                        return {
                            ...prev,
                            [acc.userId]: {
                                text: msgText,
                                createdAt: msgTime,
                                isAdminSender: isAdmin
                            }
                        };
                    });
                }
            }, (error) => {
                console.error(`Error listening to last message for user ${acc.userId}:`, error);
            });
            unsubscribers.push(unsub);
        });

        // Request notifications permission on portal mount
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission().catch(console.error);
            }
        }

        return () => {
            unsubscribers.forEach(u => u());
        };
    }, [accounts]);

    const handleSendMessage = async (textToSend: string) => {
        if (!selectedUserId || (!textToSend.trim() && !selectedImage) || isSending) return;

        setIsSending(true);
        const text = textToSend.trim() || (selectedImage ? "Attachment" : "");
        const imageToSend = selectedImage;

        // Clear input state immediately
        setNewMessageText('');
        setSelectedImage(null);

        try {
            const messagesColRef = collection(db, 'users', selectedUserId, 'messages');
            const msgPayload = sanitizeForFirestore({
                text,
                senderId: 'manager',
                senderName: 'Bodhak Manager',
                isAdminSender: true,
                imageUrl: imageToSend || "",
                createdAt: Date.now()
            });
            await addDoc(messagesColRef, msgPayload);

            // Update local preview state
            setLastMessages(prev => ({
                ...prev,
                [selectedUserId]: {
                    text: text === "Attachment" ? "🖼️ Image" : text,
                    createdAt: Date.now(),
                    isAdminSender: true
                }
            }));
        } catch (err: any) {
            console.error('Error sending manager reply:', err);
            // Revert state inputs on error
            setNewMessageText(text === "Attachment" ? "" : text);
            setSelectedImage(imageToSend);
            alert('Reply could not be sent. Check permissions.');
        } finally {
            setIsSending(false);
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!selectedUserId) return;
        
        try {
            const messageDocRef = doc(db, 'users', selectedUserId, 'messages', messageId);
            await deleteDoc(messageDocRef);
        } catch (error) {
            console.error("Error deleting message:", error);
            alert("Could not delete message / संदेश को हटाया नहीं जा सका।");
        }
    };

    // Filter accounts and order them so those who sent text messages are at the very top
    const chatUsers = accounts.map(acc => {
        const lastMsg = lastMessages[acc.userId];
        return {
            ...acc,
            lastMsgTime: lastMsg?.createdAt || 0,
            lastMsgText: lastMsg?.text || '',
            lastMsgIsAdmin: lastMsg?.isAdminSender || false,
            hasChat: !!lastMsg
        };
    }).filter(user => {
        // Search filter
        const queryNorm = searchQuery.toLowerCase().trim();
        if (!queryNorm) return true;
        return (
            user.name.toLowerCase().includes(queryNorm) ||
            user.email.toLowerCase().includes(queryNorm) ||
            user.mobile.toLowerCase().includes(queryNorm) ||
            user.lastMsgText.toLowerCase().includes(queryNorm)
        );
    }).sort((a, b) => {
        // Priority: Sort users with active chats to the top, then by message date descending
        if (a.hasChat && !b.hasChat) return -1;
        if (!a.hasChat && b.hasChat) return 1;
        return b.lastMsgTime - a.lastMsgTime;
    });

    const selectedUser = accounts.find(a => a.userId === selectedUserId);

    // Grouping of contacts: active chats vs all users
    const hasActiveChats = chatUsers.some(u => u.hasChat);

    return (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl grid grid-cols-1 md:grid-cols-12 h-[650px] animate-in zoom-in-95 duration-200">
            
            {/* Sidebar list on left (4 cols) */}
            <div className={`md:col-span-4 border-r border-slate-200 flex flex-col h-full overflow-hidden bg-slate-50/50 ${selectedUserId !== null ? 'hidden md:flex' : 'flex'}`}>
                {/* Search Header */}
                <div className="p-4 bg-white border-b border-slate-200 space-y-3">
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-indigo-600 animate-bounce" /> WhatsApp-like Support Inbox
                    </h3>
                    <div className="bg-slate-100 hover:bg-slate-200/60 rounded-xl px-3 py-2 flex items-center gap-2 border border-slate-200 transition-all">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search chats, names, or messages..."
                            className="w-full bg-transparent text-xs font-semibold focus:outline-none placeholder:text-slate-400 text-slate-850"
                        />
                    </div>
                </div>

                {/* Users list panel */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-150 custom-scrollbar">
                    {loadingLastMsgs && Object.keys(lastMessages).length === 0 ? (
                        <div className="p-6 text-center text-slate-400 font-bold text-xs flex flex-col items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                            <span>Loading conversation feeds...</span>
                        </div>
                    ) : chatUsers.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                            No matching user chats found / कोई चैट नहीं मिली।
                        </div>
                    ) : (
                        chatUsers.map((userRef) => {
                            const isSelected = selectedUserId === userRef.userId;
                            const hasChat = userRef.hasChat;
                            
                            return (
                                <button
                                    key={userRef.userId}
                                    onClick={() => setSelectedUserId(userRef.userId)}
                                    className={`w-full p-4 flex items-start gap-3 transition text-left cursor-pointer border-l-4 ${
                                        isSelected 
                                            ? 'bg-indigo-50/60 border-indigo-600' 
                                            : 'bg-white hover:bg-slate-50/50 border-transparent'
                                    }`}
                                >
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-250 flex items-center justify-center shrink-0 overflow-hidden text-slate-500 relative">
                                        {userRef.photoURL ? (
                                            <img src={userRef.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                            <User className="w-4.5 h-4.5" />
                                        )}

                                        {/* Activity/Chat indicator dot */}
                                        {hasChat && !userRef.lastMsgIsAdmin && (
                                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                                        )}
                                    </div>

                                    {/* Name and Text */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center justify-between gap-1.5">
                                            <span className="font-extrabold text-slate-800 text-xs truncate">
                                                {userRef.name}
                                            </span>
                                            {userRef.lastMsgTime > 0 && (
                                                <span className="text-[9px] font-bold text-slate-400 font-mono shrink-0">
                                                    {new Date(userRef.lastMsgTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>

                                        {/* Study focus tag */}
                                        {userRef.study && (
                                            <span className="inline-block bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                                📚 {userRef.study}
                                            </span>
                                        )}

                                        {/* Last message preview text */}
                                        <p className={`text-[11px] truncate leading-tight ${
                                            hasChat && !userRef.lastMsgIsAdmin 
                                                ? 'text-slate-900 font-extrabold' 
                                                : 'text-slate-500 font-medium'
                                        }`}>
                                            {hasChat ? (
                                                <span className="flex items-center gap-1">
                                                    {userRef.lastMsgIsAdmin && <CheckCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                                                    <span className="truncate">{userRef.lastMsgText}</span>
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic">No messages sent yet / कोई संदेश नहीं</span>
                                            )}
                                        </p>
                                    </div>
                                    
                                    {/* Quick balance badge */}
                                    <div className="text-right shrink-0">
                                        <span className="text-[10px] font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-1 rounded">
                                            🪙{userRef.coins}
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Chat message pane on right (8 cols) */}
            <div className={`md:col-span-8 flex flex-col h-full bg-slate-50 ${selectedUserId === null ? 'hidden md:flex' : 'flex'}`}>
                {selectedUser ? (
                    <>
                        {/* Selected User Header Banner */}
                        <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm select-none">
                            <div className="flex items-center gap-3">
                                {selectedUserId && (
                                    <button 
                                        onClick={() => setSelectedUserId(null)}
                                        className="md:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer transition mr-1 active:scale-95"
                                        title="Back to list / वापस जाएँ"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                )}
                                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center font-black overflow-hidden relative">
                                    {selectedUser.photoURL ? (
                                        <img src={selectedUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <User className="w-5 h-5 text-indigo-600" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-sm text-slate-800 leading-snug flex items-center gap-1.5">
                                        {selectedUser.name}
                                        <span className="bg-amber-100 border border-amber-250 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                            🪙 {selectedUser.coins} coins
                                        </span>
                                    </h4>
                                    <p className="text-[10px] text-slate-500 font-bold">
                                        Email: {selectedUser.email} {selectedUser.mobile && `| Mob: ${selectedUser.mobile}`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Message history layout */}
                        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar overscroll-contain">
                            {chatLoading && messages.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-450 text-xs font-semibold gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-650" />
                                    <span>Retrieving messages history...</span>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                                    <span className="text-4xl text-slate-300">💬</span>
                                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">No Message Exchange yet</h4>
                                    <p className="text-[11px] text-slate-400 font-semibold max-w-[250px] leading-relaxed">
                                        Send a greeting message or recharge instruction template to initiate the support ticket conversation!
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {messages.map((msgRef) => {
                                        const isAdmin = msgRef.isAdminSender;
                                        return (
                                            <div
                                                key={msgRef.id}
                                                className={`flex flex-col max-w-[85%] ${isAdmin ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                                            >
                                                <div
                                                    className={`px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed border shadow-sm ${
                                                        isAdmin 
                                                            ? 'bg-[#E2F9FC]/80 text-[#004851] rounded-tr-none border-[#B2ECF2]' 
                                                            : 'bg-white text-slate-800 rounded-tl-none border-slate-200'
                                                    }`}
                                                >
                                                    {!isAdmin && (
                                                        <span className="block text-[8px] font-black uppercase text-indigo-605 tracking-wider mb-1">
                                                            {selectedUser.name}
                                                        </span>
                                                    )}
                                                    {/* Optional Image Attachment */}
                                                    {msgRef.imageUrl && (
                                                        <div className="mb-2 max-w-full overflow-hidden rounded-xl border border-slate-100 bg-white">
                                                            <img 
                                                                src={msgRef.imageUrl} 
                                                                alt="attached visual" 
                                                                className="max-h-64 w-full object-contain rounded-xl select-none cursor-pointer hover:opacity-90 transition"
                                                                referrerPolicy="no-referrer"
                                                                onClick={() => {
                                                                    const w = window.open();
                                                                    if (w) {
                                                                        w.document.write(`<img src="${msgRef.imageUrl}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    {msgRef.text && msgRef.text !== "Attachment" && (
                                                        <p className="whitespace-pre-line font-bold">{msgRef.text}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2.5 mt-1.5 px-1 select-none">
                                                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 font-mono uppercase">
                                                        {new Date(msgRef.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {isAdmin && <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />}
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteMessage(msgRef.id)}
                                                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition active:scale-95 cursor-pointer"
                                                        title="Delete message / हमेशा के लिए मिटाएं"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div ref={chatEndRef} className="h-4" />
                        </div>

                        {/* Templates Panel */}
                        <div className="bg-amber-50/50 hover:bg-amber-50/80 border-t border-b border-amber-200/60 p-2.5 transition animate-in fade-in duration-300">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-800 mb-1.5 px-1 flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5 text-amber-500" /> WhatsApp Quick replies / त्वरित सहायता टेम्पलेट:
                            </p>
                            <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-hidden">
                                {QUICK_TEMPLATES.map((tpl, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSendMessage(tpl)}
                                        className="bg-white hover:bg-indigo-600 hover:text-white border border-slate-200 rounded-lg text-[10px] text-slate-700 px-3 py-1.5 font-bold whitespace-nowrap transition cursor-pointer active:scale-95 shadow-xs shrink-0"
                                        title={tpl}
                                    >
                                        Template {i + 1}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Selected Image Thumbnail preview */}
                        {selectedImage && (
                            <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">
                                        🖼️ Reply Attachment Preview
                                    </span>
                                    <div className="w-8 h-8 rounded border border-slate-300 overflow-hidden bg-white">
                                        <img src={selectedImage} alt="thumbnail" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedImage(null)}
                                    className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Message input */}
                        <div className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center">
                            <label className="p-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 rounded-2xl flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer text-slate-550" title="Attach screenshot / पेमेंट स्क्रीनशॉट भेजें">
                                <Image className="w-4.5 h-4.5 text-slate-550" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                            </label>
                            <input
                                type="text"
                                value={newMessageText}
                                onChange={(e) => setNewMessageText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSendMessage(newMessageText);
                                    }
                                }}
                                placeholder={selectedImage ? "Add a caption for image... / उत्तर लिखें..." : "Type WhatsApp support response reply here... / उत्तर यहाँ लिखें..."}
                                className="flex-grow bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-850 px-4 py-3 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-605 focus:border-indigo-605 transition outline-none"
                            />
                            <button
                                onClick={() => handleSendMessage(newMessageText)}
                                disabled={(!newMessageText.trim() && !selectedImage) || isSending}
                                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white shadow-md rounded-2xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                            >
                                {isSending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 select-none">
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center border-2 border-indigo-100 text-3xl shadow-inner animate-pulse">
                            💬
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-700 tracking-tight">Active Support Desk is Online</h3>
                            <p className="text-slate-400 text-xs font-semibold max-w-[325px] mt-1 leading-relaxed">
                                Select a registered Bodhak user from the left pane to view their chat history, send custom replies, or trigger coin-recharge quick layouts.
                            </p>
                        </div>
                    </div>
                )}
            </div>
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
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.1); // A5
        gain2.gain.setValueAtTime(0.12, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.1 + 0.45);
    } catch (e) {
        console.warn('Audio Chime block:', e);
    }
};

const triggerBrowserNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body,
                    icon: '/icon.svg'
                });
            } catch (e) {
                console.warn("Notification error:", e);
            }
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
};

export default ManagerChatPortal;
