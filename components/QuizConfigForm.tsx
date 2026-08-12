import React, { useRef, useState } from 'react';
import { QuizConfig, Difficulty, Language, QuestionType, QuizMode, SourceMode } from '../types';
import { Loader2, Zap, Dumbbell, ClipboardList, Image as ImageIcon, X, BookOpen, ChevronUp, ChevronDown, Slash, Type as TypeIcon, Pencil, Newspaper, History, FileText, Cloud } from 'lucide-react';
import { extractTextFromImage } from '../services/geminiService';
import { useAuth } from '../hooks/useAuth';
import GoogleDrivePicker from './GoogleDrivePicker';
import { AnimatePresence } from 'motion/react';

interface QuizConfigFormProps {
    config: QuizConfig;
    setConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
    onGenerate: () => void;
    isLoading: boolean;
}

const QuizConfigForm: React.FC<QuizConfigFormProps> = ({ config, setConfig, onGenerate, isLoading }) => {
    const { accessToken, authorizeDrive } = useAuth();
    const sourceFileInputRef = useRef<HTMLInputElement>(null);
    const pyqFileInputRef = useRef<HTMLInputElement>(null);
    const [isScanningSource, setIsScanningSource] = useState(false);
    const [isScanningPYQ, setIsScanningPYQ] = useState(false);
    const [showSourceOptions, setShowSourceOptions] = useState(false);
    const [showPYQOptions, setShowPYQOptions] = useState(false);
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    const [tempSourceText, setTempSourceText] = useState(config.sourceMaterial || '');
    const [showSourceDrivePicker, setShowSourceDrivePicker] = useState(false);
    const [showPYQDrivePicker, setShowPYQDrivePicker] = useState(false);

    
    const handleChange = (field: keyof QuizConfig, value: any) => {
        setConfig(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'difficulty') {
                if (value === 'Easy') {
                    next.minQuestionWords = 10;
                } else if (value === 'Medium') {
                    next.minQuestionWords = 20;
                } else if (value === 'Hard') {
                    next.minQuestionWords = 30;
                }
            }
            return next;
        });
    };

    const handleDriveFileSelected = async (file: { blob: Blob, name: string, mimeType: string }, isPYQ: boolean) => {
        if (isPYQ) {
            setShowPYQDrivePicker(false);
            setIsScanningPYQ(true);
        } else {
            setShowSourceDrivePicker(false);
            setIsScanningSource(true);
        }

        try {
            const isTextFile = file.mimeType === 'text/plain' || file.name.endsWith('.txt');
            let extractedText = "";

            if (isTextFile) {
                extractedText = await file.blob.text();
            } else {
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file.blob);
                });
                const base64Data = await base64Promise;
                extractedText = await extractTextFromImage(base64Data, file.mimeType);
            }

            if (extractedText) {
                if (isPYQ) {
                    setConfig(prev => ({ 
                        ...prev, 
                        pyqMaterial: (prev.pyqMaterial ? prev.pyqMaterial + '\n\n' : '') + extractedText,
                        pyqFileName: file.name,
                        includePYQ: true
                    }));
                } else {
                    setConfig(prev => ({ 
                        ...prev, 
                        sourceMaterial: (prev.sourceMaterial ? prev.sourceMaterial + '\n\n' : '') + extractedText,
                        sourceFileName: file.name
                    }));
                    setShowSourceOptions(true);
                }
            } else {
                alert("Could not extract content from the Drive file.");
            }
        } catch (err) {
            console.error(err);
            alert("Error processing file from Google Drive");
        } finally {
            if (isPYQ) setIsScanningPYQ(false);
            else setIsScanningSource(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, isPYQ: boolean = false) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const fileList = Array.from(files) as File[];
        const totalSize = fileList.reduce((acc, f) => acc + f.size, 0);

        if (totalSize > 30 * 1024 * 1024) {
            alert("Total files size exceeds 30MB.");
            return;
        }

        if (isPYQ) setIsScanningPYQ(true);
        else setIsScanningSource(true);

        try {
            const extractions = await Promise.all(fileList.map(file => {
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const result = e.target?.result as string;
                        if (!result) return resolve("");
                        const base64Data = result.split(',')[1];
                        const mimeType = result.split(',')[0].split(':')[1].split(';')[0];
                        try {
                            const text = await extractTextFromImage(base64Data, mimeType);
                            resolve(text || "");
                        } catch (err) {
                            console.error(`Error scanning ${file.name}:`, err);
                            resolve("");
                        }
                    };
                    reader.onerror = () => resolve("");
                    reader.readAsDataURL(file);
                });
            }));

            const combinedText = extractions.filter(t => t.trim().length > 0).join('\n\n---\n\n');

            if (combinedText) {
                const fileNameSummary = fileList.length > 1 
                    ? `${fileList.length} files` 
                    : fileList[0].name;
                
                if (isPYQ) {
                    setConfig(prev => ({ 
                        ...prev, 
                        pyqMaterial: (prev.pyqMaterial ? prev.pyqMaterial + '\n\n' : '') + combinedText,
                        pyqFileName: fileNameSummary,
                        includePYQ: true
                    }));
                } else {
                    setConfig(prev => ({ 
                        ...prev, 
                        sourceMaterial: (prev.sourceMaterial ? prev.sourceMaterial + '\n\n' : '') + combinedText,
                        sourceFileName: fileNameSummary
                    }));
                    setShowSourceOptions(true); // Auto-show options when file is first uploaded
                }
            } else {
                alert("Could not extract meaningful content.");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred while processing.");
        } finally {
            if (isPYQ) {
                setIsScanningPYQ(false);
                if (pyqFileInputRef.current) pyqFileInputRef.current.value = '';
            } else {
                setIsScanningSource(false);
                if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
            }
        }
    };

    const removeSourceFile = () => {
        setConfig(prev => ({ 
            ...prev, 
            sourceMaterial: undefined, 
            sourceFileName: undefined 
        }));
        setShowSourceOptions(false);
    };

    const handleSaveSourceText = () => {
        if (tempSourceText.trim()) {
            setConfig(prev => ({ 
                ...prev, 
                sourceMaterial: tempSourceText,
                sourceFileName: 'Manual Entry'
            }));
            setShowSourceOptions(true);
        } else {
            removeSourceFile();
        }
        setIsSourceModalOpen(false);
    };

    const removePYQFile = () => {
        setConfig(prev => ({ ...prev, pyqMaterial: undefined, pyqFileName: undefined, includePYQ: false }));
        setShowPYQOptions(false);
    };

    const canGenerate = config.subject && (
        (config.splitTopics 
            ? (config.topic.trim() && (config.additionalTopics || []).slice(0, (config.numTopics || 2) - 1).every(t => t.trim())) 
            : config.topic.trim()
        ) || 
        config.sourceMaterial || 
        config.pyqMaterial
    );

    const sourceModes: { id: SourceMode; label: string; desc: string }[] = [
        { id: 'exact', label: 'Same Questions / हुबहू प्रश्न', desc: '1:1 Identical copy of text, options & words / पीडीएफ से बिल्कुल हुबहू प्रश्न और विकल्प' },
        { id: 'similar', label: 'Similar Patterns / समान पैटर्न', desc: 'New questions using similar logic and style / उसी तरह के नए प्रश्न बनाएं' },
        { id: 'related', label: 'New Topics / संबंधित विषय', desc: 'New questions based on source context / पीडीएफ के संदर्भ पर आधारित नए प्रश्न' },
    ];

    const isSubjective = config.type === 'subjective';

    return (
        <div className="p-4 space-y-4 w-full max-w-5xl mx-auto animate-in fade-in duration-500 text-slate-800">
            <AnimatePresence>
                {showSourceDrivePicker && accessToken && (
                    <GoogleDrivePicker 
                        accessToken={accessToken}
                        onClose={() => setShowSourceDrivePicker(false)}
                        onFileSelected={(file) => handleDriveFileSelected(file, false)}
                    />
                )}
                {showPYQDrivePicker && accessToken && (
                    <GoogleDrivePicker 
                        accessToken={accessToken}
                        onClose={() => setShowPYQDrivePicker(false)}
                        onFileSelected={(file) => handleDriveFileSelected(file, true)}
                    />
                )}
            </AnimatePresence>
            {/* Top Row: Subject, Count, Language */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6 bg-white p-3 md:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Subject</label>
                    <input 
                        value={config.subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400 text-xs md:text-sm font-semibold" 
                        placeholder="e.g. Astronomy, Coding" 
                    />
                </div>
                <div className="md:col-span-3 bg-white p-3 md:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Count</label>
                    <input 
                        type="number"
                        value={config.count}
                        onChange={(e) => handleChange('count', parseInt(e.target.value) || 0)}
                        className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs md:text-sm font-semibold"
                    />
                </div>
                <div className="md:col-span-3 bg-white p-3 md:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Language</label>
                    <select 
                        value={config.language}
                        onChange={(e) => handleChange('language', e.target.value as Language)}
                        className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all [&>option]:bg-white [&>option]:text-slate-800 cursor-pointer text-xs md:text-sm font-semibold"
                    >
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Punjabi">Punjabi</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {/* Left Column: Topic + Action Buttons */}
                <div className="space-y-4 bg-white p-4 md:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                             <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Topic</label>
                            <div className="flex items-center space-x-2">
                                {config.splitTopics && (
                                    <div className="flex items-center space-x-1.5 bg-slate-50 rounded-lg border border-slate-200/80 p-1">
                                        <label className="text-[9px] text-slate-400 font-black uppercase ml-1">Num</label>
                                        <input 
                                            type="number"
                                            min="2"
                                            max="10"
                                            value={config.numTopics || 2}
                                            onChange={(e) => handleChange('numTopics', Math.max(2, parseInt(e.target.value) || 2))}
                                            className="w-8 bg-transparent text-slate-750 text-[10px] font-black text-center outline-none border-b border-slate-200 focus:border-indigo-500 transition-all"
                                        />
                                        <div className="flex space-x-0.5">
                                            {[2, 3, 4, 5].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => handleChange('numTopics', n)}
                                                    className={`w-5 h-5 flex items-center justify-center text-[9px] font-black rounded transition-all ${
                                                        (config.numTopics || 2) === n 
                                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600'
                                                    }`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <button 
                                    onClick={() => handleChange('splitTopics', !config.splitTopics)}
                                    title="Split Topics"
                                    className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg transition-all border ${
                                        config.splitTopics 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                        : 'bg-slate-50 border-slate-200 text-slate-450 hover:text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <div className={`w-2.5 h-2.5 rounded-full ${config.splitTopics ? 'bg-white' : 'bg-slate-300'}`}></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest">Split</span>
                                </button>
                            </div>
                        </div>
                         {config.splitTopics && (
                             <div className="flex items-center justify-between mt-2.5 ml-1">
                                <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider">
                                    Topic 1
                                </label>
                                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                                    <span className="text-[9px] text-slate-400 font-black uppercase">Quiz</span>
                                    <input 
                                        type="number"
                                        min="1"
                                        value={config.topicCounts?.[0] || ''}
                                        onChange={(e) => {
                                            const newCounts = [...(config.topicCounts || [])];
                                            newCounts[0] = parseInt(e.target.value) || 0;
                                            handleChange('topicCounts', newCounts);
                                        }}
                                        className="w-10 bg-transparent text-slate-750 text-[10px] font-black text-center outline-none"
                                        placeholder={`${Math.ceil(config.count / (config.numTopics || 2))}`}
                                    />
                                </div>
                            </div>
                        )}
                        <textarea 
                            rows={config.splitTopics ? 2 : 3}
                            value={config.topic}
                            onChange={(e) => handleChange('topic', e.target.value)}
                            className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400 resize-none text-xs md:text-sm font-semibold shadow-inner" 
                            placeholder={config.splitTopics ? "Topic 1 details..." : "Type details or upload files via Source button..."} 
                        />
                        
                        {config.splitTopics && Array.from({ length: (config.numTopics || 2) - 1 }).map((_, idx) => (
                            <div key={idx} className="mt-3.5 animate-in slide-in-from-top-2 fade-in duration-300">
                                <div className="flex items-center justify-between mb-1.5 ml-1">
                                    <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider">
                                        Topic {idx + 2}
                                    </label>
                                    <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Quiz</span>
                                        <input 
                                            type="number"
                                            min="1"
                                            value={config.topicCounts?.[idx + 1] || ''}
                                            onChange={(e) => {
                                                const newCounts = [...(config.topicCounts || [])];
                                                newCounts[idx + 1] = parseInt(e.target.value) || 0;
                                                handleChange('topicCounts', newCounts);
                                            }}
                                            className="w-10 bg-transparent text-slate-750 text-[10px] font-black text-center outline-none"
                                            placeholder={`${Math.floor(config.count / (config.numTopics || 2))}`}
                                        />
                                    </div>
                                </div>
                                <textarea 
                                    rows={2}
                                    value={config.additionalTopics?.[idx] || ''}
                                    onChange={(e) => {
                                        const newTopics = [...(config.additionalTopics || [])];
                                        newTopics[idx] = e.target.value;
                                        handleChange('additionalTopics', newTopics);
                                    }}
                                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400 resize-none text-xs md:text-sm font-semibold shadow-inner" 
                                    placeholder={`Topic ${idx + 2} details...`} 
                                />
                            </div>
                        ))}
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Source Button */}
                            <div className="relative">
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            if (config.sourceMaterial) {
                                                setShowSourceOptions(!showSourceOptions);
                                                setShowPYQOptions(false);
                                            } else {
                                                sourceFileInputRef.current?.click();
                                            }
                                        }}
                                        disabled={isScanningSource}
                                        className={`flex items-center px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all border ${
                                            config.sourceFileName 
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm'
                                        } disabled:opacity-50 min-w-[100px] md:min-w-[130px] justify-center group h-[26px] md:h-[34px]`}
                                    >
                                        <div className="flex items-center">
                                            {isScanningSource ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 mr-1.5 animate-spin text-indigo-500" /> : <BookOpen className="h-4 w-4 md:h-5 md:w-5 mr-1.5" />}
                                            <span className="truncate max-w-[60px] md:max-w-[90px]">{config.sourceFileName ? config.sourceFileName : 'Source'}</span>
                                        </div>
                                        {config.sourceFileName ? (
                                            <div className="flex items-center ml-1 border-l border-white/25 pl-1">
                                                {showSourceOptions ? <ChevronUp className="h-4 w-4 md:h-5 md:w-5" /> : <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />}
                                            </div>
                                        ) : null}
                                    </button>
                                    
                                    <button
                                        onClick={() => {
                                            setTempSourceText(config.sourceMaterial || '');
                                            setIsSourceModalOpen(true);
                                        }}
                                        className={`flex items-center px-2 py-1 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] ${
                                            config.sourceFileName === 'Manual Entry'
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                        title="Write Source Text"
                                    >
                                        <Pencil className="h-4 w-4 md:h-5 md:w-5" />
                                    </button>

                                    <button
                                        onClick={async () => {
                                            try {
                                                if (!accessToken) {
                                                    await authorizeDrive();
                                                }
                                                setShowSourceDrivePicker(true);
                                            } catch (err: any) {
                                                console.error("Authorize source drive failed:", err);
                                                alert("Google Drive access is currently resting on verification. You can still use the local files option safely! / गूगल ड्राइव एक्सेस सत्यापन के अधीन है। आप स्थानीय रूप से फाइलों का उपयोग कर सकते हैं!");
                                            }
                                        }}
                                        className={`flex items-center px-2 py-1 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50`}
                                        title="Import Source from Google Drive"
                                    >
                                        <Cloud className="h-4 w-4 md:h-5 md:w-5" />
                                    </button>
                                </div>
                                <input 
                                    type="file" 
                                    ref={sourceFileInputRef} 
                                    className="hidden" 
                                    accept="image/*,application/pdf"
                                    multiple
                                    onChange={handleFileUpload}
                                bags-drive-disabled="true" />
                            </div>

                            {/* Current Affairs Button */}
                            <button
                                onClick={() => handleChange('includeCurrentAffairs', !config.includeCurrentAffairs)}
                                className={`flex items-center px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] min-w-[100px] md:min-w-[130px] justify-center ${
                                    config.includeCurrentAffairs
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Newspaper className="h-4 w-4 md:h-5 md:w-5 mr-1.5" />
                                <span>{config.includeCurrentAffairs ? 'CA ON' : 'Current Affairs'}</span>
                            </button>

                            {/* PYQ Button */}
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        if (config.pyqMaterial) {
                                            setShowPYQOptions(!showPYQOptions);
                                            setShowSourceOptions(false);
                                        } else {
                                            pyqFileInputRef.current?.click();
                                        }
                                    }}
                                    disabled={isScanningPYQ}
                                    className={`flex items-center px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] min-w-[100px] md:min-w-[130px] justify-center ${
                                        config.includePYQ
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                        : config.pyqMaterial
                                        ? 'bg-indigo-900/10 border-indigo-200 text-indigo-700'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-center">
                                        {isScanningPYQ ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 mr-1.5 animate-spin text-indigo-500" /> : <History className="h-4 w-4 md:h-5 md:w-5 mr-1.5" />}
                                        <span className="truncate max-w-[60px] md:max-w-[90px]">
                                            {config.pyqFileName 
                                                ? (config.includePYQ ? config.pyqFileName : 'PYQ OFF') 
                                                : 'PYQ'}
                                        </span>
                                    </div>
                                    {config.pyqMaterial ? (
                                        <div className="flex items-center ml-1 border-l border-slate-200 pl-1">
                                            {showPYQOptions ? <ChevronUp className="h-4 w-4 md:h-5 md:w-5" /> : <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />}
                                        </div>
                                    ) : null}
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            if (!accessToken) {
                                                await authorizeDrive();
                                            }
                                            setShowPYQDrivePicker(true);
                                        } catch (err: any) {
                                            console.error("Authorize PYQ drive failed:", err);
                                            alert("Google Drive access is currently resting on verification. You can still use the local files option safely! / गूगल ड्राइव एक्सेस सत्यापन के अधीन है। आप स्थानीय रूप से फाइलों का उपयोग कर सकते हैं!");
                                        }
                                    }}
                                    className={`flex items-center px-2 py-1 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 ml-1`}
                                    title="Import PYQ from Google Drive"
                                >
                                    <Cloud className="h-4 w-4 md:h-5 md:w-5" />
                                </button>
                                <input 
                                    type="file" 
                                    ref={pyqFileInputRef} 
                                    className="hidden" 
                                    accept="image/*,application/pdf"
                                    multiple
                                    onChange={(e) => handleFileUpload(e, true)}
                                />
                            </div>

                            {/* Enable Images Button */}
                            <button
                                onClick={() => handleChange('includeImages', !config.includeImages)}
                                className={`flex items-center px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all border h-[26px] md:h-[34px] ${
                                    config.includeImages
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <ImageIcon className="h-4 w-4 md:h-5 md:w-5 mr-1.5" />
                                <span>{config.includeImages ? 'Images ON' : 'Images'}</span>
                            </button>

                            <div className="flex flex-wrap items-center gap-2">
                                {/* Negative Marking Button */}
                                <button
                                    onClick={() => handleChange('negativeMarking', !config.negativeMarking)}
                                    className={`flex items-center px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-black transition-all border h-[26px] md:h-[34px] ${
                                        config.negativeMarking
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                    title="Negative Marking: 1/3 ratio"
                                >
                                    <Slash className="h-4 w-4 md:h-5 md:w-5 mr-1" />
                                    <span>{config.negativeMarking ? 'Neg. Marking' : 'Neg. Marking'}</span>
                                </button>

                                 {/* Minimum Question Word Count - Unified Feature */}
                                <div className={`flex items-center border rounded-xl overflow-hidden h-[26px] md:h-[34px] transition-all bg-slate-50/50 border-slate-200 shadow-sm shadow-indigo-500/5`}>
                                    <div 
                                        className={`h-full px-2 text-[10px] md:text-xs uppercase font-black flex items-center border-r transition-all gap-1.5 bg-indigo-600 text-white border-indigo-400/20`}
                                        title="Minimum words for the question content / प्रति प्रश्न न्यूनतम शब्द"
                                    >
                                        <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                        <span className="hidden xs:inline">m. Word</span>
                                    </div>
                                    <div className="flex items-center bg-transparent group focus-within:ring-1 focus-within:ring-indigo-500 px-1.5">
                                        <input 
                                            type="number"
                                            min="5"
                                            max="500"
                                            value={config.minQuestionWords !== undefined ? config.minQuestionWords : 30}
                                            onChange={(e) => handleChange('minQuestionWords', e.target.value === '' ? '' : (parseInt(e.target.value) || 0))}
                                            className="bg-transparent text-slate-800 font-black text-[11px] md:text-sm w-[35px] md:w-[45px] text-center outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Subjective Answer Word Limit - Specific to Subjective */}
                                <div className={`flex items-center border rounded-xl overflow-hidden h-[26px] md:h-[34px] transition-all bg-slate-50/50 ${isSubjective ? 'border-emerald-500 shadow-md shadow-emerald-500/5' : 'border-slate-200 opacity-40 cursor-not-allowed'}`}>
                                    <div 
                                        className={`h-full px-2 text-[10px] md:text-xs uppercase font-black flex items-center border-r transition-all gap-1.5 ${isSubjective ? 'bg-emerald-600 text-white border-emerald-400/20' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                                        title="Subjective answer target word limit / सब्जेक्टिव उत्तर शब्द सीमा"
                                    >
                                        <TypeIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                        <span className="hidden xs:inline">Subj. Limit</span>
                                    </div>
                                    <div className="flex items-center bg-transparent group focus-within:ring-1 focus-within:ring-emerald-500 px-1.5">
                                        <input 
                                            type="number"
                                            min="20"
                                            max="2000"
                                            disabled={!isSubjective}
                                            value={config.wordLimit || 150}
                                            onChange={(e) => handleChange('wordLimit', parseInt(e.target.value) || 150)}
                                            className="bg-transparent text-slate-800 font-black text-[11px] md:text-sm w-[40px] md:w-[55px] text-center outline-none disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                {/* Timer Setting */}
                                <div className={`flex items-center border rounded-xl overflow-hidden h-[26px] md:h-[34px] transition-all bg-slate-50/50 ${config.timerEnabled ? 'border-indigo-500 shadow-md' : 'border-slate-200'}`}>
                                    <button 
                                        onClick={() => handleChange('timerEnabled', !config.timerEnabled)}
                                        className={`h-full px-2 text-[10px] md:text-xs uppercase font-black transition-all ${config.timerEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        TIME
                                    </button>
                                    <div className="flex items-center bg-transparent group focus-within:ring-1 focus-within:ring-indigo-500 px-1">
                                        <input 
                                            type="number"
                                            min="1"
                                            max="120"
                                            disabled={!config.timerEnabled}
                                            value={config.timeLimit}
                                            onChange={(e) => handleChange('timeLimit', parseInt(e.target.value) || 1)}
                                            className="bg-transparent text-slate-800 font-black text-[11px] md:text-sm w-[30px] md:w-[40px] text-center outline-none disabled:opacity-30"
                                        />
                                        <div className={`text-[10px] md:text-xs font-black uppercase ${config.timerEnabled ? 'text-indigo-600' : 'text-slate-400'}`}>min</div>
                                    </div>
                                </div>

                                {/* Marks per Question Setting */}
                                <div className={`flex items-center border rounded-xl overflow-hidden h-[26px] md:h-[34px] transition-all border-slate-200 bg-slate-50/50`}>
                                    <div className="h-full px-2 text-[10px] md:text-xs uppercase font-black bg-indigo-600 text-white flex items-center border-r border-slate-200">
                                        MARK
                                    </div>
                                    <div className="flex items-center bg-transparent group focus-within:ring-1 focus-within:ring-indigo-500 px-1.5">
                                        <input 
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={config.marksPerQuestion}
                                            onChange={(e) => handleChange('marksPerQuestion', parseInt(e.target.value) || 1)}
                                            className="bg-transparent text-slate-800 font-black text-[11px] md:text-sm w-[25px] md:w-[35px] text-center outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Source Generation Options Menu (Appears after file upload) */}
                        {showSourceOptions && config.sourceMaterial && (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in zoom-in-95 fade-in duration-200 space-y-4 shadow-inner">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">Generation Strategy</h4>
                                    <button onClick={removeSourceFile} className="text-slate-500 hover:text-red-500 flex items-center text-[10px] font-bold">
                                        <X className="h-3 w-3 mr-1" /> Remove File
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {sourceModes.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => handleChange('sourceMode', m.id)}
                                            className={`p-3 rounded-xl border text-left transition-all relative ${
                                                config.sourceMode === m.id
                                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                                : 'bg-white border-slate-250 text-slate-700 hover:border-slate-350 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <div className="font-black text-xs mb-0.5 flex items-center gap-1.5">
                                                        {m.id === 'exact' && <Zap className={`h-3 w-3 ${config.sourceMode === 'exact' ? 'text-yellow-300' : 'text-indigo-600'}`} />}
                                                        {m.label}
                                                    </div>
                                                    <div className="text-[10px] opacity-80 leading-tight font-medium">{m.desc}</div>
                                                </div>
                                                {m.id === 'exact' && (
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        <div className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${config.sourceMode === 'exact' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                                            1:1 Fidelity
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleChange('preserveSourceLanguage', !config.preserveSourceLanguage);
                                                            }}
                                                            title="Preserve Original Language (for Language Skills)"
                                                            className={`w-10 h-5 rounded-full relative transition-all border ${
                                                                config.preserveSourceLanguage 
                                                                ? 'bg-emerald-500 border-emerald-400' 
                                                                : 'bg-slate-200 border-slate-300'
                                                            }`}
                                                        >
                                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.preserveSourceLanguage ? 'right-1' : 'left-1'}`} />
                                                        </button>
                                                        {config.preserveSourceLanguage && (
                                                            <span className="text-[8px] font-black uppercase text-indigo-500 mt-1 animate-pulse">Orig. Lang</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* PYQ Options Menu */}
                        {showPYQOptions && config.pyqMaterial && (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in zoom-in-95 fade-in duration-200 space-y-4 shadow-inner">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">PYQ Settings</h4>
                                    <button onClick={removePYQFile} className="text-slate-500 hover:text-red-500 flex items-center text-[10px] font-bold">
                                        <X className="h-3 w-3 mr-1" /> Remove File
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        onClick={() => handleChange('includePYQ', !config.includePYQ)}
                                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                                            config.includePYQ
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div>
                                            <div className="font-bold text-xs mb-0.5">Include in Quiz</div>
                                            <div className="text-[10px] opacity-80 leading-tight">Use this material to generate questions</div>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${config.includePYQ ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                                            <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${config.includePYQ ? 'right-1' : 'left-1'}`} />
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => pyqFileInputRef.current?.click()}
                                        className="p-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-left transition-all text-xs font-bold"
                                    >
                                        <div className="font-bold text-xs mb-0.5 text-slate-800">Add More / Replace</div>
                                        <div className="text-[10px] opacity-70 leading-tight">Upload additional PYQ documents</div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Controls */}
                <div className="space-y-4 bg-white p-4 md:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div>
                        <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Difficulty</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(level => (
                                <button
                                    key={level}
                                    onClick={() => handleChange('difficulty', level)}
                                    className={`py-2 px-3 rounded-xl text-[10px] md:text-xs font-bold transition-all border ${
                                        config.difficulty === level 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider block mb-2 ml-1">Type</label>
                            <div className="flex flex-col gap-2">
                                {(['objective', 'subjective'] as QuestionType[]).map(type => (
                                    <button 
                                        key={type}
                                        onClick={() => handleChange('type', type)}
                                        className={`w-full py-2.5 rounded-xl text-[10px] md:text-xs font-bold transition-all capitalize border ${
                                            config.type === type 
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider block mb-2 ml-1">Mode</label>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => handleChange('mode', 'practice')}
                                    className={`w-full py-2.5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center border ${
                                        config.mode === 'practice' 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <Dumbbell className="h-4 w-4 mr-1.5" />
                                    Practice
                                </button>
                                <button 
                                    onClick={() => handleChange('mode', 'test')}
                                    className={`w-full py-2.5 rounded-xl text-[11px] md:text-xs font-bold transition-all flex items-center justify-center border ${
                                        config.mode === 'test' 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <ClipboardList className="h-4 w-4 mr-1.5" />
                                    Test
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Source Text Modal */}
            {isSourceModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div className="flex items-center">
                                <Pencil className="h-4 w-4 md:h-5 md:w-5 text-indigo-600 mr-2" />
                                <h3 className="text-sm md:text-base font-bold text-slate-800 animate-pulse">Source Material</h3>
                            </div>
                            <button onClick={() => setIsSourceModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="h-5 w-5 md:h-6 md:w-6" />
                            </button>
                        </div>
                        <div className="p-5">
                            <p className="text-[11px] md:text-xs text-slate-500 mb-3 font-semibold">Paste or write the text you want to generate the quiz from. This will override the Topic field.</p>
                            <textarea
                                value={tempSourceText}
                                onChange={(e) => setTempSourceText(e.target.value)}
                                className="w-full h-48 bg-slate-50 border border-slate-250 rounded-2xl p-4 text-slate-800 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none shadow-inner"
                                placeholder="Enter source text here..."
                            />
                        </div>
                        <div className="p-5 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-2">
                            <button 
                                onClick={() => setIsSourceModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveSourceText}
                                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs md:text-sm font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-95"
                            >
                                Save Source
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <button 
                onClick={onGenerate}
                disabled={isLoading || !canGenerate}
                className="w-full py-3.5 mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl font-extrabold text-xs md:text-sm shadow-lg shadow-indigo-600/10 active:scale-[0.99] hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white"
            >
                {isLoading ? <Loader2 className="animate-spin h-5 w-5 md:h-6 md:w-6 mr-2" /> : <Zap className="h-5 w-5 md:h-6 md:w-6 mr-2 fill-white" />} 
                {isLoading ? 'Generating Quiz...' : 'Generate Quiz'}
            </button>
        </div>
    );
};

export default QuizConfigForm;
