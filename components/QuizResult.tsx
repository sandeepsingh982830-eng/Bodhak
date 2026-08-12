import React, { useState, useEffect } from 'react';
import { QuizConfig, Question } from '../types';
import { ThumbsUp, BookOpen, CheckCircle, XCircle, RotateCw, Sparkles, Loader2, ChevronDown, ChevronUp, Play, Slash, Clock, Target, ClipboardCheck, FastForward, Download, Layout as LayoutIcon } from 'lucide-react';
import { analyzeAnswer } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import QuestionPalette from './QuestionPalette';
import { BookRecommendations } from './BookRecommendations';
import { useAuth } from '../hooks/useAuth';

interface QuizResultProps {
    config: QuizConfig;
    questions: Question[];
    userAnswers: (string | null)[];
    score: number;
    timeTaken: number;
    onNewQuiz: () => void;
    onReattempt: () => void;
    onGenerateSimilar?: () => void;
    isGeneratingSimilar?: boolean;
}

const QuizResult: React.FC<QuizResultProps> = ({ config, questions, userAnswers, score, timeTaken, onNewQuiz, onReattempt, onGenerateSimilar, isGeneratingSimilar }) => {
    const { recordDailyActivity } = useAuth();

    useEffect(() => {
        if (recordDailyActivity) {
            recordDailyActivity('quiz');
        }
    }, []);

    const isObjective = config.type === 'objective';
    const totalPossibleMarks = questions.length * config.marksPerQuestion;
    const percentage = Math.round((score / totalPossibleMarks) * 100);

    const correctCount = isObjective 
        ? questions.filter((q, i) => userAnswers[i] === q.correct_answer).length 
        : Math.round((score / totalPossibleMarks) * questions.length);
    
    const skippedCount = userAnswers.filter(a => a === null).length;
    const incorrectCount = questions.length - correctCount - skippedCount;
    const completedCount = questions.length - skippedCount;
    const completedPercentage = (completedCount / questions.length) * 105;
    const accuracy = completedCount > 0 ? (correctCount / completedCount) * 100 : 0;

    const [analysisMap, setAnalysisMap] = useState<Record<number, string>>({});
    const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
    const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>({});
    const [activeFilter, setActiveFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');
    const [showPalette, setShowPalette] = useState(false);

    const scrollToQuestion = (index: number) => {
        const element = document.getElementById(`question-review-${index}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Pulse effect to highlight
            element.classList.add('ring-4', 'ring-indigo-500/30', 'ring-offset-2');
            setTimeout(() => {
                element.classList.remove('ring-4', 'ring-indigo-500/30', 'ring-offset-2');
            }, 2000);
        }
        if (window.innerWidth < 1024) setShowPalette(false);
    };

    const getScoreColor = (p: number) => {
        if (p >= 80) return 'text-emerald-650';
        if (p >= 50) return 'text-amber-600';
        return 'text-red-650';
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleAnalyze = async (index: number) => {
        setExpandedMap(prev => ({ ...prev, [index]: !prev[index] }));
        if (expandedMap[index]) return;
        if (analysisMap[index]) return;

        setLoadingMap(prev => ({ ...prev, [index]: true }));
        try {
            const question = questions[index];
            const result = await analyzeAnswer(
                question.question,
                userAnswers[index],
                isObjective ? (question.correct_answer || '') : (question.model_answer || ''),
                config.subject,
                config.language,
                !isObjective,
                config.marksPerQuestion
            );
            setAnalysisMap(prev => ({ ...prev, [index]: result }));
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingMap(prev => ({ ...prev, [index]: false }));
        }
    };

    const [isRechecking, setIsRechecking] = useState(false);
    const [recheckProgress, setRecheckProgress] = useState(0);

    const handleRecheckAll = async () => {
        setIsRechecking(true);
        setRecheckProgress(0);
        
        try {
            for (let i = 0; i < questions.length; i++) {
                if (userAnswers[i] === null) {
                    setRecheckProgress(i + 1);
                    continue;
                }
                
                try {
                    const question = questions[i];
                    const result = await analyzeAnswer(
                        question.question,
                        userAnswers[i],
                        isObjective ? (question.correct_answer || '') : (question.model_answer || ''),
                        config.subject,
                        config.language,
                        !isObjective,
                        config.marksPerQuestion
                    );
                    setAnalysisMap(prev => ({ ...prev, [i]: result }));
                    setExpandedMap(prev => ({ ...prev, [i]: true }));
                } catch (e) {
                    console.error(`Recheck failed for index ${i}`, e);
                }
                setRecheckProgress(i + 1);
            }
            alert("✅ Rechecking Complete! / पुनर्जांच पूर्ण हुई!\nAI analysis has been refreshed for all attempted questions.");
        } catch (error) {
            console.error("Recheck All Error:", error);
            alert("Error during rechecking. Please try again.");
        } finally {
            setIsRechecking(false);
            setRecheckProgress(0);
        }
    };

    const getResultsHtml = () => {
        const title = `Bodhak Quiz Result - ${config.subject}`;
        
        return `
<!DOCTYPE html>
<html lang="${config.language === 'Hindi' ? 'hi' : (config.language === 'Punjabi' ? 'pa' : 'en')}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #0f172a; font-size: 28px; font-weight: 800; }
        .stats { display: grid; grid-template-cols: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; }
        .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 5px; }
        .stat-value { font-size: 20px; font-weight: 800; color: #0f172a; }
        .question-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 20px; background: #fff; }
        .question-header { display: flex; align-items: flex-start; margin-bottom: 15px; }
        .q-num { background: #4f46e5; color: #fff; font-weight: 800; padding: 4px 10px; border-radius: 6px; margin-right: 15px; font-size: 14px; }
        .q-text { font-size: 17px; font-weight: 700; color: #1e293b; }
        .options-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 10px; margin-top: 15px; }
        .option { padding: 10px 15px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; background: #f8fafc; font-weight: 600; }
        .answer-section { margin-top: 20px; padding: 15px; border-radius: 8px; display: flex; gap: 20px; }
        .user-answer { flex: 1; background: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 8px; color: #991b1b; }
        .user-answer.correct { background: #f0fdf4; border: 1px solid #dcfce7; color: #166534; }
        .correct-answer { flex: 1; background: #eef2ff; border: 1px solid #e0e7ff; padding: 12px; border-radius: 8px; color: #3730a3; }
        .label { font-size: 10px; font-weight: 850; text-transform: uppercase; margin-bottom: 4px; opacity: 0.7; }
        .footer { text-align: center; margin-top: 50px; color: #94a3b8; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Bodhak: Quiz Summary</h1>
            <p>${config.subject} - ${config.topic}</p>
        </div>

        <div class="stats">
            <div class="stat-card"><div class="stat-label">Score</div><div class="stat-value">${score}/${totalPossibleMarks}</div></div>
            <div class="stat-card"><div class="stat-label">Percentage</div><div class="stat-value">${percentage}%</div></div>
            <div class="stat-card"><div class="stat-label">Time Spent</div><div class="stat-value">${formatTime(timeTaken)}</div></div>
            <div class="stat-card"><div class="stat-label">Accuracy</div><div class="stat-value">${accuracy.toFixed(1)}%</div></div>
        </div>

        <h2>Questions Review</h2>
        ${questions.map((q, i) => {
            const userAnswer = userAnswers[i];
            const isCorrect = isObjective && userAnswer === q.correct_answer;
            
            return `
            <div class="question-card">
                <div class="question-header">
                    <span class="q-num">Q${i+1}</span>
                    ${q.category ? `<span style="font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; margin-right: 10px; background: ${q.category === 'PYQ' ? '#fff7ed; color: #c2410c; border: 1px solid #fdba74;' : q.category === 'Current Affairs' ? '#eff6ff; color: #1d4ed8; border: 1px solid #93c5fd;' : '#f8fafc; color: #64748b; border: 1px solid #e2e8f0;'}">${q.category}</span>` : ''}
                    <span class="q-text">${q.question}</span>
                </div>
                
                ${q.options ? `
                <div class="options-grid">
                    ${q.options.map(opt => `<div class="option">${opt}</div>`).join('')}
                </div>` : ''}

                <div class="answer-section">
                    <div class="user-answer ${isCorrect ? 'correct' : ''}">
                         <div class="label">Your Answer</div>
                         <strong>${userAnswer || 'Skipped'}</strong>
                    </div>
                    <div class="correct-answer">
                         <div class="label">Correct Answer</div>
                         <strong>${isObjective ? q.correct_answer : q.model_answer}</strong>
                    </div>
                </div>
            </div>
            `;
        }).join('')}

        <div class="footer">
            <p>Generated by Bodhak Smart Assistant</p>
        </div>
    </div>
</body>
</html>
        `;
    };

    const downloadResultsAsHtml = () => {
        const html = getResultsHtml();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bodhak_Result_${config.subject.replace(/\s+/g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const ProgressCard = ({ icon: Icon, label, value, subValue, percentage, colorClass, onClick, isActive, isClickable }: any) => (
        <div 
            onClick={onClick}
            className={`p-3.5 rounded-xl border transition-all ${
                isClickable ? 'cursor-pointer hover:shadow-md active:scale-95' : ''
            } ${
                isActive 
                ? 'bg-white ring-4 ring-indigo-550/15 border-indigo-200 shadow-md scale-[1.01] z-10' 
                : 'bg-white border-slate-150 shadow-sm'
            } flex flex-col justify-between`}
        >
            <div className="flex justify-between items-center mb-2.5">
                <div className="flex items-center space-x-1.5">
                    <Icon className={`h-4 w-4 ${colorClass}`} />
                    <span className="text-slate-500 font-extrabold text-[10px] md:text-xs uppercase tracking-tight">{label}</span>
                </div>
                <div className="text-right">
                    <span className="text-slate-850 font-black text-xs md:text-sm">{value}</span>
                    {subValue && <span className="text-slate-400 font-bold text-[9px] md:text-[11px] ml-0.5">{subValue}</span>}
                </div>
            </div>
            <div className="w-full bg-slate-100 h-1 md:h-1.5 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${colorClass.replace('text-', 'bg-')} transition-all duration-700`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                />
            </div>
        </div>
    );

    return (
        <div className="p-3 md:p-4 w-full max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-16 text-slate-800">
            <div className="space-y-4 mb-6">
                {/* Header Summary */}
                <div className="text-center relative py-6 md:py-12 bg-white rounded-3xl border border-slate-205 overflow-hidden shadow-sm">
                    <div className="absolute inset-0 bg-indigo-505/5 blur-[100px] rounded-full"></div>
                    <div className="relative flex flex-col items-center px-4">
                        <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 mb-3 shadow-sm text-indigo-650">
                            <ThumbsUp className="h-7 w-7 md:h-9 md:w-9" />
                        </div>

                        <h2 className="text-2xl md:text-3xl font-black text-slate-850 mb-1 leading-tight">Quiz Complete!</h2>
                        <p className="text-slate-450 text-xs md:text-sm mb-5 font-semibold">
                            {config.language === 'Hindi' ? 'यहाँ आपका प्रदर्शन है' : (config.language === 'Punjabi' ? 'ਇੱਥੇ ਤੁਹਾਡਾ ਪ੍ਰਦਰਸ਼ਨ ਹੈ' : 'Here is how you did')}
                        </p>
                        
                        <div className="flex flex-col items-center space-y-4">
                            <div className="flex items-center space-x-4">
                                <div className={`text-5xl md:text-6xl font-black ${getScoreColor(percentage)} tracking-tighter`}>
                                    {score.toFixed(2).replace(/\.00$/, '')}<span className="text-2xl md:text-3xl text-slate-400 ml-1">/{totalPossibleMarks}</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-col md:flex-row items-center gap-4">
                                <div className="flex flex-col items-center space-y-4">
                                    <div className="flex items-center space-x-1.5 text-indigo-700 font-mono font-black text-base md:text-lg bg-indigo-50 px-4 py-1.5 rounded-xl border border-indigo-150">
                                        <Clock className="h-4.5 w-4.5" />
                                        <span>Time Spent: {formatTime(timeTaken)}</span>
                                    </div>

                                    <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-indigo-600 transition-all duration-1000" 
                                            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                <button 
                                    onClick={handleRecheckAll}
                                    disabled={isRechecking}
                                    className="flex items-center space-x-1.5 bg-amber-400 hover:bg-amber-500 text-black rounded-xl px-4 py-2.5 shadow-md text-xs font-black border border-amber-300 transition-all disabled:opacity-50 group"
                                >
                                    {isRechecking ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin text-black" />
                                    ) : (
                                        <ClipboardCheck className="h-4 w-4 mr-1 text-black" />
                                    )}
                                    <span className="text-black font-black">{isRechecking ? `Checking ${recheckProgress}/${questions.length}` : (config.language === 'Hindi' ? 'दोबारा जांचें' : 'RECHECKING')}</span>
                                </button>

                                <button 
                                    onClick={downloadResultsAsHtml}
                                    className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl px-4 py-2.5 shadow-sm text-xs font-black border border-slate-250 transition-all group"
                                >
                                    <Download className="h-4 w-4 mr-1 text-slate-500 group-hover:text-slate-800" />
                                    <span>{config.language === 'Hindi' ? 'डाउनलोड HTML' : (config.language === 'Punjabi' ? 'ਡਾਊਨਲੋਡ HTML' : 'Download HTML')}</span>
                                </button>

                                {onGenerateSimilar && (
                                    <button 
                                        onClick={onGenerateSimilar}
                                        disabled={isGeneratingSimilar}
                                        className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl shadow-md cursor-pointer text-white text-xs font-black uppercase transition-all disabled:opacity-50"
                                    >
                                        {isGeneratingSimilar ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Sparkles className="h-4 w-4 text-white" />}
                                        <span>{config.language === 'Hindi' ? 'नया क्विज़' : (config.language === 'Punjabi' ? 'ਨਵੀਂ ਕੁਇਜ਼' : 'New Quiz')}</span>
                                    </button>
                                )}
                            </div>

                            <div className="w-full max-w-4xl mt-6 pt-4 border-t border-slate-100">
                                <BookRecommendations topic={config.topic || config.subject} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Performance Stats */}
                <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200">
                    <h3 className="text-xs md:text-sm font-black text-slate-500 mb-4 flex items-center px-1 uppercase tracking-widest">
                        <Target className="h-4 w-4 mr-2 text-indigo-600" /> Performance Overview
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <ProgressCard 
                            icon={CheckCircle}
                            label="Correct"
                            value={correctCount}
                            subValue={`/${questions.length}`}
                            percentage={(correctCount / questions.length) * 100}
                            colorClass="text-emerald-550"
                            onClick={() => setActiveFilter(activeFilter === 'correct' ? 'all' : 'correct')}
                            isActive={activeFilter === 'correct'}
                            isClickable={true}
                        />
                        <ProgressCard 
                            icon={XCircle}
                            label="Incorrect"
                            value={incorrectCount}
                            subValue={`/${questions.length}`}
                            percentage={(incorrectCount / questions.length) * 100}
                            colorClass="text-red-500"
                            onClick={() => setActiveFilter(activeFilter === 'incorrect' ? 'all' : 'incorrect')}
                            isActive={activeFilter === 'incorrect'}
                            isClickable={true}
                        />
                        <ProgressCard 
                            icon={FastForward}
                            label="Skipped"
                            value={skippedCount}
                            subValue={`/${questions.length}`}
                            percentage={(skippedCount / questions.length) * 100}
                            colorClass="text-slate-400"
                            onClick={() => setActiveFilter(activeFilter === 'skipped' ? 'all' : 'skipped')}
                            isActive={activeFilter === 'skipped'}
                            isClickable={true}
                        />
                        <ProgressCard icon={Target} label="Accuracy" value={`${accuracy.toFixed(1)}%`} percentage={accuracy} colorClass="text-indigo-600" />
                        <ProgressCard icon={ClipboardCheck} label="Completed" value={`${Math.round(completedPercentage)}%`} percentage={completedPercentage} colorClass="text-indigo-650" />
                        <ProgressCard icon={RotateCw} label="Efficiency" value={`${percentage}%`} percentage={percentage} colorClass="text-amber-500" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className="flex-grow w-full space-y-4">

                    {/* Detailed Review Header */}
                    <div className="flex items-center justify-between mb-2 mt-8 px-2 flex-wrap gap-2">
                        <h3 className="text-lg md:text-2xl font-black text-slate-800 flex items-center">
                            <BookOpen className="h-5 w-5 md:h-6 md:w-6 mr-2 text-indigo-600" /> 
                            Detailed Review
                            {activeFilter !== 'all' && (
                                <span className="ml-3 text-[10px] md:text-xs font-black uppercase bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-1 rounded-lg">
                                    {activeFilter}
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setShowPalette(!showPalette)}
                                className="lg:hidden flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 px-3 py-1.5 rounded-lg border border-indigo-150 text-[10px] font-black uppercase"
                            >
                                <LayoutIcon className="h-3.5 w-3.5" /> Quick Jump
                            </button>
                            {activeFilter !== 'all' && (
                                <button 
                                    onClick={() => setActiveFilter('all')}
                                    className="text-[10px] md:text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors"
                                >
                                    Show All
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4 font-semibold text-slate-750">
                        {questions.map((q, i) => {
                            const userAnswer = userAnswers[i];
                            const correctAnswer = isObjective ? q.correct_answer : q.model_answer;
                            const isCorrect = isObjective && userAnswer === correctAnswer;
                            const isSkipped = userAnswer === null;
                            const isIncorrect = !isCorrect && !isSkipped;

                            if (activeFilter === 'correct' && !isCorrect) return null;
                            if (activeFilter === 'incorrect' && !isIncorrect) return null;
                            if (activeFilter === 'skipped' && !isSkipped) return null;

                            const isExpanded = expandedMap[i];
                            const isLoading = loadingMap[i];
                            const analysisText = analysisMap[i];

                            return (
                                <div 
                                    key={i} 
                                    id={`question-review-${i}`}
                                    className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm hover:border-slate-300 transition-all scroll-mt-24"
                                >
                                    <div className="font-bold text-slate-800 mb-4 text-[15px] md:text-lg leading-relaxed break-words flex flex-wrap items-center gap-2">
                                        <span className="text-indigo-600 font-black text-base md:text-lg">Q{i + 1}.</span>
                                        {q.category && (
                                            <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border inline-block ${
                                                q.category === 'PYQ' ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                                : q.category === 'Current Affairs' ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                : 'bg-slate-100 border-slate-200 text-slate-500'
                                            }`}>
                                                {q.category}
                                            </span>
                                        )}
                                        <div className="inline leading-snug">{q.question}</div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 font-semibold">
                                        <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-150">
                                            <span className="block text-slate-400 uppercase text-[9px] font-black tracking-widest mb-1">Your Answer</span>
                                            <span className={`font-black text-sm md:text-base break-words ${isObjective ? (userAnswer === null ? 'text-slate-450' : (isCorrect ? 'text-emerald-600' : 'text-red-500')) : 'text-slate-700'}`}>
                                                {userAnswer || (config.language === 'Hindi' ? 'छोड़ा गया' : (config.language === 'Punjabi' ? 'ਛੱਡਿਆ ਗਿਆ' : 'Skipped'))}
                                            </span>
                                        </div>
                                        <div className="bg-indigo-50/30 p-3.5 rounded-xl border border-indigo-150">
                                            <span className="block text-indigo-500 uppercase text-[9px] font-black tracking-widest mb-1">Correct Answer</span>
                                            <span className="font-black text-sm md:text-base text-indigo-700 break-words">{correctAnswer}</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleAnalyze(i)}
                                        className={`flex items-center space-x-1 text-[10px] md:text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all border ${
                                            isExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 font-extrabold'
                                        }`}
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        <span>AI Analysis</span>
                                        {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                                    </button>

                                    {isExpanded && (
                                        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in slide-in-from-top-4">
                                            {isLoading ? (
                                                <div className="flex items-center text-slate-500 text-xs font-semibold">
                                                    <Loader2 className="animate-spin h-4 w-4 mr-2 text-indigo-600" /> Consult AI...
                                                </div>
                                            ) : (
                                                <div className="prose prose-indigo prose-sm max-w-none text-slate-700 font-semibold leading-relaxed">
                                                    <ReactMarkdown>{analysisText}</ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Final Actions */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-3 pt-12 pb-6">
                        <button onClick={onReattempt} className="w-full md:w-auto px-8 py-3.5 bg-white text-slate-700 rounded-xl font-black transition-all border border-slate-250 hover:bg-slate-50 flex items-center justify-center shadow-sm">
                            <RotateCw className="h-4.5 w-4.5 mr-2 text-slate-500" /> Re-attempt
                        </button>
                        <button onClick={onNewQuiz} className="w-full md:w-auto px-10 py-3.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black text-white shadow-md shadow-indigo-100 flex items-center justify-center transition-all">
                            <Play className="h-4.5 w-4.5 mr-2 fill-white text-white" /> Start New
                        </button>
                    </div>
                </div>

                {/* Sticky Global Sidebar Palette */}
                <aside className={`
                    lg:block lg:sticky lg:top-4 lg:w-72 shrink-0 h-auto self-start
                    ${showPalette ? 'fixed inset-0 z-50 p-6 flex items-center justify-center bg-slate-900/40 backdrop-blur-md' : 'hidden'}
                `}>
                    <div className="relative w-full h-[600px] max-w-sm">
                        {showPalette && (
                            <button 
                                onClick={() => setShowPalette(false)}
                                className="absolute -top-10 right-0 text-slate-700 hover:text-slate-900 flex items-center gap-1 text-xs font-black uppercase tracking-widest"
                            >
                                <XCircle className="h-4 w-4 text-slate-600" /> CLOSE
                            </button>
                        )}
                        <div className="h-full bg-white rounded-3xl overflow-hidden border border-slate-200 flex flex-col shadow-2xl">
                           <div className="p-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
                               <h4 className="text-slate-800 font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2">
                                   <LayoutIcon className="h-4 w-4 text-indigo-600" /> Quick Jump
                               </h4>
                               <div className="text-[10px] font-black text-slate-400">{questions.length} Items</div>
                           </div>
                           <div className="flex-grow overflow-hidden p-2">
                                <QuestionPalette 
                                    total={questions.length}
                                    currentIndex={-1}
                                    userAnswers={userAnswers}
                                    reviewStatus={new Array(questions.length).fill(false)}
                                    visitedStatus={new Array(questions.length).fill(true)}
                                    onSelect={scrollToQuestion}
                                    questions={questions}
                                    isResultView={true}
                                    activeFilter={activeFilter}
                                />
                           </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default QuizResult;
