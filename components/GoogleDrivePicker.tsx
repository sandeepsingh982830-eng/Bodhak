
import React, { useState, useEffect } from 'react';
import { 
    Folder, 
    FileText, 
    Search, 
    ChevronLeft, 
    Loader2, 
    X,
    FolderOpen,
    FileCode,
    FileDown,
    Cloud
} from 'lucide-react';
import { listDriveFiles, searchDriveFiles, DriveFile, getDriveFileContent } from '../services/driveService';
import { motion, AnimatePresence } from 'motion/react';

interface GoogleDrivePickerProps {
    accessToken: string;
    onFileSelected: (file: { blob: Blob, name: string, mimeType: string }) => void;
    onClose: () => void;
}

const GoogleDrivePicker: React.FC<GoogleDrivePickerProps> = ({ accessToken, onFileSelected, onClose }) => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [path, setPath] = useState<{ id: string, name: string }[]>([{ id: 'root', name: 'My Drive' }]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDownloading, setIsDownloading] = useState<string | null>(null);

    const currentFolder = path[path.length - 1];

    useEffect(() => {
        fetchFiles(currentFolder.id);
    }, [currentFolder.id]);

    const fetchFiles = async (folderId: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await listDriveFiles(accessToken, folderId);
            setFiles(data);
        } catch (err) {
            setError('Failed to load files from Google Drive');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            fetchFiles(currentFolder.id);
            return;
        }
        setLoading(true);
        try {
            const data = await searchDriveFiles(accessToken, searchQuery);
            setFiles(data);
        } catch (err) {
            setError('Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folder: DriveFile) => {
        setPath([...path, { id: folder.id, name: folder.name }]);
        setSearchQuery('');
    };

    const handleBack = () => {
        if (path.length > 1) {
            setPath(path.slice(0, -1));
            setSearchQuery('');
        }
    };

    const handleFileClick = async (file: DriveFile) => {
        setIsDownloading(file.id);
        try {
            const blob = await getDriveFileContent(accessToken, file.id);
            onFileSelected({ blob, name: file.name, mimeType: file.mimeType });
        } catch (err) {
            setError('Failed to download file');
        } finally {
            setIsDownloading(null);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
        >
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden border border-slate-200"
            >
                {/* Header */}
                <div className="p-6 md:p-8 bg-indigo-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <Cloud className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-black text-lg">Google Drive</h3>
                            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider">Select a document to scan</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="px-6 py-4 border-b border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        {path.map((p, idx) => (
                            <React.Fragment key={p.id}>
                                {idx > 0 && <span className="text-slate-300 text-xs">/</span>}
                                <button 
                                    onClick={() => setPath(path.slice(0, idx + 1))}
                                    className={`text-[11px] font-black uppercase tracking-wider whitespace-nowrap px-2 py-1 rounded-lg transition ${
                                        idx === path.length - 1 
                                        ? 'text-indigo-600 bg-indigo-50' 
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {p.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="relative">
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search your drive..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold transition-all"
                        />
                        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    </div>
                </div>

                {/* File List */}
                <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Loading Drive...</p>
                        </div>
                    ) : error ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="bg-red-50 p-4 rounded-full">
                                <X className="w-8 h-8 text-red-500" />
                            </div>
                            <p className="text-slate-600 font-bold">{error}</p>
                            <button 
                                onClick={() => fetchFiles(currentFolder.id)}
                                className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-black shadow-lg"
                            >
                                RETRY
                            </button>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                            <FolderOpen className="w-16 h-16 mb-4 text-slate-300" />
                            <p className="text-sm font-black text-slate-400 uppercase tracking-tight">This folder is empty</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {files.map((file) => (
                                <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    key={file.id}
                                    onClick={() => file.mimeType === 'application/vnd.google-apps.folder' ? handleFolderClick(file) : handleFileClick(file)}
                                    disabled={!!isDownloading}
                                    className="flex items-center gap-4 p-4 bg-slate-50/50 hover:bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/40 rounded-2xl transition-all text-left group"
                                >
                                    <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                                        file.mimeType === 'application/vnd.google-apps.folder'
                                        ? 'bg-amber-100 text-amber-600'
                                        : 'bg-indigo-100 text-indigo-600'
                                    }`}>
                                        {file.mimeType === 'application/vnd.google-apps.folder' ? (
                                            <Folder className="w-6 h-6" />
                                        ) : (
                                            <FileText className="w-6 h-6" />
                                        )}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{file.name}</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                            {file.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : (file.size ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` : 'Document')}
                                        </p>
                                    </div>
                                    {isDownloading === file.id && (
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                    )}
                                </motion.button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {files.length} items found
                    </p>
                    {path.length > 1 && (
                        <button 
                            onClick={handleBack}
                            className="flex items-center gap-2 text-xs font-black text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            GO BACK
                        </button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default GoogleDrivePicker;
