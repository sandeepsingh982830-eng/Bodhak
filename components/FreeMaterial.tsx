import React, { useState, useEffect } from 'react';
import { 
    Folder, FolderPlus, FolderOpen, FileText, Link2, Image as ImageIcon, FileDown, 
    Trash2, ArrowLeft, Plus, Loader2, BookOpen, AlertCircle, Eye, 
    Download, ChevronRight, ExternalLink, File, X, Info, Pin, Play, CheckCircle2, XCircle, RotateCcw, Copy, Check, Dumbbell, Award, Edit, Pencil
} from 'lucide-react';
import Markdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { db } from '../services/firebase';
import { collection, addDoc, setDoc, doc, deleteDoc, query, orderBy, onSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { Language } from '../translations';
import { NoteTemplate } from '../types';
import NoteTemplateRenderer, { TEMPLATE_OPTIONS } from './NoteTemplateRenderer';

interface FreeMaterialProps {
    profile: any;
}

interface FolderData {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    createdBy: string;
}

interface FileData {
    id: string;
    name: string;
    type: 'pdf' | 'link' | 'image' | 'file' | 'folder' | 'quiz' | 'note';
    url?: string;
    fileData?: string;
    fileName?: string;
    createdAt: number;
    parentId?: string; // Links this file/folder to a parent folder inside files collection
    logoUrl?: string; // Custom logo/image URL or base64 icon
    quizData?: {
        config: any;
        questions: any[];
    };
    noteData?: {
        config: any;
        content: string;
        handwrittenImageUrl?: string;
    };
}

export const FreeMaterial: React.FC<FreeMaterialProps> = ({ profile }) => {
    // Get language from localStorage, default to English
    const [lang, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('app_lang');
        return (saved === 'hi' ? 'hi' : 'en') as Language;
    });

    useEffect(() => {
        const handleLangChange = () => {
            const saved = localStorage.getItem('app_lang');
            setLang((saved === 'hi' ? 'hi' : 'en') as Language);
        };
        window.addEventListener('storage', handleLangChange);
        const interval = setInterval(handleLangChange, 1000); // Polling fallback for tab internal changes
        return () => {
            window.removeEventListener('storage', handleLangChange);
            clearInterval(interval);
        };
    }, []);

    const isManager = profile?.isManager || 
                     ['sandeepsinghchouhan081@gmail.com', 'bodhak355@gmail.com'].includes(profile?.email?.toLowerCase() || '');

    const formatQuizText = (text: string) => {
        if (!text) return '';
        // Handle numbered points or bullet points to ensure they are on new lines
        let formatted = text.replace(/(?:\s|^)(\d+\.)\s/g, '\n\n$1 ');
        formatted = formatted.replace(/(?:\s|^)([•\-\*])\s/g, '\n\n$1 ');
        return formatted;
    };

    const [folders, setFolders] = useState<FolderData[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<FolderData | null>(null);
    const [selectedSubFolder, setSelectedSubFolder] = useState<FileData | null>(null);
    const [files, setFiles] = useState<FileData[]>([]);

    const [loadingFolders, setLoadingFolders] = useState(true);
    const [loadingFiles, setLoadingFiles] = useState(false);

    // Interactive Free Quiz & Notes Modals
    const [activeQuizFile, setActiveQuizFile] = useState<FileData | null>(null);
    const [quizIndex, setQuizIndex] = useState<number>(0);
    const [quizAnswers, setQuizAnswers] = useState<Record<number, number | string>>({});
    const [showQuizResult, setShowQuizResult] = useState<boolean>(false);

    const [activeNoteFile, setActiveNoteFile] = useState<FileData | null>(null);
    const [noteCopied, setNoteCopied] = useState<boolean>(false);


    // Form states - folders (Level 1)
    const [showAddFolder, setShowAddFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDesc, setNewFolderDesc] = useState('');
    const [folderError, setFolderError] = useState('');
    const [savingFolder, setSavingFolder] = useState(false);

    // Form states - files & subfolders (Level 2 & 3)
    const [showAddFile, setShowAddFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileType, setNewFileType] = useState<'pdf' | 'link' | 'image' | 'file' | 'folder'>('pdf');
    const [newFileUrl, setNewFileUrl] = useState('');
    const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [newFileLogoUrl, setNewFileLogoUrl] = useState('');
    const [uploadedLogoBase64, setUploadedLogoBase64] = useState('');
    const [fileError, setFileError] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const [savingFile, setSavingFile] = useState(false);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);

    // Edit Material Modal State
    const [editModalFile, setEditModalFile] = useState<FileData | null>(null);
    const [editFileName, setEditFileName] = useState('');
    const [editFileType, setEditFileType] = useState<'pdf' | 'link' | 'image' | 'file' | 'folder'>('pdf');
    const [editFileUrl, setEditFileUrl] = useState('');
    const [editLogoUrl, setEditLogoUrl] = useState('');
    const [editUploadedLogoBase64, setEditUploadedLogoBase64] = useState('');
    const [editUploadedFileBase64, setEditUploadedFileBase64] = useState('');
    const [editUploadedFileName, setEditUploadedFileName] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState('');

    const handleOpenEditModal = (file: FileData) => {
        setEditModalFile(file);
        setEditFileName(file.name || '');
        setEditFileType((file.type as any) || 'pdf');
        setEditFileUrl(file.url || '');
        setEditLogoUrl(file.logoUrl && !file.logoUrl.startsWith('data:') ? file.logoUrl : '');
        setEditUploadedLogoBase64(file.logoUrl?.startsWith('data:') ? file.logoUrl : '');
        setEditUploadedFileBase64(file.fileData || '');
        setEditUploadedFileName(file.fileName || '');
        setEditError('');
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModalFile || !selectedFolder) return;
        if (!editFileName.trim()) {
            setEditError(lang === 'hi' ? 'शीर्षक आवश्यक है।' : 'Title is required.');
            return;
        }

        setSavingEdit(true);
        setEditError('');

        try {
            let formattedUrl = editFileUrl.trim();
            if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
                formattedUrl = 'https://' + formattedUrl;
            }

            const updatedPayload: any = {
                name: editFileName.trim(),
                type: editFileType,
                url: formattedUrl,
            };

            if (editLogoUrl.trim()) {
                updatedPayload.logoUrl = editLogoUrl.trim();
            } else if (editUploadedLogoBase64) {
                updatedPayload.logoUrl = editUploadedLogoBase64;
            } else {
                updatedPayload.logoUrl = '';
            }

            if (editUploadedFileBase64) {
                updatedPayload.fileData = editUploadedFileBase64;
                if (editUploadedFileName) updatedPayload.fileName = editUploadedFileName;
            }

            await updateDoc(doc(db, 'freeMaterials', selectedFolder.id, 'files', editModalFile.id), updatedPayload);

            if (pinnedIds.includes(editModalFile.id)) {
                await updateDoc(doc(db, 'pinnedFreeMaterials', editModalFile.id), {
                    name: updatedPayload.name,
                    type: updatedPayload.type,
                    url: updatedPayload.url || '',
                    logoUrl: updatedPayload.logoUrl || '',
                    fileData: updatedPayload.fileData || '',
                    fileName: updatedPayload.fileName || '',
                });
            }

            setEditModalFile(null);
            setAlertMessage({
                title: lang === 'hi' ? 'सफलता' : 'Success',
                message: lang === 'hi' ? 'अध्ययन सामग्री अपडेट हो गई है।' : 'Material updated successfully.',
                type: 'success'
            });
        } catch (err: any) {
            console.error("Error updating free material: ", err);
            setEditError(err.message || 'Failed to update material');
        } finally {
            setSavingEdit(false);
        }
    };

    // Listen to pinnedFreeMaterials IDs
    useEffect(() => {
        const q = query(collection(db, 'pinnedFreeMaterials'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ids: string[] = [];
            snapshot.forEach((doc) => ids.push(doc.id));
            setPinnedIds(ids);
        }, (err) => {
            console.error("Error loading pinned free materials: ", err);
        });
        return () => unsubscribe();
    }, []);

    // Toggle pin/unpin free material item to home
    const togglePinFile = async (file: FileData) => {
        const isPinned = pinnedIds.includes(file.id);
        try {
            if (isPinned) {
                await deleteDoc(doc(db, 'pinnedFreeMaterials', file.id));
            } else {
                await setDoc(doc(db, 'pinnedFreeMaterials', file.id), {
                    id: file.id,
                    name: file.name,
                    type: file.type || 'link',
                    url: file.url || file.fileData || '',
                    logoUrl: file.logoUrl || '',
                    quizData: file.quizData || null,
                    fileData: file.fileData || '',
                    folderName: selectedFolder?.name || '',
                    createdAt: Date.now()
                });
            }
        } catch (err) {
            console.error("Error toggling pin status: ", err);
        }
    };

    // Custom In-App Modal States (Replaces window.open/confirm/alert)
    const [activePreviewFile, setActivePreviewFile] = useState<FileData | null>(null);
    const [freeNoteTemplate, setFreeNoteTemplate] = useState<NoteTemplate>('infographic');
    const [confirmDialog, setConfirmDialog] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);
    const [alertMessage, setAlertMessage] = useState<{
        title: string;
        message: string;
        type: 'error' | 'success';
    } | null>(null);

    // Fetch Level 1 Folders in real-time
    useEffect(() => {
        const q = query(collection(db, 'freeMaterials'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: FolderData[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                list.push({
                    id: doc.id,
                    name: data.name || '',
                    description: data.description || '',
                    createdAt: data.createdAt || Date.now(),
                    createdBy: data.createdBy || '',
                });
            });
            setFolders(list);
            setLoadingFolders(false);
        }, (err) => {
            console.error("Error loading folders: ", err);
            setLoadingFolders(false);
            if (err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('resource-exhausted')) {
                window.dispatchEvent(new CustomEvent('bodhak:quota_exceeded', { detail: err.message }));
            }
        });

        return () => unsubscribe();
    }, []);

    // Fetch Files inside selected Level 1 folder
    useEffect(() => {
        if (!selectedFolder) {
            setFiles([]);
            setSelectedSubFolder(null);
            return;
        }

        setLoadingFiles(true);
        const q = query(collection(db, 'freeMaterials', selectedFolder.id, 'files'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: FileData[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                list.push({
                    id: doc.id,
                    name: data.name || '',
                    type: data.type || 'pdf',
                    url: data.url || '',
                    fileData: data.fileData || '',
                    fileName: data.fileName || '',
                    createdAt: data.createdAt || Date.now(),
                    parentId: data.parentId || undefined,
                    logoUrl: data.logoUrl || '',
                    quizData: data.quizData || undefined,
                    noteData: data.noteData || undefined,
                });
            });
            setFiles(list);
            setLoadingFiles(false);
        }, (err) => {
            console.error("Error loading files: ", err);
            setLoadingFiles(false);
            if (err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('resource-exhausted')) {
                window.dispatchEvent(new CustomEvent('bodhak:quota_exceeded', { detail: err.message }));
            }
        });

        return () => unsubscribe();
    }, [selectedFolder]);

    // Handle create folder (Level 1)
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) {
            setFolderError(lang === 'hi' ? 'कृपया विषय का नाम लिखें।' : 'Please enter a subject name.');
            return;
        }

        setSavingFolder(true);
        setFolderError('');

        try {
            await addDoc(collection(db, 'freeMaterials'), {
                name: newFolderName.trim(),
                description: newFolderDesc.trim(),
                createdAt: Date.now(),
                createdBy: profile?.userId || 'manager',
            });

            setNewFolderName('');
            setNewFolderDesc('');
            setShowAddFolder(false);
            setAlertMessage({
                title: lang === 'hi' ? 'सफलतापूर्वक बनाया गया' : 'Created Successfully',
                message: lang === 'hi' ? 'स्टडी मटीरियल विषय सफलतापूर्वक बन गया है।' : 'Study folder has been created successfully.',
                type: 'success'
            });
        } catch (err: any) {
            setFolderError(err.message || 'Error creating folder');
        } finally {
            setSavingFolder(false);
        }
    };

    // Handle delete folder (Level 1)
    const handleDeleteFolder = (folderId: string, folderName: string) => {
        setConfirmDialog({
            title: lang === 'hi' ? 'विषय हटाएं?' : 'Delete Subject?',
            message: lang === 'hi' 
                ? `क्या आप सचमुच "${folderName}" विषय और इसके अंदर की सभी फाइलें हटाना चाहते हैं? यह क्रिया वापस नहीं ली जा सकती।` 
                : `Are you sure you want to delete subject "${folderName}" and all of its files? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    // Fetch nested files and delete them first
                    const filesSnap = await getDocs(collection(db, 'freeMaterials', folderId, 'files'));
                    const deletePromises = filesSnap.docs.map(fdoc => deleteDoc(doc(db, 'freeMaterials', folderId, 'files', fdoc.id)));
                    await Promise.all(deletePromises);

                    // Delete main folder doc
                    await deleteDoc(doc(db, 'freeMaterials', folderId));
                    
                    if (selectedFolder?.id === folderId) {
                        setSelectedFolder(null);
                        setSelectedSubFolder(null);
                    }
                    setConfirmDialog(null);
                } catch (err) {
                    console.error("Error deleting folder: ", err);
                    setAlertMessage({
                        title: lang === 'hi' ? 'त्रुटि' : 'Error',
                        message: lang === 'hi' ? 'विषय हटाने में विफलता।' : 'Failed to delete subject.',
                        type: 'error'
                    });
                }
            }
        });
    };

    // Handle file selection (convert to base64)
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 950 * 1024) { // Firestore 1MB limit safety check
            setFileError(lang === 'hi' ? 'फाइल बहुत बड़ी है। कृपया 950KB से छोटी फाइल चुनें।' : 'File is too large. Max 950KB allowed for database safety.');
            return;
        }

        setUploadingFile(true);
        setFileError('');

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setUploadedFileBase64(result);
            setUploadedFileName(file.name);
            if (!newFileName) {
                setNewFileName(file.name.split('.').slice(0, -1).join('.') || file.name);
            }
            setUploadingFile(false);
        };
        reader.onerror = () => {
            setFileError('Failed to read file.');
            setUploadingFile(false);
        };
        reader.readAsDataURL(file);
    };

    // Handle logo image selection (convert to base64)
    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 500 * 1024) { // 500KB limit for logo icon
            setFileError(lang === 'hi' ? 'लोगो फाइल बहुत बड़ी है। कृपया 500KB से छोटी इमेज चुनें।' : 'Logo image is too large. Max 500KB allowed.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setUploadedLogoBase64(result);
        };
        reader.readAsDataURL(file);
    };

    // Handle add material file, link, or nested subfolder (Level 2 & 3)
    const handleAddFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFolder) return;

        if (!newFileName.trim()) {
            setFileError(lang === 'hi' ? 'कृपया फाइल या लिंक का शीर्षक लिखें।' : 'Please enter material title.');
            return;
        }

        if (newFileType === 'link' && !newFileUrl.trim()) {
            setFileError(lang === 'hi' ? 'कृपया वैध लिंक दर्ज करें।' : 'Please enter a valid website URL/link.');
            return;
        }

        if (newFileType !== 'link' && newFileType !== 'folder' && !uploadedFileBase64 && !newFileUrl.trim()) {
            setFileError(lang === 'hi' ? 'कृपया फाइल अपलोड करें या लिंक URL दर्ज करें।' : 'Please upload a file or enter a link URL.');
            return;
        }

        setSavingFile(true);
        setFileError('');

        try {
            const payload: any = {
                name: newFileName.trim(),
                type: newFileType,
                createdAt: Date.now(),
            };

            if (newFileUrl.trim()) {
                let formattedUrl = newFileUrl.trim();
                if (!/^https?:\/\//i.test(formattedUrl)) {
                    formattedUrl = 'https://' + formattedUrl;
                }
                payload.url = formattedUrl;
            }

            // Custom logo / image
            if (newFileLogoUrl.trim()) {
                payload.logoUrl = newFileLogoUrl.trim();
            } else if (uploadedLogoBase64) {
                payload.logoUrl = uploadedLogoBase64;
            }

            // If we are currently inside a subfolder, link it as parentId
            if (selectedSubFolder) {
                payload.parentId = selectedSubFolder.id;
            }

            if (newFileType === 'link') {
                let formattedUrl = newFileUrl.trim();
                if (!/^https?:\/\//i.test(formattedUrl)) {
                    formattedUrl = 'https://' + formattedUrl;
                }
                payload.url = formattedUrl;
            } else if (newFileType !== 'folder') {
                payload.fileData = uploadedFileBase64;
                payload.fileName = uploadedFileName;
            }

            await addDoc(collection(db, 'freeMaterials', selectedFolder.id, 'files'), payload);

            setNewFileName('');
            setNewFileUrl('');
            setUploadedFileBase64('');
            setUploadedFileName('');
            setNewFileLogoUrl('');
            setUploadedLogoBase64('');
            setShowAddFile(false);
            setAlertMessage({
                title: lang === 'hi' ? 'जोड़ा गया' : 'Added Successfully',
                message: newFileType === 'folder' 
                    ? (lang === 'hi' ? 'नया सब-फोल्डर जोड़ दिया गया है।' : 'New sub-folder added successfully.')
                    : (lang === 'hi' ? 'अध्ययन सामग्री सफलतापूर्वक जोड़ दी गई है।' : 'Study material added successfully.'),
                type: 'success'
            });
        } catch (err: any) {
            setFileError(err.message || 'Error saving material');
        } finally {
            setSavingFile(false);
        }
    };

    // Handle Delete File/Subfolder
    const handleDeleteFile = (fileId: string, fileName: string, type: string) => {
        if (!selectedFolder) return;

        setConfirmDialog({
            title: type === 'folder' 
                ? (lang === 'hi' ? 'सब-फोल्डर हटाएं?' : 'Delete Sub-Folder?') 
                : (lang === 'hi' ? 'मटीरियल हटाएं?' : 'Delete Material?'),
            message: type === 'folder'
                ? (lang === 'hi' 
                    ? `क्या आप सचमुच सब-फोल्डर "${fileName}" और इसके अंदर की सभी फाइलें हटाना चाहते हैं?` 
                    : `Are you sure you want to delete sub-folder "${fileName}" and all its nested files?`)
                : (lang === 'hi' 
                    ? `क्या आप सचमुच "${fileName}" हटाना चाहते हैं?` 
                    : `Are you sure you want to delete "${fileName}"?`),
            onConfirm: async () => {
                try {
                    if (type === 'folder') {
                        // Delete child files inside this subfolder
                        const childQ = query(collection(db, 'freeMaterials', selectedFolder.id, 'files'));
                        const childSnap = await getDocs(childQ);
                        const childDeletes = childSnap.docs
                            .filter(doc => doc.data().parentId === fileId)
                            .map(doc => deleteDoc(doc.ref));
                        await Promise.all(childDeletes);
                    }

                    // Delete the main record
                    await deleteDoc(doc(db, 'freeMaterials', selectedFolder.id, 'files', fileId));
                    
                    if (selectedSubFolder?.id === fileId) {
                        setSelectedSubFolder(null);
                    }
                    setConfirmDialog(null);
                } catch (err) {
                    console.error("Error deleting file: ", err);
                    setAlertMessage({
                        title: lang === 'hi' ? 'त्रुटि' : 'Error',
                        message: lang === 'hi' ? 'मटीरियल हटाने में विफलता।' : 'Failed to delete material.',
                        type: 'error'
                    });
                }
            }
        });
    };

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'folder': return <Folder className="w-5 h-5 text-amber-500" />;
            case 'link': return <Link2 className="w-5 h-5 text-indigo-600" />;
            case 'image': return <ImageIcon className="w-5 h-5 text-teal-600" />;
            case 'pdf': return <FileText className="w-5 h-5 text-rose-600" />;
            default: return <File className="w-5 h-5 text-blue-600" />;
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-24 text-left animate-[fadeIn_0.25s_ease-out]">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-3 rounded-2xl border border-amber-200 text-amber-700">
                        <BookOpen className="w-6 h-6 shrink-0" />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            {lang === 'hi' ? 'फ्री स्टडी मटीरियल 🎁' : 'Free Study Material 🎁'}
                        </h2>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                            {lang === 'hi' 
                                ? 'मैनेजर द्वारा शेयर की गई पुस्तकें, पीडीएफ, सब-फोल्डर और उपयोगी स्टडी लिंक्स।' 
                                : 'Manager-shared reference books, PDFs, organized sub-folders & free study links.'}
                        </p>
                    </div>
                </div>

                {isManager && !selectedFolder && (
                    <button
                        onClick={() => {
                            setShowAddFolder(!showAddFolder);
                            setFolderError('');
                        }}
                        className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md active:scale-95 transition cursor-pointer"
                    >
                        <FolderPlus className="w-4 h-4" />
                        <span>{lang === 'hi' ? 'नया विषय' : 'New Subject'}</span>
                    </button>
                )}
            </div>

            {/* Folder creation form for Managers */}
            {isManager && showAddFolder && !selectedFolder && (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 mb-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                        <Plus className="w-4.5 h-4.5 text-indigo-600" />
                        <span>{lang === 'hi' ? 'नया स्टडी मटीरियल विषय/फोल्डर बनाएं' : 'Create New Study Folder'}</span>
                    </h3>
                    <form onSubmit={handleCreateFolder} className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'विषय / फोल्डर का नाम *' : 'Subject / Folder Name *'}
                            </label>
                            <input
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder={lang === 'hi' ? "जैसे: इतिहास (History), भूगोल (Geography), GK MCQ" : "e.g. Indian History, Geography, Current Affairs 2026"}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'संक्षिप्त विवरण (वैकल्पिक)' : 'Description (Optional)'}
                            </label>
                            <input
                                type="text"
                                value={newFolderDesc}
                                onChange={(e) => setNewFolderDesc(e.target.value)}
                                placeholder={lang === 'hi' ? "जैसे: वर्ष 2026 की परीक्षा के लिए उपयोगी पीडीएफ और पुस्तकें" : "e.g. Free reference books & hand-written notes"}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {folderError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-xs font-semibold">
                                <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                                <span>{folderError}</span>
                            </div>
                        )}

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddFolder(false);
                                    setFolderError('');
                                }}
                                className="px-4.5 py-2 border border-slate-200 text-slate-500 font-extrabold text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={savingFolder}
                                className="px-4.5 py-2 bg-indigo-650 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                                {savingFolder && <Loader2 className="w-3 h-3 animate-spin" />}
                                <span>{lang === 'hi' ? 'फोल्डर बनाएं' : 'Create Folder'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Folders List (Level 1) */}
            {!selectedFolder && (
                <div>
                    {loadingFolders ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-xs text-slate-500 font-bold">
                                {lang === 'hi' ? 'विषय सूची लोड की जा रही है...' : 'Loading materials subjects...'}
                            </p>
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-xs">
                            <div className="bg-amber-50 text-amber-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700">
                                    {lang === 'hi' ? 'कोई स्टडी मटीरियल उपलब्ध नहीं है' : 'No study materials available'}
                                </h3>
                                <p className="text-xs text-slate-400 font-medium max-w-[280px] mx-auto mt-1">
                                    {lang === 'hi' 
                                        ? 'मैनेजर ने अभी तक कोई मुफ्त स्टडी विषय नहीं बनाया है।' 
                                        : 'The manager has not uploaded any study subjects yet.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {folders.map((folder) => (
                                <div 
                                    key={folder.id}
                                    className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs hover:shadow-md hover:border-amber-300 transition-all duration-200 flex items-start justify-between gap-3 text-left group"
                                >
                                    <div 
                                        onClick={() => setSelectedFolder(folder)}
                                        className="flex gap-4 cursor-pointer flex-grow min-w-0"
                                    >
                                        <div className="bg-amber-50 text-amber-600 p-3 rounded-2xl group-hover:bg-amber-100 transition shrink-0 self-start">
                                            <Folder className="w-7 h-7" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-black text-slate-900 group-hover:text-amber-600 transition truncate text-base sm:text-lg">
                                                {folder.name}
                                            </h3>
                                            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed line-clamp-2">
                                                {folder.description || (lang === 'hi' ? 'मटीरियल, नोट्स और अनुशंसित पुस्तकें' : 'Study guides, reference books and hand-written notes.')}
                                            </p>
                                        </div>
                                    </div>

                                    {isManager && (
                                        <button
                                            onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                            className="p-2 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-xl transition shrink-0 cursor-pointer self-start"
                                            title={lang === 'hi' ? 'हटाएं' : 'Delete'}
                                        >
                                            <Trash2 className="w-4.5 h-4.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Folder Contents (Level 2 & 3) */}
            {selectedFolder && (
                <div>
                    {/* Navigation Path Breadcrumbs */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-extrabold mb-5 bg-white py-2.5 px-4 rounded-xl border border-slate-200/80 shadow-sm">
                        <span 
                            className="hover:text-indigo-600 cursor-pointer transition flex items-center gap-1"
                            onClick={() => {
                                setSelectedFolder(null);
                                setSelectedSubFolder(null);
                            }}
                        >
                            <BookOpen className="w-3.5 h-3.5" />
                            {lang === 'hi' ? 'मुख्य सूची' : 'Subjects'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span 
                            className={`hover:text-indigo-600 cursor-pointer transition truncate max-w-[120px] sm:max-w-[200px] ${!selectedSubFolder ? 'text-indigo-600 font-black' : ''}`}
                            onClick={() => setSelectedSubFolder(null)}
                        >
                            {selectedFolder.name}
                        </span>
                        
                        {selectedSubFolder && (
                            <>
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span className="text-indigo-600 font-black truncate max-w-[120px] sm:max-w-[200px]">
                                    {selectedSubFolder.name}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Active Subject Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 p-5 rounded-3xl mb-6 shadow-xs">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => {
                                    if (selectedSubFolder) {
                                        setSelectedSubFolder(null);
                                    } else {
                                        setSelectedFolder(null);
                                    }
                                }}
                                className="p-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer shrink-0"
                            >
                                <ArrowLeft className="w-4.5 h-4.5" />
                            </button>
                            <div>
                                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-wider leading-none">
                                    {selectedSubFolder ? (lang === 'hi' ? 'उप-फोल्डर / टॉपिक' : 'SUB-FOLDER') : (lang === 'hi' ? 'विषय / फोल्डर' : 'SUBJECT')}
                                </p>
                                <h3 className="text-base font-black text-slate-900 mt-1 leading-tight">
                                    {selectedSubFolder ? selectedSubFolder.name : selectedFolder.name}
                                </h3>
                            </div>
                        </div>

                        {/* Actions inside Folder */}
                        {isManager && (
                            <button
                                onClick={() => setShowAddFile(!showAddFile)}
                                className="flex items-center gap-1 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>
                                    {selectedSubFolder 
                                        ? (lang === 'hi' ? 'पीडीएफ / लिंक जोड़ें' : 'Add PDF / Link')
                                        : (lang === 'hi' ? 'सब-फोल्डर या फाइल जोड़ें' : 'Add Folder or File')}
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Add File / Subfolder Form */}
                    {showAddFile && (
                        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 mb-6 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                    <Plus className="w-4.5 h-4.5 text-indigo-600" />
                                    <span>
                                        {selectedSubFolder 
                                            ? (lang === 'hi' ? `"${selectedSubFolder.name}" में मटीरियल जोड़ें` : `Add Material to "${selectedSubFolder.name}"`)
                                            : (lang === 'hi' ? 'नया सब-फोल्डर या फाइल जोड़ें' : 'Add Sub-Folder or Material')}
                                    </span>
                                </h3>
                                <button 
                                    onClick={() => setShowAddFile(false)}
                                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition"
                                >
                                    <X className="w-4.5 h-4.5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddFile} className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                        {lang === 'hi' ? 'मटीरियल प्रकार / Type *' : 'Material Type *'}
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                        {/* Nested folders can only be created at Level 2 (directly inside main subject, not inside another subfolder) */}
                                        {!selectedSubFolder && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNewFileType('folder');
                                                    setFileError('');
                                                }}
                                                className={`px-2 py-2 border rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                                    newFileType === 'folder'
                                                    ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-xs'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                <FolderOpen className="w-4.5 h-4.5 text-amber-500" />
                                                <span className="text-[10px]">{lang === 'hi' ? 'सब-फोल्डर' : 'Sub-Folder'}</span>
                                            </button>
                                        )}
                                        
                                        {(['pdf', 'link', 'image', 'file'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => {
                                                    setNewFileType(type);
                                                    setFileError('');
                                                }}
                                                className={`px-2 py-2 border rounded-xl text-xs font-bold transition-all capitalize flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                                    newFileType === type
                                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {getFileIcon(type)}
                                                <span className="text-[10px] capitalize">{type}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                        {newFileType === 'folder' 
                                            ? (lang === 'hi' ? 'सब-फोल्डर का नाम *' : 'Sub-Folder Title *')
                                            : (lang === 'hi' ? 'मटीरियल / फाइल का शीर्षक *' : 'Material Title *')}
                                    </label>
                                    <input
                                        type="text"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        placeholder={newFileType === 'folder' 
                                            ? (lang === 'hi' ? "जैसे: मध्यकालीन इतिहास, Mock Tests" : "e.g. Ancient India, Practice Papers")
                                            : (lang === 'hi' ? "जैसे: GK Chapterwise PDF, History Lecture Notes" : "e.g. UPSC Prelims Syllabus PDF")}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                {newFileType === 'link' ? (
                                    <div>
                                        <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                            {lang === 'hi' ? 'वेबसाइट / लिंक URL *' : 'Website Link URL *'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newFileUrl}
                                            onChange={(e) => setNewFileUrl(e.target.value)}
                                            placeholder="https://drive.google.com/..."
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                ) : newFileType !== 'folder' ? (
                                    <div>
                                        <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                            {lang === 'hi' ? 'फाइल अपलोड करें * (अधिकतम 950KB)' : 'Upload File * (Max 950KB)'}
                                        </label>
                                        <div className="mt-1 flex items-center gap-3">
                                            <input
                                                type="file"
                                                accept={newFileType === 'pdf' ? '.pdf' : newFileType === 'image' ? 'image/*' : '*'}
                                                onChange={handleFileChange}
                                                className="hidden"
                                                id="free-material-subfile-uploader"
                                            />
                                            <label
                                                htmlFor="free-material-subfile-uploader"
                                                className="px-4 py-2 border border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-xl text-slate-600 font-bold text-xs cursor-pointer flex items-center gap-1.5 transition"
                                            >
                                                <Eye className="w-4 h-4 text-slate-500" />
                                                <span>
                                                    {uploadedFileName ? (lang === 'hi' ? 'बदलें / Change' : 'Change') : (lang === 'hi' ? 'फाइल चुनें / Select' : 'Select File')}
                                                </span>
                                            </label>

                                            {uploadingFile ? (
                                                <span className="text-xs text-slate-500 flex items-center gap-1.5 font-semibold">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                                    {lang === 'hi' ? 'फाइल प्रोसेस हो रही है...' : 'Processing file...'}
                                                </span>
                                            ) : uploadedFileName ? (
                                                <span className="text-xs text-emerald-750 font-black truncate max-w-[200px]">
                                                    ✓ {uploadedFileName}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400 font-semibold">
                                                    {lang === 'hi' ? 'कोई फाइल चुनी नहीं गई' : 'No file chosen'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {/* Custom Logo / Image Option for PDF/Link/Files */}
                                <div className="border-t border-slate-100 pt-3 mt-1">
                                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                        {lang === 'hi' ? 'कस्टम लोगो / इमेज (ऐच्छिक)' : 'Custom Logo / Icon Image (Optional)'}
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={newFileLogoUrl}
                                            onChange={(e) => {
                                                setNewFileLogoUrl(e.target.value);
                                                if (e.target.value) setUploadedLogoBase64('');
                                            }}
                                            placeholder={lang === 'hi' ? 'लोगो/इमेज URL (उदा: https://.../logo.png)' : 'Logo Image URL (e.g. https://.../logo.png)'}
                                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <span className="text-slate-400 font-bold text-xs self-center hidden sm:inline">{lang === 'hi' ? 'या' : 'or'}</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoFileChange}
                                                className="hidden"
                                                id="free-material-logo-uploader"
                                            />
                                            <label
                                                htmlFor="free-material-logo-uploader"
                                                className="px-3 py-2 border border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl text-slate-700 font-extrabold text-xs cursor-pointer flex items-center gap-1.5 transition shrink-0"
                                            >
                                                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>{uploadedLogoBase64 ? (lang === 'hi' ? 'लोगो बदला गया ✓' : 'Logo Selected ✓') : (lang === 'hi' ? 'लोगो फाइल चुनें' : 'Upload Logo')}</span>
                                            </label>
                                        </div>
                                    </div>
                                    {(newFileLogoUrl || uploadedLogoBase64) && (
                                        <div className="mt-2 flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200/80 w-fit">
                                            <span className="text-[10px] font-extrabold text-slate-500 uppercase">{lang === 'hi' ? 'पूर्वावलोकन / Preview:' : 'Logo Preview:'}</span>
                                            <img 
                                                src={newFileLogoUrl || uploadedLogoBase64} 
                                                alt="Logo preview" 
                                                className="w-6 h-6 object-contain rounded-md bg-white border border-slate-200"
                                                referrerPolicy="no-referrer"
                                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {fileError && (
                                    <div className="bg-red-50 border border-red-150 text-red-750 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>{fileError}</span>
                                    </div>
                                )}

                                <div className="flex gap-2 justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddFile(false);
                                            setNewFileName('');
                                            setNewFileUrl('');
                                            setUploadedFileBase64('');
                                            setUploadedFileName('');
                                            setFileError('');
                                        }}
                                        className="px-4.5 py-2 border border-slate-200 text-slate-500 font-extrabold text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                                    >
                                        {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingFile || uploadingFile}
                                        className="px-4.5 py-2 bg-indigo-650 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                        {savingFile && <Loader2 className="w-3 h-3 animate-spin" />}
                                        <span>{lang === 'hi' ? 'जोड़ें' : 'Add Material'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Interior Contents List - Level 2 (Subfolders/Files) & Level 3 (Inside subfolder) */}
                    {loadingFiles ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-xs text-slate-500 font-semibold">
                                {lang === 'hi' ? 'कंटेंट लोड हो रहा है...' : 'Loading contents...'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* 1. Subfolders Grid (Only displayed if not inside subfolder) */}
                            {!selectedSubFolder && files.filter(f => f.type === 'folder').length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                    {files.filter(f => f.type === 'folder').map((folder) => (
                                        <div 
                                            key={folder.id}
                                            className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition flex items-center justify-between gap-3 text-left group"
                                        >
                                            <div 
                                                onClick={() => setSelectedSubFolder(folder)}
                                                className="flex items-center gap-3 cursor-pointer min-w-0 flex-grow"
                                            >
                                                <div className="bg-amber-50 border border-amber-100 text-amber-600 p-2 rounded-xl group-hover:bg-amber-100 transition shrink-0 w-10 h-10 flex items-center justify-center overflow-hidden">
                                                    {folder.logoUrl ? (
                                                        <img src={folder.logoUrl} alt="" className="w-full h-full object-contain rounded-lg" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <FolderOpen className="w-5 h-5" />
                                                    )}
                                                </div>
                                                <span className="font-extrabold text-slate-800 text-sm truncate leading-tight">
                                                    {folder.name}
                                                </span>
                                            </div>

                                            {isManager && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleOpenEditModal(folder)}
                                                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                                        title={lang === 'hi' ? 'संपादित करें' : 'Edit'}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteFile(folder.id, folder.name, folder.type)}
                                                        className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                                        title={lang === 'hi' ? 'हटाएं' : 'Delete'}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 2. Files List */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {files
                                    .filter(file => file.type !== 'folder')
                                    .filter(file => {
                                        // If inside a subfolder, show only files that have parentId === selectedSubFolder.id
                                        // If not inside a subfolder, show files that do NOT have a parentId
                                        if (selectedSubFolder) {
                                            return file.parentId === selectedSubFolder.id;
                                        } else {
                                            return !file.parentId;
                                        }
                                    })
                                    .map((file) => (
                                        <div 
                                            key={file.id}
                                            className="bg-white border border-slate-200/80 rounded-3xl p-4.5 shadow-xs flex items-center justify-between gap-4 transition-all duration-150 hover:border-indigo-200 hover:shadow-xs text-left"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-2xl shrink-0 w-11 h-11 flex items-center justify-center overflow-hidden">
                                                    {file.logoUrl ? (
                                                        <img src={file.logoUrl} alt="" className="w-full h-full object-contain rounded-xl" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        getFileIcon(file.type)
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug truncate">
                                                        {file.name}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                                        {file.type} • {new Date(file.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {file.type === 'quiz' && (
                                                    <button
                                                        onClick={() => {
                                                            setActiveQuizFile(file);
                                                            setQuizIndex(0);
                                                            setQuizAnswers({});
                                                            setShowQuizResult(false);
                                                        }}
                                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-xs rounded-xl border border-amber-200 transition cursor-pointer shadow-2xs"
                                                        title={lang === 'hi' ? 'क्विज़ हल करें' : 'Attempt Quiz'}
                                                    >
                                                        <Play className="w-3.5 h-3.5 fill-amber-600 text-amber-600" />
                                                        <span>{lang === 'hi' ? 'क्विज़ हल करें' : 'Attempt Quiz'}</span>
                                                    </button>
                                                )}

                                                {file.type === 'note' && (
                                                    <button
                                                        onClick={() => setActiveNoteFile(file)}
                                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs rounded-xl border border-emerald-200 transition cursor-pointer shadow-2xs"
                                                        title={lang === 'hi' ? 'नोट्स पढ़ें' : 'Read Notes'}
                                                    >
                                                        <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                                                        <span>{lang === 'hi' ? 'नोट्स पढ़ें' : 'Read Notes'}</span>
                                                    </button>
                                                )}

                                                {file.type === 'link' && file.url && (
                                                    <a 
                                                        href={file.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-600 rounded-xl transition cursor-pointer"
                                                        title={lang === 'hi' ? 'लिंक खोलें' : 'Open Link'}
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}

                                                {(file.type === 'pdf' || file.type === 'image' || file.type === 'file') && file.fileData && (
                                                    <>
                                                        <button
                                                            onClick={() => setActivePreviewFile(file)}
                                                            className="p-2 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-rose-600 rounded-xl transition cursor-pointer"
                                                            title={lang === 'hi' ? 'देखें' : 'Preview'}
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        
                                                        <a 
                                                            href={file.fileData} 
                                                            download={file.fileName || file.name}
                                                            className="p-2 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-600 rounded-xl transition cursor-pointer"
                                                            title={lang === 'hi' ? 'डाउनलोड' : 'Download'}
                                                        >
                                                            <FileDown className="w-4 h-4" />
                                                        </a>
                                                    </>
                                                )}

                                                {isManager && (
                                                    <button
                                                        onClick={() => togglePinFile(file)}
                                                        className={`p-2 border rounded-xl transition cursor-pointer ${
                                                            pinnedIds.includes(file.id)
                                                                ? 'bg-amber-50 border-amber-300 text-amber-600'
                                                                : 'border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-600'
                                                        }`}
                                                        title={pinnedIds.includes(file.id) ? (lang === 'hi' ? 'होम से पिन हटाएं' : 'Unpin from Home') : (lang === 'hi' ? 'होम पर पिन करें' : 'Pin to Home')}
                                                    >
                                                        <Pin className={`w-4 h-4 ${pinnedIds.includes(file.id) ? 'fill-amber-500 text-amber-500' : ''}`} />
                                                    </button>
                                                )}

                                                {isManager && (
                                                    <>
                                                        <button
                                                            onClick={() => handleOpenEditModal(file)}
                                                            className="p-2 border border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-amber-600 rounded-xl transition cursor-pointer"
                                                            title={lang === 'hi' ? 'संपादित/अपडेट करें' : 'Edit / Update'}
                                                        >
                                                            <Pencil className="w-4 h-4 text-slate-500 hover:text-amber-600" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteFile(file.id, file.name, file.type)}
                                                            className="p-2 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-xl transition cursor-pointer"
                                                            title={lang === 'hi' ? 'हटाएं' : 'Delete'}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                {files.filter(file => {
                                    if (selectedSubFolder) {
                                        return file.parentId === selectedSubFolder.id;
                                    } else {
                                        return !file.parentId;
                                    }
                                }).length === 0 && (
                                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                                        <FolderOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-xs font-bold">
                                            {lang === 'hi' ? 'इस श्रेणी में अभी कोई मटीरियल उपलब्ध नहीं है।' : 'No study material uploaded in this category yet.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Custom Interactive In-App Document Preview Modal */}
            {activePreviewFile && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100">
                        <div className="flex items-center justify-between p-4.5 bg-slate-50 border-b border-slate-100">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-5 h-5 text-rose-600 shrink-0" />
                                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                                    {activePreviewFile.name}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setActivePreviewFile(null)}
                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-grow overflow-auto p-4 bg-slate-100 min-h-[400px]">
                            {activePreviewFile.fileData?.startsWith('data:application/pdf') ? (
                                <iframe 
                                    src={activePreviewFile.fileData} 
                                    className="w-full h-full rounded-2xl border border-slate-200 shadow-xs"
                                    title={activePreviewFile.name}
                                />
                            ) : activePreviewFile.fileData?.startsWith('data:image') ? (
                                <div className="flex items-center justify-center h-full max-h-[70vh]">
                                    <img 
                                        src={activePreviewFile.fileData} 
                                        alt={activePreviewFile.name} 
                                        className="max-w-full max-h-full object-contain rounded-2xl shadow-md"
                                        referrerPolicy="no-referrer"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                                    <AlertCircle className="w-12 h-12 text-slate-400" />
                                    <p className="text-xs text-slate-500 font-bold text-center">
                                        {lang === 'hi' ? 'इस फाइल के लिए लाइव व्यू उपलब्ध नहीं है।' : 'No preview available for this file type.'}
                                    </p>
                                    <a 
                                        href={activePreviewFile.fileData} 
                                        download={activePreviewFile.fileName || activePreviewFile.name}
                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>{lang === 'hi' ? 'डाउनलोड करें' : 'Download File'}</span>
                                    </a>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            {activePreviewFile.fileData && (
                                <a 
                                    href={activePreviewFile.fileData} 
                                    download={activePreviewFile.fileName || activePreviewFile.name}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>{lang === 'hi' ? 'डाउनलोड करें' : 'Download'}</span>
                                </a>
                            )}
                            <button 
                                onClick={() => setActivePreviewFile(null)}
                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'बंद करें' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Dialog Modal */}
            {confirmDialog && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-55 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md p-5 border border-slate-100 shadow-2xl animate-in fade-in duration-250 text-left">
                        <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                            <AlertCircle className="w-5.5 h-5.5 text-red-650" />
                            {confirmDialog.title}
                        </h3>
                        <p className="text-sm text-slate-600 font-semibold mt-3 leading-relaxed">
                            {confirmDialog.message}
                        </p>
                        <div className="flex gap-2.5 justify-end mt-6">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="px-4.5 py-2 border border-slate-200 text-slate-500 font-black text-xs rounded-xl hover:bg-slate-50 transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                            </button>
                            <button
                                onClick={confirmDialog.onConfirm}
                                className="px-4.5 py-2 bg-red-650 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-sm transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'हां, हटाएं' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Interactive Free Quiz Runner Modal */}
            {activeQuizFile && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[180] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-100 shadow-2xl overflow-hidden text-left">
                        {(() => {
                            const getCorrectOptionIndex = (q: any): number => {
                                if (!q) return -1;
                                let target = q.correctAnswer ?? q.correct_answer ?? q.correctIndex ?? q.correct_index ?? q.answer ?? q.answerIndex;
                                if (target === undefined || target === null) return -1;
                                
                                if (typeof target === 'number' && target >= 0) return target;
                                
                                if (typeof target === 'string') {
                                    const trimmed = target.trim();
                                    if (/^\d+$/.test(trimmed)) {
                                        const parsed = parseInt(trimmed, 10);
                                        if (parsed >= 0 && parsed < (q.options?.length || 4)) return parsed;
                                    }
                                    if (/^[a-dA-D]$/.test(trimmed)) {
                                        const charCode = trimmed.toUpperCase().charCodeAt(0);
                                        return charCode - 65;
                                    }
                                    if (Array.isArray(q.options)) {
                                        const matchIdx = q.options.findIndex((opt: string) => 
                                            opt && opt.trim().toLowerCase() === trimmed.toLowerCase()
                                        );
                                        if (matchIdx !== -1) return matchIdx;

                                        const matchIdxClean = q.options.findIndex((opt: string) => {
                                            const cleanOpt = opt.replace(/^[A-Da-d0-9][\.\)\:]\s*/, '').trim().toLowerCase();
                                            const cleanTarget = trimmed.replace(/^[A-Da-d0-9][\.\)\:]\s*/, '').trim().toLowerCase();
                                            return cleanOpt === cleanTarget;
                                        });
                                        if (matchIdxClean !== -1) return matchIdxClean;
                                    }
                                }
                                return -1;
                            };

                            let questions: any[] = activeQuizFile.quizData?.questions || [];
                            if (!questions || questions.length === 0) {
                                if (activeQuizFile.fileData) {
                                    try {
                                        let rawStr = activeQuizFile.fileData;
                                        if (rawStr.startsWith('data:')) {
                                            const base64Content = rawStr.split(',')[1];
                                            if (base64Content) {
                                                try {
                                                    rawStr = decodeURIComponent(escape(atob(base64Content)));
                                                } catch (e) {
                                                    rawStr = atob(base64Content);
                                                }
                                            }
                                        }
                                        const parsed = JSON.parse(rawStr);
                                        if (Array.isArray(parsed)) questions = parsed;
                                        else if (parsed.questions) questions = parsed.questions;
                                    } catch (e) {
                                        console.error("Error parsing quiz questions JSON:", e);
                                    }
                                }
                            }

                            return (
                                <>
                                    <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                                                <Award className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-extrabold text-base md:text-lg leading-tight text-amber-300">
                                                    {activeQuizFile.name}
                                                </h3>
                                                <p className="text-[11px] text-slate-300 font-medium">
                                                    {questions.length} Questions • Free Study Material
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setActiveQuizFile(null)}
                                            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                        {!showQuizResult ? (
                                            (() => {
                                                const q = questions[quizIndex];
                                                if (!q) return (
                                                    <div className="text-center text-slate-500 py-12 space-y-3">
                                                        <p className="font-bold text-base">कोई प्रश्न नहीं मिला / No questions available in this quiz.</p>
                                                        <p className="text-xs text-slate-400">यह क्विज़ संभवतः सही प्रारूप में नहीं था या खाली है।</p>
                                                    </div>
                                                );

                                                const selectedOpt = quizAnswers[quizIndex];
                                                const isAnswered = selectedOpt !== undefined;
                                                const correctIdx = getCorrectOptionIndex(q);

                                                return (
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs font-black text-slate-400 mb-2">
                                                            <span>Question {quizIndex + 1} of {questions.length}</span>
                                                            <span>{Math.round(((quizIndex + 1) / questions.length) * 100)}% Completed</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-6">
                                                            <div 
                                                                className="bg-amber-500 h-full transition-all duration-300"
                                                                style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }}
                                                            />
                                                        </div>

                                                        <h4 className="font-extrabold text-slate-850 text-base md:text-lg mb-5 leading-snug whitespace-pre-wrap">
                                                            {formatQuizText(q.questionText || q.question)}
                                                        </h4>

                                                        <div className="space-y-3">
                                                            {(q.options || []).map((opt: string, optIdx: number) => {
                                                                let btnClass = "border-slate-200 bg-slate-50/70 hover:bg-amber-50/50 text-slate-800";
                                                                if (isAnswered) {
                                                                    if (optIdx === correctIdx) {
                                                                        btnClass = "border-emerald-500 bg-emerald-50 text-emerald-900 font-extrabold";
                                                                    } else if (selectedOpt === optIdx) {
                                                                        btnClass = "border-rose-500 bg-rose-50 text-rose-900 font-extrabold";
                                                                    } else {
                                                                        btnClass = "border-slate-100 bg-slate-50/40 text-slate-400 opacity-60";
                                                                    }
                                                                }

                                                                return (
                                                                    <button
                                                                        key={optIdx}
                                                                        onClick={() => {
                                                                            if (!isAnswered) {
                                                                                setQuizAnswers(prev => ({ ...prev, [quizIndex]: optIdx }));
                                                                            }
                                                                        }}
                                                                        className={`w-full p-4 rounded-2xl border text-left transition flex items-center justify-between font-semibold text-sm cursor-pointer ${btnClass}`}
                                                                    >
                                                                        <div className="flex items-start gap-3">
                                                                            <span className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-xs text-slate-600 shrink-0 mt-0.5">
                                                                                {String.fromCharCode(65 + optIdx)}
                                                                            </span>
                                                                            <span className="whitespace-pre-wrap leading-snug">{opt}</span>
                                                                        </div>
                                                                        {isAnswered && optIdx === correctIdx && (
                                                                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-2" />
                                                                        )}
                                                                        {isAnswered && selectedOpt === optIdx && optIdx !== correctIdx && (
                                                                            <XCircle className="w-5 h-5 text-rose-600 shrink-0 ml-2" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {isAnswered && (q.explanation || (q.points && q.points.length > 0)) && (
                                                            <div className="mt-5 p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs text-indigo-900 leading-relaxed animate-in fade-in space-y-2">
                                                                <span className="font-extrabold block text-indigo-950">💡 Explanation / व्याख्या:</span>
                                                                {q.explanation && <p className="whitespace-pre-wrap">{formatQuizText(q.explanation)}</p>}
                                                                {q.points && Array.isArray(q.points) && q.points.length > 0 && (
                                                                    <div className="pt-2 border-t border-indigo-100/80 space-y-1">
                                                                        {q.points.map((pt: string, pIdx: number) => (
                                                                            <div key={pIdx} className="flex items-start gap-1.5 font-medium">
                                                                                <span className="text-indigo-600 font-bold">•</span>
                                                                                <span className="whitespace-pre-wrap">{pt}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                let correctCount = 0;
                                                questions.forEach((q: any, idx: number) => {
                                                    const correctIdx = getCorrectOptionIndex(q);
                                                    if (quizAnswers[idx] === correctIdx) {
                                                        correctCount++;
                                                    }
                                                });
                                                const percentage = Math.round((correctCount / (questions.length || 1)) * 100);

                                                return (
                                                    <div className="text-center py-6 space-y-5 animate-in fade-in">
                                                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600 border-2 border-amber-300">
                                                            <Award className="w-10 h-10" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-2xl font-black text-slate-900">Quiz Completed! 🎉</h4>
                                                            <p className="text-xs text-slate-500 font-semibold mt-1">Great job attempting this quiz from Free Study Material!</p>
                                                        </div>

                                                        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 max-w-sm mx-auto flex items-center justify-around">
                                                            <div>
                                                                <p className="text-[11px] font-black uppercase text-slate-400">Score</p>
                                                                <p className="text-3xl font-black text-amber-600">{percentage}%</p>
                                                            </div>
                                                            <div className="w-px h-10 bg-slate-200" />
                                                            <div>
                                                                <p className="text-[11px] font-black uppercase text-slate-400">Correct</p>
                                                                <p className="text-3xl font-black text-emerald-600">{correctCount} / {questions.length}</p>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => {
                                                                setQuizIndex(0);
                                                                setQuizAnswers({});
                                                                setShowQuizResult(false);
                                                            }}
                                                            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-2xl shadow-md inline-flex items-center gap-2 transition cursor-pointer"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                            <span>Re-attempt Quiz / फिर से हल करें</span>
                                                        </button>
                                                    </div>
                                                );
                                            })()
                                        )}
                                    </div>

                                    {!showQuizResult && questions.length > 0 && (
                                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                            <button
                                                onClick={() => setQuizIndex(prev => Math.max(0, prev - 1))}
                                                disabled={quizIndex === 0}
                                                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-white transition cursor-pointer disabled:opacity-40"
                                            >
                                                Previous
                                            </button>

                                            {quizIndex < questions.length - 1 ? (
                                                <button
                                                    onClick={() => setQuizIndex(prev => prev + 1)}
                                                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer"
                                                >
                                                    Next Question
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setShowQuizResult(true)}
                                                    className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer"
                                                >
                                                    Finish & View Results 🏆
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Interactive Free Note Reader Modal */}
            {activeNoteFile && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[180] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-100 shadow-2xl overflow-hidden text-left">
                        {(() => {
                            const noteContent = activeNoteFile.noteData?.content || activeNoteFile.fileData || activeNoteFile.url || '';
                            const handwrittenImg = activeNoteFile.noteData?.handwrittenImageUrl || '';
                            const noteSubject = activeNoteFile.noteData?.config?.subject || 'Study Material';

                            return (
                                <>
                                    <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                                                <BookOpen className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-extrabold text-sm sm:text-base leading-tight text-emerald-300">
                                                    {activeNoteFile.name}
                                                </h3>
                                                <p className="text-[11px] text-slate-300 font-medium">
                                                    {noteSubject} • Free Study Material
                                                </p>
                                            </div>
                                        </div>

                                        {/* Template Switcher Pills in Modal */}
                                        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 overflow-x-auto">
                                            {TEMPLATE_OPTIONS.map(tmpl => (
                                                <button
                                                    key={tmpl.id}
                                                    onClick={() => setFreeNoteTemplate(tmpl.id)}
                                                    className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 ${
                                                        freeNoteTemplate === tmpl.id ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-xs' : 'text-slate-300 hover:text-white'
                                                    }`}
                                                >
                                                    <span>{tmpl.icon}</span>
                                                    <span className="hidden sm:inline">{tmpl.name.split(' ')[0]}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (noteContent) {
                                                        navigator.clipboard.writeText(noteContent);
                                                        setNoteCopied(true);
                                                        setTimeout(() => setNoteCopied(false), 2000);
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                                title="Copy Text"
                                            >
                                                {noteCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{noteCopied ? 'Copied!' : 'Copy'}</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    const el = document.getElementById('free-note-content-area');
                                                    if (!el) return;
                                                    const opt = {
                                                        margin: 10,
                                                        filename: `${activeNoteFile.name.replace(/[^a-zA-Z0-9]/g, '_')}_Notes.pdf`,
                                                        image: { type: 'jpeg' as const, quality: 0.98 },
                                                        html2canvas: { scale: 2, useCORS: true },
                                                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                                                    };
                                                    html2pdf().set(opt).from(el).save();
                                                }}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                                title="Download PDF"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>PDF</span>
                                            </button>

                                            <button 
                                                onClick={() => setActiveNoteFile(null)}
                                                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div id="free-note-content-area" className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100/70">
                                        <div className="w-full max-w-4xl mx-auto">
                                            <NoteTemplateRenderer 
                                                note={{
                                                    config: activeNoteFile.noteData?.config || { subject: noteSubject, topic: activeNoteFile.name, language: 'English', format: 'Detail' },
                                                    content: noteContent,
                                                    handwrittenImageUrl: handwrittenImg,
                                                    createdAt: activeNoteFile.createdAt
                                                }}
                                                activeTemplate={freeNoteTemplate}
                                                onSelectTemplate={(t) => setFreeNoteTemplate(t)}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                                        <button
                                            onClick={() => setActiveNoteFile(null)}
                                            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                                        >
                                            Close / बंद करें
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Edit Free Material Modal */}
            {editModalFile && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-5 border border-slate-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-left">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Pencil className="w-4.5 h-4.5 text-amber-600" />
                                <span>{lang === 'hi' ? 'सामग्री संपादित / अपडेट करें' : 'Edit / Update Material'}</span>
                            </h3>
                            <button 
                                onClick={() => setEditModalFile(null)}
                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                            >
                                <X className="w-4.5 h-4.5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="space-y-3.5 overflow-y-auto pr-1">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'मटीरियल प्रकार' : 'Material Type'}
                                </label>
                                <select
                                    value={editFileType}
                                    onChange={(e) => setEditFileType(e.target.value as any)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                >
                                    <option value="pdf">PDF File 📄</option>
                                    <option value="link">Website / Drive Link 🔗</option>
                                    <option value="image">Image / Graphic 🖼️</option>
                                    <option value="file">Other File 📁</option>
                                    <option value="folder">Sub-folder 📁</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'शीर्षक *' : 'Title *'}
                                </label>
                                <input
                                    type="text"
                                    value={editFileName}
                                    onChange={(e) => setEditFileName(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'वेबसाइट / ड्राइव लिंक URL' : 'Link / Drive URL'}
                                </label>
                                <input
                                    type="text"
                                    value={editFileUrl}
                                    onChange={(e) => setEditFileUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'कस्टम लोगो / इमेज (अपलोड / बदलें)' : 'Custom Image / Logo (Upload/Change)'}
                                </label>
                                <div className="space-y-2 mt-1">
                                    <input
                                        type="text"
                                        value={editLogoUrl}
                                        onChange={(e) => setEditLogoUrl(e.target.value)}
                                        placeholder={lang === 'hi' ? "इमेज का डायरेक्ट URL (optional)" : "Direct image URL (optional)"}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            id="edit-freematerial-logo-input"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 950 * 1024) {
                                                    setEditError(lang === 'hi' ? 'चित्र 950KB से छोटा होना चाहिए।' : 'Image size must be under 950KB.');
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => {
                                                    setEditUploadedLogoBase64(reader.result as string);
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        <label
                                            htmlFor="edit-freematerial-logo-input"
                                            className="px-3 py-1.5 border border-dashed border-slate-300 hover:border-amber-500 rounded-lg text-slate-600 font-bold text-xs cursor-pointer transition flex items-center gap-1"
                                        >
                                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                                            <span>{editUploadedLogoBase64 || editLogoUrl ? (lang === 'hi' ? 'लोगो बदलें' : 'Change Logo') : (lang === 'hi' ? 'लोगो अपलोड करें' : 'Upload Logo')}</span>
                                        </label>

                                        {(editUploadedLogoBase64 || editLogoUrl) && (
                                            <img src={editUploadedLogoBase64 || editLogoUrl} alt="Preview" className="w-8 h-8 rounded object-contain border border-slate-200" referrerPolicy="no-referrer" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {editFileType !== 'link' && editFileType !== 'folder' && (
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                        {lang === 'hi' ? 'फाइल (अपलोड / बदलें)' : 'File / PDF (Upload / Change)'}
                                    </label>
                                    <div className="flex items-center gap-3 mt-1">
                                        <input
                                            type="file"
                                            id="edit-freematerial-file-input"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 950 * 1024) {
                                                    setEditError(lang === 'hi' ? 'फाइल 950KB से छोटी होनी चाहिए।' : 'File size must be under 950KB.');
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => {
                                                    setEditUploadedFileBase64(reader.result as string);
                                                    setEditUploadedFileName(file.name);
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        <label
                                            htmlFor="edit-freematerial-file-input"
                                            className="px-3 py-1.5 border border-dashed border-slate-300 hover:border-indigo-500 rounded-lg text-slate-600 font-bold text-xs cursor-pointer transition flex items-center gap-1"
                                        >
                                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                                            <span>{editUploadedFileBase64 ? (lang === 'hi' ? 'फाइल बदलें' : 'Change File') : (lang === 'hi' ? 'फाइल चुनें' : 'Select File')}</span>
                                        </label>
                                        {editUploadedFileName && (
                                            <span className="text-xs text-emerald-700 font-bold truncate max-w-[150px]">
                                                ✓ {editUploadedFileName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {editError && (
                                <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {editError}
                                </p>
                            )}

                            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setEditModalFile(null)}
                                    className="px-4 py-2 border border-slate-200 text-slate-500 font-bold text-xs rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                >
                                    {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingEdit}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                >
                                    {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {lang === 'hi' ? 'सुरक्षित करें' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Custom Alert Message Modal */}
            {alertMessage && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-55 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-5 border border-slate-100 shadow-2xl text-center">
                        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                            alertMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-650'
                        }`}>
                            {alertMessage.type === 'success' ? <CheckCircle className="w-6 h-6 animate-bounce" /> : <AlertCircle className="w-6 h-6" />}
                        </div>
                        <h3 className="font-black text-slate-900 text-base">
                            {alertMessage.title}
                        </h3>
                        <p className="text-xs text-slate-500 font-semibold mt-1.5 leading-relaxed">
                            {alertMessage.message}
                        </p>
                        <button
                            onClick={() => setAlertMessage(null)}
                            className="w-full mt-5 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white font-black text-xs rounded-xl transition cursor-pointer"
                        >
                            {lang === 'hi' ? 'ठीक है' : 'Okay'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Simple Mock CheckCircle if not imported or required
const CheckCircle: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
    </svg>
);
