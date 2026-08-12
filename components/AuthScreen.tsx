import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, LogIn, UserPlus, AlertCircle, CheckCircle, Loader2, Gift, Cloud } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const AuthScreen: React.FC = () => {
    const { signInWithGoogle, signInAsGuest } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await signInWithGoogle();
        } catch (err: any) {
            let msg = err.message || 'Google Sign-In failed';
            if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-by-user')) {
                msg = "The Google Sign-In popup was closed or blocked. Please open in a new tab if you're in preview.";
            } else if (msg.includes('access_denied') || msg.includes('verification process') || msg.includes('403')) {
                msg = "Google Verification Error (403 Access Denied): Your Google Cloud OAuth Consent Screen is currently in 'Testing' mode. To allow sandeepsingh982830@gmail.com, please go to Google Cloud Console -> APIs & Services -> OAuth consent screen -> Test users and click '+ ADD USERS', or change Publishing Status to 'In Production'. / यह Google OAuth की टेस्टिंग सीमा के कारण है। कृपया GCP Console में Test Users में यह ईमेल ऐड करें या ऐप पब्लिश करें।";
            }
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGuestSignIn = () => {
        try {
            signInAsGuest();
        } catch (err) {
            console.error("Guest sign in error:", err);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
            {/* Branding Logo & Header */}
            <div className="text-center mb-10 space-y-3 animate-in fade-in slide-in-from-top duration-700">
                <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto shadow-lg overflow-hidden bg-white border border-slate-100 p-2 transform hover:scale-110 transition-transform duration-300">
                    <img src="/icon.svg" alt="Bodhak Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900">Bodhak</h1>
                    <p className="text-sm text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Intelligent Buddy for Prep</p>
                </div>
            </div>

            {/* Auth Card */}
            <div className="bg-white border border-slate-200/80 rounded-[2.5rem] shadow-2xl w-full max-w-sm p-8 animate-in zoom-in-95 duration-500 overflow-hidden relative">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50"></div>

                <div className="relative text-center space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-xl font-black text-slate-800">Welcome back!</h2>
                        <p className="text-xs text-slate-400 font-bold leading-relaxed px-4">
                            Start your competitive exam journey with the smartest AI buddy.
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-[10px] font-bold animate-in slide-in-from-top-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                            <span className="text-left">{error}</span>
                        </div>
                    )}

                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                        className="w-full group bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-slate-200 disabled:opacity-50 text-slate-700 py-4 px-6 font-black rounded-2xl text-sm flex items-center justify-center gap-4 transition-all active:scale-[0.98] cursor-pointer shadow-sm relative overflow-hidden"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        ) : (
                            <>
                                <svg className="w-5 h-5 shrink-0 transform group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                <span>SIGN IN WITH GOOGLE</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleGuestSignIn}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 px-6 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-sm border border-slate-200/60"
                    >
                        <User className="w-4 h-4 text-slate-500" />
                        <span>CONTINUE AS GUEST / गेस्ट के रूप में जारी रखें</span>
                    </button>

                    <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase py-1">
                        Fast • Secure • Private
                    </p>
                </div>
            </div>

            {/* Help text */}
            <div className="mt-8 text-center max-w-xs space-y-4">
                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
                    <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-1 flex items-center justify-center gap-2">
                        <Cloud className="w-3 h-3" /> Google Drive Enabled
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        You can now import your study materials directly from Google Drive for scanning and quiz generation.
                    </p>
                </div>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    💡 If login popup doesn't open, please click <span className="font-extrabold text-indigo-500">"Open in New Tab"</span> at the top-right corner.
                </p>
            </div>
        </div>
    );
};

export default AuthScreen;
