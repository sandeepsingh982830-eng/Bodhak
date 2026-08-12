import React, { useState, useEffect } from 'react';
import { X, User, Save, UserCircle, LogOut, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth, UserProfile } from '../hooks/useAuth';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    profile?: UserProfile | null;
    user?: any;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profile: propProfile, user: propUser }) => {
    const auth = useAuth();
    
    const user = propUser || auth.user;
    const authProfile = propProfile || auth.profile;
    const authLoading = auth.loading;
    const signInWithGoogle = auth.signInWithGoogle;
    const logout = auth.logout;
    const updateProfile = auth.updateProfile;

    // Mode state: 'profile' if user is signed in, otherwise 'login'
    const [mode, setMode] = useState<'login' | 'profile'>('login');
    
    // Feedback state
    const [localError, setLocalError] = useState<string | null>(null);
    const [localSuccess, setLocalSuccess] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Profile edit state
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [study, setStudy] = useState('');
    const [isManager, setIsManager] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [uploading, setUploading] = useState(false);

    // Synchronize profile details when signed in
    useEffect(() => {
        if (user && authProfile) {
            setMode('profile');
            setName(authProfile.name || '');
            setMobile(authProfile.mobile || '');
            setStudy(authProfile.studyFocus || authProfile.study || '');
            setIsManager(authProfile.isManager || false);
            setPhotoUrl(authProfile.photoUrl || '');
        } else if (!user) {
            setMode('login');
        }
    }, [user, authProfile, isOpen]);

    // Clear feedback when mode changes or closed
    useEffect(() => {
        setLocalError(null);
        setLocalSuccess(null);
    }, [mode, isOpen]);

    if (!isOpen) return null;

    const handleGoogleSignIn = async () => {
        setLocalError(null);
        setActionLoading(true);
        try {
            await signInWithGoogle();
        } catch (err: any) {
            let msg = err.message || 'Google Sign-In failed';
            if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-by-user')) {
                msg = "The Google Sign-In popup was closed. Please try again or open in a new tab.";
            }
            setLocalError(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (!file.type.startsWith('image/')) {
            setLocalError('Please select an image file. / कृपया फोटो चुनें।');
            return;
        }
        if (file.size > 600 * 1024) { // Reduced to 600KB for Base64 document safety
            setLocalError('Image too large. Please select a photo under 600KB. / फोटो 600KB से कम होनी चाहिए।');
            return;
        }

        setUploading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            setPhotoUrl(result);
            setUploading(false);
        };
        reader.onerror = () => {
            setLocalError('Failed to read file. / फाइल पढ़ने में विफल।');
            setUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLocalError(null);
        setLocalSuccess(null);
        setActionLoading(true);
        try {
            const updated: any = {
                userId: user.uid,
                name,
                mobile,
                studyFocus: study,
                email: user.email || '',
                isManager: isManager,
                photoUrl,
                updatedAt: Date.now()
            };
            await updateProfile(updated);
            setLocalSuccess('Profile updated successfully!');
            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (err: any) {
            setLocalError(err.message || 'Failed to update profile.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            onClose();
        } catch (err) {
            console.error(err);
        }
    };

    const isLoading = authLoading || actionLoading;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative p-8 animate-in zoom-in-95 duration-200 m-4 max-h-[90vh] overflow-y-auto custom-scrollbar text-slate-850">
                
                <button 
                    onClick={onClose} 
                    className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={isLoading}
                >
                    <X className="h-5 w-5" />
                </button>

                {localError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700 text-[11px] font-bold animate-in slide-in-from-top-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span>{localError}</span>
                    </div>
                )}
                {localSuccess && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3 text-emerald-800 text-[11px] font-bold animate-in slide-in-from-top-2">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                        <span>{localSuccess}</span>
                    </div>
                )}

                {mode === 'profile' && user ? (
                    <div className="space-y-6">
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-indigo-100 p-1 bg-white ring-4 ring-indigo-50/50 overflow-hidden">
                                {photoUrl ? (
                                    <img src={photoUrl} alt="Profile" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                                ) : user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-full h-full rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                                        <User className="w-8 h-8" />
                                    </div>
                                )}
                            </div>
                            <h3 className="text-xl font-black text-slate-800">{name || user.displayName || 'Friend'}</h3>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Active Learner Profile</p>
                            
                            {/* Live coin balance display in profile details */}
                            <div className="mt-3 flex items-center justify-center gap-2 bg-amber-50/70 border border-amber-200/80 rounded-2xl py-2.5 px-4.5 w-fit mx-auto shadow-sm">
                                <span className="text-xl">🪙</span>
                                <div className="text-left leading-none">
                                    <p className="text-[8px] font-black text-amber-500 uppercase tracking-wider mb-1">Coins Balance</p>
                                    <p className="text-sm font-black text-amber-800 font-mono flex items-center gap-1.5 leading-none">
                                        {(authProfile?.isManager || (authProfile?.unlimitedExpirity && authProfile.unlimitedExpirity > Date.now())) ? '∞' : (authProfile?.coins !== undefined ? authProfile.coins : 50)}
                                        {!!(!authProfile?.isManager && authProfile?.unlimitedExpirity && authProfile.unlimitedExpirity > Date.now()) && (
                                            <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-md font-bold leading-none">
                                                {Math.max(1, Math.ceil((authProfile.unlimitedExpirity - Date.now()) / (24 * 60 * 60 * 1000)))}d
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 mb-2 block text-left">Profile Photo / प्रोफाइल फोटो</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-3">
                                            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm bg-slate-100 flex-shrink-0">
                                                {photoUrl ? (
                                                    <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <User className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileChange}
                                                    className="hidden"
                                                    id="profile-photo-upload"
                                                    disabled={isLoading || uploading}
                                                />
                                                <label 
                                                    htmlFor="profile-photo-upload"
                                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                                                        uploading ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                                    }`}
                                                >
                                                    {uploading ? 'Processing...' : photoUrl ? 'Change Photo / फोटो बदलें' : 'Choose Photo / फोटो चुनें'}
                                                </label>
                                                <p className="text-[9px] text-slate-400 mt-1.5 font-bold">Max 600KB (JPG/PNG)</p>
                                            </div>
                                            {photoUrl && (
                                                <button 
                                                    type="button"
                                                    onClick={() => setPhotoUrl('')}
                                                    className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remove"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Fallback for Image URL if needed, but user requested side upload */}
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                value={photoUrl}
                                                onChange={(e) => setPhotoUrl(e.target.value)}
                                                placeholder="Or paste image URL / या फोटो लिंक पेस्ट करें"
                                                className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-2.5 text-[11px] font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                                disabled={isLoading || uploading}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 mb-1 block text-left">Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 mb-1 block text-left">Study Focus</label>
                                    <input
                                        type="text"
                                        value={study}
                                        onChange={(e) => setStudy(e.target.value)}
                                        placeholder="e.g. UPSC, JEE, Class 12"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 mb-1 block text-left">Mobile</label>
                                    <input
                                        type="tel"
                                        value={mobile}
                                        onChange={(e) => setMobile(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                                <div>
                                    <p className="text-xs font-black text-indigo-900">Manager Mode</p>
                                    <p className="text-[9px] font-bold text-indigo-400 mt-0.5">Admin dashboard access</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={isManager} 
                                        onChange={(e) => setIsManager(e.target.checked)} 
                                        className="sr-only peer"
                                        disabled={isLoading}
                                    />
                                    <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            <div className="pt-4 grid grid-cols-2 gap-3">
                                <button 
                                    type="button" 
                                    onClick={handleLogout}
                                    className="py-3 bg-white border border-red-100 text-red-500 font-black rounded-xl text-xs hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    Logout
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isLoading}
                                    className="py-3 bg-indigo-600 text-white font-black rounded-xl text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isLoading ? 'Saving...' : 'Save Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="text-center py-4 space-y-8">
                        <div className="space-y-3">
                            <div className="w-16 h-16 bg-indigo-50 rounded-3xl mx-auto flex items-center justify-center text-indigo-600 shadow-inner">
                                <UserCircle className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800">Sign In</h3>
                                <p className="text-[11px] text-slate-400 font-bold px-8 leading-relaxed">
                                    Unlock exclusive study tools, history sync, and AI evaluations.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleGoogleSignIn}
                            disabled={isLoading}
                            className="w-full bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-slate-200 p-4 rounded-2xl flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 group"
                        >
                            {isLoading ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-600"></div>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    <span className="text-sm font-black text-slate-700">GOOGLE ACCOUNT</span>
                                </>
                            )}
                        </button>

                        <div className="pt-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">One-Tap Login</p>
                        </div>
                    </div>
                )}
                
                <div className="mt-8 pt-4 border-t border-slate-150 font-semibold text-slate-400">
                    <p className="text-[10px] text-center uppercase tracking-[0.2em] font-mono">
                        Powered by Firebase Auth
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
