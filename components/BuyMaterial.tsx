import React, { useState, useEffect } from 'react';
import { 
    Folder, FolderPlus, FolderOpen, FileText, Link2, Image, 
    Trash2, Plus, Loader2, BookOpen, AlertCircle, Eye, 
    Download, ChevronRight, ExternalLink, X, ShoppingBag, Search, Pin, Wand2,
    Share2, Copy, Check
} from 'lucide-react';
import { db } from '../services/firebase';
import { collection, addDoc, doc, deleteDoc, query, orderBy, onSnapshot, getDocs, setDoc } from 'firebase/firestore';
import { Language } from '../translations';
import { suggestTopicTag, suggestBookTags } from '../services/geminiService';

interface BuyMaterialProps {
    profile: any;
    appSettings: any;
}

interface FolderData {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    createdBy?: string;
}

interface FileData {
    id: string;
    name: string;
    type: 'pdf' | 'link' | 'image' | 'file' | 'folder' | 'book';
    url?: string;
    fileData?: string;
    fileName?: string;
    createdAt: number;
    parentId?: string;
    price?: string;
    description?: string;
    topicTags?: string[];
    categoryId?: string;
    categoryName?: string;
}

export const BuyMaterial: React.FC<BuyMaterialProps> = ({ profile, appSettings }) => {
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

    // Folders/Categories list (Level 1)
    const [folders, setFolders] = useState<FolderData[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
    const [allBooks, setAllBooks] = useState<FileData[]>([]);
    
    const [loadingFolders, setLoadingFolders] = useState(true);
    const [loadingAllBooks, setLoadingAllBooks] = useState(true);

    // Filter search text
    const [searchText, setSearchText] = useState('');

    // Pinned books on Home page
    const [pinnedBookIds, setPinnedBookIds] = useState<string[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'pinnedBooks'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: string[] = [];
            snapshot.forEach((doc) => {
                list.push(doc.id);
            });
            setPinnedBookIds(list);
        }, (err) => {
            console.error("Error loading pinned books in BuyMaterial: ", err);
        });
        return () => unsubscribe();
    }, []);

    // Form states - folders (Level 1 - Categories)
    const [showAddFolder, setShowAddFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDesc, setNewFolderDesc] = useState('');
    const [folderError, setFolderError] = useState('');
    const [savingFolder, setSavingFolder] = useState(false);

    // Form states - files & subfolders (Level 2 & 3 - Sub-Categories & Books)
    const [showAddFile, setShowAddFile] = useState(false);
    const [uploadCategoryId, setUploadCategoryId] = useState<string>('');
    const [newFileName, setNewFileName] = useState('');
    const [newFileType, setNewFileType] = useState<'pdf' | 'link' | 'image' | 'file' | 'folder' | 'book'>('book');
    const [newFileUrl, setNewFileUrl] = useState('');
    const [newFilePrice, setNewFilePrice] = useState('');
    const [newFileDescription, setNewFileDescription] = useState('');
    const [newTopicTags, setNewTopicTags] = useState('');
    const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [fileError, setFileError] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const [savingFile, setSavingFile] = useState(false);
    const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);

    // Custom In-App Modal States (Replaces window.open/confirm/alert)
    const [activePreviewFile, setActivePreviewFile] = useState<FileData | null>(null);
    const [shareModalBook, setShareModalBook] = useState<FileData | null>(null);
    const [shareCopied, setShareCopied] = useState(false);
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

    const handleShareBook = (book: FileData) => {
        setShareModalBook(book);
    };

    // Fetch Level 1 Folders in real-time
    useEffect(() => {
        const q = query(collection(db, 'buyMaterials'), orderBy('createdAt', 'desc'));
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
            if (list.length > 0 && !uploadCategoryId) {
                setUploadCategoryId(list[0].id);
            }
            setLoadingFolders(false);
        }, (err) => {
            console.error("Error loading folders: ", err);
            setLoadingFolders(false);
        });

        return () => unsubscribe();
    }, []);

    // Real-time listener for files of ALL folders
    useEffect(() => {
        if (folders.length === 0) {
            setAllBooks([]);
            setLoadingAllBooks(false);
            return;
        }

        setLoadingAllBooks(true);
        const unsubscribes: (() => void)[] = [];
        const booksMap = new Map<string, FileData[]>();

        folders.forEach((folder) => {
            const q = query(collection(db, 'buyMaterials', folder.id, 'files'), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, (snapshot) => {
                const list: FileData[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    list.push({
                        id: doc.id,
                        name: data.name || '',
                        type: data.type || 'book',
                        url: data.url || '',
                        fileData: data.fileData || '',
                        fileName: data.fileName || '',
                        createdAt: data.createdAt || Date.now(),
                        parentId: data.parentId || undefined,
                        price: data.price || '',
                        description: data.description || '',
                        topicTags: data.topicTags || (data.topicTag ? [data.topicTag] : []),
                        categoryId: folder.id,
                        categoryName: folder.name,
                    });
                });
                booksMap.set(folder.id, list);

                // Flatten map to array of all books
                const flattened: FileData[] = [];
                booksMap.forEach((bookList) => {
                    flattened.push(...bookList);
                });
                
                setAllBooks(flattened);
                setLoadingAllBooks(false);
            }, (err) => {
                console.error(`Error loading books for folder ${folder.id}:`, err);
            });
            unsubscribes.push(unsub);
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, [folders]);

    // Handle create folder (Level 1)
    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) {
            setFolderError(lang === 'hi' ? 'कृपया कैटेगरी का नाम लिखें।' : 'Please enter a category name.');
            return;
        }

        setSavingFolder(true);
        setFolderError('');

        try {
            await addDoc(collection(db, 'buyMaterials'), {
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
                message: lang === 'hi' ? 'स्टडी मटीरियल मुख्य कैटेगरी सफलतापूर्वक बन गई है।' : 'Study Category has been created successfully.',
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
            title: lang === 'hi' ? 'कैटेगरी हटाएं?' : 'Delete Category?',
            message: lang === 'hi' 
                ? `क्या आप सचमुच "${folderName}" कैटेगरी और इसके अंदर की सभी पुस्तकें हटाना चाहते हैं? यह क्रिया वापस नहीं ली जा सकती।` 
                : `Are you sure you want to delete category "${folderName}" and all its books? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    // Fetch nested files and delete them first
                    const filesSnap = await getDocs(collection(db, 'buyMaterials', folderId, 'files'));
                    const deletePromises = filesSnap.docs.map(fdoc => deleteDoc(doc(db, 'buyMaterials', folderId, 'files', fdoc.id)));
                    await Promise.all(deletePromises);

                    // Delete main folder doc
                    await deleteDoc(doc(db, 'buyMaterials', folderId));
                    
                    if (selectedCategoryId === folderId) {
                        setSelectedCategoryId('all');
                    }
                    setConfirmDialog(null);
                    setAlertMessage({
                        title: lang === 'hi' ? 'सफलता' : 'Success',
                        message: lang === 'hi' ? 'कैटेगरी सफलतापूर्वक हटा दी गई है।' : 'Category deleted successfully.',
                        type: 'success'
                    });
                } catch (err) {
                    console.error("Error deleting folder: ", err);
                    setAlertMessage({
                        title: lang === 'hi' ? 'त्रुटि' : 'Error',
                        message: lang === 'hi' ? 'कैटेगरी हटाने में विफलता।' : 'Failed to delete category.',
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
            setFileError(lang === 'hi' ? 'चित्र बहुत बड़ा है। कृपया 950KB से छोटा चित्र चुनें।' : 'Image is too large. Max 950KB allowed for database safety.');
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

    const handleSuggestTopic = async () => {
        if (!newFileName.trim()) {
            setFileError(lang === 'hi' ? 'कृपया पहले शीर्षक लिखें।' : 'Please enter a title first.');
            return;
        }
        setIsSuggestingTopic(true);
        try {
            const suggestedResult = await suggestBookTags(newFileName, newFileDescription);
            const suggestedTagsList = suggestedResult
                .split(/[,;#]+/)
                .map(t => t.trim())
                .filter(t => t.length > 0);
            
            const currentTags = newTopicTags.split(/[, ]+/).map(t => t.trim()).filter(t => t !== '');
            const combined = [...currentTags];
            
            suggestedTagsList.forEach(tag => {
                if (!combined.includes(tag)) {
                    combined.push(tag);
                }
            });
            
            setNewTopicTags(combined.join(', '));
        } catch (err) {
            console.error("Topic Suggestion Error:", err);
        } finally {
            setIsSuggestingTopic(false);
        }
    };

    // Handle add material file, link, or nested subfolder (Level 2 & 3)
    const handleAddFile = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetCategory = uploadCategoryId || (folders.length > 0 ? folders[0].id : null);
        if (!targetCategory) {
            setFileError(lang === 'hi' ? 'कृपया पहले एक कैटेगरी चुनें।' : 'Please choose a category first.');
            return;
        }

        if (!newFileName.trim()) {
            setFileError(lang === 'hi' ? 'कृपया मटीरियल/पुस्तक का शीर्षक लिखें।' : 'Please enter material title.');
            return;
        }

        if (newFileType === 'book' && !newFileUrl.trim()) {
            setFileError(lang === 'hi' ? 'कृपया वैध ऑनलाइन शॉपिंग/पर्चेस लिंक दर्ज करें।' : 'Please enter a valid online shopping/purchase URL/link.');
            return;
        }

        if (newFileType === 'book' && !uploadedFileBase64) {
            setFileError(lang === 'hi' ? 'कृपया पुस्तक का कवर चित्र अपलोड करें।' : 'Please upload a book cover image.');
            return;
        }

        if (newFileType !== 'link' && newFileType !== 'folder' && newFileType !== 'book' && !uploadedFileBase64) {
            setFileError(lang === 'hi' ? 'कृपया फाइल अपलोड करें।' : 'Please upload a file.');
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

            if (newFileType === 'link' || newFileType === 'book') {
                let formattedUrl = newFileUrl.trim();
                if (!/^https?:\/\//i.test(formattedUrl)) {
                    formattedUrl = 'https://' + formattedUrl;
                }
                payload.url = formattedUrl;
            }

            if (newFileType === 'book') {
                payload.price = newFilePrice.trim() || '₹299';
                payload.description = newFileDescription.trim();
                payload.topicTags = newTopicTags.split(/[, ]+/).map(t => t.trim().replace(/^#/, '')).filter(t => t !== '');
                payload.fileData = uploadedFileBase64;
                payload.fileName = uploadedFileName || 'cover.png';
            } else if (newFileType !== 'link' && newFileType !== 'folder') {
                payload.topicTags = newTopicTags.split(/[, ]+/).map(t => t.trim().replace(/^#/, '')).filter(t => t !== '');
                payload.fileData = uploadedFileBase64;
                payload.fileName = uploadedFileName;
            } else if (newFileType === 'link') {
                payload.topicTags = newTopicTags.split(/[, ]+/).map(t => t.trim().replace(/^#/, '')).filter(t => t !== '');
            }

            await addDoc(collection(db, 'buyMaterials', targetCategory, 'files'), payload);

            setNewFileName('');
            setNewFileUrl('');
            setNewFilePrice('');
            setNewFileDescription('');
            setNewTopicTags('');
            setUploadedFileBase64('');
            setUploadedFileName('');
            setShowAddFile(false);
            setAlertMessage({
                title: lang === 'hi' ? 'जोड़ा गया' : 'Added Successfully',
                message: lang === 'hi' ? 'पुस्तक को ऑनलाइन शॉपिंग लिंक के साथ जोड़ दिया गया है।' : 'Book has been added with shopping link successfully.',
                type: 'success'
            });
        } catch (err: any) {
            setFileError(err.message || 'Error saving material');
        } finally {
            setSavingFile(false);
        }
    };

    const handleDeleteFile = (fileId: string, fileName: string, type: string, categoryId: string) => {
        setConfirmDialog({
            title: lang === 'hi' ? 'मटीरियल हटाएं?' : 'Delete Book/Material?',
            message: lang === 'hi' 
                ? `क्या आप सचमुच "${fileName}" हटाना चाहते हैं?` 
                : `Are you sure you want to delete "${fileName}"?`,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'buyMaterials', categoryId, 'files', fileId));
                    setConfirmDialog(null);
                    setAlertMessage({
                        title: lang === 'hi' ? 'सफलता' : 'Success',
                        message: lang === 'hi' ? 'मटीरियल सफलतापूर्वक हटा दिया गया है।' : 'Material deleted successfully.',
                        type: 'success'
                    });
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
            case 'folder': return <Folder className="w-5 h-5 text-indigo-600" />;
            case 'link': return <Link2 className="w-5 h-5 text-indigo-600" />;
            case 'image': return <Image className="w-5 h-5 text-teal-600" />;
            case 'pdf': return <FileText className="w-5 h-5 text-rose-600" />;
            case 'book': return <ShoppingBag className="w-5 h-5 text-violet-600" />;
            default: return <FileText className="w-5 h-5 text-blue-600" />;
        }
    };

    // Local client-side filter logic for displaying all books cleanly
    const filteredBooks = allBooks
        .filter(file => file.type !== 'folder') // only show books/materials
        .filter(file => {
            if (selectedCategoryId === 'all') return true;
            return file.categoryId === selectedCategoryId;
        })
        .filter(file => {
            if (!searchText.trim()) return true;
            const queryText = searchText.toLowerCase();
            const nameMatch = file.name.toLowerCase().includes(queryText);
            const descMatch = file.description && file.description.toLowerCase().includes(queryText);
            const tagMatch = file.topicTags && file.topicTags.some(tag => tag.toLowerCase().includes(queryText));
            return nameMatch || descMatch || tagMatch;
        });

    return (
        <div id="buy-materials-root" className="max-w-5xl mx-auto px-4 py-6 md:py-10 pb-24 text-slate-800">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="bg-violet-100 p-3 rounded-2xl border border-violet-200 text-violet-700">
                        <ShoppingBag className="w-6 h-6 shrink-0" />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            {lang === 'hi' ? 'स्टडी मटीरियल व पुस्तकें खरीदें 📚' : 'Buy Study Material & Books 📚'}
                        </h2>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                            {lang === 'hi' 
                                ? 'मैनेजर द्वारा चुनी गई बेस्ट बुक्स, नोट्स और रेकमेंडेड स्टडी मटीरियल सीधे ऑनलाइन खरीदें।' 
                                : 'Browse handpicked exam books, curated notes and guides with direct online purchase links.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Manager Control Center Panel (Only shown to manager) */}
            {isManager && (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 mb-6 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase text-violet-600 tracking-wider">
                            🛠️ {lang === 'hi' ? 'मैनेजर विशेष पैनल' : 'MANAGER EXCLUSIVE CONTROL'}
                        </span>
                        <h4 className="text-xs font-bold text-slate-700 mt-0.5">
                            {lang === 'hi' ? 'श्रेणियां प्रबंधित करें और नई पुस्तकें सीधे अपलोड करें' : 'Manage categories and upload books directly'}
                        </h4>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                setShowAddFolder(!showAddFolder);
                                setShowAddFile(false);
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer"
                        >
                            <FolderPlus className="w-4 h-4" />
                            <span>{lang === 'hi' ? 'नई कैटेगरी' : 'Add Category'}</span>
                        </button>
                        <button
                            onClick={() => {
                                setShowAddFile(!showAddFile);
                                setShowAddFolder(false);
                                if (folders.length > 0 && !uploadCategoryId) {
                                    setUploadCategoryId(folders[0].id);
                                }
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>{lang === 'hi' ? 'नई पुस्तक जोड़ें' : 'Add New Book'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Category creation box */}
            {showAddFolder && isManager && (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 mb-6 shadow-sm animate-in fade-in duration-200">
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                        <Plus className="w-4.5 h-4.5 text-violet-600" />
                        <span>{lang === 'hi' ? 'नई स्टडी मटीरियल मुख्य कैटेगरी बनाएं' : 'Create New Study Material Category'}</span>
                    </h3>
                    <form onSubmit={handleCreateFolder} className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'कैटेगरी का नाम *' : 'Category Name *'}
                            </label>
                            <input
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder={lang === 'hi' ? "जैसे: इतिहास पुस्तकें, Exam Practice Sets" : "e.g. UPSC Books, SSC Exam"}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'कैटेगरी संक्षिप्त विवरण (वैकल्पिक)' : 'Category Description (Optional)'}
                            </label>
                            <input
                                type="text"
                                value={newFolderDesc}
                                onChange={(e) => setNewFolderDesc(e.target.value)}
                                placeholder={lang === 'hi' ? "जैसे: वर्ष 2026 की परीक्षा के लिए उपयोगी किताबें" : "e.g. Curated guides for study"}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        {folderError && (
                            <p className="text-xs text-red-650 font-bold flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {folderError}
                            </p>
                        )}

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddFolder(false);
                                    setFolderError('');
                                }}
                                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold text-xs rounded-lg hover:bg-slate-100 transition"
                            >
                                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={savingFolder}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {savingFolder && <Loader2 className="w-3 h-3 animate-spin" />}
                                {lang === 'hi' ? 'बनाएं' : 'Create Category'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Book Upload Box */}
            {showAddFile && isManager && (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 mb-6 shadow-sm animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <Plus className="w-4.5 h-4.5 text-violet-600" />
                            <span>{lang === 'hi' ? 'स्टोर में नई पुस्तक जोड़ें' : 'Add New Book to Store'}</span>
                        </h3>
                        <button 
                            onClick={() => setShowAddFile(false)}
                            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition"
                        >
                            <X className="w-4.5 h-4.5" />
                        </button>
                    </div>

                    <form onSubmit={handleAddFile} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'कैटेगरी चुनें *' : 'Choose Category *'}
                                </label>
                                <select
                                    value={uploadCategoryId}
                                    onChange={(e) => setUploadCategoryId(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    {folders.length === 0 && <option value="">No categories available</option>}
                                    {folders.map((f) => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'मटीरियल प्रकार / Type' : 'Material Type'}
                                </label>
                                <select
                                    value={newFileType}
                                    onChange={(e) => setNewFileType(e.target.value as any)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="book">{lang === 'hi' ? 'पुस्तक 🛒' : 'Book 🛒'}</option>
                                    <option value="link">Link</option>
                                    <option value="pdf">PDF File</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'पुस्तक/मटीरियल का शीर्षक *' : 'Book/Material Title *'}
                            </label>
                            <input
                                type="text"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder={lang === 'hi' ? "जैसे: SSC GK Chapterwise Book" : "e.g. UPSC General Studies Notes"}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider">
                                    {lang === 'hi' ? 'विषय टैग्स (कम से कम 10 AI द्वारा जनरेट करने के लिए क्लिक करें)' : 'Topic Tags (Click AI Suggest to generate 10+ tags)'}
                                </label>
                                <button
                                    type="button"
                                    onClick={handleSuggestTopic}
                                    disabled={isSuggestingTopic}
                                    className="flex items-center gap-1 text-[10px] font-black text-violet-600 hover:text-violet-700 bg-violet-50 px-2 py-0.5 rounded transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isSuggestingTopic ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                                    {lang === 'hi' ? 'AI 10+ टैग्स सुझाव' : 'AI Suggest 10+ Tags'}
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">#</span>
                                <input
                                    type="text"
                                    value={newTopicTags}
                                    onChange={(e) => setNewTopicTags(e.target.value)}
                                    placeholder={lang === 'hi' ? "कोमा (,) से अलग किए गए विषय टैग्स" : "Commas separated tags"}
                                    className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-bold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'कीमत / Price *' : 'Price *'}
                                </label>
                                <input
                                    type="text"
                                    value={newFilePrice}
                                    onChange={(e) => setNewFilePrice(e.target.value)}
                                    placeholder={lang === 'hi' ? "जैसे: ₹299 या Free" : "e.g. ₹299 or Free"}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                    {lang === 'hi' ? 'पुस्तक संक्षिप्त विवरण' : 'Book Short Description'}
                                </label>
                                <input
                                    type="text"
                                    value={newFileDescription}
                                    onChange={(e) => setNewFileDescription(e.target.value)}
                                    placeholder={lang === 'hi' ? "जैसे: UPSC इतिहास के लिए महत्वपूर्ण गाइड" : "e.g. Essential history guide with practice sets"}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'खरीद लिंक / URL *' : 'Purchase Link / URL *'}
                            </label>
                            <input
                                type="text"
                                value={newFileUrl}
                                onChange={(e) => setNewFileUrl(e.target.value)}
                                placeholder="https://amazon.in/dp/..."
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-500 mb-1 tracking-wider">
                                {lang === 'hi' ? 'पुस्तक कवर चित्र (950KB से कम) *' : 'Book Cover Image (Max 950KB) *'}
                            </label>
                            <div className="mt-1 flex items-center gap-3">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="book-image-file-uploader"
                                />
                                <label
                                    htmlFor="book-image-file-uploader"
                                    className="px-4 py-2 border border-dashed border-slate-300 hover:border-violet-500 hover:bg-violet-50/50 rounded-xl text-slate-600 font-bold text-xs cursor-pointer flex items-center gap-1.5 transition"
                                >
                                    <Eye className="w-4 h-4 text-slate-500" />
                                    <span>
                                        {uploadedFileName ? (lang === 'hi' ? 'बदलें / Change' : 'Change') : (lang === 'hi' ? 'चित्र चुनें' : 'Select Image')}
                                    </span>
                                </label>

                                {uploadingFile ? (
                                    <span className="text-xs text-slate-500 flex items-center gap-1.5 font-semibold animate-pulse">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                                        {lang === 'hi' ? 'प्रोसेस हो रहा है...' : 'Processing file...'}
                                    </span>
                                ) : uploadedFileName ? (
                                    <span className="text-xs text-emerald-700 font-black truncate max-w-[200px]">
                                        ✓ {uploadedFileName}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {fileError && (
                            <p className="text-xs text-red-650 font-bold flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {fileError}
                            </p>
                        )}

                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddFile(false);
                                    setNewFileName('');
                                    setNewFileUrl('');
                                    setNewFilePrice('');
                                    setNewFileDescription('');
                                    setNewTopicTags('');
                                    setUploadedFileBase64('');
                                    setUploadedFileName('');
                                    setFileError('');
                                }}
                                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold text-xs rounded-lg hover:bg-slate-100 transition"
                            >
                                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={savingFile || uploadingFile}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {savingFile && <Loader2 className="w-3 h-3 animate-spin" />}
                                {lang === 'hi' ? 'जोड़ें' : 'Add Book'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Search Bar (Primary focus) */}
            <div className="relative mb-5 animate-in fade-in duration-300">
                <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={lang === 'hi' ? 'पुस्तक का नाम, विषय या हैशटैग (#) खोजें...' : 'Search books, specific subjects or hashtag tags...'}
                    className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4.5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-md font-medium text-slate-900 placeholder-slate-400"
                />
                {searchText && (
                    <button 
                        onClick={() => setSearchText('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Small Category Selector (Low profile tag pills) */}
            {folders.length > 0 && (
                <div className="mb-6 animate-in fade-in duration-300">
                    <span className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-wider">
                        {lang === 'hi' ? 'श्रेणी अनुसार छानें (वैकल्पिक)' : 'FILTER BY CATEGORY (OPTIONAL)'}
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 scrollbar-hide">
                        <button
                            onClick={() => setSelectedCategoryId('all')}
                            className={`px-3.5 py-1.5.5 rounded-full text-[11px] font-extrabold transition whitespace-nowrap border cursor-pointer ${
                                selectedCategoryId === 'all'
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200/80 hover:border-violet-300 hover:bg-violet-50/20'
                            }`}
                        >
                            {lang === 'hi' ? 'सभी पुस्तकें 📚' : 'All Books 📚'}
                        </button>
                        {folders.map((folder) => {
                            const isSelected = selectedCategoryId === folder.id;
                            return (
                                <div key={folder.id} className="flex items-center gap-1">
                                    <button
                                        onClick={() => setSelectedCategoryId(folder.id)}
                                        className={`px-3.5 py-1.5 rounded-full text-[11px] font-extrabold transition whitespace-nowrap border cursor-pointer ${
                                            isSelected
                                                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200/80 hover:border-violet-300 hover:bg-violet-50/20'
                                        }`}
                                    >
                                        {folder.name}
                                    </button>
                                    {isManager && (
                                        <button
                                            onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition cursor-pointer shrink-0"
                                            title={lang === 'hi' ? 'कैटेगरी हटाएं' : 'Delete Category'}
                                        >
                                            <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Books Loading State */}
            {(loadingAllBooks || loadingFolders) && folders.length > 0 && allBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                    <p className="text-xs text-slate-500 font-bold">
                        {lang === 'hi' ? 'पुस्तकें लोड की जा रही हैं...' : 'Loading all books...'}
                    </p>
                </div>
            ) : null}

            {/* No books placeholder */}
            {folders.length === 0 && !loadingFolders && (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-md animate-in fade-in duration-300">
                    <div className="bg-violet-50 text-violet-600 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <ShoppingBag className="w-7 h-7" />
                    </div>
                    <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                        {lang === 'hi' ? 'कोई पुस्तक उपलब्ध नहीं है' : 'No books available'}
                    </h3>
                    <p className="text-xs text-slate-400 font-semibold max-w-[280px] mx-auto mt-1.5 leading-relaxed">
                        {lang === 'hi' 
                            ? 'मैनेजर ने अभी तक कोई स्टडी मटीरियल या पुस्तक नहीं अपलोड की है।' 
                            : 'The manager has not uploaded any study material or books yet.'}
                    </p>
                </div>
            )}

            {/* Primary Books Feed Grid */}
            {filteredBooks.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-5.5 animate-in fade-in duration-300">
                    {filteredBooks.map((file) => (
                        <div 
                            key={file.id}
                            className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3.5 shadow-sm flex flex-col gap-3.5 transition-all duration-300 hover:border-violet-300 hover:shadow-lg text-left relative overflow-hidden group"
                        >
                            {/* Cover photo section */}
                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 border border-slate-100 relative shrink-0">
                                {file.url ? (
                                    <a 
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full h-full relative group cursor-pointer"
                                    >
                                        {file.fileData ? (
                                            <img 
                                                src={file.fileData} 
                                                alt={file.name} 
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-violet-50 flex flex-col items-center justify-center text-violet-500">
                                                <ShoppingBag className="w-7 h-7 mb-1" />
                                                <span className="text-[9px] font-black uppercase">Book</span>
                                            </div>
                                        )}
                                        {/* Overlay on Hover */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                            <span className="bg-white text-slate-900 font-extrabold text-[10px] px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                                <span>{lang === 'hi' ? 'खरीदें 🛒' : 'Buy 🛒'}</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </a>
                                ) : (
                                    <div className="w-full h-full relative">
                                        {file.fileData ? (
                                            <img 
                                                src={file.fileData} 
                                                alt={file.name} 
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-violet-50 flex flex-col items-center justify-center text-violet-500">
                                                <ShoppingBag className="w-7 h-7 mb-1" />
                                                <span className="text-[9px] font-black uppercase">Book</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* Pin to home badge for Manager */}
                                {isManager && (
                                    <button
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const isPinned = pinnedBookIds.includes(file.id);
                                            try {
                                                if (isPinned) {
                                                    await deleteDoc(doc(db, 'pinnedBooks', file.id));
                                                } else {
                                                    await setDoc(doc(db, 'pinnedBooks', file.id), {
                                                        id: file.id,
                                                        name: file.name,
                                                        type: file.type,
                                                        url: file.url || '',
                                                        fileData: file.fileData || '',
                                                        fileName: file.fileName || '',
                                                        price: file.price || '',
                                                        description: file.description || '',
                                                        createdAt: Date.now()
                                                    });
                                                }
                                            } catch (err) {
                                                console.error("Error pinning/unpinning: ", err);
                                            }
                                        }}
                                        className="absolute top-2 right-2 bg-white/95 hover:bg-white text-slate-700 hover:text-amber-500 p-1.5 rounded-lg shadow-md z-20 transition active:scale-90 flex items-center justify-center cursor-pointer border border-slate-100"
                                        title={pinnedBookIds.includes(file.id) ? (lang === 'hi' ? 'पिन हटाएं' : 'Unpin Book') : (lang === 'hi' ? 'होम पर पिन करें' : 'Pin to Home')}
                                    >
                                        <Pin className={`w-3.5 h-3.5 ${pinnedBookIds.includes(file.id) ? 'fill-amber-500 text-amber-500 stroke-amber-600' : 'text-slate-400'}`} />
                                    </button>
                                )}
                            </div>

                            {/* Info Section below cover */}
                            <div className="flex-grow flex flex-col justify-between">
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs sm:text-sm leading-tight line-clamp-2 min-h-[2.25rem]">
                                        {file.name}
                                    </h4>
                                    {file.description && (
                                        <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-1 leading-snug line-clamp-2">
                                            {file.description}
                                        </p>
                                    )}

                                    {/* Small Category Badge */}
                                    {file.categoryName && (
                                        <span className="inline-block mt-2 text-[8px] font-black uppercase text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100/50">
                                            {file.categoryName}
                                        </span>
                                    )}


                                </div>

                                <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-100 shrink-0 gap-1.5">
                                    {file.url ? (
                                        <a 
                                            href={file.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] font-black text-violet-650 hover:text-violet-850 flex items-center gap-0.5 transition hover:underline"
                                        >
                                            <span>{lang === 'hi' ? 'अभी खरीदें 🛒' : 'Buy Now 🛒'}</span>
                                        </a>
                                    ) : (
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">
                                            {lang === 'hi' ? 'सत्यापित पुस्तक' : 'Verified Material'}
                                        </span>
                                    )}

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleShareBook(file);
                                            }}
                                            className="p-1.5 text-indigo-650 hover:text-indigo-850 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 rounded-lg transition active:scale-95 flex items-center gap-1 text-[10px] font-extrabold cursor-pointer"
                                            title={lang === 'hi' ? 'पुस्तक शेयर करें' : 'Share Book'}
                                        >
                                            <Share2 className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{lang === 'hi' ? 'शेयर' : 'Share'}</span>
                                        </button>

                                        {isManager && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteFile(file.id, file.name, file.type, file.categoryId || '');
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                                title={lang === 'hi' ? 'हटाएं' : 'Delete'}
                                            >
                                                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : folders.length > 0 && !loadingAllBooks ? (
                <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl p-10 shadow-sm animate-in fade-in duration-300">
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-xs text-slate-500 font-extrabold">
                        {lang === 'hi' ? 'खोज से मेल खाती कोई पुस्तक नहीं मिली।' : 'No books match your search queries.'}
                    </p>
                    <button 
                        onClick={() => { setSearchText(''); setSelectedCategoryId('all'); }}
                        className="mt-3.5 px-4.5 py-2 bg-slate-150 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition cursor-pointer"
                    >
                        {lang === 'hi' ? 'फ़िल्टर साफ़ करें' : 'Clear Filters'}
                    </button>
                </div>
            ) : null}

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
                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
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
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
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
                                className="px-4.5 py-2 bg-red-650 hover:bg-red-750 text-white font-black text-xs rounded-xl shadow-sm transition cursor-pointer"
                            >
                                {lang === 'hi' ? 'हां, हटाएं' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Book Share Modal */}
            {shareModalBook && (
                <div className="fixed inset-0 bg-slate-900/80 z-55 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-5 border-2 border-slate-200 shadow-2xl text-left relative overflow-hidden bg-white text-slate-900">
                        <button 
                            onClick={() => { setShareModalBook(null); setShareCopied(false); }}
                            className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650">
                                <Share2 className="w-4 h-4" />
                            </div>
                            <h3 className="font-black text-slate-900 text-base">
                                {lang === 'hi' ? 'पुस्तक शेयर करें 📚' : 'Share Book 📚'}
                            </h3>
                        </div>

                        {/* Book Preview Card */}
                        <div className="flex gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-200/80 mb-4">
                            <div className="w-16 h-20 bg-white rounded-xl overflow-hidden border border-slate-200 shrink-0 shadow-xs">
                                {shareModalBook.fileData ? (
                                    <img 
                                        src={shareModalBook.fileData} 
                                        alt={shareModalBook.name} 
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-violet-50 flex items-center justify-center text-violet-500">
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h4 className="font-extrabold text-xs text-slate-900 line-clamp-2 leading-snug">
                                    {shareModalBook.name}
                                </h4>
                                {shareModalBook.description && (
                                    <p className="text-[10px] text-slate-500 font-semibold line-clamp-2 mt-1">
                                        {shareModalBook.description}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Share Platform Buttons */}
                        <div className="space-y-2">
                            {/* WhatsApp Button */}
                            <a 
                                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                                    `📚 *${shareModalBook.name}*\n\n${shareModalBook.description ? shareModalBook.description + '\n\n' : ''}👉 *Book Link / बुक लिंक:* ${shareModalBook.url || window.location.href}\n📲 *Bodhak App Link / बोधक ऐप लिंक:* ${appSettings?.shareAppLink || window.location.origin}\n\nShared via Bodhak App`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-98 cursor-pointer"
                            >
                                <span className="text-base">💬</span>
                                <span>{lang === 'hi' ? 'व्हाट्सएप पर शेयर करें (WhatsApp)' : 'Share via WhatsApp'}</span>
                            </a>

                            {/* Telegram Button */}
                            <a 
                                href={`https://t.me/share/url?url=${encodeURIComponent(shareModalBook.url || window.location.href)}&text=${encodeURIComponent(
                                    `📚 *${shareModalBook.name}*\n${shareModalBook.description ? shareModalBook.description + '\n' : ''}\n👉 *Book Link:* ${shareModalBook.url || window.location.href}\n📲 *Bodhak App Link:* ${appSettings?.shareAppLink || window.location.origin}`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-98 cursor-pointer"
                            >
                                <span className="text-base">✈️</span>
                                <span>{lang === 'hi' ? 'टेलीग्राम पर शेयर करें (Telegram)' : 'Share via Telegram'}</span>
                            </a>

                            {/* Copy Link & Details */}
                            <button
                                onClick={async () => {
                                    const link = shareModalBook.url || window.location.href;
                                    const appUrl = appSettings?.shareAppLink || window.location.origin;
                                    const text = `📚 ${shareModalBook.name}\n${shareModalBook.description ? shareModalBook.description + '\n' : ''}\n👉 Book Link: ${link}\n📲 Bodhak App Link: ${appUrl}`;
                                    try {
                                        await navigator.clipboard.writeText(text);
                                        setShareCopied(true);
                                        setTimeout(() => setShareCopied(false), 2500);
                                    } catch (e) {
                                        console.error("Failed to copy", e);
                                    }
                                }}
                                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition active:scale-98 cursor-pointer"
                            >
                                {shareCopied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-600" />
                                        <span className="text-emerald-700 font-black">
                                            {lang === 'hi' ? 'लिंक व विवरण कॉपी हो गया!' : 'Link & Info Copied!'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 text-slate-600" />
                                        <span>
                                            {lang === 'hi' ? 'लिंक व विवरण कॉपी करें (Instagram/Others)' : 'Copy Link & Info (Instagram/Others)'}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
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
                            className="w-full mt-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl transition cursor-pointer"
                        >
                            {lang === 'hi' ? 'ठीक है' : 'Okay'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const CheckCircle: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
    </svg>
);
