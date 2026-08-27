import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Save, X, Loader2, Sparkles, BookOpen, AlertCircle, FileUp, Zap, HelpCircle, Cloud } from 'lucide-react';
import { BodhakLogo } from './Layout';
import { extractTextFromImage, evaluateAnsChak, cleanTranscribedText } from '../services/geminiService';
import Markdown from 'react-markdown';
import { useAuth } from '../hooks/useAuth';
import GoogleDrivePicker from './GoogleDrivePicker';
import { AnimatePresence } from 'motion/react';
import { BookRecommendations } from './BookRecommendations';

interface AnsChakProps {}

const INFO_TEXT = `### **About Ans. Chak**
Ans. Chak is your personal exam evaluator.

1. **Context:** Write the question or topic in the Box. (e.g. Contribution of Rani Lakshmibai)
2. **Parameters:** Set Max Marks and Word Limit.
3. **Submit Answer:** Upload an image of your handwritten answer, or type it out.
4. **Get Feedback:** Click Analyze. The AI will evaluate your response based on the set parameters.`;

const AnsChak: React.FC<AnsChakProps> = () => {
    const { profile, deductCoins, accessToken, authorizeDrive, recordDailyActivity } = useAuth();
    const [context, setContext] = useState('');
    const [maxMarks, setMaxMarks] = useState('10');
    const [wordLimit, setWordLimit] = useState('200');
    const [answerText, setAnswerText] = useState('');
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [feedback, setFeedback] = useState<any>(null);
    const [showInfo, setShowInfo] = useState(false);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [error, setError] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
        let totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
            setError(`Total file size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds the 20MB limit. Please upload fewer or smaller images/PDFs.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setIsAnalyzing(true);
        setStatusText(`छवि स्कैन की जा रही है... (Scanning ${files.length} images)`);
        setError('');
        
        try {
            let extractedTexts: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setStatusText(`Scanning image ${i + 1} of ${files.length}...`);
                const base64Str = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                const text = await extractTextFromImage(base64Str, file.type);
                if (text && text.trim()) extractedTexts.push(text.trim());
            }
            const joinedText = extractedTexts.join('\n\n');
            setAnswerText(prev => prev ? prev + '\n\n' + joinedText : joinedText);
            setStatusText('');
        } catch (error) {
            console.error(error);
            setError('Error processing image(s). Please try typing your answer.');
        } finally {
            setIsAnalyzing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDriveFileSelected = async (file: { blob: Blob, name: string, mimeType: string }) => {
        setShowDrivePicker(false);
        setIsAnalyzing(true);
        setStatusText(`प्रोसेसिंग: ${file.name}...`);
        setError('');
        
        try {
            const isTextFile = file.mimeType === 'text/plain' || file.name.endsWith('.txt');
            
            if (isTextFile) {
                const text = await file.blob.text();
                if (text && text.trim()) setAnswerText(prev => prev ? prev + '\n\n' + text.trim() : text.trim());
            } else {
                const base64Str = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file.blob);
                });
                const text = await extractTextFromImage(base64Str, file.mimeType);
                if (text && text.trim()) setAnswerText(prev => prev ? prev + '\n\n' + text.trim() : text.trim());
            }
            setStatusText('');
        } catch (error) {
            console.error(error);
            setError('Error processing file from Drive.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAnalyze = async () => {
        setError('');
        if (!context) {
            setError('Please enter a Context / Question before evaluating.');
            return;
        }
        if (!answerText) {
            setError('Please write an answer or upload an image before evaluating.');
            return;
        }

        const isUnlimited = profile?.isManager || 
            (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now()) ||
            (profile?.awPassExpirity && profile.awPassExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                setError("🪙 Inadequate Coins / अपर्याप्त कॉइन! You don't have enough coins (needs 10 coins). Current balance: " + currentCoins + ".");
                alert("🪙 Inadequate Coins / अपर्याप्त कॉइन!\n\nYou don't have enough coins to evaluate an answer (needs 10 coins). Your current balance is " + currentCoins + ".\n\nआपके पास उत्तर जांचने के लिए पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। वर्तमान बैलेंस: " + currentCoins + " कॉइन। कृपया अधिक कॉइन प्राप्त करने के लिए मैनेजर से संपर्क करें।");
                return;
            }
        }

        setIsAnalyzing(true);
        setStatusText('Evaluating your answer...');
        setFeedback(null);

        try {
            const success = await deductCoins(10);
            if (!success) {
                setError('Coin deduction failed. Please check your balance.');
                setIsAnalyzing(false);
                return;
            }

            const result = await evaluateAnsChak({
                context,
                maxMarks,
                wordLimit,
                answerText
            });
            setFeedback(result);
            if (recordDailyActivity) {
                recordDailyActivity('ans_chak');
            }
        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Failed to analyze answer. Please try again.";
            alert(msg);
            setError(msg);
        } finally {
            setIsAnalyzing(false);
            setStatusText('');
        }
    };

    return (
        <div className="flex flex-col h-full w-full overflow-y-auto text-slate-800 font-sans animate-in fade-in duration-500 pb-12">
            
            {showInfo && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-150 flex justify-between items-center bg-indigo-50">
                            <h2 className="font-extrabold flex items-center gap-2 text-indigo-900"><HelpCircle className="w-5 h-5 text-indigo-650" /> About Ans. Chak</h2>
                            <button onClick={() => setShowInfo(false)} className="hover:bg-slate-100 text-slate-400 hover:text-slate-700 p-1 rounded-md transition"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto prose prose-indigo max-w-none text-slate-700 text-sm font-semibold leading-relaxed">
                            <Markdown>{INFO_TEXT}</Markdown>
                        </div>
                        <div className="p-4 bg-slate-50 text-right border-t border-slate-150">
                            <button onClick={() => setShowInfo(false)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 transition text-white rounded-xl font-extrabold text-xs uppercase shadow-sm">Got it</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="p-4 md:p-8 w-full max-w-4xl mx-auto space-y-6">
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <BodhakLogo />
                        <div>
                            <h1 className="text-2xl font-black text-slate-855 tracking-tight">Ans. Chak</h1>
                            <p className="text-xs font-semibold text-slate-450"> Answer Evaluator</p>
                        </div>
                    </div>
                    <button onClick={() => setShowInfo(true)} className="p-2.5 bg-white border border-slate-250 rounded-xl hover:bg-slate-50 transition shadow-sm text-slate-500" title="Help">
                        <HelpCircle className="w-5 h-5" />
                    </button>
                </div>

                {!feedback ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                        
                        <div>
                            <label className="text-xs text-indigo-600 uppercase font-black tracking-wider mb-2 block">Context / Question Details</label>
                            <input 
                                type="text"
                                placeholder="e.g. Contribution of Rani Lakshmibai"
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 text-slate-805"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-indigo-600 uppercase font-black tracking-wider mb-2 block">Max Marks </label>
                                <input 
                                    type="number"
                                    value={maxMarks}
                                    onChange={(e) => setMaxMarks(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-805"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-indigo-600 uppercase font-black tracking-wider mb-2 block">Word Limit </label>
                                <input 
                                    type="number"
                                    value={wordLimit}
                                    onChange={(e) => setWordLimit(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-805"
                                />
                            </div>
                        </div>

                        {context && <BookRecommendations topic={context} />}

                        <div className="pt-2 border-t border-slate-150">
                            <label className="text-xs text-indigo-600 uppercase font-black tracking-wider mb-2 block">Your Handwritten / Typed Answer</label>
                            
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-5 border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70 rounded-xl flex flex-col items-center justify-center text-indigo-650 transition cursor-pointer"
                                    >
                                        <FileUp className="w-6 h-6 mb-2 text-indigo-500" />
                                        <span className="font-extrabold text-sm text-indigo-800">
                                            {answerText ? "Add local page" : "Upload Local Image"}
                                        </span>
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setError('');
                                            try {
                                                if (!accessToken) {
                                                    await authorizeDrive();
                                                }
                                                setShowDrivePicker(true);
                                            } catch (err: any) {
                                                console.error("Authorize drive failed:", err);
                                                setError('Google Drive access is currently resting on verification. You can still use the "Upload Local Image" option below securely! / गूगल ड्राइव एक्सेस सत्यापन के अधीन है। आप स्थानीय रूप से "Upload Local Image" उपयोग कर सकते हैं!');
                                            }
                                        }}
                                        className="w-full py-5 border-2 border-indigo-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex flex-col items-center justify-center transition shadow-lg shadow-indigo-100"
                                    >
                                        <Cloud className="w-6 h-6 mb-2" />
                                        <span className="font-extrabold text-sm">
                                            {answerText ? "Add Drive page" : "Import from Drive"}
                                        </span>
                                    </button>
                                </div>
                                <input 
                                    type="file" 
                                    accept="image/*,.pdf" 
                                    multiple
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={handleFileUpload}
                                />
                                <AnimatePresence>
                                    {showDrivePicker && accessToken && (
                                        <GoogleDrivePicker 
                                            accessToken={accessToken}
                                            onClose={() => setShowDrivePicker(false)}
                                            onFileSelected={handleDriveFileSelected}
                                        />
                                    )}
                                </AnimatePresence>
                                
                                <div className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">or</div>

                                <textarea
                                    value={answerText}
                                    onChange={(e) => setAnswerText(e.target.value)}
                                    placeholder="या उत्तर यहाँ लिखें... (Or write answer here...)"
                                    className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none font-bold text-slate-805 placeholder:text-slate-400 text-sm leading-relaxed"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-650 p-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button 
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl flex items-center justify-center space-x-2 transition-all disabled:opacity-75 shadow-md shadow-indigo-100 cursor-pointer"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>{statusText}</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5" />
                                    <span>Check Answer</span>
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex-wrap gap-2">
                             <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-50 text-indigo-650 rounded-xl border border-indigo-150">
                                    <CheckCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Evaluation Score</div>
                                    <div className="text-2xl font-black text-slate-850">{feedback.score} <span className="text-sm font-bold text-slate-400">/ {maxMarks}</span></div>
                                </div>
                             </div>
                             <button
                                onClick={() => setFeedback(null)}
                                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-extrabold rounded-xl text-xs uppercase tracking-tight transition"
                             >
                                Check Another
                             </button>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-x-auto">
                            <h3 className="font-extrabold text-slate-850 mb-4 text-base">Criteria-wise Score Breakdown</h3>
                            
                            <table className="w-full text-left text-xs md:text-sm text-slate-600 min-w-[700px] font-semibold">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-xl text-slate-700">Criterion</th>
                                        <th className="px-4 py-3 text-slate-700">Weightage</th>
                                        <th className="px-4 py-3 text-slate-700">Max Marks</th>
                                        <th className="px-4 py-3 text-slate-700">Awarded</th>
                                        <th className="px-4 py-3 text-slate-700">Status</th>
                                        <th className="px-4 py-3 rounded-tr-xl text-slate-700">Justification</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feedback.criteriaScores?.map((score: any, index: number) => (
                                        <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                                            <td className="px-4 py-3 font-bold text-slate-800">{score.name}</td>
                                            <td className="px-4 py-3 text-slate-500 font-mono">{score.weightage}%</td>
                                            <td className="px-4 py-3 text-slate-500 font-mono">{score.maxMarks.toFixed(1)}</td>
                                            <td className="px-4 py-3 font-black text-slate-900 font-mono">{score.awardedMarks.toFixed(1)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border ${
                                                    score.status === 'WELL DONE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                    score.status === 'CAN IMPROVE' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                    'bg-red-50 border-red-200 text-red-700'
                                                }`}>
                                                    {score.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs leading-relaxed max-w-xs text-slate-500 font-bold">{score.justification}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h3 className="font-extrabold text-slate-850 mb-4 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-550" /> Actionable Improvement Plan
                            </h3>
                            <div className="space-y-4">
                                {feedback.improvements?.map((imp: any, i: number) => (
                                    <div key={i} className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 font-semibold">
                                        <div className="flex gap-2 items-start mb-2">
                                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="text-[10px] font-black text-red-650 uppercase tracking-wider block mb-1">Issue Overview</span>
                                                <span className="text-sm text-slate-700">{imp.issue}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-start pl-6 mt-3 border-t border-slate-150 pt-3">
                                            <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="text-[10px] font-black text-emerald-650 uppercase tracking-wider block mb-1">Strategic Solution</span>
                                                <span className="text-sm text-emerald-850">{imp.solution}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {(feedback.modelIntro || feedback.modelConclusion) && (
                            <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-6 shadow-sm">
                                <h3 className="font-extrabold text-indigo-900 flex items-center gap-2 mb-4">
                                    <Zap className="w-4.5 h-4.5 text-indigo-650" /> Model Introduction & Conclusion
                                </h3>
                                
                                <div className="space-y-4">
                                    {feedback.modelIntro && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-indigo-500 mb-1 uppercase tracking-wider">Model Intro</h4>
                                            <p className="text-sm text-indigo-950 italic border-l-3 border-indigo-250 pl-3 leading-relaxed font-semibold">{feedback.modelIntro}</p>
                                        </div>
                                    )}
                                    {feedback.modelConclusion && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-indigo-500 mb-1 uppercase tracking-wider">Model Conclusion</h4>
                                            <p className="text-sm text-indigo-950 italic border-l-3 border-indigo-250 pl-3 leading-relaxed font-semibold">{feedback.modelConclusion}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h3 className="font-extrabold text-slate-850 mb-2">Overall Feedback</h3>
                            <div className="prose prose-indigo prose-sm max-w-none text-slate-700 font-semibold leading-relaxed">
                                <Markdown>{feedback.overallFeedback}</Markdown>
                            </div>
                        </div>

                        {context && <BookRecommendations topic={context} />}
                        
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-6">
                            <h3 className="font-extrabold text-slate-800 mb-2 text-xs uppercase tracking-wider">Your Submitted Answer</h3>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap font-semibold leading-relaxed bg-white p-4 rounded-xl border border-slate-200">
                                {answerText}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnsChak;
