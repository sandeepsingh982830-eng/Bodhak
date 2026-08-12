import React, { useState, useRef } from 'react';
import { Search, FileUp, Loader2, FileText, CheckCircle, AlertCircle, Cloud } from 'lucide-react';
import { scanDocumentForQuery, ScanResult } from '../services/geminiService';
import { useAuth } from '../hooks/useAuth';
import GoogleDrivePicker from './GoogleDrivePicker';
import { AnimatePresence } from 'motion/react';
import { BookRecommendations } from './BookRecommendations';

const PYQScanner = () => {
    const { profile, deductCoins, accessToken, authorizeDrive, recordDailyActivity } = useAuth();
    const [fileStatus, setFileStatus] = useState<string>('');
    const [fileData, setFileData] = useState<{ base64?: string, text?: string, mimeType: string, filename: string }[]>([]);
    const [query, setQuery] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState('');
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        await processFiles(Array.from(files));
    };

    const processFiles = async (files: File[]) => {
        const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB safe limit for Cloud Run's 32MB body limit
        let totalSize = files.reduce((sum, f) => sum + f.size, 0);

        if (totalSize > MAX_TOTAL_SIZE) {
            setError(`Total file size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds the 20MB limit. Please upload fewer or smaller documents.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setFileStatus('');
            return;
        }

        setFileStatus(`Loading ${files.length} file(s)...`);
        setFileData([]);
        setResult(null);
        setError('');

        try {
            const uploadedFiles = [];
            for (const file of files) {
                const isTextFile = file.type === 'text/plain' || file.type === 'text/csv' || file.type === 'text/html' || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.xml');
                
                if (isTextFile) {
                    const text = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsText(file);
                    });
                    uploadedFiles.push({ text: text, mimeType: file.type || 'text/plain', filename: file.name });
                } else {
                    const base64Str = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    uploadedFiles.push({ base64: base64Str, mimeType: file.type || 'application/octet-stream', filename: file.name });
                }
            }
            setFileData(uploadedFiles);
            setFileStatus(`${files.length} file(s) selected`);
        } catch (error) {
            console.error(error);
            setError('Error loading files. Please try again.');
            setFileStatus('');
        }
    };

    const handleDriveFileSelected = async (file: { blob: Blob, name: string, mimeType: string }) => {
        setShowDrivePicker(false);
        setFileStatus(`Processing ${file.name}...`);
        
        try {
            const isTextFile = file.mimeType === 'text/plain' || file.name.endsWith('.txt');
            
            if (isTextFile) {
                const text = await file.blob.text();
                setFileData([{ text, mimeType: file.mimeType, filename: file.name }]);
            } else {
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file.blob);
                });
                const base64Str = await base64Promise;
                setFileData([{ base64: base64Str, mimeType: file.mimeType, filename: file.name }]);
            }
            setFileStatus(`${file.name} imported from Drive`);
        } catch (err) {
            console.error(err);
            setError('Failed to process file from Drive');
            setFileStatus('');
        }
    };

    const handleScan = async () => {
        if (fileData.length === 0) {
            setError('Please upload at least one document first.');
            return;
        }
        if (!query.trim()) {
            setError('Please enter a query.');
            return;
        }

        const isUnlimited = profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                setError("🪙 Inadequate Coins / अपर्याप्त कॉइन! You don't have enough coins (needs 10 coins). Current balance: " + currentCoins + ".");
                alert("🪙 Inadequate Coins / अपर्याप्त कॉइन!\n\nYou don't have enough coins to scan a document (needs 10 coins). Your current balance is " + currentCoins + ".\n\nआपके पास दस्तावेज स्कैन करने के लिए पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। वर्तमान बैलेंस: " + currentCoins + " कॉइन। कृपया अधिक कॉइन प्राप्त करने के लिए मैनेजर से संपर्क करें।");
                return;
            }
        }

        setIsScanning(true);
        setError('');
        setResult(null);

        try {
            const success = await deductCoins(10);
            if (!success) {
                setError('Coin deduction failed. Please check your balance.');
                setIsScanning(false);
                return;
            }

            const res = await scanDocumentForQuery(
                fileData, 
                query
            );
            setResult(res);
            if (recordDailyActivity) {
                recordDailyActivity('pyq_scanner');
            }
        } catch (error: any) {
            console.error(error);
            setError(error.message || 'Error scanning document. Please try again.');
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="flex flex-col items-center h-full w-full max-w-4xl mx-auto p-4 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-500 text-slate-800">
            <div className="bg-white border border-slate-200/85 rounded-3xl p-6 md:p-10 w-full shadow-sm space-y-6">
                
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-indigo-50 border border-indigo-150 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-650 shadow-md">
                        <FileText className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">PYQ Document Scanner</h2>
                    <p className="text-slate-500 text-xs md:text-sm max-w-md mx-auto font-semibold leading-relaxed">
                        Upload your PDF, TXT, or CSV document and ask specific questions. The AI will scan the document and find the information.
                    </p>
                </div>

                <div className="space-y-4 max-w-2xl mx-auto">
                    {/* Document Upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1">Local File (PDF, TXT, CSV)</label>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-6 border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-slate-50 hover:border-indigo-400 rounded-2xl flex flex-col items-center justify-center text-indigo-650 transition-all font-semibold"
                            >
                                <FileUp className="w-6 h-6 mb-2 text-indigo-650" />
                                <span className="font-bold text-[11px]">
                                    {fileStatus && !showDrivePicker ? fileStatus : "Select a local file..."}
                                </span>
                            </button>
                            <input 
                                type="file" 
                                accept=".pdf,.txt,.csv,.html,.xml" 
                                ref={fileInputRef} 
                                className="hidden" 
                                multiple
                                onChange={handleFileUpload}
                            />
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1">Cloud / Google Drive</label>
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
                                        setError('Google Drive access is currently resting on verification. You can still use the local "Select Documents" files option safely! / गूगल ड्राइव एक्सेस सत्यापन के अधीन है। आप स्थानीय फाइलों का उपयोग कर सकते हैं!');
                                    }
                                }}
                                className="w-full py-6 border-2 border-indigo-100 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex flex-col items-center justify-center transition-all font-semibold shadow-lg shadow-indigo-100"
                            >
                                <Cloud className="w-6 h-6 mb-2" />
                                <span className="font-bold text-[11px]">Import from Drive</span>
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showDrivePicker && accessToken && (
                            <GoogleDrivePicker 
                                accessToken={accessToken}
                                onClose={() => setShowDrivePicker(false)}
                                onFileSelected={handleDriveFileSelected}
                            />
                        )}
                    </AnimatePresence>

                    {/* Query Input */}
                    <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1">Your Question / Query</label>
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="What do you want to find in this document?"
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-800 placeholder:text-slate-400 h-28 resize-none shadow-inner text-sm md:text-base font-semibold"
                        ></textarea>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-650 p-3 rounded-xl flex items-center gap-2 text-xs md:text-sm font-semibold shadow-sm">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        onClick={handleScan}
                        disabled={isScanning || fileData.length === 0 || !query.trim()}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-md shadow-indigo-100/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs md:text-sm"
                    >
                        {isScanning ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                <span>Scanning Document...</span>
                            </>
                        ) : (
                            <>
                                <Search className="w-4 h-4" />
                                <span>Scan & Find</span>
                            </>
                        )}
                    </button>
                </div>
                
                {/* Results Section */}
                {result && (
                    <div className="mt-8 pt-8 border-t border-slate-200 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-slate-800">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                                Scan Results / स्कैन परिणाम
                            </h3>
                            <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                Match Found
                            </div>
                        </div>
                        
                        <div className="bg-white border-2 border-slate-100 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl shadow-slate-200/40 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                            
                            <div>
                                <span className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 block mb-4 ml-1">Findings / मुख्य बिंदु</span>
                                <div className="space-y-4">
                                    {(result.answer || "").split('\n').filter(line => line.trim().length > 0).map((point, idx) => {
                                        // Clean markdown markers from point
                                        const cleanPoint = point
                                            .replace(/^[\s\-\*•\d\.]+/g, '') // strip leading markers
                                            .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
                                            .replace(/#{1,}/g, '')
                                            .replace(/&/g, 'and')
                                            .trim();
                                        
                                        if (!cleanPoint) return null;

                                        return (
                                            <div key={idx} className="flex items-start gap-4 group">
                                                <div className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-indigo-600 group-hover:border-indigo-600 transition-colors">
                                                    <span className="text-[10px] font-black text-slate-400 group-hover:text-white">{idx + 1}</span>
                                                </div>
                                                <p className="text-slate-800 text-sm md:text-[15px] leading-relaxed font-bold">
                                                    {cleanPoint}
                                                </p>
                                            </div>
                                        );
                                    })}
                                    {(!result.answer || result.answer.trim().length === 0) && (
                                        <p className="text-slate-400 italic text-sm">No detailed points found.</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                                <div className="space-y-1">
                                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block">Source File / स्रोत फ़ाइल</span>
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                        <p className="text-indigo-600 text-[11px] font-mono font-black truncate">{result.sourceFile}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block">Location / स्थान</span>
                                    <div className="flex items-center gap-2">
                                        <Search className="w-3.5 h-3.5 text-indigo-400" />
                                        <p className="text-slate-700 text-[11px] font-black leading-tight">{result.location}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 block">Certainty / निश्चितता</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                            result.matchType.toLowerCase().includes('both')
                                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                            : result.matchType.toLowerCase().includes('direct') 
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                        }`}>
                                            {result.matchType}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <BookRecommendations topic={query} title={result.answer} />
                        
                        <div className="flex justify-center pt-2">
                            <button 
                                onClick={() => {
                                    setResult(null);
                                    setQuery('');
                                }}
                                className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors flex items-center gap-1.5"
                            >
                                <Search className="w-3 h-3" />
                                Start New Scan / नया स्कैन
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PYQScanner;
