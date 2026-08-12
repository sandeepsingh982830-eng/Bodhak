import React, { useState } from 'react';
import { QuizHistoryItem } from '../types';
import { Clock, ChevronRight, FileText, Dumbbell, Play, RotateCcw, Trash2, BookmarkPlus, Loader2, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../services/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';

interface HistoryListProps {
    history: QuizHistoryItem[];
    onSelect: (item: QuizHistoryItem) => void;
    onReattempt: (item: QuizHistoryItem) => void;
    onContinue: (item: QuizHistoryItem) => void;
    onRemove: (id: string) => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, onSelect, onReattempt, onContinue, onRemove }) => {
    const { profile } = useAuth();
    const isManager = profile?.isManager || 
                     ['sandeepsinghchouhan081@gmail.com', 'bodhak355@gmail.com'].includes(profile?.email?.toLowerCase() || '');

    const [saveModalItem, setSaveModalItem] = useState<QuizHistoryItem | null>(null);
    const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string>('new');
    const [newFolderName, setNewFolderName] = useState<string>('');
    const [materialTitle, setMaterialTitle] = useState<string>('');
    const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const handleOpenSaveModal = async (item: QuizHistoryItem) => {
        setSaveModalItem(item);
        setMaterialTitle(`${item.config.subject || 'Quiz'}${item.config.topic ? ` - ${item.config.topic}` : ''}`);
        setLoadingFolders(true);
        try {
            const snap = await getDocs(collection(db, 'freeMaterials'));
            const list = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Folder' }));
            setFolders(list);
            if (list.length > 0) {
                setSelectedFolderId(list[0].id);
            } else {
                setSelectedFolderId('new');
                setNewFolderName('Free Quizzes & Notes');
            }
        } catch (err) {
            console.error("Error loading freeMaterials folders:", err);
            setSelectedFolderId('new');
            setNewFolderName('Free Quizzes & Notes');
        } finally {
            setLoadingFolders(false);
        }
    };

    const handleSaveToFreeMaterial = async () => {
        if (!saveModalItem) return;
        if (!materialTitle.trim()) {
            alert("Please enter a title for the study material.");
            return;
        }

        setSaving(true);
        try {
            let targetFolderId = selectedFolderId;
            if (targetFolderId === 'new') {
                const folderName = newFolderName.trim() || 'Free Quizzes & Notes';
                const folderRef = await addDoc(collection(db, 'freeMaterials'), {
                    name: folderName,
                    description: 'Free Quizzes and Notes',
                    createdAt: Date.now(),
                    createdBy: profile?.userId || 'manager'
                });
                targetFolderId = folderRef.id;
            }

            await addDoc(collection(db, 'freeMaterials', targetFolderId, 'files'), {
                name: materialTitle.trim(),
                type: 'quiz',
                createdAt: Date.now(),
                quizData: {
                    config: saveModalItem.config,
                    questions: saveModalItem.questions
                }
            });

            setSaveModalItem(null);
            setToastMessage("Quiz saved to Free Study Material successfully! / क्विज़ फ्री स्टडी मटीरियल में सेव हो गया है!");
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err: any) {
            console.error("Error saving quiz to free materials:", err);
            alert("Failed to save quiz to Free Study Material: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[55vh] text-slate-400 animate-in fade-in">
                <div className="p-5 bg-slate-100 rounded-full mb-3">
                    <Clock className="h-10 w-10 md:h-12 md:w-12 opacity-60 text-indigo-500" />
                </div>
                <p className="text-base md:text-lg text-slate-700 font-semibold">No quiz history yet.</p>
                <p className="text-xs md:text-sm mt-1 text-slate-450 font-medium">Create your first quiz to get started.</p>
            </div>
        );
    }

    return (
        <div className="p-3 w-full max-w-6xl mx-auto animate-in slide-in-from-bottom-4 text-slate-800 relative">
            {toastMessage && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle className="w-5 h-5 text-emerald-300" />
                    <span>{toastMessage}</span>
                </div>
            )}

            <h2 className="text-lg md:text-xl font-bold text-slate-800 mb-4 px-2 md:px-0">Recent Quizzes</h2>
            <div className="grid grid-cols-1 gap-3">
                {history.map((item) => {
                    const isObjective = item.config.type === 'objective';
                    const scoreDisplay = isObjective 
                        ? `${item.score}/${item.questions.length}`
                        : `${item.score}%`;

                    return (
                        <div key={item.id} className="relative group">
                            <div
                                onClick={() => onSelect(item)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        onSelect(item);
                                    }
                                }}
                                className="w-full bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm hover:bg-slate-50/50 hover:border-slate-300 hover:shadow-md transition-all active:scale-[0.99] flex items-center text-left h-full cursor-pointer"
                            >
                                <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-slate-50 flex flex-shrink-0 items-center justify-center mr-3 border border-slate-200 group-hover:border-indigo-500/30 group-hover:bg-indigo-50/50 transition-colors">
                                    {item.config.mode === 'practice' ? (
                                        <Dumbbell className="h-5 w-5 md:h-6 md:w-6 text-emerald-500" />
                                    ) : (
                                        <FileText className="h-5 w-5 md:h-6 md:w-6 text-indigo-500" />
                                    )}
                                </div>
                                
                                <div className="flex-grow min-w-0 font-semibold">
                                    <div className="flex items-center space-x-1.5 mb-1.5">
                                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${isObjective ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-indigo-650 bg-indigo-50 border-indigo-200'}`}>
                                            {item.config.type}
                                        </span>
                                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${item.config.mode === 'practice' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
                                            {item.config.mode}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between pr-3">
                                        <h3 className="font-bold text-slate-800 text-sm md:text-base truncate pr-2 group-hover:text-indigo-600 transition-colors">
                                            {item.config.subject || 'Quiz'}
                                        </h3>
                                        <span className="text-[10px] md:text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-xl border border-indigo-150">
                                            {scoreDisplay}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">{item.config.topic}</p>
                                    
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center text-[10px] text-slate-450 space-x-1.5 font-bold">
                                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg">{item.config.count} Qs</span>
                                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg">{item.config.difficulty}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {isManager && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenSaveModal(item);
                                                    }}
                                                    className="flex items-center gap-1 text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-300 px-2.5 py-0.5 rounded-xl hover:bg-amber-100 transition-colors cursor-pointer"
                                                    title="Save to Free Study Material"
                                                >
                                                    <BookmarkPlus className="h-3 w-3 text-amber-600" />
                                                    <span>Free M. में सेव करें</span>
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemove(item.id);
                                                }}
                                                className="p-1 px-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                title="Remove from history"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                            {!item.isFinished && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onContinue(item);
                                                    }}
                                                    className="flex items-center gap-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-250 px-2.5 py-0.5 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
                                                >
                                                    <Play className="h-3 w-3" />
                                                    Continue
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReattempt(item);
                                                }}
                                                className="flex items-center gap-1 text-[10px] font-extrabold bg-indigo-50 text-indigo-650 border border-indigo-250 px-2.5 py-0.5 rounded-xl hover:bg-indigo-100/80 transition-colors cursor-pointer"
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                                Re-attempt
                                            </button>
                                            <span className="text-[10px] text-slate-400 font-semibold">
                                                {new Date(item.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <ChevronRight className="h-5 w-5 text-slate-350 group-hover:text-indigo-600 transition-colors ml-1.5" />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Save to Free Study Material Modal for Manager */}
            {saveModalItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[160] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md p-6 border border-slate-100 shadow-2xl text-left">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                                <BookmarkPlus className="w-5 h-5 text-amber-500" />
                                <span>फ्री स्टडी मटीरियल में सेव करें 🎁</span>
                            </h3>
                            <button onClick={() => setSaveModalItem(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs font-semibold">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                                    क्विज़ का शीर्षक / Material Title *
                                </label>
                                <input 
                                    type="text" 
                                    value={materialTitle}
                                    onChange={(e) => setMaterialTitle(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="जैसे: Indian Polity - Executive MCQ Quiz"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                                    विषय फोल्डर चुनें / Select Folder *
                                </label>
                                {loadingFolders ? (
                                    <div className="py-2 text-slate-400 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                                        <span>फोल्डर्स लोड हो रहे हैं...</span>
                                    </div>
                                ) : (
                                    <select
                                        value={selectedFolderId}
                                        onChange={(e) => setSelectedFolderId(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                                    >
                                        {folders.map(f => (
                                            <option key={f.id} value={f.id}>📁 {f.name}</option>
                                        ))}
                                        <option value="new">➕ नया विषय/फोल्डर बनाएं (New Subject)</option>
                                    </select>
                                )}
                            </div>

                            {selectedFolderId === 'new' && (
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-amber-600 mb-1">
                                        नए फोल्डर का नाम / New Folder Name *
                                    </label>
                                    <input 
                                        type="text" 
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        className="w-full bg-amber-50/50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                        placeholder="जैसे: Polity, History, Mock Tests"
                                    />
                                </div>
                            )}

                            <p className="text-[11px] text-slate-400 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                                ℹ️ सेव करने पर यह क्विज़ फ्री स्टडी मटीरियल में उपलब्ध हो जाएगा जिसे सभी यूज़र्स हल कर सकेंगे। आपके हिस्ट्री से डिलीट करने पर भी यह फ्री मटीरियल में सेव रहेगा।
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setSaveModalItem(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer"
                            >
                                रद्द करें
                            </button>
                            <button
                                onClick={handleSaveToFreeMaterial}
                                disabled={saving}
                                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                <span>सेव करें</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoryList;