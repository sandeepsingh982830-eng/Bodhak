import React, { useState, useEffect, useRef } from 'react';
import { NoteConfig, SavedNote, NoteTemplate } from '../types';
import { saveNote, getSavedNotes, deleteNote } from '../services/storageService';
import { generateNotes, extractTextFromImage } from '../services/geminiService';
import { BookOpen, FileText, Trash2, Loader2, FileUp, Save, Download, HelpCircle, X, Copy, PanelLeft, Sparkles, Clock, ArrowUpRight, Brain, Tag, Calendar, Search, Cloud, BookmarkPlus, CheckCircle, Layout, Palette, Columns, Grid, AlignLeft } from 'lucide-react';
import Markdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { BodhakLogo } from './Layout';
import { useAuth } from '../hooks/useAuth';
import GoogleDrivePicker from './GoogleDrivePicker';
import { AnimatePresence } from 'motion/react';
import { BookRecommendations } from './BookRecommendations';
import { db } from '../services/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import NoteTemplateRenderer, { TEMPLATE_OPTIONS, TemplateMiniWireframe } from './NoteTemplateRenderer';

interface SmartNotesProps {}

const INFO_TEXT = `**Bodhak: Smart Notes** is a smart tool designed to convert any information, link, or document into organized and easy-to-read notes. Based on the interface visible on your screen, here is a breakdown of its features and how it works:

### **Key Features of Bodhak: Smart Notes**

* **Source Upload:** You can provide the study material by clicking "UPLOAD SOURCE" to add documents or paste a URL.
* **Multilingual Support:** The tool allows you to generate notes in English (ENG), Hindi (HIN), or Punjabi (PNB).
* **Custom Formats:**
  * **Smart:** Focuses on key topic keywords and vital terms for rapid scanning (max limit).
  * **Detail:** In-depth and comprehensive information.
  * **Point:** Bullet points, which are great for quick revisions.
* **Educational Templates (टेम्पलेट्स):**
  * **A4 Educational Infographic:** Clean vertical infographic with top decorative title frame, wide definition box, colorful gradient sub-heading cards (orange, teal, purple, emerald, rose) with icons and neat bullet points.
  * **Cornell Study Sheet:** 2-column layout (left cue keywords, right detailed notes, bottom summary).
  * **Cheat Sheet Grid:** High-density bento grid for quick exam revision.
  * **Editorial Brief:** Refined editorial typography and callouts.
  * **Classic Document:** Standard linear study sheets.
* **Include Add-ons (Toggles):**
  * **Current Affairs:** Adds recent developments related to the topic.
  * **Vocabulary:** Adds a list of difficult words with their meanings.
* **Word Limit:** You can set a specific length for your notes.
* **My Notebook:** A library for all your saved notes, permanently preserved in your chosen template.`;

const INITIAL_CONFIG: NoteConfig = {
    subject: '',
    topic: '',
    language: 'English',
    format: 'Detail',
    template: 'infographic',
    includeCurrentAffairs: false,
    includeVocabulary: false,
    wordLimit: 1000
};

const SmartNotes: React.FC<SmartNotesProps> = () => {
    const { profile, deductCoins, accessToken, authorizeDrive, recordDailyActivity } = useAuth();
    const isManager = profile?.isManager || 
                     ['sandeepsinghchouhan081@gmail.com', 'bodhak355@gmail.com'].includes(profile?.email?.toLowerCase() || '');

    const [config, setConfig] = useState<NoteConfig>(INITIAL_CONFIG);
    const [isGenerating, setIsGenerating] = useState(false);
    const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
    const [activeNote, setActiveNote] = useState<SavedNote | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Save Note to Free Material State
    const [saveModalNote, setSaveModalNote] = useState<SavedNote | null>(null);
    const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string>('new');
    const [newFolderName, setNewFolderName] = useState<string>('');
    const [materialTitle, setMaterialTitle] = useState<string>('');
    const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
    const [savingNoteFree, setSavingNoteFree] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const handleOpenSaveNoteModal = async (note: SavedNote, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSaveModalNote(note);
        setMaterialTitle(`${note.config.subject || 'Notes'}${note.config.topic ? ` - ${note.config.topic}` : ''}`);
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

    const handleSaveNoteToFreeMaterial = async () => {
        if (!saveModalNote) return;
        if (!materialTitle.trim()) {
            alert("Please enter a title for the study notes.");
            return;
        }

        setSavingNoteFree(true);
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
                type: 'note',
                createdAt: Date.now(),
                noteData: {
                    config: saveModalNote.config,
                    content: saveModalNote.content,
                    handwrittenImageUrl: saveModalNote.handwrittenImageUrl || ''
                }
            });

            setSaveModalNote(null);
            setToastMessage("Note saved to Free Study Material successfully! / नोट्स फ्री स्टडी मटीरियल में सेव हो गए हैं!");
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err: any) {
            console.error("Error saving note to free materials:", err);
            alert("Failed to save note to Free Study Material: " + err.message);
        } finally {
            setSavingNoteFree(false);
        }
    };

    useEffect(() => {
        const fetchNotes = async () => {
            const notes = await getSavedNotes();
            setSavedNotes(notes);
        };
        fetchNotes();
    }, [profile?.userId]);

    const handleChange = (key: keyof NoteConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const MAX_SIZE = 20 * 1024 * 1024; // 20MB
        if (file.size > MAX_SIZE) {
            alert(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 20MB limit. Please upload a smaller PDF.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setIsUploading(true);
        try {
            if (file.type === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const result = e.target?.result as string;
                    if (result) {
                        const base64Data = result.split(',')[1];
                        const mimeType = result.split(',')[0].split(':')[1].split(';')[0];
                        const text = await extractTextFromImage(base64Data, mimeType);
                        handleChange('sourceText', text);
                        handleChange('sourceFileName', file.name);
                    }
                    setIsUploading(false);
                };
                reader.onerror = () => {
                    alert("Failed to read file.");
                    setIsUploading(false);
                };
                reader.readAsDataURL(file);
                return; // let reader finish
            } else {
                alert("Only PDF files are supported for notes source currently.");
                setIsUploading(false);
            }
        } catch (err) {
            console.error('File upload failed', err);
            alert("Failed to process file.");
            setIsUploading(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDriveFileSelected = async (file: { blob: Blob, name: string, mimeType: string }) => {
        setShowDrivePicker(false);
        setIsUploading(true);
        try {
            const isTextFile = file.mimeType === 'text/plain' || file.name.endsWith('.txt');
            
            if (isTextFile) {
                const text = await file.blob.text();
                handleChange('sourceText', text);
                handleChange('sourceFileName', file.name);
            } else if (file.mimeType === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const result = e.target?.result as string;
                    if (result) {
                        const base64Data = result.split(',')[1];
                        const mimeType = result.split(',')[0].split(':')[1].split(';')[0];
                        const text = await extractTextFromImage(base64Data, mimeType);
                        handleChange('sourceText', text);
                        handleChange('sourceFileName', file.name);
                    }
                    setIsUploading(false);
                };
                reader.onerror = () => {
                    alert("Failed to read file.");
                    setIsUploading(false);
                };
                reader.readAsDataURL(file.blob);
                return;
            } else {
                alert("Only PDF and text files are supported for notes source currently.");
            }
        } catch (err) {
            console.error(err);
            alert('Failed to process file from Drive');
        } finally {
            setIsUploading(false);
        }
    };

    const handleGenerate = async () => {
        if (!config.subject || !config.topic) {
            alert("Please provide both subject and topic.");
            return;
        }

        const isUnlimited = profile?.isManager || (profile?.unlimitedExpirity && profile.unlimitedExpirity > Date.now());
        if (profile && !isUnlimited) {
            const currentCoins = profile.coins !== undefined ? profile.coins : 50;
            if (currentCoins < 10) {
                alert("🪙 Inadequate Coins / अपर्याप्त कॉइन!\n\nYou don't have enough coins to generate Smart Notes (needs 10 coins). Your current balance is " + currentCoins + ".\n\nआपके पास नोट्स जनरेट करने के लिए पर्याप्त कॉइन नहीं हैं (10 कॉइन आवश्यक)। वर्तमान बैलेंस: " + currentCoins + " कॉइन। कृपया अधिक कॉइन प्राप्त करने के लिए मैनेजर से संपर्क करें।");
                return;
            }
        }

        setIsGenerating(true);
        try {
            const success = await deductCoins(10);
            if (!success) {
                alert("🪙 Coin deduction failed. Please check your balance.");
                setIsGenerating(false);
                return;
            }

            const templateToUse = config.template || 'infographic';
            const finalConfig = { ...config, template: templateToUse };
            const result = await generateNotes(finalConfig);
            const newNote = await saveNote({ 
                config: finalConfig, 
                content: result.content, 
                handwrittenImageUrl: result.handwrittenImageUrl 
            });
            const notes = await getSavedNotes();
            setSavedNotes(notes);
            setActiveNote(newNote);
            if (recordDailyActivity) {
                recordDailyActivity('smart_notes');
            }
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Failed to generate notes. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = async () => {
        if (!activeNote || !activeNote.content) return;
        
        const element = document.getElementById('note-content-to-print');
        if (!element) {
            // Fallback to basic text copy if DOM element not found
            navigator.clipboard.writeText(activeNote.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            return;
        }

        try {
            // Create a temporary container to style the HTML for better paste compatibility
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = element.innerHTML;
            
            // Remove download links, buttons or icons from the copy
            const buttons = tempDiv.querySelectorAll('button, a[download], svg');
            buttons.forEach(b => b.remove());

            // Handle Duplication: If markdown content already has the topic/title, remove the redundant top header
            const prose = tempDiv.querySelector('.prose');
            if (prose) {
                const headersInProse = prose.querySelectorAll('h1, h2');
                let foundDuplicate = false;
                headersInProse.forEach(h => {
                    const text = (h.textContent || "").toLowerCase().trim();
                    const topic = activeNote.config.topic.toLowerCase().trim();
                    if (text.includes(topic) || topic.includes(text)) {
                        foundDuplicate = true;
                    }
                });

                if (foundDuplicate) {
                    const redundantHeaders = tempDiv.querySelectorAll('.note-copy-header');
                    redundantHeaders.forEach(rh => rh.remove());
                }
            }

            // Apply premium inline styles for a beautiful look on paste
            tempDiv.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            tempDiv.style.color = '#334155';
            tempDiv.style.lineHeight = '1.6';

            const headings = tempDiv.querySelectorAll('h1, h2, h3, h4');
            headings.forEach(h => {
                const el = h as HTMLElement;
                el.style.color = '#0f172a';
                el.style.fontWeight = '800';
                el.style.marginTop = '1.5em';
                el.style.marginBottom = '0.75em';
                el.style.borderBottom = el.tagName === 'H1' || el.tagName === 'H2' ? '2px solid #6366f1' : 'none';
                el.style.paddingBottom = '8px';
                el.style.fontSize = el.tagName === 'H1' ? '24pt' : el.tagName === 'H2' ? '18pt' : '14pt';
            });

            const paragraphs = tempDiv.querySelectorAll('p');
            paragraphs.forEach(p => {
                const el = p as HTMLElement;
                el.style.marginBottom = '1em';
                el.style.fontSize = '11pt';
            });

            const strongs = tempDiv.querySelectorAll('strong, b');
            strongs.forEach(s => {
                const el = s as HTMLElement;
                el.style.color = '#4f46e5';
                el.style.fontWeight = '700';
                el.style.backgroundColor = '#f5f3ff';
                el.style.padding = '0 2px';
            });

            const blockquotes = tempDiv.querySelectorAll('blockquote');
            blockquotes.forEach(bq => {
                const el = bq as HTMLElement;
                el.style.borderLeft = '4px solid #fbbf24';
                el.style.backgroundColor = '#fffbeb';
                el.style.padding = '12px 20px';
                el.style.margin = '1.5em 0';
                el.style.fontStyle = 'italic';
                el.style.color = '#92400e';
            });

            const listItems = tempDiv.querySelectorAll('li');
            listItems.forEach(li => {
                const el = li as HTMLElement;
                el.style.marginBottom = '0.5em';
            });

            const html = tempDiv.innerHTML;
            const text = element.innerText; // Get clean visible text with layout preserved
            
            // ClipboardItem API for rich text copy
            if (typeof ClipboardItem !== 'undefined') {
                const blobHtml = new Blob([html], { type: 'text/html' });
                const blobText = new Blob([text], { type: 'text/plain' });
                
                const data = [new ClipboardItem({
                    'text/html': blobHtml,
                    'text/plain': blobText,
                })];
                
                await navigator.clipboard.write(data);
            } else {
                // Fallback for browsers that don't support ClipboardItem
                await navigator.clipboard.writeText(text);
            }
            
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error('Clipboard write failed', err);
            // Last resort fallback to raw markdown content
            navigator.clipboard.writeText(activeNote.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await deleteNote(id);
        const updated = await getSavedNotes();
        setSavedNotes(updated);
        if (activeNote?.id === id) {
            setActiveNote(updated.length > 0 ? updated[0] : null);
        }
    };

    const handleSaveDoc = () => {
        if (!activeNote) return;
        const element = document.getElementById('note-content-to-print');
        if (!element) return;
        const opt = {
            margin:       10,
            filename:     `${activeNote.config.subject}_${activeNote.config.topic}_Notes.pdf`,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        // @ts-ignore
        html2pdf().set(opt).from(element).save();
    };

    return (
        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden text-slate-800 font-sans animate-in fade-in duration-500">
            {/* Info Modal */}
            {showInfo && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl text-slate-800">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-indigo-50/50">
                            <div className="flex items-center space-x-2">
                                <HelpCircle className="w-4 h-4 text-indigo-600" />
                                <h2 className="font-extrabold text-slate-800 text-sm md:text-base">About Bodhak: Smart Notes</h2>
                            </div>
                            <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-slate-600 transition p-1">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto prose prose-slate max-w-none text-xs md:text-sm font-semibold
                            prose-headings:font-black prose-headings:text-slate-800
                            prose-strong:text-indigo-600
                        ">
                            <Markdown>{INFO_TEXT}</Markdown>
                        </div>
                        <div className="p-4 border-t border-slate-150 bg-slate-50 text-right">
                           <button onClick={() => setShowInfo(false)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all shadow-md text-xs md:text-sm">
                               Got it!
                           </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    className="md:hidden fixed inset-0 bg-slate-900/20 z-40 backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            {isSidebarOpen && (
            <div className="absolute md:relative z-50 h-full w-[80%] max-w-[280px] md:w-64 flex-shrink-0 border-r border-slate-200 bg-white shadow-md md:shadow-none overflow-y-auto flex flex-col animate-in slide-in-from-left duration-300">
                <div className="p-4 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-md z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center space-x-2">
                           <div className="w-8 h-8 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center justify-center text-indigo-600">
                              <BookOpen className="w-4 h-4" />
                           </div>
                           <h2 className="font-black text-slate-800 text-sm tracking-tight">My Notebook</h2>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-black tracking-wider">{savedNotes.length} Saved Notes</p>
                    </div>
                    <div className="flex items-center space-x-1">
                        <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 transition" title="Hide Sidebar">
                            <PanelLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowInfo(true)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600 transition" title="Info">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 p-3 space-y-2">
                    <button 
                        onClick={() => setActiveNote(null)}
                        className={`w-full text-left p-3 rounded-xl transition-all flex items-center space-x-3 border ${!activeNote ? 'bg-indigo-50 border-indigo-200' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-650 font-black text-xs">
                            +
                        </div>
                        <div>
                            <div className="font-bold text-slate-800 text-xs md:text-sm">New Note</div>
                            <div className="text-[10px] text-slate-450 font-medium">Create a new summary</div>
                        </div>
                    </button>
                    {savedNotes.map(note => (
                        <div 
                            key={note.id}
                            onClick={() => setActiveNote(note)}
                            className={`w-full text-left p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group border ${activeNote?.id === note.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold' : 'bg-white border-transparent text-slate-600 hover:bg-slate-50'}`}
                        >
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="font-bold text-slate-805 text-xs truncate">{note.config.subject}</div>
                                <div className="text-[10px] text-slate-450 truncate font-semibold">{note.config.topic}</div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isManager && (
                                    <button 
                                        onClick={(e) => handleOpenSaveNoteModal(note, e)}
                                        className="text-amber-600 hover:text-amber-700 transition-colors p-1.5 rounded-lg hover:bg-amber-50"
                                        title="Free Study Material में सेव करें"
                                    >
                                        <BookmarkPlus className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button 
                                    onClick={(e) => handleDelete(note.id, e)}
                                    className="text-slate-350 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                                    title="Delete Note"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-hidden relative">
                {!isSidebarOpen && !activeNote && (
                    <div className="absolute top-4 left-4 z-50 animate-in fade-in">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white hover:bg-slate-50 border border-slate-250 rounded-lg text-slate-700 shadow-sm backdrop-blur-sm transition" title="Show Sidebar">
                            <PanelLeft className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {!activeNote ? (
                    <div className="p-4 md:p-8 overflow-y-auto w-full max-w-4xl mx-auto h-full space-y-6">
                         <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                {/* Subject & Topic */}
                                <div>
                                    <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-1 block">Subject</label>
                                    <input 
                                        type="text" 
                                        value={config.subject}
                                        onChange={(e) => handleChange('subject', e.target.value)}
                                        className="w-full bg-slate-50/50 border border-slate-205 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs md:text-sm font-semibold text-slate-800 placeholder:text-slate-400"
                                        placeholder="e.g. Polity"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-1 block">Topic</label>
                                    <input 
                                        type="text" 
                                        value={config.topic}
                                        onChange={(e) => handleChange('topic', e.target.value)}
                                        className="w-full bg-slate-50/50 border border-slate-205 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs md:text-sm font-semibold text-slate-800 placeholder:text-slate-400"
                                        placeholder="e.g. PM"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {/* Source & Lang */}
                                <div>
                                    <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-1 block">Source Material</label>
                                    <div className="flex flex-col space-y-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploading}
                                                className="flex items-center justify-center space-x-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl p-3 transition-all text-xs font-black text-indigo-650"
                                            >
                                                {isUploading && !showDrivePicker ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <FileUp className="w-4 h-4" />}
                                                <span className="truncate">{config.sourceFileName && !showDrivePicker ? config.sourceFileName : "Local PDF"}</span>
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        if (!accessToken) {
                                                            await authorizeDrive();
                                                        }
                                                        setShowDrivePicker(true);
                                                    } catch (err: any) {
                                                        console.error("Authorize drive failed:", err);
                                                        alert("Google Drive access is currently resting on verification. You can still use the local 'Local PDF' option safely! / गूगल ड्राइव एक्सेस सत्यापन के अधीन है। आप स्थानीय रूप से 'Local PDF' विकल्प उपयोग कर सकते हैं!");
                                                    }
                                                }}
                                                className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-3 transition-all text-xs font-black shadow-lg shadow-indigo-100"
                                            >
                                                <Cloud className="w-4 h-4" />
                                                <span className="truncate">Drive</span>
                                            </button>
                                        </div>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            accept="application/pdf"
                                            onChange={handleFileUpload}
                                            className="hidden"
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
                                        {config.sourceFileName && (
                                            <button 
                                                onClick={() => { handleChange('sourceText', undefined); handleChange('sourceFileName', undefined); }}
                                                className="text-[10px] text-red-500 hover:underline w-full text-center py-1 font-bold"
                                            >
                                                Clear file
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-1 block">Language</label>
                                    <div className="flex bg-slate-100 rounded-xl border border-slate-200 p-1 font-black text-xs uppercase tracking-wider">
                                        {['English', 'Hindi', 'Punjabi'].map(lang => (
                                            <button
                                                key={lang}
                                                onClick={() => handleChange('language', lang)}
                                                className={`flex-1 py-2 rounded-lg transition-all text-[10px] md:text-xs uppercase font-black ${config.language === lang ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-450 hover:text-slate-700'}`}
                                            >
                                                {lang === 'English' ? 'ENG' : (lang === 'Hindi' ? 'HIN' : 'PNB')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <hr className="border-slate-150 my-4" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Format */}
                                <div>
                                     <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-2 block">Format / फॉर्मेट</label>
                                     <div className="grid grid-cols-3 gap-2">
                                        {['Smart', 'Detail', 'Point'].map(f => (
                                            <button
                                                key={f}
                                                onClick={() => handleChange('format', f)}
                                                className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl border transition-all text-xs font-black ${config.format === f ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-550 hover:bg-slate-100 hover:border-slate-300'}`}
                                            >
                                                {f === 'Smart' && <span className="text-sm">⚡</span>}
                                                {f === 'Detail' && <FileText className="w-3.5 h-3.5" />}
                                                {f === 'Point' && <div className="space-y-0.5"><div className="w-1 h-1 bg-current rounded-full" /><div className="w-1 h-1 bg-current rounded-full" /></div>}
                                                <span>{f}</span>
                                            </button>
                                        ))}
                                     </div>
                                </div>

                                {/* Include & Limits */}
                                <div className="space-y-3">
                                    <label className="text-[10px] text-indigo-600 uppercase font-black tracking-wider ml-1 mb-2 block">Include & Limits</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button 
                                            onClick={() => handleChange('includeCurrentAffairs', !config.includeCurrentAffairs)}
                                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[11px] font-extrabold transition-all ${config.includeCurrentAffairs ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            <span>Current Affairs</span>
                                            <div className={`w-6 h-3 rounded-full relative transition-all ${config.includeCurrentAffairs ? 'bg-indigo-600' : 'bg-slate-250'}`}>
                                                <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${config.includeCurrentAffairs ? 'right-0.5' : 'left-0.5'}`} />
                                            </div>
                                        </button>
                                        <button 
                                            onClick={() => handleChange('includeVocabulary', !config.includeVocabulary)}
                                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[11px] font-extrabold transition-all ${config.includeVocabulary ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            <span>Vocabulary</span>
                                            <div className={`w-6 h-3 rounded-full relative transition-all ${config.includeVocabulary ? 'bg-indigo-600' : 'bg-slate-250'}`}>
                                                <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${config.includeVocabulary ? 'right-0.5' : 'left-0.5'}`} />
                                            </div>
                                        </button>
                                        
                                        <div className={`flex items-center space-x-2 p-1.5 px-3.5 rounded-full border border-indigo-200 bg-indigo-50/20 text-xs font-bold w-full max-w-[160px]`}>
                                            <span className="text-indigo-600 text-sm">#</span>
                                            <span className="text-indigo-650/85 uppercase tracking-wider text-[10px]">Min Words</span>
                                            <input 
                                                type="number"
                                                value={config.minWordLimit || 500}
                                                onChange={(e) => handleChange('minWordLimit', parseInt(e.target.value) || 500)}
                                                className="bg-transparent border-none w-12 outline-none text-indigo-700 text-right ml-auto font-black"
                                                min="100"
                                                step="100"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Templet / Template Selection Section */}
                            <div className="mt-6 pt-5 border-t border-slate-150">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3.5 gap-1">
                                    <label className="text-[11px] text-indigo-600 uppercase font-black tracking-wider flex items-center gap-1.5">
                                        <Palette className="w-3.5 h-3.5" />
                                        <span>Templet / नोट्स टेम्पलेट चुनें (Single Choice)</span>
                                    </label>
                                    <span className="text-[10px] text-slate-500 font-bold bg-indigo-50/60 border border-indigo-150/70 px-2 py-0.5 rounded-md">
                                        🔒 चुने गए टेम्पलेट में ही नोट्स बनेंगे व सुरक्षित रहेंगे
                                    </span>
                                </div>

                                {/* 2 facing each other on mobile (grid-cols-2), 4 in rows on laptop (lg:grid-cols-4) */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                                    {TEMPLATE_OPTIONS.map((tmpl) => {
                                        const isSelected = (config.template || 'infographic') === tmpl.id;
                                        return (
                                            <button
                                                key={tmpl.id}
                                                type="button"
                                                onClick={() => handleChange('template', tmpl.id)}
                                                className={`group relative text-left p-2.5 sm:p-3 rounded-2xl border-2 transition-all aspect-square flex flex-col justify-between overflow-hidden cursor-pointer ${
                                                    isSelected 
                                                        ? 'border-indigo-600 bg-indigo-50/40 shadow-md ring-2 ring-indigo-500/25' 
                                                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/80 text-slate-700 shadow-2xs'
                                                }`}
                                            >
                                                {tmpl.badge && (
                                                    <span className={`absolute top-2 right-2 z-10 text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-full shadow-2xs ${
                                                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-900/80 text-white backdrop-blur-xs'
                                                    }`}>
                                                        {tmpl.badge}
                                                    </span>
                                                )}

                                                {/* Visual Preview Wireframe Thumbnail */}
                                                <div className={`w-full flex-1 min-h-0 rounded-xl overflow-hidden mb-2 p-1 flex items-center justify-center border transition-all ${
                                                    isSelected ? 'bg-white border-indigo-200 shadow-2xs' : 'bg-slate-50/80 border-slate-200/70 group-hover:border-indigo-200 group-hover:bg-white'
                                                }`}>
                                                    <div className="w-full h-full transform transition-transform duration-200 group-hover:scale-[1.02]">
                                                        <TemplateMiniWireframe templateId={tmpl.id} isSelected={isSelected} />
                                                    </div>
                                                </div>

                                                {/* Template Meta & Selection Indicator */}
                                                <div className="w-full pt-1.5 border-t border-slate-150/80 flex items-center justify-between gap-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-sm flex-shrink-0">{tmpl.icon}</span>
                                                        <span className="font-extrabold text-[11px] sm:text-xs text-slate-900 truncate leading-tight">
                                                            {tmpl.shortName || tmpl.name}
                                                        </span>
                                                    </div>
                                                    <span className={`text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                                        isSelected ? 'bg-indigo-600 text-white' : 'text-slate-400 bg-slate-100'
                                                    }`}>
                                                        {isSelected ? '✓ Selected' : tmpl.hindiName}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                         </div>

                         {config.topic && <BookRecommendations topic={config.topic} />}
                         
                         <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="w-full lg:w-1/2 lg:float-right bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs md:text-sm font-black p-4 rounded-xl shadow-md shadow-indigo-100 transition-all flex justify-center items-center h-14 cursor-pointer"
                         >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="animate-spin h-5 w-5 mr-2 text-white" />
                                    <span>GENERATING NOTES...</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-base mr-2">⚡</span>
                                    <span>GENERATE DETAILED NOTES</span>
                                </>
                            )}
                         </button>
                     </div>
                ) : (
                    <div className="flex flex-col h-full bg-slate-100 text-slate-800 overflow-hidden shadow-2xl">
                        {/* Notes Toolbar */}
                        <div className="bg-white border-b border-slate-200 p-3 flex flex-wrap justify-between items-center z-10 shadow-xs font-semibold gap-3">
                            <div className="flex items-center space-x-3">
                                {!isSidebarOpen && (
                                    <button onClick={() => setIsSidebarOpen(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition cursor-pointer" title="Show Sidebar">
                                        <PanelLeft className="w-4 h-4" />
                                    </button>
                                )}
                                <div className="scale-75 -ml-2 -my-2 flex items-center justify-center">
                                    <BodhakLogo />
                                </div>
                                <h2 className="font-bold text-base md:text-lg text-slate-800"><span className="opacity-50">Bodhak:</span> Notes</h2>
                            </div>

                            {/* Locked Template Indicator Badge (Template cannot be changed after creation) */}
                            {(() => {
                                const currentTmplId = activeNote.config.template || 'infographic';
                                const currentTmpl = TEMPLATE_OPTIONS.find(t => t.id === currentTmplId) || TEMPLATE_OPTIONS[0];
                                return (
                                    <div className="flex items-center gap-2 bg-indigo-50/70 text-slate-800 px-3 py-1.5 rounded-xl border border-indigo-200/80 shadow-2xs">
                                        <span className="text-sm">{currentTmpl.icon}</span>
                                        <span className="text-xs font-extrabold text-slate-800">{currentTmpl.name}</span>
                                        <span className="text-[9px] px-2 py-0.5 bg-indigo-600 text-white rounded-md font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                                            <span>🔒</span>
                                            <span>Locked Template</span>
                                        </span>
                                    </div>
                                );
                            })()}

                            <div className="flex items-center space-x-2 text-xs md:text-sm">
                                <button 
                                    onClick={handleCopy}
                                    className={`px-4 py-2 text-white rounded-lg text-xs font-black flex items-center space-x-2 transition-all shadow-sm cursor-pointer ${copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                >
                                    <Copy className="w-3.5 h-3.5 text-white" />
                                    <span>{copied ? "Copied! / कॉपी हुआ" : "Copy"}</span>
                                </button>
                                <button 
                                    onClick={handleSaveDoc}
                                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-indigo-600 rounded-lg text-xs font-black flex items-center space-x-2 transition-all shadow-sm cursor-pointer"
                                >
                                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Download PDF</span>
                                </button>
                            </div>
                        </div>

                        {/* Document Content with Template Renderer (Strictly locked to note's chosen template) */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative bg-slate-100/60 pb-24 text-slate-800">
                           <div id="note-content-to-print" className="w-full max-w-4xl mx-auto printable-notes">
                               <NoteTemplateRenderer 
                                   note={activeNote}
                                   activeTemplate={activeNote.config.template || 'infographic'}
                               />
                           </div>

                           <div className="w-full max-w-4xl mx-auto mt-12 pt-6 border-t border-slate-200">
                               <BookRecommendations topic={activeNote.config.topic || activeNote.config.subject} />
                           </div>
                        </div>
                    </div>
                )}
            </div>
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle className="w-5 h-5 text-emerald-300" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Save Note to Free Study Material Modal for Manager */}
            {saveModalNote && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[160] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md p-6 border border-slate-100 shadow-2xl text-left">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                                <BookmarkPlus className="w-5 h-5 text-amber-500" />
                                <span>नोट्स को फ्री स्टडी मटीरियल में सेव करें 🎁</span>
                            </h3>
                            <button onClick={() => setSaveModalNote(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs font-semibold">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                                    नोट्स का शीर्षक / Material Title *
                                </label>
                                <input 
                                    type="text" 
                                    value={materialTitle}
                                    onChange={(e) => setMaterialTitle(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="जैसे: Indian Polity Notes - Executive"
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
                                        placeholder="जैसे: Polity, History, Science Notes"
                                    />
                                </div>
                            )}

                            <p className="text-[11px] text-slate-400 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                                ℹ️ सेव करने पर यह नोट्स फ्री स्टडी मटीरियल में उपलब्ध हो जाएंगे जिन्हें सभी यूज़र्स पढ़ सकेंगे। आपके नोटबुक से डिलीट करने पर भी यह फ्री मटीरियल में सेव रहेंगे।
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setSaveModalNote(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer"
                            >
                                रद्द करें
                            </button>
                            <button
                                onClick={handleSaveNoteToFreeMaterial}
                                disabled={savingNoteFree}
                                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                {savingNoteFree && <Loader2 className="w-4 h-4 animate-spin" />}
                                <span>सेव करें</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SmartNotes;
