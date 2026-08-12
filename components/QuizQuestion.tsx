import React, { useState, useRef, useEffect } from 'react';
import { Question, QuizMode } from '../types';
import { ArrowRight, ArrowLeft, Check, AlertCircle, Eye, Camera, Loader2, Sparkles, X, SearchCheck, Clock, Bookmark, Type as TypeIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { extractTextFromImage, analyzeAnswer, verifyAndFixQuestion } from '../services/geminiService';
import { BookRecommendations } from './BookRecommendations';

interface QuizQuestionProps {
    question: Question;
    currentAnswer: string | null;
    index: number;
    total: number;
    onAnswer: (answer: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onUpdateQuestion: (question: Question) => void;
    onToggleReview?: () => void;
    isMarkedForReview?: boolean;
    isSubmitting: boolean;
    mode: QuizMode;
    subject: string;
    language: string;
    timeLeft: number | null;
    navDirection: 'next' | 'prev';
}

const QuizQuestion: React.FC<QuizQuestionProps> = ({ 
    question, currentAnswer, index, total, onAnswer, onNext, onPrev, onUpdateQuestion, onToggleReview, isMarkedForReview, isSubmitting, mode, subject, language, timeLeft, navDirection
}) => {
    const isObjective = !!question.options && question.options.length > 0;
    const isLast = index === total - 1;
    const [showModelAnswer, setShowModelAnswer] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [evaluationText, setEvaluationText] = useState<string | null>(null);
    const [showEvaluation, setShowEvaluation] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Reset evaluation state when question changes
    useEffect(() => {
        setEvaluationText(null);
        setShowEvaluation(false);
        setShowModelAnswer(false);
    }, [index]);

    const normalize = (s: string | null | undefined) => s?.trim().toLowerCase() || '';
    const isAnswered = currentAnswer !== null;
    const isPractice = mode === 'practice';
    const isCorrect = isObjective ? normalize(currentAnswer) === normalize(question.correct_answer) : true;
    const showImmediateFeedback = isPractice && isAnswered;
    const showEvaluationButton = isPractice && isAnswered && isObjective;

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("File is too large. Please select an image under 5MB.");
            return;
        }

        setIsScanning(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const result = e.target?.result as string;
                if (!result) return;
                
                const base64Data = result.split(',')[1];
                const mimeType = result.split(',')[0].split(':')[1].split(';')[0];

                try {
                    const text = await extractTextFromImage(base64Data, mimeType);
                    if (text) {
                        const newText = currentAnswer ? currentAnswer + '\n\n' + text : text;
                        onAnswer(newText);
                    } else {
                        alert("Could not read text from the image.");
                    }
                } catch (error) {
                    console.error(error);
                    alert("Failed to scan. Please try again.");
                } finally {
                    setIsScanning(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error(error);
            setIsScanning(false);
        }
    };

    const handleCheckQuestion = async () => {
        setIsVerifying(true);
        try {
            const result = await verifyAndFixQuestion(question, subject, language);
            if (result.status === 'FIXED' && result.correctedQuestion) {
                onUpdateQuestion({ ...question, ...result.correctedQuestion });
                alert("Question has been corrected for accuracy.");
            } else {
                alert("Question is already verified and accurate.");
            }
        } catch (error) {
            console.error(error);
            alert("Failed to verify question.");
        } finally {
            setIsVerifying(false);
        }
    };

    const handleEvaluation = async () => {
        if (evaluationText) {
            setShowEvaluation(true);
            return;
        }

        setIsEvaluating(true);
        try {
            const result = await analyzeAnswer(
                question.question,
                currentAnswer,
                question.correct_answer || '',
                subject,
                language
            );
            setEvaluationText(result);
            setShowEvaluation(true);
        } catch (error) {
            console.error(error);
            alert("Failed to generate evaluation.");
        } finally {
            setIsEvaluating(false);
        }
    };

    const animationClass = navDirection === 'next' 
        ? 'animate-in slide-in-from-right-8 fade-in duration-300' 
        : 'animate-in slide-in-from-left-8 fade-in duration-300';

    const formatQuestionText = (text: string) => {
        // Ensure numbered statements (1., 2., etc.) that are preceded by a space or start of line
        // are on their own line with a double newline for Markdown.
        let formatted = text.replace(/(?:\s|^)(\d+\.)\s/g, '\n\n$1 ');
        
        // Handle Assertion/Reason (Kathan/Karan)
        // Match "Assertion (A):", "Reason (R):", "कथन (A):", "कारण (R):" etc.
        formatted = formatted.replace(/(Assertion\s*\(A\):|कथन\s*\(A\):|Reason\s*\(R\):|कारण\s*\(R\):)/gi, '\n\n$1');
        
        return formatted;
    };

    return (
        <div 
            className={`p-3 md:p-6 max-w-4xl mx-auto min-h-full flex flex-col relative text-slate-800 ${animationClass}`}
        >
            
            <div className="flex items-center justify-between mb-4 px-1 flex-shrink-0 flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                    <span className="text-[10px] md:text-xs font-bold font-mono bg-indigo-55 border border-indigo-150 text-indigo-700 px-2.5 py-1 rounded-lg">
                        Question {index + 1} / {total}
                    </span>
                    {question.category && (
                        <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                            question.category === 'PYQ' 
                            ? 'bg-amber-50 border-amber-200 text-amber-700 font-extrabold' 
                            : question.category === 'Current Affairs'
                            ? 'bg-blue-50 border-blue-200 text-blue-700 font-extrabold'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                            {question.category}
                        </span>
                    )}
                    {timeLeft !== null && (
                        <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border font-mono font-bold text-[11px] md:text-sm ${timeLeft < 60 ? 'bg-red-50 border-red-200 text-red-650 animate-pulse' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                            <Clock className="h-4 w-4 text-slate-600" />
                            <span>{formatTime(timeLeft)}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center space-x-1.5 flex-wrap gap-1.5">
                    {!isObjective && question.word_limit && (
                        <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50/50 text-indigo-700 text-[10px] md:text-xs font-extrabold uppercase tracking-wider">
                            <TypeIcon className="h-4 w-4" />
                            <span>{question.word_limit} words</span>
                        </div>
                    )}
                    {onToggleReview && (
                        <button 
                            onClick={onToggleReview}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border transition-all text-xs font-black ${isMarkedForReview ? 'bg-amber-400 border-amber-450 text-slate-800 shadow-sm' : 'bg-slate-50 border-slate-205 text-slate-500 hover:bg-slate-100'}`}
                            title="Mark for Review"
                        >
                            <Bookmark className={`h-4 w-4 ${isMarkedForReview ? 'fill-current' : ''}`} />
                            <span>{isMarkedForReview ? 'Marked' : 'Mark'}</span>
                        </button>
                    )}
                    {isPractice && (
                        <button 
                            onClick={handleCheckQuestion}
                            disabled={isVerifying}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-650 text-[10px] md:text-xs font-black bg-indigo-50 hover:bg-indigo-100 transition-all disabled:opacity-50"
                            title="Verify question accuracy with AI"
                        >
                            {isVerifying ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <SearchCheck className="h-4 w-4" />}
                            <span>Verify Accuracy</span>
                        </button>
                    )}
                    {showEvaluationButton && (
                        <button 
                            onClick={handleEvaluation}
                            disabled={isEvaluating}
                            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-650 text-[10px] md:text-xs font-black bg-indigo-50 hover:bg-indigo-100 transition-all disabled:opacity-50"
                        >
                            {isEvaluating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Sparkles className="h-4 w-4" />}
                            <span>Evaluation</span>
                        </button>
                    )}
                    {isPractice && (
                        <span className="text-[10px] md:text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-150">
                            Practice
                        </span>
                    )}
                </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 md:p-6 rounded-2xl mb-4 shadow-sm relative overflow-hidden flex-shrink-0 text-slate-800">
                 <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-indigo-650"></div>
                <div className="space-y-4">
                    <div className="text-[15px] md:text-lg font-bold leading-relaxed text-slate-800 prose prose-indigo max-w-none text-left [&_strong]:text-indigo-650">
                        <ReactMarkdown>
                            {formatQuestionText(question.question)}
                        </ReactMarkdown>
                    </div>

                    {question.imageUrl && (
                        <div className="w-full flex justify-center mt-4">
                            <div className="p-1 border border-slate-200 bg-white rounded-xl shadow-sm">
                                <img 
                                    src={question.imageUrl} 
                                    alt="Question Diagram" 
                                    className="max-h-48 object-contain rounded-lg"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-grow relative pb-3">
                {isObjective ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-semibold">
                        {question.options?.map((opt, i) => {
                            const isSelected = normalize(currentAnswer) === normalize(opt);
                            const isOptionCorrect = normalize(question.correct_answer) === normalize(opt);
                            
                            let buttonClass = 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300';
                            let indicatorClass = 'border-slate-300 text-slate-500 group-hover:border-indigo-400 group-hover:text-indigo-650';
                            let textClass = 'text-slate-700';

                            if (showImmediateFeedback) {
                                if (isSelected && isOptionCorrect) {
                                    buttonClass = 'border-emerald-500 bg-emerald-50 text-emerald-850';
                                    indicatorClass = 'border-emerald-500 bg-emerald-550 text-white';
                                    textClass = 'text-emerald-900 font-extrabold';
                                } else if (isSelected && !isOptionCorrect) {
                                    buttonClass = 'border-red-400 bg-red-50 text-red-850';
                                    indicatorClass = 'border-red-500 bg-red-500 text-white';
                                    textClass = 'text-red-900 font-extrabold';
                                } else if (isOptionCorrect) {
                                    buttonClass = 'border-emerald-300 bg-emerald-50/50';
                                    indicatorClass = 'border-emerald-300 text-emerald-600 font-bold';
                                    textClass = 'text-emerald-750 font-bold';
                                } else {
                                    buttonClass = 'opacity-50 border-slate-150 bg-transparent';
                                }
                            } else if (isSelected) {
                                buttonClass = 'border-indigo-600 bg-indigo-50 text-indigo-750 shadow-sm shadow-indigo-50';
                                indicatorClass = 'border-indigo-600 bg-indigo-600 text-white';
                                textClass = 'text-indigo-900 font-black';
                            }

                            return (
                                <button 
                                    key={i} 
                                    onClick={() => !showImmediateFeedback && onAnswer(opt)}
                                    disabled={showImmediateFeedback}
                                    className={`w-full p-4 md:p-5 text-left rounded-xl border-2 transition-all flex items-center group active:scale-[0.99] h-full ${buttonClass}`}
                                >
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 font-mono text-xs md:text-sm font-black transition-colors ${indicatorClass}`}>
                                        {showImmediateFeedback && isSelected ? (
                                            isOptionCorrect ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />
                                        ) : (
                                            String.fromCharCode(65 + i)
                                        )}
                                    </div>
                                    <span className={`text-sm md:text-base leading-snug whitespace-pre-wrap ${textClass}`}>
                                        {opt}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="relative">
                            <textarea 
                                value={currentAnswer || ''}
                                onChange={(e) => onAnswer(e.target.value)}
                                className="w-full h-64 md:h-80 bg-slate-50 border border-slate-200 rounded-xl p-4 pb-12 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-800 text-sm md:text-base placeholder-slate-400 font-bold transition-all shadow-sm leading-relaxed" 
                                placeholder={question.word_limit ? `Provide your answer within ${question.word_limit} words...` : "Type your answer here..."}  
                            />
                            
                            <div className="absolute bottom-3 right-3 flex space-x-1.5">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isScanning || showImmediateFeedback}
                                    className="flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 border border-indigo-150 px-2.5 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isScanning ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Camera className="h-4 w-4" />}
                                    <span>{isScanning ? 'Scanning...' : 'Scan Answer'}</span>
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*,application/pdf"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>

                        {isPractice && (
                            <div className="flex flex-col gap-1.5">
                                <button 
                                    onClick={() => setShowModelAnswer(!showModelAnswer)}
                                    className="self-start flex items-center px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-black text-indigo-650 border border-slate-200 transition-colors"
                                >
                                    <Eye className="h-4 w-4 mr-1.5" />
                                    {showModelAnswer ? 'Hide Model Answer' : 'Show Model Answer'}
                                </button>
                                {showModelAnswer && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-250 rounded-xl animate-in fade-in slide-in-from-top-2">
                                        <h4 className="text-emerald-805 text-xs font-black uppercase tracking-wider mb-2">Model Answer REFERENCE</h4>
                                        <div className="text-emerald-950/90 leading-relaxed prose prose-indigo max-w-none text-xs md:text-sm font-semibold">
                                            <ReactMarkdown>{question.model_answer || ''}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Evaluation Modal Display */}
            {showEvaluation && evaluationText && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 relative text-slate-800">
                        <button 
                            onClick={() => setShowEvaluation(false)}
                            className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <div className="flex items-center space-x-2.5 mb-3">
                            <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-150 text-emerald-600">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <h3 className="text-emerald-800 font-extrabold text-base">Explanation & Evaluation</h3>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="text-slate-650 leading-relaxed text-xs italic mb-3 font-semibold">
                                Correct Answer selection: "{question.correct_answer}"
                            </div>
                            <div className="text-slate-700 leading-relaxed text-xs md:text-sm prose prose-indigo font-semibold">
                                <ReactMarkdown>{evaluationText}</ReactMarkdown>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end">
                            <button 
                                onClick={() => setShowEvaluation(false)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-1.5 px-5 rounded-lg transition-all shadow-md text-sm"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-4 flex space-x-3 flex-shrink-0 pb-3">
                <button 
                    onClick={() => {
                        setShowModelAnswer(false);
                        onPrev();
                    }}
                    disabled={index === 0}
                    className="flex-none w-12 h-12 md:w-16 md:h-16 bg-white text-slate-600 rounded-xl font-bold border border-slate-250 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 active:scale-95 transition flex items-center justify-center shadow-sm"
                >
                    <ArrowLeft className="h-5 w-5 md:h-7 md:w-7 text-slate-550" />
                </button>
                <button 
                    onClick={() => {
                        setShowModelAnswer(false);
                        onNext();
                    }}
                    disabled={isSubmitting}
                    className={`flex-1 h-12 md:h-16 rounded-xl font-extrabold text-sm md:text-base shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center active:scale-[0.98] transition-all border ${
                        isLast 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-450 text-white shadow-emerald-50' 
                        : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 shadow-md'
                    }`}
                >
                    {isSubmitting ? (
                        <span className="flex items-center animate-pulse">Processing...</span>
                    ) : (
                        <>
                            <span>{isLast ? 'Submit Quiz' : 'Next'}</span>
                            {isLast ? <Check className="ml-1.5 h-4 w-4 md:h-5 md:w-5" /> : <ArrowRight className="ml-1.5 h-4 w-4 md:h-5 md:w-5" />}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default QuizQuestion;
