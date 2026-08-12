
import React from 'react';

import { Question, QuizMode } from '../types';

interface QuestionPaletteProps {
    total: number;
    currentIndex: number;
    userAnswers: (string | null)[];
    reviewStatus: boolean[];
    visitedStatus: boolean[];
    onSelect: (index: number) => void;
    questions?: Question[];
    mode?: QuizMode;
    isResultView?: boolean;
    activeFilter?: 'all' | 'correct' | 'incorrect' | 'skipped';
}

const QuestionPalette: React.FC<QuestionPaletteProps> = ({
    total,
    currentIndex,
    userAnswers,
    reviewStatus,
    visitedStatus,
    onSelect,
    questions,
    mode,
    isResultView,
    activeFilter = 'all'
}) => {
    const normalize = (s: string | null | undefined) => s?.trim().toLowerCase() || '';

    const getStatus = (i: number) => {
        const userAnswer = userAnswers[i];
        const isAnswered = userAnswer !== null;
        const isMarked = reviewStatus[i];
        const isVisited = visitedStatus[i];

        if (isResultView && questions) {
            if (!isAnswered) return 'not-answered-result';
            const question = questions[i];
            const isCorrect = normalize(userAnswer) === normalize(question.correct_answer);
            return isCorrect ? 'correct-result' : 'wrong-result';
        }

        // In practice mode, we can show if it's wrong
        if (mode === 'practice' && isAnswered && questions && questions[i].options) {
            const isCorrect = normalize(userAnswers[i]) === normalize(questions[i].correct_answer);
            if (!isCorrect) return 'wrong';
        }

        if (isAnswered && isMarked) return 'answered-marked';
        if (isMarked) return 'marked';
        if (isAnswered) return 'answered';
        if (isVisited) return 'not-answered';
        return 'not-visited';
    };

    const isVisible = (i: number) => {
        if (!isResultView || activeFilter === 'all') return true;
        
        const status = getStatus(i);
        if (activeFilter === 'correct') return status === 'correct-result';
        if (activeFilter === 'incorrect') return status === 'wrong-result';
        if (activeFilter === 'skipped') return status === 'not-answered-result';
        return true;
    };

    const stats = {
        correct: isResultView && questions ? userAnswers.filter((a, i) => a !== null && normalize(a) === normalize(questions[i].correct_answer)).length : 0,
        wrong: (isResultView || mode === 'practice') && questions ? userAnswers.filter((a, i) => a !== null && normalize(a) !== normalize(questions[i].correct_answer)).length : 0,
        skipped: isResultView ? userAnswers.filter(a => a === null).length : 0,
        answered: !isResultView ? userAnswers.filter((a, i) => {
            const isAnswered = a !== null && !reviewStatus[i];
            if (mode === 'practice' && isAnswered && questions && questions[i].options) {
                return normalize(a) === normalize(questions[i].correct_answer);
            }
            return isAnswered;
        }).length : 0,
        notAnswered: !isResultView ? visitedStatus.filter((v, i) => v && userAnswers[i] === null && !reviewStatus[i]).length : 0,
        marked: !isResultView ? reviewStatus.filter((m, i) => m && userAnswers[i] === null).length : 0,
        notVisited: !isResultView ? total - visitedStatus.filter(v => v).length : 0,
        answeredMarked: !isResultView ? reviewStatus.filter((m, i) => m && userAnswers[i] !== null).length : 0,
    };

    const getBtnClass = (status: string, i: number) => {
        const isCurrent = currentIndex === i;
        const base = "w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center text-xs md:text-sm font-black transition-all border shrink-0 shadow-sm ";
        
        if (isCurrent && !isResultView) {
            return base + "border-indigo-600 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-500/20 z-10 scale-105";
        }

        switch (status) {
            case 'correct-result': return base + "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-100";
            case 'wrong-result': return base + "bg-red-500 border-red-500 text-white shadow-sm shadow-red-100";
            case 'not-answered-result': return base + "bg-slate-100 border-slate-200 text-slate-500";
            case 'wrong': return base + "bg-red-500 border-red-550 text-white";
            case 'answered': return base + "bg-emerald-500 border-emerald-550 text-white";
            case 'not-answered': return base + "bg-rose-500 border-rose-550 text-white";
            case 'marked': return base + "bg-amber-400 border-amber-450 text-slate-800";
            case 'answered-marked': return base + "bg-indigo-600 border-indigo-650 text-white";
            case 'not-visited': return base + "bg-slate-100 border-slate-200 text-slate-450 hover:bg-slate-200/50";
            default: return base + "bg-white border-slate-200 text-slate-600";
        }
    };

    const LegendItem = ({ count, label, colorClass }: { count: number, label: string, colorClass: string }) => (
        <div className="flex items-center space-x-1.5 text-[9px] md:text-[11px] font-bold text-slate-600">
            <div className={`w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center text-[8px] md:text-[10px] text-white font-black shrink-0 ${colorClass}`}>
                {count}
            </div>
            <span className="leading-tight uppercase truncate">{label}</span>
        </div>
    );

    return (
        <div className={`border rounded-lg p-2 h-full flex flex-col w-full shadow-xl overflow-hidden ${isResultView ? 'bg-white border-gray-200' : 'bg-[#f0f7ff] border-blue-200'}`}>
            {/* Status Legend Section */}
            <div className={`p-1.5 rounded-md border shadow-sm shrink-0 mb-2 ${isResultView ? 'bg-gray-50/50 border-gray-100' : 'bg-white/80 border-white'}`}>
                {isResultView ? (
                    <div className="grid grid-cols-2 gap-2">
                        <LegendItem count={stats.correct} label="Correct" colorClass="bg-emerald-600" />
                        <LegendItem count={stats.wrong} label="Incorrect" colorClass="bg-red-500" />
                        <LegendItem count={stats.skipped} label="Skipped" colorClass="bg-gray-300" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2 mb-1.5">
                            <LegendItem count={stats.answered} label={mode === 'practice' ? "Correct" : "Answered"} colorClass="bg-emerald-700" />
                            <LegendItem count={stats.notAnswered} label="Not Ans." colorClass="bg-red-700" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-1.5">
                            <LegendItem count={stats.marked} label="Marked" colorClass="bg-indigo-600" />
                            <LegendItem count={stats.notVisited} label="Not Visited" colorClass="bg-gray-400" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-1.5">
                            {mode === 'practice' && <LegendItem count={stats.wrong} label="Wrong" colorClass="bg-orange-600" />}
                            <LegendItem 
                                count={stats.answeredMarked} 
                                label="Ans. & Marked" 
                                colorClass="bg-gradient-to-tr from-indigo-600 to-emerald-600" 
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Question Number Grid - Forced Scrolling Container */}
            <div className={`rounded-lg p-2 border flex-grow overflow-y-auto custom-scrollbar shadow-inner ${isResultView ? 'bg-gray-50 border-gray-100' : 'bg-white border-blue-100'}`}>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                    {Array.from({ length: total }).map((_, i) => isVisible(i) && (
                        <button
                            key={i}
                            onClick={() => onSelect(i)}
                            className={getBtnClass(getStatus(i), i)}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
                {/* Spacer to ensure bottom row is accessible */}
                <div className="h-3 w-full"></div>
            </div>
        </div>
    );
};

export default QuestionPalette;
