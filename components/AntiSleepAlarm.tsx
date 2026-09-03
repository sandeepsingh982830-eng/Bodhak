import React, { useState, useEffect, useRef, useCallback, useImperativeHandle } from 'react';
import { 
    Eye, EyeOff, Play, Square, Bell, BellRing, BellOff, Volume2, Volume1, VolumeX,
    Settings2, ShieldAlert, Sparkles, AlertTriangle, CheckCircle2, Clock, 
    RotateCcw, Code2, Download, Copy, Check, Info, Camera, CameraOff,
    Maximize2, Minimize2, Sliders, Moon, Sun, ArrowLeft, BookOpen, PenTool,
    Activity, Compass, ShieldCheck, Zap, ExternalLink, Tv
} from 'lucide-react';

// Declare global types for MediaPipe CDN scripts
declare global {
    interface Window {
        FaceMesh?: any;
        Camera?: any;
    }
}

// MediaPipe 468/478 Landmark Indices for Eye Aspect Ratio (EAR)
// Left Eye: 33 (outer), 160 (upper1), 158 (upper2), 133 (inner), 153 (lower2), 144 (lower1)
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
// Right Eye: 362 (inner), 385 (upper1), 387 (upper2), 263 (outer), 373 (lower2), 380 (lower1)
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];

// Landmarks for micro-motion tracking (Nose, Forehead, Chin, Left Cheek, Right Cheek)
const MOTION_LANDMARK_INDICES = [1, 10, 152, 234, 454];

export type AlarmToneId = 'siren' | 'military' | 'airhorn' | 'highpitch' | 'classic';

export interface SoundProfile {
    id: AlarmToneId;
    name: string;
    hindiName: string;
    desc: string;
    icon: string;
    color: string;
}

export const ALARM_SOUND_PROFILES: SoundProfile[] = [
    {
        id: 'siren',
        name: 'Ultra Siren',
        hindiName: 'अल्ट्रा सायरन 🚨',
        desc: 'Piercing dual-sweep emergency alarm with maximum acoustic penetration.',
        icon: '🚨',
        color: 'from-red-500 to-rose-600',
    },
    {
        id: 'military',
        name: 'Military Klaxon',
        hindiName: 'मिलिट्री क्लैक्सन ⚡',
        desc: 'Aggressive triple-harmonic warning bursts for instant wake-up.',
        icon: '⚡',
        color: 'from-amber-500 to-orange-600',
    },
    {
        id: 'airhorn',
        name: 'Heavy Air Horn',
        hindiName: 'हैवी एयर हॉर्न 📯',
        desc: 'Deep multi-pitch stadium horn with vibrating low-end punch.',
        icon: '📯',
        color: 'from-cyan-500 to-blue-600',
    },
    {
        id: 'highpitch',
        name: 'High-Pitch Pulse',
        hindiName: 'हाई-पिच बीप 🔔',
        desc: 'Sharp 2200Hz rapid chirps scientifically tuned to startle awake.',
        icon: '🔔',
        color: 'from-purple-500 to-indigo-600',
    },
    {
        id: 'classic',
        name: 'Classic Bell Clock',
        hindiName: 'क्लासिक घंटी अलार्म ⏰',
        desc: 'Loud twin-bell mechanical clock chimes with quick double strike.',
        icon: '⏰',
        color: 'from-emerald-500 to-teal-600',
    }
];

interface Landmark {
    x: number;
    y: number;
    z?: number;
}

// Euclidean distance helper
const distance = (p1: Landmark, p2: Landmark): number => {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

// Calculate Eye Aspect Ratio (EAR)
const computeEAR = (landmarks: Landmark[], indices: number[]): number => {
    try {
        const p1 = landmarks[indices[0]];
        const p2 = landmarks[indices[1]];
        const p3 = landmarks[indices[2]];
        const p4 = landmarks[indices[3]];
        const p5 = landmarks[indices[4]];
        const p6 = landmarks[indices[5]];

        if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

        const v1 = distance(p2, p6);
        const v2 = distance(p3, p5);
        const h = distance(p1, p4);

        if (h <= 0.0001) return 0;
        return (v1 + v2) / (2.0 * h);
    } catch {
        return 0;
    }
};

// Head Pose & Pitch estimation
interface HeadPose {
    pitchRatio: number;
    estimatedPitchDeg: number;
    isHeadDown: boolean;
}

const computeHeadPose = (landmarks: Landmark[]): HeadPose => {
    try {
        const forehead = landmarks[10];
        const nose = landmarks[1];
        const chin = landmarks[152];

        if (!forehead || !nose || !chin) {
            return { pitchRatio: 1.0, estimatedPitchDeg: 0, isHeadDown: false };
        }

        const dForeheadNose = Math.max(0.001, nose.y - forehead.y);
        const dNoseChin = chin.y - nose.y;
        const pitchRatio = dNoseChin / dForeheadNose;

        // When looking straight: pitchRatio is roughly 0.85 - 1.25 (pitchDeg ~0°).
        // When head is tilted downwards to write, dNoseChin decreases relative to forehead.
        // Positive pitchDeg represents downward tilt (+30°, +35°, etc.)
        const estimatedPitchDeg = Math.round((0.95 - pitchRatio) * 55);
        const clampedPitch = Math.min(60, Math.max(-30, estimatedPitchDeg));

        // User requirement: Head pitch 30°+ down hone par hi face down alert timer shuru ho
        const isHeadDown = clampedPitch >= 30;

        return {
            pitchRatio: Number(pitchRatio.toFixed(2)),
            estimatedPitchDeg: clampedPitch,
            isHeadDown
        };
    } catch {
        return { pitchRatio: 1.0, estimatedPitchDeg: 0, isHeadDown: false };
    }
};

// Compute micro-motion delta across consecutive frames
const computeMicroMotion = (curr: Landmark[], prev: Landmark[]): number => {
    if (!curr || !prev || curr.length === 0 || prev.length === 0) return 0;
    let totalDelta = 0;
    let count = 0;
    for (const idx of MOTION_LANDMARK_INDICES) {
        if (curr[idx] && prev[idx]) {
            totalDelta += Math.hypot(curr[idx].x - prev[idx].x, curr[idx].y - prev[idx].y);
            count++;
        }
    }
    return count > 0 ? totalDelta / count : 0;
};

// Standalone HTML template for student download/export with "No False Alarms" Smart Logic
const STANDALONE_HTML_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Anti-Sleep Alarm | No False Alarms AI Logic</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- MediaPipe Face Mesh & Camera CDN -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>
    <style>
        @keyframes pulse-ring {
            0% { transform: scale(0.96); opacity: 0.85; }
            50% { transform: scale(1.02); opacity: 1; }
            100% { transform: scale(0.96); opacity: 0.85; }
        }
        .alarm-flashing {
            animation: pulse-ring 0.6s infinite ease-in-out;
        }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 selection:bg-indigo-500 selection:text-white font-sans">

    <!-- Main Container -->
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 relative overflow-hidden">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-xl font-black text-white flex items-center gap-2">
                    <span>👁️</span>
                    <span>Anti-Sleep Alarm</span>
                    <span class="text-[10px] bg-indigo-900/70 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/50 uppercase font-black tracking-widest">Smart Vision</span>
                </h1>
                <p class="text-xs text-slate-400 font-medium mt-0.5">AI Drowsiness Detection with "No False Alarms" Dictation Mode</p>
            </div>
            <!-- Status Badge -->
            <div id="statusBadge" class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                <span id="statusDot" class="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                <span id="statusText">Standby</span>
            </div>
        </div>

        <!-- Mode Toggle Bar -->
        <div class="bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex gap-2">
            <button id="readingModeBtn" class="flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer bg-indigo-600 text-white shadow-lg">
                <span>📖</span>
                <span>Reading Mode (Strict Eyes)</span>
            </button>
            <button id="writingModeBtn" class="flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer text-slate-400 hover:text-slate-200">
                <span>✍️</span>
                <span>Dictation/Writing Mode</span>
            </button>
        </div>

        <!-- Mode Explanation Banner -->
        <div id="modeBanner" class="text-xs p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-indigo-200 flex items-start gap-2">
            <span class="text-indigo-400 text-sm">💡</span>
            <div id="modeBannerText">
                <strong>Reading Mode Active:</strong> Monitoring eye openness continuously. The alarm sounds if eyes stay closed longer than the grace period.
            </div>
        </div>

        <!-- Video & Canvas Stage -->
        <div class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner group">
            <video id="webcamVideo" class="absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300" playsinline muted></video>
            <canvas id="overlayCanvas" class="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-10 transition-opacity duration-300"></canvas>
            <canvas id="pipCanvas" width="480" height="360" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></canvas>
            <video id="pipVideo" width="480" height="360" playsinline muted style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></video>

            <!-- Minimized App Logo Overlay -->
            <div id="minimizedLogoOverlay" class="hidden absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center z-20 select-none">
                <div class="relative mb-3 flex items-center justify-center">
                    <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white p-2.5 shadow-2xl border-2 border-slate-200 flex items-center justify-center">
                        <img src="/icon.svg" alt="Bodhak Logo" class="w-full h-full object-contain" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><circle cx=\\'50\\' cy=\\'50\\' r=\\'45\\' fill=\\'%234F46E5\\'/><text x=\\'50\\' y=\\'62\\' font-size=\\'36\\' text-anchor=\\'middle\\' fill=\\'white\\' font-weight=\\'bold\\'>B</text></svg>'">
                    </div>
                </div>
                <h3 class="text-base sm:text-lg font-black text-white">Bodhak Anti-Sleep AI</h3>
                <p class="text-xs text-slate-400 max-w-sm mt-1 mb-3">वीडियो मिनिमाइज़ है। बैकग्राउंड AI द्वारा आँखें और 20s स्क्रीन टाइमर एक्टिव हैं।</p>
                <button id="restoreVideoBtn" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer">
                    <span>🔍</span>
                    <span>Maximize Video (कैमरा देखें)</span>
                </button>
            </div>

            <!-- Alarm Flashing Overlay -->
            <div id="alarmOverlay" class="hidden absolute inset-0 bg-red-650/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30 alarm-flashing text-center p-4">
                <div class="text-5xl animate-bounce">🚨</div>
                <div>
                    <h2 class="text-3xl sm:text-4xl font-black text-white tracking-wide">WAKE UP!</h2>
                    <p id="alarmReason" class="text-sm font-semibold text-red-100 mt-1">Drowsiness Detected</p>
                </div>
                <button id="overlayStopAlarmBtn" class="bg-white hover:bg-slate-100 text-red-650 font-black text-sm px-6 py-3 rounded-xl shadow-2xl uppercase tracking-wider cursor-pointer active:scale-95 transition-all">
                    Stop Alarm 🔕 (Spacebar)
                </button>
                <div class="text-xs font-bold text-amber-200 bg-black/40 px-3 py-1.5 rounded-full border border-amber-400/40 flex items-center gap-1.5">
                    <span>👁️</span>
                    <span>Just open your eyes to stop alarm automatically! (आँखें खोलते ही अलार्म बंद)</span>
                </div>
            </div>

            <!-- Standby Overlay -->
            <div id="standbyOverlay" class="flex flex-col items-center text-slate-500 gap-2 pointer-events-none">
                <span class="text-4xl opacity-50">📷</span>
                <p class="text-xs font-semibold">Click "Start Tracking" below to begin</p>
            </div>
        </div>

        <!-- Metrics HUD -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">EAR Metric</div>
                <div id="earDisplay" class="text-base font-black text-indigo-400 mt-0.5">0.00</div>
            </div>
            <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Head Pitch</div>
                <div id="pitchDisplay" class="text-base font-black text-cyan-400 mt-0.5">0° Level</div>
            </div>
            <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Closure / Stillness</div>
                <div id="timerDisplay" class="text-base font-black text-amber-400 mt-0.5">0.0s</div>
            </div>
            <div class="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Session Time</div>
                <div id="studyTime" class="text-base font-black text-emerald-400 mt-0.5">00:00</div>
            </div>
        </div>

        <!-- Blinking Grace Period Slider -->
        <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div class="flex items-center justify-between text-xs font-bold">
                <span class="text-slate-300">Blinking Grace Period (Eyes Closed):</span>
                <span id="gracePeriodLabel" class="text-amber-400 font-black">3.0s</span>
            </div>
            <input 
                id="graceSlider"
                type="range" 
                min="1.0" 
                max="5.0" 
                step="0.5" 
                value="3.0"
                class="w-full accent-amber-500 cursor-pointer h-2 bg-slate-900 rounded-lg"
            />
            <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>1.0s (Very Strict)</span>
                <span>3.0s (Prevents Normal Blink Triggers)</span>
                <span>5.0s (Relaxed)</span>
            </div>
        </div>

        <!-- Alarm Sound & Loudness Settings (Feature Requested) -->
        <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
            <div class="flex items-center justify-between text-xs font-bold border-b border-slate-800/80 pb-2">
                <span class="text-slate-300 flex items-center gap-1.5">
                    <span>🔊</span>
                    <span>Alarm Sound & Volume (ध्वनि चयन व तीव्रता)</span>
                </span>
                <button id="testSoundBtn" class="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[10px] font-black px-2.5 py-1 rounded-lg transition cursor-pointer">
                    ▶ Test Sound
                </button>
            </div>
            
            <div class="space-y-1.5">
                <div class="text-[11px] font-bold text-slate-400">Alarm Tone:</div>
                <select id="toneSelect" class="w-full bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-xl p-2 cursor-pointer outline-none">
                    <option value="siren">🚨 Ultra Siren (अल्ट्रा सायरन)</option>
                    <option value="military">⚡ Military Klaxon (मिलिट्री क्लैक्सन)</option>
                    <option value="airhorn">📯 Heavy Air Horn (हैवी एयर हॉर्न)</option>
                    <option value="highpitch">🔔 High-Pitch Pulse (हाई-पिच बीप)</option>
                    <option value="classic">⏰ Classic Bell Clock (क्लासिक घंटी)</option>
                </select>
            </div>

            <div class="space-y-1.5 pt-1">
                <div class="flex justify-between text-xs font-bold">
                    <span class="text-slate-400">Loudness (तीव्रता):</span>
                    <span id="volumeLabel" class="text-emerald-400 font-mono font-black">145% (Super Boost)</span>
                </div>
                <input id="volumeSlider" type="range" min="0.4" max="1.0" step="0.05" value="1.0" class="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-900 rounded-lg">
            </div>

            <button id="boostBtn" class="w-full py-1.5 px-2.5 bg-amber-950/40 border border-amber-500/50 rounded-xl text-amber-300 text-xs font-black flex items-center justify-between cursor-pointer">
                <span>⚡ 145% Super Loud Boost</span>
                <span id="boostBadge" class="bg-amber-400 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black">MAX BOOST 💥</span>
            </button>
        </div>

        <!-- Face-Down Alert Timeout (Customizable by typing or presets) -->
        <div class="bg-slate-950 p-3.5 rounded-2xl border border-cyan-900/60 space-y-2.5">
            <div class="flex items-center justify-between text-xs font-bold border-b border-slate-800/80 pb-2">
                <span class="text-cyan-300 flex items-center gap-1.5">
                    <span>🧭</span>
                    <span>Face-Down Alert Timeout (नीचे देखने पर अलर्ट)</span>
                </span>
                <span id="headDownLimitLabel" class="text-cyan-400 font-mono font-black">20s</span>
            </div>
            <p class="text-[10px] text-slate-400 leading-relaxed">
                हेड पिच <strong>30°+ नीचे</strong> होने पर ही फेस-डाउन टाइमर शुरू होता है। <strong>35° से कम</strong> पर आँखें बंद होने पर तुरंत आई अलर्ट मिलेगा। निर्धारित समय तक स्क्रीन पर न देखने पर अलार्म बज जाएगा। स्क्रीन पर देखते ही टाइमर 0s रीसेट हो जाता है।
            </p>
            <!-- Direct write / input field -->
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px] font-bold text-slate-300">
                    <span>✍️ समय लिखें (Type Custom Alert Time):</span>
                    <span id="headDownUnitLabel" class="text-cyan-400 font-mono text-[10px]">Seconds (सेकंड)</span>
                </div>
                <div class="flex items-center gap-2">
                    <input id="headDownCustomInput" type="number" min="1" max="7200" step="1" value="20" placeholder="e.g. 1, 10, 30" class="flex-1 bg-slate-900 border border-cyan-800/80 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm outline-none">
                    <div class="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800 shrink-0 text-xs">
                        <button id="unitMinBtn" type="button" class="px-2.5 py-1 rounded-lg font-bold text-slate-400 hover:text-slate-200 cursor-pointer">Min (मिनट)</button>
                        <button id="unitSecBtn" type="button" class="px-2.5 py-1 rounded-lg font-bold bg-cyan-600 text-white cursor-pointer">Sec (सेकंड)</button>
                    </div>
                </div>
            </div>
            <!-- Quick Presets -->
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-1 text-[11px] font-bold">
                <button type="button" data-secs="20" data-unit="seconds" class="hd-preset py-1 bg-cyan-900/60 text-cyan-300 border border-cyan-500 rounded-lg cursor-pointer text-center">20s</button>
                <button type="button" data-secs="60" data-unit="minutes" class="hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center">1 Min</button>
                <button type="button" data-secs="300" data-unit="minutes" class="hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center">5 Min</button>
                <button type="button" data-secs="600" data-unit="minutes" class="hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center">10 Min</button>
                <button type="button" data-secs="900" data-unit="minutes" class="hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center">15 Min</button>
                <button type="button" data-secs="1800" data-unit="minutes" class="hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center">30 Min</button>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-3">
            <button id="startBtn" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2">
                <span>▶</span>
                <span>Start Tracking</span>
            </button>
            <button id="stopBtn" disabled class="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2">
                <span>⏹</span>
                <span>Stop Tracking</span>
            </button>
            <button id="pipBtn" class="bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2">
                <span>📺</span>
                <span id="pipBtnText">PiP Window</span>
            </button>
            <button id="minVideoBtn" class="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2">
                <span>🖼️</span>
                <span id="minVideoBtnText">Minimize (Logo Mode)</span>
            </button>
            <button id="stopAlarmBtn" class="hidden flex-1 bg-red-600 hover:bg-red-500 text-white font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 animate-bounce">
                <span>🔕</span>
                <span>Stop Alarm</span>
            </button>
        </div>

    </div>

    <!-- HTML5 Audio Fallback -->
    <audio id="alarmAudio" loop preload="auto">
        <source src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" type="audio/ogg">
    </audio>

    <script>
        // --- 1. DOM References ---
        const videoElement = document.getElementById('webcamVideo');
        const canvasElement = document.getElementById('overlayCanvas');
        const canvasCtx = canvasElement.getContext('2d');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const stopAlarmBtn = document.getElementById('stopAlarmBtn');
        const overlayStopAlarmBtn = document.getElementById('overlayStopAlarmBtn');
        const readingModeBtn = document.getElementById('readingModeBtn');
        const writingModeBtn = document.getElementById('writingModeBtn');
        const modeBanner = document.getElementById('modeBanner');
        const modeBannerText = document.getElementById('modeBannerText');
        const statusBadge = document.getElementById('statusBadge');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const earDisplay = document.getElementById('earDisplay');
        const pitchDisplay = document.getElementById('pitchDisplay');
        const timerDisplay = document.getElementById('timerDisplay');
        const studyTimeDisplay = document.getElementById('studyTime');
        const alarmOverlay = document.getElementById('alarmOverlay');
        const alarmReason = document.getElementById('alarmReason');
        const standbyOverlay = document.getElementById('standbyOverlay');
        const alarmAudio = document.getElementById('alarmAudio');
        const graceSlider = document.getElementById('graceSlider');
        const gracePeriodLabel = document.getElementById('gracePeriodLabel');

        // --- 2. Application State ---
        let isTracking = false;
        let isAlarmActive = false;
        let currentMode = 'reading'; // 'reading' | 'writing'
        let faceMesh = null;
        let camera = null;
        let eyeClosedStartTime = null;
        let lastMotionTime = performance.now();
        let previousLandmarks = null;
        let studyStartTime = null;
        let studyTimerInterval = null;
        let headDownStartTime = null;

        // Configurable Parameters
        let EAR_THRESHOLD = 0.21;
        let BLINKING_GRACE_PERIOD = 3.0; // Seconds before alarm on closed eyes (Reading Mode)
        let HEAD_DOWN_MAX_TIMEOUT = 20.0; // User Request: Seconds face can stay down continuously without glancing at screen
        const WRITING_STILLNESS_THRESHOLD = 40.0; // Seconds of 0 micro-motion while looking down
        const MOTION_SENSITIVITY = 0.0035; // Normalized coordinate delta threshold

        // Landmarks for Eyes & Pose
        const LEFT_EYE = [33, 160, 158, 133, 153, 144];
        const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
        const MOTION_POINTS = [1, 10, 152, 234, 454];

        // --- 3. Web Audio Multi-Tone Synthesizer & Sound Customization ---
        let audioCtx = null;
        let buzzerInterval = null;
        let selectedTone = 'siren';
        let alarmVolume = 1.0;
        let isSuperBoost = true;
        let isTestingSound = false;
        let testSoundTimeout = null;

        const toneSelect = document.getElementById('toneSelect');
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeLabel = document.getElementById('volumeLabel');
        const boostBtn = document.getElementById('boostBtn');
        const boostBadge = document.getElementById('boostBadge');
        const testSoundBtn = document.getElementById('testSoundBtn');
        const headDownSlider = document.getElementById('headDownSlider');
        const headDownLimitLabel = document.getElementById('headDownLimitLabel');

        function playToneBurst() {
            if (!isAlarmActive && !isTestingSound) return;
            const now = audioCtx.currentTime;
            const masterGain = audioCtx.createGain();
            const compressor = audioCtx.createDynamicsCompressor();

            compressor.threshold.setValueAtTime(isSuperBoost ? -16 : -10, now);
            compressor.knee.setValueAtTime(6, now);
            compressor.ratio.setValueAtTime(isSuperBoost ? 20 : 12, now);
            compressor.attack.setValueAtTime(0.002, now);
            compressor.release.setValueAtTime(0.2, now);

            const effectiveVol = Math.min(1.5, Math.max(0.2, alarmVolume * (isSuperBoost ? 1.45 : 1.0)));
            masterGain.gain.setValueAtTime(effectiveVol, now);
            masterGain.connect(compressor);
            compressor.connect(audioCtx.destination);

            if (selectedTone === 'siren') {
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const g1 = audioCtx.createGain();
                const g2 = audioCtx.createGain();

                osc1.type = 'sawtooth';
                osc1.frequency.setValueAtTime(850, now);
                osc1.frequency.linearRampToValueAtTime(1550, now + 0.16);
                osc1.frequency.linearRampToValueAtTime(900, now + 0.3);

                osc2.type = 'square';
                osc2.frequency.setValueAtTime(950, now);
                osc2.frequency.linearRampToValueAtTime(1650, now + 0.16);
                osc2.frequency.linearRampToValueAtTime(1000, now + 0.3);

                g1.gain.setValueAtTime(0.65, now);
                g1.gain.linearRampToValueAtTime(0.01, now + 0.3);
                g2.gain.setValueAtTime(0.45, now);
                g2.gain.linearRampToValueAtTime(0.01, now + 0.3);

                osc1.connect(g1); g1.connect(masterGain);
                osc2.connect(g2); g2.connect(masterGain);
                osc1.start(now); osc1.stop(now + 0.3);
                osc2.start(now); osc2.stop(now + 0.3);
            } else if (selectedTone === 'military') {
                [440, 880, 1320].forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    osc.type = idx % 2 === 0 ? 'square' : 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now);
                    g.gain.setValueAtTime([0.65, 0.45, 0.35][idx], now);
                    g.gain.linearRampToValueAtTime(0.01, now + 0.22);
                    osc.connect(g); g.connect(masterGain);
                    osc.start(now); osc.stop(now + 0.22);
                });
            } else if (selectedTone === 'airhorn') {
                [233.08, 293.66, 349.23, 466.16].forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    osc.type = idx === 3 ? 'square' : 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now);
                    osc.frequency.linearRampToValueAtTime(freq * 1.02, now + 0.15);
                    g.gain.setValueAtTime(0.45, now);
                    g.gain.linearRampToValueAtTime(0.01, now + 0.34);
                    osc.connect(g); g.connect(masterGain);
                    osc.start(now); osc.stop(now + 0.34);
                });
            } else if (selectedTone === 'highpitch') {
                const osc = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1850, now);
                osc.frequency.exponentialRampToValueAtTime(2450, now + 0.1);
                osc.frequency.exponentialRampToValueAtTime(1800, now + 0.2);
                g.gain.setValueAtTime(0.85, now);
                g.gain.linearRampToValueAtTime(0.01, now + 0.2);
                osc.connect(g); g.connect(masterGain);
                osc.start(now); osc.stop(now + 0.2);
            } else {
                [0, 0.12].forEach((delay) => {
                    const osc1 = audioCtx.createOscillator();
                    const osc2 = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    osc1.type = 'triangle'; osc1.frequency.setValueAtTime(780, now + delay);
                    osc2.type = 'sine'; osc2.frequency.setValueAtTime(1240, now + delay);
                    g.gain.setValueAtTime(0.75, now + delay);
                    g.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
                    osc1.connect(g); osc2.connect(g);
                    g.connect(masterGain);
                    osc1.start(now + delay); osc1.stop(now + delay + 0.15);
                    osc2.start(now + delay); osc2.stop(now + delay + 0.15);
                });
            }
        }

        function startWebAudioBuzzer() {
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                if (buzzerInterval) return;

                const intervalMs = selectedTone === 'military' ? 280 : selectedTone === 'highpitch' ? 240 : selectedTone === 'airhorn' ? 420 : 340;
                playToneBurst();
                buzzerInterval = setInterval(playToneBurst, intervalMs);
            } catch (err) {
                console.warn('Audio synthesis error:', err);
            }
        }

        function stopWebAudioBuzzer() {
            if (buzzerInterval) {
                clearInterval(buzzerInterval);
                buzzerInterval = null;
            }
        }

        function formatDurationText(totalSecs) {
            if (totalSecs >= 3600) {
                const h = Math.floor(totalSecs / 3600);
                const m = Math.floor((totalSecs % 3600) / 60);
                return h + 'h ' + m + 'm';
            }
            if (totalSecs >= 60) {
                const m = Math.floor(totalSecs / 60);
                const s = Math.round(totalSecs % 60);
                return s > 0 ? (m + 'm ' + s + 's') : (m + ' min');
            }
            return Math.round(totalSecs) + 's';
        }

        // --- 4. Math Calculations ---
        function getDistance(p1, p2) {
            return Math.hypot(p1.x - p2.x, p1.y - p2.y);
        }

        function calculateEAR(landmarks, indices) {
            const p1 = landmarks[indices[0]];
            const p2 = landmarks[indices[1]];
            const p3 = landmarks[indices[2]];
            const p4 = landmarks[indices[3]];
            const p5 = landmarks[indices[4]];
            const p6 = landmarks[indices[5]];
            if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
            const v1 = getDistance(p2, p6);
            const v2 = getDistance(p3, p5);
            const h = getDistance(p1, p4);
            if (h <= 0.0001) return 0;
            return (v1 + v2) / (2.0 * h);
        }

        function calculateHeadPitch(landmarks) {
            const forehead = landmarks[10];
            const nose = landmarks[1];
            const chin = landmarks[152];
            if (!forehead || !nose || !chin) return { isDown: false, pitchDeg: 0 };

            const d1 = Math.max(0.001, nose.y - forehead.y);
            const d2 = chin.y - nose.y;
            const ratio = d2 / d1;

            const pitchDeg = Math.round((0.95 - ratio) * 55);
            const clampedPitch = Math.min(60, Math.max(-30, pitchDeg));
            // User requirement: pitch 30°+ down hone par hi face down alert timer shuru ho
            const isDown = clampedPitch >= 30;

            return { isDown, pitchDeg: clampedPitch };
        }

        function calculateMotion(curr, prev) {
            if (!curr || !prev) return 0;
            let total = 0;
            let count = 0;
            for (const idx of MOTION_POINTS) {
                if (curr[idx] && prev[idx]) {
                    total += Math.hypot(curr[idx].x - prev[idx].x, curr[idx].y - prev[idx].y);
                    count++;
                }
            }
            return count > 0 ? total / count : 0;
        }

        // --- 5. MediaPipe Results Processing ---
        function onFaceMeshResults(results) {
            if (!isTracking) return;

            canvasElement.width = videoElement.videoWidth || 640;
            canvasElement.height = videoElement.videoHeight || 480;
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const landmarks = results.multiFaceLandmarks[0];

                // 1. Calculate EAR
                const leftEAR = calculateEAR(landmarks, LEFT_EYE);
                const rightEAR = calculateEAR(landmarks, RIGHT_EYE);
                const avgEAR = (leftEAR + rightEAR) / 2.0;
                earDisplay.textContent = avgEAR.toFixed(2);

                // 2. Calculate Head Pitch
                const { isDown: isHeadDown, pitchDeg } = calculateHeadPitch(landmarks);
                pitchDisplay.textContent = isHeadDown ? (\`+\${pitchDeg}° Down 📓\`) : (\`\${pitchDeg}° Level 💻\`);
                pitchDisplay.className = isHeadDown ? 'text-base font-black text-amber-400 mt-0.5' : 'text-base font-black text-cyan-400 mt-0.5';

                // 3. Calculate Micro-Motion
                let motionDelta = 0;
                if (previousLandmarks) {
                    motionDelta = calculateMotion(landmarks, previousLandmarks);
                    if (motionDelta > MOTION_SENSITIVITY) {
                        lastMotionTime = performance.now();
                    }
                }
                previousLandmarks = landmarks;

                const isEyesClosed = avgEAR < EAR_THRESHOLD;
                const now = performance.now();

                // Global auto-stop safeguard: If eyes are detected open AND facing screen (< 30°), immediately stop alarm
                if (!isEyesClosed && !isHeadDown && isAlarmActive) {
                    stopAlarm();
                }

                // 1. FACE-DOWN ALERT TIMER (Only starts when head pitch >= 30°)
                // User requirement: Head pitch 30°+ down hone par hi face down alert timer shuru ho
                if (isHeadDown) {
                    if (!headDownStartTime) headDownStartTime = now;
                    const headDownSecs = (now - headDownStartTime) / 1000;
                    const glanceCurStr = headDownSecs >= 60 ? (headDownSecs / 60).toFixed(1) + 'm' : headDownSecs.toFixed(1) + 's';
                    timerDisplay.textContent = \`Head Down: \${glanceCurStr} / \${formatDurationText(HEAD_DOWN_MAX_TIMEOUT)}\`;

                    if (headDownSecs >= HEAD_DOWN_MAX_TIMEOUT) {
                        if (!isAlarmActive) {
                            triggerAlarm(\`Face Down Alert: \${formatDurationText(HEAD_DOWN_MAX_TIMEOUT)} से स्क्रीन पर नहीं देखा! (Looking down >= 30° > \${formatDurationText(HEAD_DOWN_MAX_TIMEOUT)})\`);
                        }
                    }
                } else {
                    // Head is looking at screen (< 30°) -> Immediately reset face-down timer!
                    headDownStartTime = null;
                }

                // 2. EYE ALERT EVALUATION
                // User requirement: "35' se kam face down hone pr eye alert hi de"
                // If head pitch is < 35° down, ALWAYS monitor eye closure and trigger eye alert!
                const shouldCheckEyes = (currentMode === 'reading') || (pitchDeg < 35);
                if (shouldCheckEyes) {
                    handleNormalEyes(isEyesClosed, now);
                } else {
                    // Deep head down (>= 35°) in writing mode: ignore eye closure, monitor micro-motion
                    eyeClosedStartTime = null;
                    const stillnessSecs = (now - lastMotionTime) / 1000;
                    if (stillnessSecs >= WRITING_STILLNESS_THRESHOLD) {
                        if (!isAlarmActive) {
                            triggerAlarm('Fallen Asleep at Desk (No motion for 40s while looking down >= 35°)');
                        }
                    } else if (!isAlarmActive) {
                        updateStatus('Writing / Safe ✍️', 'bg-cyan-500', 'text-cyan-400', 'border-cyan-500/50');
                    }
                }

                // Draw Eye Outlines
                const eyeColor = isEyesClosed ? '#ef4444' : (isHeadDown && currentMode === 'writing' ? '#06b6d4' : '#10b981');
                drawOutline(landmarks, LEFT_EYE, eyeColor);
                drawOutline(landmarks, RIGHT_EYE, eyeColor);

            } else {
                earDisplay.textContent = '--';
                if (!isAlarmActive) updateStatus('Searching Face', 'bg-yellow-500', 'text-yellow-400', 'border-yellow-500/50');
            }
        }

        function handleNormalEyes(isEyesClosed, now) {
            if (isEyesClosed) {
                if (!eyeClosedStartTime) eyeClosedStartTime = now;
                const closedSecs = (now - eyeClosedStartTime) / 1000;
                timerDisplay.textContent = \`Closed: \${closedSecs.toFixed(1)}s / \${BLINKING_GRACE_PERIOD}s\`;

                if (closedSecs >= BLINKING_GRACE_PERIOD) {
                    if (!isAlarmActive) {
                        triggerAlarm(\`Drowsiness Detected (Eyes closed > \${BLINKING_GRACE_PERIOD}s)\`);
                    }
                } else if (!isAlarmActive) {
                    updateStatus('Eyes Closed 🟡', 'bg-amber-500', 'text-amber-400', 'border-amber-500/50');
                }
            } else {
                eyeClosedStartTime = null;
                timerDisplay.textContent = '0.0s';
                if (isAlarmActive) {
                    // Eye opened again! Automatically silence alarm immediately
                    stopAlarm();
                } else {
                    updateStatus('Awake & Focused 🟢', 'bg-emerald-500', 'text-emerald-400', 'border-emerald-500/50');
                }
            }
        }

        function drawOutline(landmarks, indices, color) {
            canvasCtx.strokeStyle = color;
            canvasCtx.lineWidth = 2.5;
            canvasCtx.beginPath();
            indices.forEach((idx, i) => {
                const pt = landmarks[idx];
                const x = pt.x * canvasElement.width;
                const y = pt.y * canvasElement.height;
                if (i === 0) canvasCtx.moveTo(x, y);
                else canvasCtx.lineTo(x, y);
            });
            canvasCtx.closePath();
            canvasCtx.stroke();
        }

        function updateStatus(text, dotClass, textClass, borderClass) {
            statusText.textContent = text;
            statusDot.className = 'w-2.5 h-2.5 rounded-full ' + dotClass;
            statusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-slate-900 border ' + textClass + ' ' + borderClass;
        }

        // --- 6. Alarm Management ---
        function triggerAlarm(reason) {
            isAlarmActive = true;
            alarmReason.textContent = reason;
            updateStatus('Asleep 🚨', 'bg-red-600', 'text-red-400', 'border-red-600');
            alarmOverlay.classList.remove('hidden');
            stopAlarmBtn.classList.remove('hidden');

            try {
                alarmAudio.currentTime = 0;
                alarmAudio.play().catch(() => {});
            } catch (e) {}
            startWebAudioBuzzer();
        }

        function stopAlarm() {
            isAlarmActive = false;
            eyeClosedStartTime = null;
            headDownStartTime = null;
            lastMotionTime = performance.now();
            alarmOverlay.classList.add('hidden');
            stopAlarmBtn.classList.add('hidden');

            try {
                alarmAudio.pause();
                alarmAudio.currentTime = 0;
            } catch (e) {}
            stopWebAudioBuzzer();
            updateStatus('Awake 🟢', 'bg-emerald-500', 'text-emerald-400', 'border-emerald-500/50');
        }

        // --- 7. Mode Switching ---
        readingModeBtn.addEventListener('click', () => {
            currentMode = 'reading';
            readingModeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer bg-indigo-600 text-white shadow-lg';
            writingModeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer text-slate-400 hover:text-slate-200';
            modeBanner.className = 'text-xs p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-indigo-200 flex items-start gap-2';
            modeBannerText.innerHTML = '<strong>Reading Mode Active:</strong> Monitoring eye openness continuously. Alarm sounds if eyes stay closed longer than the grace period.';
        });

        writingModeBtn.addEventListener('click', () => {
            currentMode = 'writing';
            writingModeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer bg-cyan-600 text-white shadow-lg';
            readingModeBtn.className = 'flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer text-slate-400 hover:text-slate-200';
            modeBanner.className = 'text-xs p-3 rounded-xl bg-cyan-950/40 border border-cyan-900/60 text-cyan-200 flex items-start gap-2';
            modeBannerText.innerHTML = '<strong>Dictation / Writing Mode Active:</strong> हेड पिच 30°+ नीचे होने पर ही फेस-डाउन अलर्ट टाइमर शुरू होता है। 35° से कम पर आँखें बंद होने पर तुरंत आई अलर्ट मिलता है। 35°+ डीप राइटिंग एंगल पर 40s स्टिलनेस और स्क्रीन ग्लांस टाइमर सुरक्षा देते हैं।';
        });

        // Grace Period Slider
        graceSlider.addEventListener('input', (e) => {
            BLINKING_GRACE_PERIOD = parseFloat(e.target.value);
            gracePeriodLabel.textContent = BLINKING_GRACE_PERIOD.toFixed(1) + 's';
        });

        // Face-Down Custom Input & Presets
        let headDownInputUnit = 'seconds';
        const headDownCustomInput = document.getElementById('headDownCustomInput');
        const unitMinBtn = document.getElementById('unitMinBtn');
        const unitSecBtn = document.getElementById('unitSecBtn');
        const headDownUnitLabel = document.getElementById('headDownUnitLabel');
        const headDownLimitLabel = document.getElementById('headDownLimitLabel');
        const hdPresets = document.querySelectorAll('.hd-preset');

        function updateHeadDownUI() {
            if (headDownLimitLabel) headDownLimitLabel.textContent = formatDurationText(HEAD_DOWN_MAX_TIMEOUT);
            if (headDownUnitLabel) headDownUnitLabel.textContent = headDownInputUnit === 'minutes' ? 'Minutes (मिनट)' : 'Seconds (सेकंड)';
            if (unitMinBtn && unitSecBtn) {
                if (headDownInputUnit === 'minutes') {
                    unitMinBtn.className = 'px-2.5 py-1 rounded-lg font-bold bg-cyan-600 text-white cursor-pointer';
                    unitSecBtn.className = 'px-2.5 py-1 rounded-lg font-bold text-slate-400 hover:text-slate-200 cursor-pointer';
                } else {
                    unitSecBtn.className = 'px-2.5 py-1 rounded-lg font-bold bg-cyan-600 text-white cursor-pointer';
                    unitMinBtn.className = 'px-2.5 py-1 rounded-lg font-bold text-slate-400 hover:text-slate-200 cursor-pointer';
                }
            }
            hdPresets.forEach(btn => {
                const secs = parseFloat(btn.getAttribute('data-secs'));
                if (Math.abs(HEAD_DOWN_MAX_TIMEOUT - secs) < 0.5) {
                    btn.className = 'hd-preset py-1 bg-cyan-900/60 text-cyan-300 border border-cyan-500 rounded-lg cursor-pointer text-center font-black shadow-sm';
                } else {
                    btn.className = 'hd-preset py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-lg cursor-pointer text-center font-bold';
                }
            });
        }

        if (headDownCustomInput) {
            headDownCustomInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                    let totalSecs = headDownInputUnit === 'minutes' ? val * 60 : val;
                    totalSecs = Math.min(7200, Math.max(3, totalSecs));
                    HEAD_DOWN_MAX_TIMEOUT = totalSecs;
                    updateHeadDownUI();
                }
            });
        }

        if (unitMinBtn) {
            unitMinBtn.addEventListener('click', () => {
                headDownInputUnit = 'minutes';
                if (headDownCustomInput) {
                    headDownCustomInput.value = (HEAD_DOWN_MAX_TIMEOUT / 60).toFixed(1);
                    headDownCustomInput.step = '0.5';
                    headDownCustomInput.max = '120';
                }
                updateHeadDownUI();
            });
        }

        if (unitSecBtn) {
            unitSecBtn.addEventListener('click', () => {
                headDownInputUnit = 'seconds';
                if (headDownCustomInput) {
                    headDownCustomInput.value = Math.round(HEAD_DOWN_MAX_TIMEOUT);
                    headDownCustomInput.step = '1';
                    headDownCustomInput.max = '7200';
                }
                updateHeadDownUI();
            });
        }

        hdPresets.forEach(btn => {
            btn.addEventListener('click', () => {
                const secs = parseFloat(btn.getAttribute('data-secs'));
                const unit = btn.getAttribute('data-unit') || 'seconds';
                HEAD_DOWN_MAX_TIMEOUT = secs;
                headDownInputUnit = unit;
                if (headDownCustomInput) {
                    headDownCustomInput.value = unit === 'minutes' ? (secs / 60) : secs;
                }
                updateHeadDownUI();
            });
        });

        // Sound Customization Controls
        if (toneSelect) {
            toneSelect.addEventListener('change', (e) => {
                selectedTone = e.target.value;
                previewTone();
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                alarmVolume = parseFloat(e.target.value);
                updateVolumeLabel();
            });
        }

        if (boostBtn) {
            boostBtn.addEventListener('click', () => {
                isSuperBoost = !isSuperBoost;
                boostBadge.textContent = isSuperBoost ? 'MAX BOOST 💥' : 'NORMAL';
                boostBadge.className = isSuperBoost ? 'bg-amber-400 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-black' : 'bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded font-black';
                updateVolumeLabel();
                previewTone();
            });
        }

        function updateVolumeLabel() {
            if (volumeLabel) {
                volumeLabel.textContent = Math.round(alarmVolume * (isSuperBoost ? 145 : 100)) + '% ' + (isSuperBoost ? '(Super Boost)' : '');
            }
        }

        if (testSoundBtn) {
            testSoundBtn.addEventListener('click', () => {
                if (isTestingSound) {
                    stopWebAudioBuzzer();
                    isTestingSound = false;
                    testSoundBtn.textContent = '▶ Test Sound';
                } else {
                    previewTone();
                }
            });
        }

        function previewTone() {
            stopWebAudioBuzzer();
            if (testSoundTimeout) clearTimeout(testSoundTimeout);
            isTestingSound = true;
            if (testSoundBtn) testSoundBtn.textContent = '■ Stop Test';
            startWebAudioBuzzer();
            testSoundTimeout = setTimeout(() => {
                stopWebAudioBuzzer();
                isTestingSound = false;
                if (testSoundBtn) testSoundBtn.textContent = '▶ Test Sound';
            }, 2200);
        }

        // --- 8. Background Worker & Minimize Resiliency ---
        let backgroundWorker = null;
        let lastFrameTimestamp = 0;
        let isProcessingFrame = false;
        let keepAliveOsc = null;
        let keepAliveGain = null;
        let wakeLock = null;
        const pipBtn = document.getElementById('pipBtn');
        const pipBtnText = document.getElementById('pipBtnText');

        function createBackgroundWorker() {
            const workerScript = `
                let timer = null;
                self.onmessage = function(e) {
                    if (e.data === 'start') {
                        if (!timer) timer = setInterval(() => self.postMessage('tick'), 120);
                    } else if (e.data === 'stop') {
                        if (timer) { clearInterval(timer); timer = null; }
                    }
                };
            `;
            return new Worker(URL.createObjectURL(new Blob([workerScript], { type: 'application/javascript' })));
        }

        function startKeepAliveAudio() {
            try {
                if (!audioCtx) initAudio();
                if (audioCtx && !keepAliveOsc) {
                    keepAliveGain = audioCtx.createGain();
                    keepAliveGain.gain.value = 0.00001;
                    keepAliveOsc = audioCtx.createOscillator();
                    keepAliveOsc.frequency.value = 60;
                    keepAliveOsc.connect(keepAliveGain);
                    keepAliveGain.connect(audioCtx.destination);
                    keepAliveOsc.start();
                }
            } catch (e) {}
        }

        function stopKeepAliveAudio() {
            try {
                if (keepAliveOsc) {
                    keepAliveOsc.stop();
                    keepAliveOsc.disconnect();
                    keepAliveOsc = null;
                }
                if (keepAliveGain) {
                    keepAliveGain.disconnect();
                    keepAliveGain = null;
                }
            } catch (e) {}
        }

        async function requestWakeLock() {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                } catch (e) {}
            }
        }

        let isPiPActive = false;
        const pipCanvas = document.getElementById('pipCanvas');
        const pipVideo = document.getElementById('pipVideo');
        let pipRenderInterval = null;
        let logoImg = new Image();
        logoImg.src = '/icon.svg';

        function renderPiPFrame() {
            if (!pipCanvas) return;
            const ctx = pipCanvas.getContext('2d');
            if (!ctx) return;
            const width = 480;
            const height = 360;
            if (isAlarmActive) {
                const flash = Math.floor(Date.now() / 250) % 2 === 0;
                ctx.fillStyle = flash ? '#991b1b' : '#450a0a';
                ctx.fillRect(0, 0, width, height);
                ctx.lineWidth = 10;
                ctx.strokeStyle = '#ef4444';
                ctx.strokeRect(5, 5, width - 10, height - 10);
            } else {
                const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
                bgGrad.addColorStop(0, '#020617');
                bgGrad.addColorStop(0.5, '#0f172a');
                bgGrad.addColorStop(1, '#020617');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(0, 0, width, height);
            }

            const cardSize = 100;
            const cardX = (width - cardSize) / 2;
            const cardY = isAlarmActive ? 48 : 64;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardSize, cardSize, 22);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = isAlarmActive ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetY = 4;
            ctx.fill();
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = isAlarmActive ? '#ef4444' : '#10b981';
            ctx.stroke();
            ctx.restore();

            if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
                try {
                    ctx.drawImage(logoImg, cardX + 14, cardY + 14, cardSize - 28, cardSize - 28);
                } catch(e) {}
            } else {
                ctx.save();
                ctx.beginPath();
                ctx.arc(width / 2, cardY + cardSize / 2, 32, 0, Math.PI * 2);
                ctx.fillStyle = '#4f46e5';
                ctx.fill();
                ctx.font = 'bold 34px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('B', width / 2, cardY + cardSize / 2 + 2);
                ctx.restore();
            }

            if (isAlarmActive) {
                ctx.font = 'bold 22px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText('🚨 WAKE UP! (अलार्म) 🚨', width / 2, cardY + cardSize + 40);
                ctx.font = 'bold 16px sans-serif';
                ctx.fillStyle = '#fecaca';
                ctx.fillText('अपनी आँखें खोलें या स्क्रीन पर देखें!', width / 2, cardY + cardSize + 90);
            } else {
                ctx.font = 'bold 18px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText('Bodhak Anti-Sleep AI', width / 2, 30);

                ctx.font = 'bold 13px sans-serif';
                ctx.fillStyle = '#6ee7b7';
                ctx.fillText(isTracking ? '⚡ AI MONITORING ACTIVE' : 'STANDBY', width / 2, cardY + cardSize + 30);
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.fillText('🛡️ Camera feed hidden in PiP • Privacy Protected', width / 2, 335);
            }
        }

        async function togglePictureInPicture() {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                    if (pipBtnText) pipBtnText.textContent = 'PiP Floating Window';
                    isPiPActive = false;
                    if (pipRenderInterval) { clearInterval(pipRenderInterval); pipRenderInterval = null; }
                    return;
                }
                
                renderPiPFrame();
                if (pipCanvas && pipVideo && document.pictureInPictureEnabled) {
                    const stream = pipCanvas.captureStream ? pipCanvas.captureStream(25) : (pipCanvas.mozCaptureStream ? pipCanvas.mozCaptureStream(25) : null);
                    if (stream) {
                        pipVideo.srcObject = stream;
                        await pipVideo.play();
                        await pipVideo.requestPictureInPicture();
                        isPiPActive = true;
                        if (pipBtnText) pipBtnText.textContent = 'Exit PiP Window';
                        if (!pipRenderInterval) {
                            pipRenderInterval = setInterval(renderPiPFrame, 100);
                        }
                        return;
                    }
                }

                if (videoElement && document.pictureInPictureEnabled) {
                    await videoElement.requestPictureInPicture();
                    if (pipBtnText) pipBtnText.textContent = 'Exit PiP Window';
                }
            } catch (err) {
                console.warn('PiP error:', err);
            }
        }

        // --- 9. Start & Stop Camera ---
        async function startTracking() {
            try {
                startBtn.disabled = true;
                startBtn.textContent = 'Initializing AI...';

                if (!faceMesh) {
                    faceMesh = new FaceMesh({
                        locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/\${file}\`
                    });
                    faceMesh.setOptions({
                        maxNumFaces: 1,
                        refineLandmarks: true,
                        minDetectionConfidence: 0.5,
                        minTrackingConfidence: 0.5
                    });
                    faceMesh.onResults(onFaceMeshResults);
                }

                camera = new Camera(videoElement, {
                    onFrame: async () => {
                        lastFrameTimestamp = performance.now();
                        if (isTracking && !isProcessingFrame) {
                            isProcessingFrame = true;
                            try {
                                await faceMesh.send({ image: videoElement });
                            } catch (e) {
                            } finally {
                                isProcessingFrame = false;
                            }
                        }
                    },
                    width: 640,
                    height: 480
                });

                await camera.start();

                // Background worker to keep frame pipeline alive when minimized/hidden
                if (!backgroundWorker) {
                    backgroundWorker = createBackgroundWorker();
                    backgroundWorker.onmessage = async () => {
                        const now = performance.now();
                        if (now - lastFrameTimestamp > 160 && isTracking && faceMesh && videoElement && !isProcessingFrame) {
                            if (videoElement.readyState >= 2) {
                                if (videoElement.paused) videoElement.play().catch(() => {});
                                isProcessingFrame = true;
                                try {
                                    await faceMesh.send({ image: videoElement });
                                } catch (e) {
                                } finally {
                                    isProcessingFrame = false;
                                    lastFrameTimestamp = performance.now();
                                }
                            }
                        }
                    };
                }
                backgroundWorker.postMessage('start');

                startKeepAliveAudio();
                requestWakeLock();

                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().catch(() => {});
                }

                isTracking = true;
                standbyOverlay.classList.add('hidden');
                startBtn.classList.add('hidden');
                stopBtn.disabled = false;
                lastMotionTime = performance.now();

                studyStartTime = Date.now();
                studyTimerInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - studyStartTime) / 1000);
                    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
                    const secs = String(elapsed % 60).padStart(2, '0');
                    studyTimeDisplay.textContent = \`\${mins}:\${secs}\`;
                }, 1000);

                updateStatus('Awake 🟢', 'bg-emerald-500', 'text-emerald-400', 'border-emerald-500/50');
            } catch (err) {
                console.error('Camera initialization failed:', err);
                alert('Webcam permission was denied or device not found: ' + err.message);
                startBtn.disabled = false;
                startBtn.textContent = '▶ Start Tracking';
            }
        }

        function stopTracking() {
            isTracking = false;
            if (backgroundWorker) backgroundWorker.postMessage('stop');
            stopKeepAliveAudio();
            if (wakeLock) {
                wakeLock.release().catch(() => {});
                wakeLock = null;
            }
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(() => {});
            }
            if (camera) camera.stop();
            if (videoElement.srcObject) {
                videoElement.srcObject.getTracks().forEach(t => t.stop());
                videoElement.srcObject = null;
            }
            clearInterval(studyTimerInterval);
            stopAlarm();

            startBtn.disabled = false;
            startBtn.classList.remove('hidden');
            startBtn.textContent = '▶ Start Tracking';
            stopBtn.disabled = true;
            standbyOverlay.classList.remove('hidden');
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            updateStatus('Standby', 'bg-slate-500', 'text-slate-400', 'border-slate-700');
        }

        let isVideoMinimized = false;
        const minVideoBtn = document.getElementById('minVideoBtn');
        const minVideoBtnText = document.getElementById('minVideoBtnText');
        const minimizedLogoOverlay = document.getElementById('minimizedLogoOverlay');
        const restoreVideoBtn = document.getElementById('restoreVideoBtn');

        function setVideoMinimized(minimized) {
            isVideoMinimized = minimized;
            if (isVideoMinimized) {
                videoElement.classList.add('opacity-0', 'pointer-events-none');
                canvasElement.classList.add('opacity-0');
                if (minimizedLogoOverlay) minimizedLogoOverlay.classList.remove('hidden');
                if (minVideoBtnText) minVideoBtnText.textContent = 'Show Camera';
            } else {
                videoElement.classList.remove('opacity-0', 'pointer-events-none');
                canvasElement.classList.remove('opacity-0');
                if (minimizedLogoOverlay) minimizedLogoOverlay.classList.add('hidden');
                if (minVideoBtnText) minVideoBtnText.textContent = 'Minimize (Logo Mode)';
            }
        }

        if (minVideoBtn) minVideoBtn.addEventListener('click', () => setVideoMinimized(!isVideoMinimized));
        if (restoreVideoBtn) restoreVideoBtn.addEventListener('click', () => setVideoMinimized(false));

        startBtn.addEventListener('click', startTracking);
        stopBtn.addEventListener('click', stopTracking);
        stopAlarmBtn.addEventListener('click', stopAlarm);
        overlayStopAlarmBtn.addEventListener('click', stopAlarm);
        if (pipBtn) pipBtn.addEventListener('click', togglePictureInPicture);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                setVideoMinimized(true);
            } else {
                if (isTracking) {
                    requestWakeLock();
                    if (videoElement && videoElement.paused) videoElement.play().catch(() => {});
                }
            }
        });

        if (videoElement) {
            videoElement.addEventListener('enterpictureinpicture', () => {
                setVideoMinimized(true);
                if (pipBtnText) pipBtnText.textContent = 'Exit PiP Window';
            });
            videoElement.addEventListener('leavepictureinpicture', () => {
                setVideoMinimized(false);
                if (pipBtnText) pipBtnText.textContent = 'PiP Window';
            });
        }

        window.addEventListener('keydown', (e) => {
            if (isAlarmActive && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
                e.preventDefault();
                stopAlarm();
            }
        });
    </script>
</body>
</html>`;

export interface AntiSleepAlarmHandle {
    startPiPTracking: () => Promise<void>;
    stopTracking: () => void;
    togglePiP: () => Promise<void>;
    isTracking: () => boolean;
    isPiPActive: () => boolean;
}

interface AntiSleepAlarmProps {
    onBack?: () => void;
    onTrackingChange?: (isTracking: boolean) => void;
    onPiPChange?: (isPiPActive: boolean) => void;
}

export const AntiSleepAlarm = React.forwardRef<AntiSleepAlarmHandle, AntiSleepAlarmProps>(({ onBack, onTrackingChange, onPiPChange }, ref) => {
    // Media & Canvas refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // AudioContext Synthesizer refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const buzzerIntervalRef = useRef<any>(null);

    // Mode: 'reading' (strict eye tracking) | 'writing' (anti-false alarm with head tilt & micro-motion)
    const [mode, setMode] = useState<'reading' | 'writing'>('reading');

    // Tracking state
    const [isTracking, setIsTracking] = useState(false);
    const [isLoadingModel, setIsLoadingModel] = useState(false);
    const [isAlarmActive, setIsAlarmActive] = useState(false);
    const [alarmTriggerReason, setAlarmTriggerReason] = useState<string>('');
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Detection status: 'standby' | 'awake' | 'drowsy' | 'writing' | 'asleep' | 'no_face'
    const [detectionState, setDetectionState] = useState<'standby' | 'awake' | 'drowsy' | 'writing' | 'asleep' | 'no_face'>('standby');

    // Metrics state
    const [earLeft, setEarLeft] = useState<number>(0);
    const [earRight, setEarRight] = useState<number>(0);
    const [avgEar, setAvgEar] = useState<number>(0);
    const [closureDuration, setClosureDuration] = useState<number>(0);
    const [headPitchDeg, setHeadPitchDeg] = useState<number>(0);
    const [isHeadDown, setIsHeadDown] = useState<boolean>(false);
    const [headDownDuration, setHeadDownDuration] = useState<number>(0);
    const [headDownMaxLimit, setHeadDownMaxLimit] = useState<number>(() => {
        try {
            const saved = localStorage.getItem('bodhak_head_down_limit');
            if (saved) {
                const val = parseFloat(saved);
                if (!isNaN(val) && val >= 3 && val <= 7200) return val;
            }
        } catch {}
        return 20.0;
    });

    // Custom typed value and unit ('seconds' | 'minutes') for face down alert timeout
    const [headDownInputUnit, setHeadDownInputUnit] = useState<'seconds' | 'minutes'>(() => {
        try {
            const savedUnit = localStorage.getItem('bodhak_head_down_unit');
            if (savedUnit === 'minutes' || savedUnit === 'seconds') return savedUnit;
        } catch {}
        return 'seconds';
    });

    const [headDownInputValue, setHeadDownInputValue] = useState<string>(() => {
        try {
            const savedUnit = localStorage.getItem('bodhak_head_down_unit');
            const savedVal = localStorage.getItem('bodhak_head_down_limit');
            if (savedVal) {
                const val = parseFloat(savedVal);
                if (!isNaN(val) && val > 0) {
                    if (savedUnit === 'minutes') {
                        return (val / 60).toString();
                    }
                    return val.toString();
                }
            }
        } catch {}
        return '20';
    });

    const [stillnessDuration, setStillnessDuration] = useState<number>(0);
    const [hasRecentMicroMotion, setHasRecentMicroMotion] = useState<boolean>(true);
    const [totalAlerts, setTotalAlerts] = useState<number>(0);
    const [studySeconds, setStudySeconds] = useState<number>(0);

    const headDownMaxLimitRef = useRef<number>(20.0);
    headDownMaxLimitRef.current = headDownMaxLimit;
    const headDownStartTimeRef = useRef<number | null>(null);
    const noFaceStartTimeRef = useRef<number | null>(null);

    // Handlers for user writing/typing custom alert time (e.g. 1m, 10m, 30m, etc.)
    const handleHeadDownInputChange = (rawVal: string, unit: 'seconds' | 'minutes' = headDownInputUnit) => {
        setHeadDownInputValue(rawVal);
        const num = parseFloat(rawVal);
        if (!isNaN(num) && num > 0) {
            let totalSecs = unit === 'minutes' ? num * 60 : num;
            totalSecs = Math.min(7200, Math.max(3, totalSecs));
            setHeadDownMaxLimit(totalSecs);
            try {
                localStorage.setItem('bodhak_head_down_limit', totalSecs.toString());
                localStorage.setItem('bodhak_head_down_unit', unit);
            } catch {}
        }
    };

    const handleHeadDownUnitToggle = (newUnit: 'seconds' | 'minutes') => {
        setHeadDownInputUnit(newUnit);
        try {
            localStorage.setItem('bodhak_head_down_unit', newUnit);
        } catch {}
        if (newUnit === 'minutes') {
            const mins = Number((headDownMaxLimit / 60).toFixed(2));
            setHeadDownInputValue(mins.toString());
        } else {
            setHeadDownInputValue(Math.round(headDownMaxLimit).toString());
        }
    };

    const handleSelectPreset = (presetSecs: number, presetUnit: 'seconds' | 'minutes') => {
        setHeadDownMaxLimit(presetSecs);
        setHeadDownInputUnit(presetUnit);
        if (presetUnit === 'minutes') {
            setHeadDownInputValue((presetSecs / 60).toString());
        } else {
            setHeadDownInputValue(presetSecs.toString());
        }
        try {
            localStorage.setItem('bodhak_head_down_limit', presetSecs.toString());
            localStorage.setItem('bodhak_head_down_unit', presetUnit);
        } catch {}
    };

    // Settings
    const [earThreshold, setEarThreshold] = useState<number>(0.21); // Default EAR threshold
    const [blinkingGracePeriod, setBlinkingGracePeriod] = useState<number>(3.0); // 1.0s to 5.0s grace period
    const [showMesh, setShowMesh] = useState<boolean>(true);
    const [isAudioTested, setIsAudioTested] = useState<boolean>(false);

    // Alarm Sound & Volume Settings
    const [selectedTone, setSelectedTone] = useState<AlarmToneId>('siren');
    const [alarmVolume, setAlarmVolume] = useState<number>(1.0); // 0.4 to 1.0
    const [isSuperBoost, setIsSuperBoost] = useState<boolean>(true); // Extra loud mode

    const selectedToneRef = useRef<AlarmToneId>('siren');
    selectedToneRef.current = selectedTone;

    const alarmVolumeRef = useRef<number>(1.0);
    alarmVolumeRef.current = alarmVolume;

    const isSuperBoostRef = useRef<boolean>(true);
    isSuperBoostRef.current = isSuperBoost;

    const isTestingRef = useRef<boolean>(false);
    const testTimeoutRef = useRef<any>(null);

    // Standalone code modal
    const [isCodeModalOpen, setIsCodeModalOpen] = useState<boolean>(false);
    const [copiedCode, setCopiedCode] = useState<boolean>(false);

    // FaceMesh & Camera instance references
    const faceMeshRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const eyeClosedStartTimeRef = useRef<number | null>(null);
    const lastMotionTimeRef = useRef<number>(performance.now());
    const previousLandmarksRef = useRef<Landmark[] | null>(null);
    const isAlarmActiveRef = useRef<boolean>(false);
    isAlarmActiveRef.current = isAlarmActive;

    const isTrackingRef = useRef<boolean>(false);
    isTrackingRef.current = isTracking;

    const detectionStateRef = useRef(detectionState);
    detectionStateRef.current = detectionState;

    const opennessPercentage = Math.min(100, Math.max(0, Math.round((avgEar / 0.35) * 100)));
    const opennessRef = useRef(opennessPercentage);
    opennessRef.current = opennessPercentage;

    const isHeadDownRef = useRef(isHeadDown);
    isHeadDownRef.current = isHeadDown;

    const headDownDurationRef = useRef(headDownDuration);
    headDownDurationRef.current = headDownDuration;

    const studySecondsRef = useRef(studySeconds);
    studySecondsRef.current = studySeconds;

    // PiP canvas & dedicated video element references (to stream App Logo instead of webcam)
    const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pipVideoRef = useRef<HTMLVideoElement | null>(null);
    const logoImgRef = useRef<HTMLImageElement | null>(null);

    // Format seconds into HH:MM:SS
    const formatTime = useCallback((secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, []);

    // Format duration nicely (e.g. 20s, 1m, 1m 30s, 10m, 30m)
    const formatDuration = useCallback((totalSecs: number) => {
        if (totalSecs >= 3600) {
            const h = Math.floor(totalSecs / 3600);
            const m = Math.floor((totalSecs % 3600) / 60);
            const s = Math.round(totalSecs % 60);
            return `${h}h ${m}m${s > 0 ? ` ${s}s` : ''}`;
        }
        if (totalSecs >= 60) {
            const m = Math.floor(totalSecs / 60);
            const s = Math.round(totalSecs % 60);
            return s > 0 ? `${m}m ${s}s` : `${m} min`;
        }
        return `${Math.round(totalSecs)}s`;
    }, []);

    // Format current glance progress against limit (e.g. "12.5s / 20s" or "2m 15s / 10 min")
    const formatGlanceProgress = useCallback((currSecs: number, maxSecs: number) => {
        if (maxSecs >= 60) {
            const curM = Math.floor(currSecs / 60);
            const curS = Math.floor(currSecs % 60);
            const curStr = curM > 0 ? `${curM}m ${curS}s` : `${currSecs.toFixed(0)}s`;
            return `${curStr} / ${formatDuration(maxSecs)}`;
        }
        return `${currSecs.toFixed(1)}s / ${maxSecs.toFixed(0)}s`;
    }, [formatDuration]);

    // Background Execution & Minimize Resiliency refs
    const backgroundWorkerRef = useRef<Worker | null>(null);
    const lastFrameTimeRef = useRef<number>(0);
    const isProcessingFrameRef = useRef<boolean>(false);
    const keepAliveGainRef = useRef<GainNode | null>(null);
    const keepAliveOscRef = useRef<OscillatorNode | null>(null);
    const wakeLockRef = useRef<any>(null);
    const [isPiPActive, setIsPiPActive] = useState<boolean>(false);
    const [isMinimizedOrHidden, setIsMinimizedOrHidden] = useState<boolean>(false);
    const [isUserMinimized, setIsUserMinimized] = useState<boolean>(false);

    // If either manually minimized by user, or tab/browser is minimized/hidden, or PiP is active
    const isVideoMinimized = isUserMinimized || isMinimizedOrHidden || isPiPActive;

    // Render PiP Canvas with Bodhak App Logo and Live AI Status (Never displays user camera feed)
    const renderPiPCanvas = useCallback(() => {
        const canvas = pipCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = 480;
        const height = 360;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const isAlarm = isAlarmActiveRef.current;
        const detection = detectionStateRef.current;
        const openness = opennessRef.current;
        const secs = studySecondsRef.current;
        const timeStr = formatTime(secs);
        const headDown = isHeadDownRef.current;
        const glanceSecs = headDownDurationRef.current;
        const maxGlance = headDownMaxLimitRef.current;
        const tracking = isTrackingRef.current;

        // 1. Background
        if (isAlarm) {
            const flash = Math.floor(Date.now() / 250) % 2 === 0;
            ctx.fillStyle = flash ? '#991b1b' : '#450a0a';
            ctx.fillRect(0, 0, width, height);

            ctx.lineWidth = 10;
            ctx.strokeStyle = '#ef4444';
            ctx.strokeRect(5, 5, width - 10, height - 10);
        } else {
            const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
            bgGrad.addColorStop(0, '#020617');
            bgGrad.addColorStop(0.5, '#0f172a');
            bgGrad.addColorStop(1, '#020617');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            // Ambient Aura behind logo
            const glowGrad = ctx.createRadialGradient(width / 2, 135, 15, width / 2, 135, 110);
            if (detection === 'awake') {
                glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
                glowGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
            } else if (detection === 'drowsy' || headDown) {
                glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.32)');
                glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
            } else {
                glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
                glowGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            }
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(width / 2, 135, 110, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Bodhak App Logo Card in center
        const cardSize = 100;
        const cardX = (width - cardSize) / 2;
        const cardY = isAlarm ? 48 : 64;
        const cardRadius = 22;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardSize, cardSize, cardRadius);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = isAlarm ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 4;
        ctx.fill();

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = isAlarm ? '#ef4444' : (detection === 'awake' ? '#10b981' : (detection === 'drowsy' ? '#f59e0b' : '#818cf8'));
        ctx.stroke();
        ctx.restore();

        // Draw Bodhak Logo image
        if (logoImgRef.current && logoImgRef.current.complete && logoImgRef.current.naturalWidth > 0) {
            const logoPadding = 14;
            try {
                ctx.drawImage(
                    logoImgRef.current,
                    cardX + logoPadding,
                    cardY + logoPadding,
                    cardSize - (logoPadding * 2),
                    cardSize - (logoPadding * 2)
                );
            } catch {}
        } else {
            // High-contrast fallback vector emblem
            ctx.save();
            ctx.beginPath();
            ctx.arc(width / 2, cardY + cardSize / 2, 32, 0, Math.PI * 2);
            ctx.fillStyle = '#4f46e5';
            ctx.fill();
            ctx.font = 'bold 34px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('B', width / 2, cardY + cardSize / 2 + 2);
            ctx.restore();
        }

        // 3. Status Labels
        if (isAlarm) {
            ctx.save();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.roundRect((width - 320) / 2, cardY + cardSize + 18, 320, 44, 14);
            ctx.fill();

            ctx.font = 'bold 22px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🚨 WAKE UP! (अलार्म) 🚨', width / 2, cardY + cardSize + 40);
            ctx.restore();

            ctx.font = 'bold 16px sans-serif';
            ctx.fillStyle = '#fecaca';
            ctx.textAlign = 'center';
            ctx.fillText('अपनी आँखें खोलें या स्क्रीन पर देखें!', width / 2, cardY + cardSize + 90);

            ctx.font = '13px sans-serif';
            ctx.fillStyle = '#fca5a5';
            ctx.textAlign = 'center';
            ctx.fillText('आँखें खोलते ही अलार्म तुरंत बंद हो जाएगा', width / 2, cardY + cardSize + 115);
        } else {
            ctx.font = 'bold 18px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Bodhak Anti-Sleep AI', width / 2, 20);

            const badgeY = cardY + cardSize + 16;
            let badgeBg = '#064e3b';
            let badgeBorder = '#10b981';
            let badgeTextColor = '#6ee7b7';
            let badgeText = tracking ? '⚡ AI MONITORING ACTIVE' : 'STANDBY';

            if (headDown) {
                badgeBg = '#78350f';
                badgeBorder = '#f59e0b';
                badgeTextColor = '#fde68a';
                badgeText = `📖 Glance: ${formatGlanceProgress(glanceSecs, maxGlance)}`;
            } else if (detection === 'drowsy') {
                badgeBg = '#7f1d1d';
                badgeBorder = '#f87171';
                badgeTextColor = '#fecaca';
                badgeText = '⚠️ DROWSY ALERT';
            }

            const badgeWidth = 260;
            ctx.fillStyle = badgeBg;
            ctx.beginPath();
            ctx.roundRect((width - badgeWidth) / 2, badgeY, badgeWidth, 30, 15);
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = badgeBorder;
            ctx.stroke();

            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = badgeTextColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, width / 2, badgeY + 15);

            // 4. Metrics Footer Cards
            const footerY = 250;

            // Left Metric: Eyes Openness
            ctx.save();
            ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
            ctx.beginPath();
            ctx.roundRect(35, footerY, 195, 52, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText('👁️ Eye Openness', 48, footerY + 20);

            ctx.font = 'bold 18px sans-serif';
            ctx.fillStyle = openness > 40 ? '#34d399' : '#fbbf24';
            ctx.fillText(`${openness}%`, 48, footerY + 41);

            const barX = 115;
            const barY = footerY + 28;
            const barW = 100;
            const barH = 9;
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 4);
            ctx.fill();

            ctx.fillStyle = openness > 40 ? '#10b981' : '#f59e0b';
            ctx.beginPath();
            ctx.roundRect(barX, barY, (barW * Math.min(openness, 100)) / 100, barH, 4);
            ctx.fill();
            ctx.restore();

            // Right Metric: Session Timer
            ctx.save();
            ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
            ctx.beginPath();
            ctx.roundRect(250, footerY, 195, 52, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText('⏱️ Session Time', 265, footerY + 20);

            ctx.font = 'bold 18px monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(timeStr, 265, footerY + 41);
            ctx.restore();

            // Bottom Privacy Micro-text
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.fillText('🛡️ Camera feed hidden in PiP • Privacy Protected', width / 2, 335);
        }
    }, [formatTime, formatGlanceProgress]);

    // Preload Bodhak App Logo for PiP Canvas rendering
    useEffect(() => {
        const img = new Image();
        img.src = '/icon.svg';
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            logoImgRef.current = img;
            if (isPiPActive) renderPiPCanvas();
        };
        logoImgRef.current = img;
    }, [isPiPActive, renderPiPCanvas]);

    // Render loop for PiP canvas (using interval so it runs smoothly even when tab is in background/minimized)
    useEffect(() => {
        let interval: any = null;
        if (isPiPActive) {
            renderPiPCanvas();
            interval = setInterval(() => {
                renderPiPCanvas();
            }, 100);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPiPActive, renderPiPCanvas]);

    // Create Background Worker
    const createBackgroundWorker = useCallback(() => {
        const workerScript = `
            let timer = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    if (!timer) {
                        timer = setInterval(function() {
                            self.postMessage('tick');
                        }, 120);
                    }
                } else if (e.data === 'stop') {
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                }
            };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        return new Worker(URL.createObjectURL(blob));
    }, []);

    // Silent Audio Keep-Alive to prevent Chrome Sleeping Tab / Memory Saver
    const startKeepAliveAudio = useCallback((ctx: AudioContext) => {
        try {
            if (keepAliveOscRef.current) return;
            const gain = ctx.createGain();
            gain.gain.value = 0.00001; // Ultra silent, inaudible
            const osc = ctx.createOscillator();
            osc.frequency.value = 60;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            keepAliveGainRef.current = gain;
            keepAliveOscRef.current = osc;
        } catch (e) {
            console.warn('Keep-alive audio error:', e);
        }
    }, []);

    const stopKeepAliveAudio = useCallback(() => {
        try {
            if (keepAliveOscRef.current) {
                keepAliveOscRef.current.stop();
                keepAliveOscRef.current.disconnect();
                keepAliveOscRef.current = null;
            }
            if (keepAliveGainRef.current) {
                keepAliveGainRef.current.disconnect();
                keepAliveGainRef.current = null;
            }
        } catch {}
    }, []);

    // WakeLock to keep screen and camera awake during study
    const requestWakeLock = useCallback(async () => {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            } catch {}
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
            } catch {}
        }
    }, []);

    // Toggle Picture-in-Picture (PiP Floating Window showing Bodhak App Logo instead of camera video)
    const togglePictureInPicture = async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiPActive(false);
                return;
            }

            if (!document.pictureInPictureEnabled) {
                alert("Picture-in-Picture is not supported in this browser.");
                return;
            }

            // 1. Initial draw on PiP canvas
            renderPiPCanvas();

            const canvas = pipCanvasRef.current;
            const pipVideo = pipVideoRef.current;

            if (canvas && pipVideo) {
                const stream = (canvas as any).captureStream 
                    ? (canvas as any).captureStream(25) 
                    : ((canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(25) : null);

                if (stream) {
                    pipVideo.srcObject = stream;
                    await pipVideo.play();
                    await pipVideo.requestPictureInPicture();
                    setIsPiPActive(true);
                    return;
                }
            }

            // Fallback to video element if canvas stream fails
            if (videoRef.current) {
                await videoRef.current.requestPictureInPicture();
                setIsPiPActive(true);
            }
        } catch (err) {
            console.warn('Picture-in-picture error:', err);
        }
    };

    // Handle tab minimize / background visibility
    useEffect(() => {
        const handleVisibilityChange = () => {
            const hidden = document.hidden;
            setIsMinimizedOrHidden(hidden);
            if (!hidden && isTrackingRef.current) {
                requestWakeLock();
                if (videoRef.current && videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                }
            }
        };

        const handleEnterPiP = () => setIsPiPActive(true);
        const handleLeavePiP = () => setIsPiPActive(false);

        document.addEventListener('visibilitychange', handleVisibilityChange);
        const video = videoRef.current;
        const pipVideo = pipVideoRef.current;

        if (pipVideo) {
            pipVideo.addEventListener('enterpictureinpicture', handleEnterPiP);
            pipVideo.addEventListener('leavepictureinpicture', handleLeavePiP);
        }
        if (video) {
            video.addEventListener('enterpictureinpicture', handleEnterPiP);
            video.addEventListener('leavepictureinpicture', handleLeavePiP);
        }

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (pipVideo) {
                pipVideo.removeEventListener('enterpictureinpicture', handleEnterPiP);
                pipVideo.removeEventListener('leavepictureinpicture', handleLeavePiP);
            }
            if (video) {
                video.removeEventListener('enterpictureinpicture', handleEnterPiP);
                video.removeEventListener('leavepictureinpicture', handleLeavePiP);
            }
        };
    }, [requestWakeLock]);

    // Study session timer
    useEffect(() => {
        let interval: any = null;
        if (isTracking) {
            interval = setInterval(() => {
                setStudySeconds(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isTracking]);

    // Play synthesized burst based on selected tone, volume and super-boost
    const playSynthesizerBurst = useCallback((ctx: AudioContext, tone: AlarmToneId, vol: number, boost: boolean) => {
        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();

        // Dynamics compressor maximizes acoustic punch without digital clipping
        compressor.threshold.setValueAtTime(boost ? -16 : -10, now);
        compressor.knee.setValueAtTime(6, now);
        compressor.ratio.setValueAtTime(boost ? 20 : 12, now);
        compressor.attack.setValueAtTime(0.002, now);
        compressor.release.setValueAtTime(0.2, now);

        const gainMultiplier = boost ? 1.45 : 1.0;
        const effectiveVol = Math.min(1.5, Math.max(0.2, vol * gainMultiplier));
        masterGain.gain.setValueAtTime(effectiveVol, now);

        masterGain.connect(compressor);
        compressor.connect(ctx.destination);

        if (tone === 'siren') {
            // Ultra Piercing Siren (Dual frequency sweeping 850Hz -> 1550Hz)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const g1 = ctx.createGain();
            const g2 = ctx.createGain();

            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(850, now);
            osc1.frequency.linearRampToValueAtTime(1550, now + 0.16);
            osc1.frequency.linearRampToValueAtTime(900, now + 0.3);

            osc2.type = 'square';
            osc2.frequency.setValueAtTime(950, now);
            osc2.frequency.linearRampToValueAtTime(1650, now + 0.16);
            osc2.frequency.linearRampToValueAtTime(1000, now + 0.3);

            g1.gain.setValueAtTime(0.65, now);
            g1.gain.linearRampToValueAtTime(0.01, now + 0.3);
            g2.gain.setValueAtTime(0.45, now);
            g2.gain.linearRampToValueAtTime(0.01, now + 0.3);

            osc1.connect(g1);
            g1.connect(masterGain);
            osc2.connect(g2);
            g2.connect(masterGain);

            osc1.start(now);
            osc1.stop(now + 0.3);
            osc2.start(now);
            osc2.stop(now + 0.3);
        } else if (tone === 'military') {
            // Military Klaxon (Triple harmonic square buzz 440Hz + 880Hz + 1320Hz)
            const freqs = [440, 880, 1320];
            const gains = [0.65, 0.45, 0.35];
            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = idx % 2 === 0 ? 'square' : 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                g.gain.setValueAtTime(gains[idx], now);
                g.gain.linearRampToValueAtTime(0.01, now + 0.22);
                osc.connect(g);
                g.connect(masterGain);
                osc.start(now);
                osc.stop(now + 0.22);
            });
        } else if (tone === 'airhorn') {
            // Heavy Air Horn (Full brass chord Bb3 + D4 + F4 + Bb4 with deep rumble)
            const chord = [233.08, 293.66, 349.23, 466.16];
            chord.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = idx === 3 ? 'square' : 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.linearRampToValueAtTime(freq * 1.02, now + 0.15);
                g.gain.setValueAtTime(0.45, now);
                g.gain.linearRampToValueAtTime(0.01, now + 0.34);
                osc.connect(g);
                g.connect(masterGain);
                osc.start(now);
                osc.stop(now + 0.34);
            });
        } else if (tone === 'highpitch') {
            // High-Pitch Piercing Pulse (1850Hz -> 2450Hz)
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1850, now);
            osc.frequency.exponentialRampToValueAtTime(2450, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(1800, now + 0.2);
            g.gain.setValueAtTime(0.85, now);
            g.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.connect(g);
            g.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.2);
        } else {
            // Classic Bell Alarm Clock (Two quick metallic hammer strikes)
            const strikeTimes = [0, 0.12];
            strikeTimes.forEach((delay) => {
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const g = ctx.createGain();
                osc1.type = 'triangle';
                osc1.frequency.setValueAtTime(780, now + delay);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(1240, now + delay);

                g.gain.setValueAtTime(0.75, now + delay);
                g.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);

                osc1.connect(g);
                osc2.connect(g);
                g.connect(masterGain);

                osc1.start(now + delay);
                osc1.stop(now + delay + 0.15);
                osc2.start(now + delay);
                osc2.stop(now + delay + 0.15);
            });
        }
    }, []);

    // Play loud dual-tone synthesizer buzzer using Web Audio API
    const startSynthesizerBuzzer = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;

            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioCtx();
            }

            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            if (buzzerIntervalRef.current) return;

            const tone = selectedToneRef.current;
            const intervalMs = tone === 'military' ? 280 : tone === 'highpitch' ? 240 : tone === 'airhorn' ? 420 : 340;

            const playCycle = () => {
                if (!isAlarmActiveRef.current && !isTestingRef.current) return;
                playSynthesizerBurst(ctx, selectedToneRef.current, alarmVolumeRef.current, isSuperBoostRef.current);
            };

            playCycle();
            buzzerIntervalRef.current = setInterval(playCycle, intervalMs);
        } catch (e) {
            console.warn("AudioContext error:", e);
        }
    }, [playSynthesizerBurst]);

    // Stop synthesizer buzzer
    const stopSynthesizerBuzzer = useCallback(() => {
        if (buzzerIntervalRef.current) {
            clearInterval(buzzerIntervalRef.current);
            buzzerIntervalRef.current = null;
        }
    }, []);

    // Trigger Drowsiness Alarm
    const triggerDrowsinessAlarm = useCallback((reason: string) => {
        setIsAlarmActive(true);
        isAlarmActiveRef.current = true;
        setAlarmTriggerReason(reason);
        setDetectionState('asleep');
        setTotalAlerts(prev => prev + 1);

        // Backup HTML5 audio playback
        if (audioRef.current) {
            try {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
            } catch {}
        }

        // Web Audio Synthesizer
        startSynthesizerBuzzer();

        // Desktop Notification if window is minimized or permitted
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification('🚨 Anti-Sleep Alert!', {
                    body: reason || 'नींद की चेतावनी! तुरंत स्क्रीन की तरफ देखें या आँखें खोलें!',
                    icon: '/favicon.ico',
                    tag: 'anti-sleep-alarm',
                    requireInteraction: true
                });
            } catch {}
        }
    }, [startSynthesizerBuzzer]);

    // Stop Alarm
    const stopAlarm = useCallback(() => {
        setIsAlarmActive(false);
        isAlarmActiveRef.current = false;
        isTestingRef.current = false;
        if (testTimeoutRef.current) {
            clearTimeout(testTimeoutRef.current);
            testTimeoutRef.current = null;
        }
        setIsAudioTested(false);
        eyeClosedStartTimeRef.current = null;
        headDownStartTimeRef.current = null;
        noFaceStartTimeRef.current = null;
        lastMotionTimeRef.current = performance.now();
        setClosureDuration(0);
        setHeadDownDuration(0);
        setStillnessDuration(0);
        setDetectionState('awake');

        // Stop audio
        if (audioRef.current) {
            try {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            } catch {}
        }
        stopSynthesizerBuzzer();
    }, [stopSynthesizerBuzzer]);

    // Preview or test tone
    const handlePreviewTone = useCallback((toneToPreview?: AlarmToneId) => {
        if (toneToPreview) {
            setSelectedTone(toneToPreview);
            selectedToneRef.current = toneToPreview;
        }

        stopSynthesizerBuzzer();
        if (testTimeoutRef.current) {
            clearTimeout(testTimeoutRef.current);
            testTimeoutRef.current = null;
        }

        if (isAudioTested) {
            setIsAudioTested(false);
            isTestingRef.current = false;
            return;
        }

        setIsAudioTested(true);
        isTestingRef.current = true;
        startSynthesizerBuzzer();

        testTimeoutRef.current = setTimeout(() => {
            setIsAudioTested(false);
            isTestingRef.current = false;
            stopSynthesizerBuzzer();
        }, 2200);
    }, [isAudioTested, startSynthesizerBuzzer, stopSynthesizerBuzzer]);

    // Test Audio Buzzer
    const handleTestAlarm = () => {
        handlePreviewTone();
    };

    // Keyboard shortcut to stop alarm with space or enter
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isAlarmActive && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
                e.preventDefault();
                stopAlarm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAlarmActive, stopAlarm]);

    // Handle FaceMesh Results
    const onResults = useCallback((results: any) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks: Landmark[] = results.multiFaceLandmarks[0];

            // 1. Compute Eye Aspect Ratio (EAR)
            const earL = computeEAR(landmarks, LEFT_EYE_INDICES);
            const earR = computeEAR(landmarks, RIGHT_EYE_INDICES);
            const avg = (earL + earR) / 2.0;

            setEarLeft(Number(earL.toFixed(3)));
            setEarRight(Number(earR.toFixed(3)));
            setAvgEar(Number(avg.toFixed(3)));

            // 2. Compute Head Pitch (Tilt)
            const { isHeadDown: headDownDetected, estimatedPitchDeg } = computeHeadPose(landmarks);
            setIsHeadDown(headDownDetected);
            setHeadPitchDeg(estimatedPitchDeg);

            // 3. Compute Micro-Motion across frames
            let motionDelta = 0;
            if (previousLandmarksRef.current) {
                motionDelta = computeMicroMotion(landmarks, previousLandmarksRef.current);
                // Normalized coordinate threshold: > 0.0035 indicates active hand/shoulder/head micro-motion
                if (motionDelta > 0.0035) {
                    lastMotionTimeRef.current = performance.now();
                    setHasRecentMicroMotion(true);
                    if (isAlarmActiveRef.current && mode === 'writing') {
                        // User started moving again in writing mode! Auto-silence alarm
                        stopAlarm();
                    }
                } else {
                    setHasRecentMicroMotion(false);
                }
            }
            previousLandmarksRef.current = landmarks;

            const isEyesClosed = avg < earThreshold;
            const now = performance.now();

            // ==========================================
            // 1. AUTO-STOP ON EYE OPEN AND LOOKING AT SCREEN (< 30°)
            // ==========================================
            if (!isEyesClosed && !headDownDetected && isAlarmActiveRef.current) {
                stopAlarm();
            }

            // ==========================================
            // 2. HEAD-DOWN SCREEN CHECK (User Request)
            // "henad pitch 30'+down ho pr hi face down alet time shuru ho"
            // Head pitch 30°+ down hone par hi face down alert timer shuru ho
            // ==========================================
            if (headDownDetected) {
                // Head pitch is >= 30°
                if (!headDownStartTimeRef.current) {
                    headDownStartTimeRef.current = now;
                }
                const headDownSecs = (now - headDownStartTimeRef.current) / 1000;
                setHeadDownDuration(Number(headDownSecs.toFixed(1)));

                if (headDownSecs >= headDownMaxLimitRef.current) {
                    if (!isAlarmActiveRef.current) {
                        triggerDrowsinessAlarm(`चेहरा काफी देर से नीचे (30°+) है! स्क्रीन पर ध्यान दें (Face Down > ${formatDuration(headDownMaxLimitRef.current)} without screen glance)`);
                    }
                }
            } else {
                // Head pitch is < 30° -> Looking at screen / level
                // IMMEDIATELY RESET HEAD-DOWN TIMER! (Glanced at screen)
                headDownStartTimeRef.current = null;
                setHeadDownDuration(0);
                setStillnessDuration(0);
            }

            // ==========================================
            // 3. EYE ALERT & MOTION EVALUATION (User Request)
            // "and 35' se kam face down hone pr eye alert hi de"
            // If head pitch is < 35° down, ALWAYS monitor eye closure and trigger eye alert!
            // ==========================================
            const isEyeAlertActive = (mode === 'reading') || (estimatedPitchDeg < 35);

            if (isEyeAlertActive) {
                // When head is tilted < 35° (or reading mode), eyes are clearly facing camera -> Eye Alert is Active
                if (isEyesClosed) {
                    if (!eyeClosedStartTimeRef.current) {
                        eyeClosedStartTimeRef.current = now;
                    }
                    const elapsed = (now - eyeClosedStartTimeRef.current) / 1000;
                    setClosureDuration(Number(elapsed.toFixed(1)));

                    if (elapsed >= blinkingGracePeriod) {
                        if (!isAlarmActiveRef.current) {
                            const pitchInfo = estimatedPitchDeg >= 30 ? ` (Pitch ${estimatedPitchDeg}°, Eye Alert < 35°)` : '';
                            triggerDrowsinessAlarm(`Drowsiness Detected (Eyes closed > ${blinkingGracePeriod}s)${pitchInfo}`);
                        }
                    } else {
                        if (!isAlarmActiveRef.current) setDetectionState('drowsy');
                    }
                } else {
                    eyeClosedStartTimeRef.current = null;
                    setClosureDuration(0);
                    if (isAlarmActiveRef.current && !headDownDetected) {
                        stopAlarm();
                    } else if (!isAlarmActiveRef.current) {
                        setDetectionState(headDownDetected && mode === 'writing' ? 'writing' : 'awake');
                    }
                }
            } else {
                // Mode is 'writing' AND head pitch is deeply down (>= 35°)
                // User is writing down on notebook/desk; avoid eyelid false alarms
                eyeClosedStartTimeRef.current = null;
                setClosureDuration(0);

                // HYBRID SLEEP CHECK: monitor stillness duration (40s)
                const stillnessSecs = (now - lastMotionTimeRef.current) / 1000;
                setStillnessDuration(Number(stillnessSecs.toFixed(1)));

                if (stillnessSecs >= 40.0) {
                    if (!isAlarmActiveRef.current) {
                        triggerDrowsinessAlarm('Fallen Asleep on Desk (Zero motion for 40s while looking down >= 35°)');
                    }
                } else {
                    if (!isAlarmActiveRef.current) {
                        setDetectionState('writing');
                    }
                }
            }

            // Draw Wireframe & Contours on Canvas
            if (showMesh) {
                const drawContour = (indices: number[], color: string) => {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    indices.forEach((idx, i) => {
                        const pt = landmarks[idx];
                        const x = pt.x * canvas.width;
                        const y = pt.y * canvas.height;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.stroke();
                };

                let contourColor = '#10b981'; // Green (Awake)
                if (isEyesClosed) {
                    contourColor = (mode === 'writing' && headDownDetected) ? '#06b6d4' : '#ef4444';
                }

                drawContour(LEFT_EYE_INDICES, contourColor);
                drawContour(RIGHT_EYE_INDICES, contourColor);

                // Draw Head Orientation Axis line (Forehead -> Nose)
                if (landmarks[10] && landmarks[1]) {
                    ctx.strokeStyle = headDownDetected ? '#f59e0b' : '#3b82f6';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(landmarks[10].x * canvas.width, landmarks[10].y * canvas.height);
                    ctx.lineTo(landmarks[1].x * canvas.width, landmarks[1].y * canvas.height);
                    ctx.stroke();
                }
            }
        } else {
            setAvgEar(0);
            if (isTracking) {
                // If head was down before face disappeared (e.g., student rested head down on notebook/desk)
                if (headDownStartTimeRef.current) {
                    const headDownSecs = (performance.now() - headDownStartTimeRef.current) / 1000;
                    setHeadDownDuration(Number(headDownSecs.toFixed(1)));
                    if (headDownSecs >= headDownMaxLimitRef.current && !isAlarmActiveRef.current) {
                        triggerDrowsinessAlarm(`चेहरा डेस्क पर है! (Face Down / Head on desk > ${formatDuration(headDownMaxLimitRef.current)})`);
                    }
                }
            }
            if (!isAlarmActiveRef.current) {
                setDetectionState('no_face');
            }
        }
    }, [earThreshold, blinkingGracePeriod, mode, showMesh, isTracking, triggerDrowsinessAlarm, stopAlarm, formatDuration]);

    // Dynamically load MediaPipe FaceMesh & Camera scripts if not already present
    const loadMediaPipeScripts = async (): Promise<boolean> => {
        if (window.FaceMesh && window.Camera) return true;

        const loadScript = (src: string): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.crossOrigin = 'anonymous';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script ${src}`));
                document.head.appendChild(script);
            });
        };

        try {
            await Promise.all([
                loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
                loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
            ]);
            return true;
        } catch (e) {
            console.error('Error loading MediaPipe from CDN:', e);
            return false;
        }
    };

    // Start Eye Tracking
    const handleStartTracking = async () => {
        setCameraError(null);
        setIsLoadingModel(true);

        try {
            const scriptsLoaded = await loadMediaPipeScripts();
            if (!scriptsLoaded || !window.FaceMesh || !window.Camera) {
                throw new Error("Could not initialize MediaPipe FaceMesh. Please check your internet connection.");
            }

            const video = videoRef.current;
            if (!video) throw new Error("Video element is not ready");

            if (!faceMeshRef.current) {
                const mesh = new window.FaceMesh({
                    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
                });
                mesh.setOptions({
                    maxNumFaces: 1,
                    refineLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                mesh.onResults(onResults);
                faceMeshRef.current = mesh;
            }

            const camera = new window.Camera(video, {
                onFrame: async () => {
                    lastFrameTimeRef.current = performance.now();
                    if (faceMeshRef.current && videoRef.current && !isProcessingFrameRef.current) {
                        isProcessingFrameRef.current = true;
                        try {
                            await faceMeshRef.current.send({ image: videoRef.current });
                        } catch (e) {
                            // ignore frame error
                        } finally {
                            isProcessingFrameRef.current = false;
                        }
                    }
                },
                width: 640,
                height: 480
            });

            await camera.start();
            cameraRef.current = camera;

            // Start Web Worker Background Heartbeat (Keeps tracking alive when tab is minimized/hidden!)
            if (!backgroundWorkerRef.current) {
                backgroundWorkerRef.current = createBackgroundWorker();
                backgroundWorkerRef.current.onmessage = async () => {
                    const now = performance.now();
                    // If requestAnimationFrame has stalled > 160ms (browser is minimized or tab is hidden)
                    if (now - lastFrameTimeRef.current > 160) {
                        if (isTrackingRef.current && faceMeshRef.current && videoRef.current && !isProcessingFrameRef.current) {
                            const vid = videoRef.current;
                            if (vid.readyState >= 2) {
                                if (vid.paused) {
                                    vid.play().catch(() => {});
                                }
                                isProcessingFrameRef.current = true;
                                try {
                                    await faceMeshRef.current.send({ image: vid });
                                } catch (err) {
                                    // background frame drop
                                } finally {
                                    isProcessingFrameRef.current = false;
                                    lastFrameTimeRef.current = performance.now();
                                }
                            }
                        }
                    }
                };
            }
            backgroundWorkerRef.current.postMessage('start');

            // Initialize audio context and start keep-alive audio heartbeat (prevents tab sleep)
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    if (!audioCtxRef.current) {
                        audioCtxRef.current = new AudioCtx();
                    }
                    if (audioCtxRef.current.state === 'suspended') {
                        await audioCtxRef.current.resume();
                    }
                    startKeepAliveAudio(audioCtxRef.current);
                }
            } catch (e) {
                console.warn('Audio init error:', e);
            }

            // Screen WakeLock to prevent display sleeping
            requestWakeLock();

            // Request Notification permission for background alarms
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }

            isTrackingRef.current = true;
            setIsTracking(true);
            setIsLoadingModel(false);
            setDetectionState('awake');
            lastMotionTimeRef.current = performance.now();
        } catch (err: any) {
            console.error('Tracking startup error:', err);
            setCameraError(err.message || "Failed to access webcam. Please ensure camera permissions are allowed.");
            setIsLoadingModel(false);
            isTrackingRef.current = false;
            setIsTracking(false);
            setDetectionState('standby');
        }
    };

    // Stop Eye Tracking
    const handleStopTracking = () => {
        isTrackingRef.current = false;
        setIsTracking(false);
        setDetectionState('standby');
        stopAlarm();

        // Stop background worker
        if (backgroundWorkerRef.current) {
            backgroundWorkerRef.current.postMessage('stop');
        }

        // Stop audio keep-alive & release wake lock
        stopKeepAliveAudio();
        releaseWakeLock();

        // Exit PiP if active
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
        }

        if (pipVideoRef.current && pipVideoRef.current.srcObject) {
            const stream = pipVideoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            pipVideoRef.current.srcObject = null;
        }

        if (cameraRef.current) {
            try {
                cameraRef.current.stop();
            } catch {}
            cameraRef.current = null;
        }

        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            handleStopTracking();
            stopSynthesizerBuzzer();
            if (backgroundWorkerRef.current) {
                try {
                    backgroundWorkerRef.current.terminate();
                    backgroundWorkerRef.current = null;
                } catch {}
            }
            if (audioCtxRef.current) {
                try {
                    audioCtxRef.current.close();
                } catch {}
            }
        };
    }, []);

    // Direct PiP Tracking Launcher (For Home Page Bodhak logo 2-click shortcut & auto-PiP)
    const startPiPTracking = useCallback(async () => {
        try {
            let pipTriggered = false;

            // 1. Immediately request Picture-in-Picture on user gesture (uses pre-rendered Bodhak Logo canvas)
            if (document.pictureInPictureEnabled) {
                renderPiPCanvas();
                const canvas = pipCanvasRef.current;
                const pipVideo = pipVideoRef.current;

                if (canvas && pipVideo) {
                    const stream = (canvas as any).captureStream 
                        ? (canvas as any).captureStream(25) 
                        : ((canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(25) : null);

                    if (stream) {
                        try {
                            pipVideo.srcObject = stream;
                            await pipVideo.play();
                            await pipVideo.requestPictureInPicture();
                            setIsPiPActive(true);
                            pipTriggered = true;
                        } catch (pipErr) {
                            console.warn('Immediate PiP request:', pipErr);
                        }
                    }
                }
            }

            // 2. Start webcam & FaceMesh tracking
            if (!isTrackingRef.current) {
                await handleStartTracking();
            }

            // 3. If PiP didn't launch immediately due to browser video queue, retry after camera starts
            if (!pipTriggered && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                setTimeout(() => {
                    togglePictureInPicture().catch(() => {});
                }, 350);
            }
        } catch (err: any) {
            console.error('startPiPTracking error:', err);
        }
    }, [handleStartTracking, renderPiPCanvas, togglePictureInPicture]);

    // Expose control handles to parent component (App.tsx)
    useImperativeHandle(ref, () => ({
        startPiPTracking,
        stopTracking: handleStopTracking,
        togglePiP: togglePictureInPicture,
        isTracking: () => isTrackingRef.current,
        isPiPActive: () => isPiPActive,
    }), [startPiPTracking, handleStopTracking, togglePictureInPicture, isPiPActive]);

    // Listen to global window custom event for the shortcut
    useEffect(() => {
        const handleCustomStart = () => {
            startPiPTracking();
        };
        window.addEventListener('bodhak:start_anti_sleep_pip', handleCustomStart);
        return () => {
            window.removeEventListener('bodhak:start_anti_sleep_pip', handleCustomStart);
        };
    }, [startPiPTracking]);

    // Notify parent of state changes
    useEffect(() => {
        if (onTrackingChange) onTrackingChange(isTracking);
    }, [isTracking, onTrackingChange]);

    useEffect(() => {
        if (onPiPChange) onPiPChange(isPiPActive);
    }, [isPiPActive, onPiPChange]);

    // Copy standalone code
    const handleCopyCode = () => {
        navigator.clipboard.writeText(STANDALONE_HTML_CODE);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
    };

    // Download standalone HTML
    const handleDownloadCode = () => {
        const blob = new Blob([STANDALONE_HTML_CODE], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'anti-sleep-alarm.html';
        a.click();
        URL.revokeObjectURL(url);
    };

    const isHeadDownWarning = headDownDuration > 0 && (headDownMaxLimit - headDownDuration <= Math.min(30, Math.max(4, headDownMaxLimit * 0.15)));
    const isHeadDownCaution = headDownDuration >= headDownMaxLimit * 0.5;

    return (
        <div className="min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100 p-3 sm:p-6 lg:p-8 flex flex-col items-center select-none font-sans">
            
            {/* Top Navigation Bar */}
            <div className="w-full max-w-5xl flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
                            title="Go Back"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl sm:text-2xl">👁️</span>
                            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                <span>Anti-Sleep Alarm</span>
                                <span className="text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-md bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 uppercase tracking-widest">
                                    Smart Vision
                                </span>
                            </h1>
                        </div>
                        <p className="text-xs text-slate-400 font-medium hidden sm:block">
                            AI Drowsiness Detection with "No False Alarms" Dictation Mode for Students • <span className="text-cyan-400 font-semibold">⚡ Shortcut: होम पेज पर Bodhak लोगो पर 2 बार क्लिक करके सीधे PiP चलाएं!</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Test Alarm Button */}
                    <button 
                        onClick={handleTestAlarm}
                        className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                            isAudioTested 
                                ? 'bg-red-650 text-white border-red-500 shadow-md animate-pulse' 
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                        title="Test Loud Buzzer Sound"
                    >
                        <Volume2 className="w-4 h-4" />
                        <span className="hidden sm:inline">{isAudioTested ? 'Testing Buzzer...' : 'Test Alarm'}</span>
                    </button>

                    {/* Single-File Code Export Button */}
                    <button 
                        onClick={() => setIsCodeModalOpen(true)}
                        className="px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-700/50 transition cursor-pointer"
                        title="View & Download Single-File Vanilla Code"
                    >
                        <Code2 className="w-4 h-4" />
                        <span className="hidden md:inline">Export Single-File Code</span>
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {cameraError && (
                <div className="w-full max-w-5xl mb-4 bg-red-950/80 border border-red-800 text-red-200 p-3.5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <strong className="font-bold">Camera Access Issue:</strong> {cameraError}
                    </div>
                    <button 
                        onClick={() => setCameraError(null)}
                        className="text-red-400 hover:text-red-200 font-black text-xs cursor-pointer"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Mode Selector Bar (Feature 1: Dual Mode Toggle) */}
            <div className="w-full max-w-5xl mb-4 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setMode('reading')}
                        className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                            mode === 'reading'
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-950/50'
                                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800'
                        }`}
                    >
                        <BookOpen className="w-4 h-4" />
                        <span>Reading Mode (Strict Eyes)</span>
                    </button>

                    <button
                        onClick={() => setMode('writing')}
                        className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                            mode === 'writing'
                                ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg shadow-cyan-950/50'
                                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800'
                        }`}
                    >
                        <PenTool className="w-4 h-4" />
                        <span>Dictation / Writing Mode ✍️</span>
                    </button>
                </div>

                {/* Mode Explanation & Active Safeguards */}
                <div className="text-xs font-bold flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-slate-300 w-full sm:w-auto justify-between sm:justify-start">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                        {mode === 'reading' ? (
                            <span><strong className="text-indigo-400">Strict Eyes:</strong> Alarms if eyes closed &gt; {blinkingGracePeriod}s • <span className="text-emerald-400 font-bold">Auto-stops on eye open 👁️</span></span>
                        ) : (
                            <span><strong className="text-cyan-400">Smart Dictation:</strong> Face-Down Timer (≥30°) • Eye Alert Active (&lt;35°) • <span className="text-emerald-400 font-bold">Auto-stops on eye open 👁️</span></span>
                        )}
                    </span>
                </div>
            </div>

            {/* Main Application Grid */}
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* Left Column: Video Viewport & Live HUD */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                    
                    {/* Video Stage */}
                    <div className="relative w-full aspect-video sm:aspect-[4/3] md:aspect-video bg-black rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl flex items-center justify-center group">
                        
                        <video 
                            ref={videoRef}
                            playsInline
                            muted
                            className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${isVideoMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                        />

                        <canvas 
                            ref={canvasRef}
                            className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-10 transition-opacity duration-300 ${isVideoMinimized ? 'opacity-0' : 'opacity-100'}`}
                        />

                        {/* Hidden Canvas & Dedicated Video for Streaming Bodhak App Logo to PiP window */}
                        <canvas 
                            ref={pipCanvasRef} 
                            width={480} 
                            height={360} 
                            className="fixed -top-[9999px] -left-[9999px] pointer-events-none opacity-0"
                        />
                        <video 
                            ref={pipVideoRef} 
                            playsInline 
                            muted 
                            width={480} 
                            height={360} 
                            className="fixed -top-[9999px] -left-[9999px] pointer-events-none opacity-0"
                        />

                        {/* Minimized View: Bodhak App Logo replaces live video feed */}
                        {isVideoMinimized && (
                            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center z-20 select-none animate-in fade-in duration-300">
                                {/* Ambient Glow Aura */}
                                <div className="relative mb-4 flex items-center justify-center">
                                    <div className={`absolute -inset-4 rounded-full blur-xl opacity-40 transition-all duration-700 ${
                                        isAlarmActive 
                                            ? 'bg-red-500 animate-ping' 
                                            : detectionState === 'awake' 
                                            ? 'bg-emerald-500 animate-pulse' 
                                            : detectionState === 'writing' 
                                            ? 'bg-cyan-500 animate-pulse' 
                                            : detectionState === 'drowsy'
                                            ? 'bg-amber-500 animate-pulse'
                                            : 'bg-indigo-500'
                                    }`} />
                                    
                                    {/* Bodhak App Logo Card */}
                                    <div className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white p-3.5 shadow-2xl border-2 flex items-center justify-center transition-transform duration-300 ${
                                        isAlarmActive 
                                            ? 'border-red-500 scale-105 animate-bounce' 
                                            : 'border-slate-200/90 hover:scale-105'
                                    }`}>
                                        <img 
                                            src="/icon.svg" 
                                            alt="Bodhak App Logo" 
                                            className="w-full h-full object-contain"
                                        />
                                    </div>

                                    {/* Live Status Pill on Logo Corner */}
                                    <div className={`absolute -bottom-1 -right-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-lg ${
                                        isAlarmActive 
                                            ? 'bg-red-600 text-white border-red-400 animate-bounce' 
                                            : isTracking 
                                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500 animate-pulse' 
                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            isAlarmActive ? 'bg-white' : isTracking ? 'bg-emerald-400' : 'bg-slate-500'
                                        }`} />
                                        <span>{isAlarmActive ? 'ALERT' : isTracking ? 'ACTIVE ⚡' : 'STANDBY'}</span>
                                    </div>
                                </div>

                                {/* Title & Status */}
                                <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                                    <span>Bodhak Anti-Sleep AI</span>
                                    {isPiPActive && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-bold">PiP Active</span>}
                                </h3>

                                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                                    {isTracking 
                                        ? (isPiPActive 
                                            ? 'कैमरा फ्लोटिंग PiP विंडो में चल रहा है। यहाँ ऐप लोगो प्रदर्शित है।' 
                                            : 'वीडियो मिनिमाइज़ है। बैकग्राउंड AI द्वारा आँखें और 20s स्क्रीन टाइमर सक्रिय रूप से मॉनिटर हो रहे हैं।')
                                        : 'कैमरा बंद है। शुरू करने के लिए Start Tracking दबाएं।'
                                    }
                                </p>

                                {/* Metrics HUD in Logo Mode */}
                                {isTracking && (
                                    <div className="flex flex-wrap items-center justify-center gap-2 mb-4 text-xs font-semibold">
                                        <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-2 text-slate-300">
                                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                                            <span>Openness:</span>
                                            <span className={`font-black ${opennessPercentage > 40 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {opennessPercentage}%
                                            </span>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-2 text-slate-300">
                                            <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                            <span>Session:</span>
                                            <span className="font-mono font-bold text-white">{formatTime(studySeconds)}</span>
                                        </div>
                                        {isHeadDown && (
                                            <div className="px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-700/80 flex items-center gap-2 text-xs text-amber-300">
                                                <Compass className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Screen Glance: {formatGlanceProgress(headDownDuration, headDownMaxLimit)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2.5">
                                    <button
                                        onClick={() => setIsUserMinimized(false)}
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-900/40 transition cursor-pointer active:scale-95 border border-indigo-400/30"
                                        title="Restore Live Video Feed"
                                    >
                                        <Maximize2 className="w-3.5 h-3.5" />
                                        <span>Maximize Video (कैमरा देखें)</span>
                                    </button>
                                    {isPiPActive && (
                                        <button
                                            onClick={togglePictureInPicture}
                                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Exit PiP</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Standby Overlay */}
                        {!isTracking && !isLoadingModel && !isVideoMinimized && (
                            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
                                <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-400 shadow-xl mb-3">
                                    <Camera className="w-8 h-8" />
                                </div>
                                <h3 className="text-base sm:text-lg font-black text-white">Eye & Head Tracking Paused</h3>
                                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
                                    Position your webcam in front of your desk. Click "Start Tracking" to begin real-time focus monitoring.
                                </p>
                                <button
                                    onClick={handleStartTracking}
                                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-900/40 transition cursor-pointer active:scale-95"
                                >
                                    <Play className="w-4 h-4 fill-white" />
                                    <span>Start Tracking 👁️</span>
                                </button>
                            </div>
                        )}

                        {/* Loading Model */}
                        {isLoadingModel && (
                            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
                                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                <h4 className="text-sm font-black text-white">Loading MediaPipe AI Face Mesh...</h4>
                                <p className="text-xs text-slate-400 mt-1">Starting camera and calibrating head pitch & eye landmarks...</p>
                            </div>
                        )}

                        {/* Top-Left Live Status HUD */}
                        {isTracking && (
                            <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-md border shadow-lg ${
                                    detectionState === 'awake' 
                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60'
                                        : detectionState === 'writing'
                                        ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/60'
                                        : detectionState === 'drowsy'
                                        ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 animate-pulse'
                                        : detectionState === 'asleep'
                                        ? 'bg-red-950/90 text-red-200 border-red-500 animate-bounce'
                                        : 'bg-slate-900/80 text-slate-400 border-slate-700'
                                }`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${
                                        detectionState === 'awake' ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' :
                                        detectionState === 'writing' ? 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]' :
                                        detectionState === 'drowsy' ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' :
                                        detectionState === 'asleep' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-slate-500'
                                    }`} />
                                    <span>
                                        {detectionState === 'awake' ? 'AWAKE 🟢' :
                                         detectionState === 'writing' ? 'WRITING / NOTES ✍️' :
                                         detectionState === 'drowsy' ? 'EYES CLOSED 🟡' :
                                         detectionState === 'asleep' ? 'ASLEEP 🔴' : 'SEARCHING FACE'}
                                    </span>
                                </div>

                                {/* Timer Badge */}
                                {detectionState === 'drowsy' && (
                                    <div className="bg-amber-500/90 text-slate-950 px-2.5 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{closureDuration}s / {blinkingGracePeriod}s</span>
                                    </div>
                                )}

                                {detectionState === 'writing' && (
                                    <div className="bg-cyan-500/90 text-slate-950 px-2.5 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1">
                                        <Activity className="w-3.5 h-3.5" />
                                        <span>Still: {stillnessDuration}s / 40.0s</span>
                                    </div>
                                )}

                                {/* Face-Down Screen Glance Timer Badge */}
                                {isHeadDown && (
                                    <div className={`px-2.5 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1.5 transition-colors ${
                                        isHeadDownWarning 
                                            ? 'bg-red-500 text-white animate-pulse' 
                                            : isHeadDownCaution 
                                            ? 'bg-amber-500 text-slate-950' 
                                            : 'bg-cyan-500/90 text-slate-950'
                                    }`}>
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Screen Glance: {formatGlanceProgress(headDownDuration, headDownMaxLimit)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Head Pose Badge (Top-Center) */}
                        {isTracking && (
                            <div className="absolute top-3 inset-x-0 mx-auto w-fit z-20 hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider backdrop-blur-md border shadow-lg bg-slate-950/80 border-slate-800 text-slate-300">
                                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Face:</span>
                                <span className={isHeadDown ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                                    {isHeadDown ? `+${headPitchDeg}° Down (≥30° Notebook)` : `${headPitchDeg}° Level (<30° Screen)`}
                                </span>
                                {isHeadDown && (
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                        isHeadDownWarning
                                            ? 'bg-red-950 text-red-300 border-red-700 animate-pulse'
                                            : 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                                    }`}>
                                        {formatGlanceProgress(headDownDuration, headDownMaxLimit)}
                                    </span>
                                )}
                                {headPitchDeg < 35 && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
                                        👁️ Eye Alert Active (&lt;35°)
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Face-Down Screen Guidance HUD (Bottom Center) */}
                        {isTracking && isHeadDown && !isAlarmActive && (
                            <div className={`absolute bottom-3 inset-x-3 mx-auto max-w-sm z-20 px-3.5 py-2 rounded-2xl backdrop-blur-md border shadow-2xl flex items-center justify-between transition-all ${
                                isHeadDownWarning
                                    ? 'bg-red-950/95 border-red-500 text-red-100 animate-pulse'
                                    : 'bg-cyan-950/90 border-cyan-500/80 text-cyan-100'
                            }`}>
                                <div className="flex items-center gap-2">
                                    <Compass className={`w-4 h-4 shrink-0 ${isHeadDownWarning ? 'text-red-400 animate-spin' : 'text-cyan-400'}`} />
                                    <div>
                                        <div className="text-xs font-black">चेहरा नीचे है (Looking Down)</div>
                                        <div className="text-[10px] font-medium text-slate-300">स्क्रीन की तरफ देखें (Look at screen to reset)</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-mono font-black ${isHeadDownWarning ? 'text-red-300' : 'text-amber-300'}`}>
                                        {formatGlanceProgress(headDownDuration, headDownMaxLimit)}
                                    </div>
                                    <div className="text-[9px] text-slate-400">अलर्ट से पहले</div>
                                </div>
                            </div>
                        )}

                        {/* Alarm Overlay */}
                        {isAlarmActive && (
                            <div className="absolute inset-0 bg-red-650/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center animate-pulse">
                                <div className="text-6xl sm:text-7xl mb-2 animate-bounce">🚨</div>
                                <h2 className="text-3xl sm:text-5xl font-black text-white tracking-wider drop-shadow-md">
                                    WAKE UP!
                                </h2>
                                <p className="text-sm sm:text-base font-bold text-red-100 max-w-md mt-1 mb-6">
                                    {alarmTriggerReason || 'Drowsiness detected! Stand up, hydrate, and stretch!'}
                                </p>
                                <button 
                                    onClick={stopAlarm}
                                    className="bg-white hover:bg-slate-100 text-red-650 font-black text-base sm:text-lg px-8 py-4 rounded-2xl shadow-2xl uppercase tracking-wider transition-all transform active:scale-95 cursor-pointer flex items-center gap-3"
                                >
                                    <BellOff className="w-6 h-6" />
                                    <span>STOP ALARM (SPACEBAR)</span>
                                </button>
                                <div className="mt-4 px-4 py-2 rounded-full bg-black/60 text-amber-300 border border-amber-400/40 text-xs sm:text-sm font-black flex items-center gap-2 shadow-2xl backdrop-blur-md">
                                    <Eye className="w-4 h-4 text-amber-400 animate-pulse" />
                                    <span>✨ Just open your eyes to stop alarm automatically! (आँखें खोलते ही अलार्म बंद)</span>
                                </div>
                            </div>
                        )}

                        {/* Top Right Action Buttons */}
                        {isTracking && (
                            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                                {/* Background Resiliency Status */}
                                {isMinimizedOrHidden && (
                                    <div className="px-2.5 py-1.5 rounded-lg text-[11px] font-black backdrop-blur-md border bg-emerald-950/90 text-emerald-300 border-emerald-500 flex items-center gap-1.5 animate-pulse shadow-lg">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                        <span>Background Active ⚡</span>
                                    </div>
                                )}

                                {/* Minimize Video (Show Logo) Button */}
                                <button
                                    onClick={() => setIsUserMinimized(!isUserMinimized)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold backdrop-blur-md border transition cursor-pointer flex items-center gap-1.5 shadow-md ${
                                        isUserMinimized 
                                            ? 'bg-indigo-950/90 text-indigo-300 border-indigo-500' 
                                            : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                                    }`}
                                    title={isUserMinimized ? "Maximize Video (Show Camera Feed)" : "Minimize Video (Show Bodhak App Logo)"}
                                >
                                    {isUserMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                                    <span>{isUserMinimized ? 'Show Camera' : 'Minimize (Logo)'}</span>
                                </button>

                                {/* Floating PiP Window Button */}
                                <button
                                    onClick={togglePictureInPicture}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold backdrop-blur-md border transition cursor-pointer flex items-center gap-1.5 shadow-md ${
                                        isPiPActive 
                                            ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500' 
                                            : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                                    }`}
                                    title="Floating Camera Window (Works on top of any app/screen even when browser is minimized)"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isPiPActive ? 'Exit PiP' : 'PiP Window 📺'}</span>
                                </button>

                                {/* Contour Mesh Toggle Button */}
                                <button
                                    onClick={() => setShowMesh(!showMesh)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold backdrop-blur-md border transition cursor-pointer flex items-center gap-1.5 ${
                                        showMesh 
                                            ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60' 
                                            : 'bg-slate-900/80 text-slate-400 border-slate-700'
                                    }`}
                                    title="Toggle Wireframe Contours"
                                >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{showMesh ? 'Mesh ON' : 'Mesh OFF'}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Background Resiliency & Floating PiP Bar */}
                    {isTracking && (
                        <div className="bg-slate-900/90 border border-slate-800/90 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-md">
                            <div className="flex items-center gap-2">
                                <span className="flex h-2.5 w-2.5 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-slate-300 font-medium">
                                    <strong className="text-emerald-400 font-bold">Background Tracking Active:</strong> मिनिमाइज़ करने पर भी बैकग्राउंड वर्कर आँखें और 20s टाइमर लगातार मॉनिटर करता रहेगा।
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsUserMinimized(!isUserMinimized)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                                        isUserMinimized 
                                            ? 'bg-indigo-950 text-indigo-300 border-indigo-500' 
                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                    }`}
                                    title={isUserMinimized ? "Show Camera Feed" : "Hide Video & Show App Logo"}
                                >
                                    {isUserMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                                    <span>{isUserMinimized ? 'Restore Video' : 'Minimize Video (App Logo)'}</span>
                                </button>
                                <button
                                    onClick={togglePictureInPicture}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                                        isPiPActive 
                                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500' 
                                            : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-cyan-800/60'
                                    }`}
                                    title="Keep camera floating on top of your desktop"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>{isPiPActive ? 'Close Floating PiP' : 'Open PiP (फ़्लोटिंग विंडो)'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Bottom Primary Controls Bar */}
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-wrap items-center justify-between gap-3 shadow-xl">
                        <div className="flex items-center gap-2">
                            {!isTracking ? (
                                <button
                                    onClick={handleStartTracking}
                                    disabled={isLoadingModel}
                                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-900/40 transition cursor-pointer active:scale-95"
                                >
                                    <Play className="w-4 h-4 fill-white" />
                                    <span>Start Tracking</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleStopTracking}
                                    className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-sm flex items-center gap-2 border border-slate-700 transition cursor-pointer active:scale-95"
                                >
                                    <Square className="w-4 h-4 fill-slate-200" />
                                    <span>Stop Tracking</span>
                                </button>
                            )}

                            {isAlarmActive && (
                                <button
                                    onClick={stopAlarm}
                                    className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-red-900/50 animate-bounce transition cursor-pointer active:scale-95"
                                >
                                    <BellOff className="w-4 h-4" />
                                    <span>Stop Alarm</span>
                                </button>
                            )}
                        </div>

                        {/* Study Session Stats */}
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-indigo-400" />
                                <span>Session:</span>
                                <span className="font-black text-white text-sm">{formatTime(studySeconds)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-red-400" />
                                <span>Alerts:</span>
                                <span className="font-black text-red-400 text-sm">{totalAlerts}</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column: AI Metrics & Smart Settings */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    
                    {/* Live EAR Analysis Card */}
                    <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Eye className="w-4 h-4 text-indigo-400" />
                                <span>Eye Openness (EAR)</span>
                            </h3>
                            <span className="text-[10px] font-black text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                Cutoff: {earThreshold}
                            </span>
                        </div>

                        {/* Openness Percentage Bar */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-400">Openness Gauge:</span>
                                <span className={`font-black ${opennessPercentage > 40 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {opennessPercentage}%
                                </span>
                            </div>
                            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                                <div 
                                    className={`h-full rounded-full transition-all duration-150 ${
                                        avgEar >= earThreshold 
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                            : 'bg-gradient-to-r from-amber-500 to-red-500'
                                    }`}
                                    style={{ width: `${opennessPercentage}%` }}
                                />
                            </div>
                        </div>

                        {/* Left & Right Eye Breakdown */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Left Eye EAR</span>
                                <div className="text-base font-black text-indigo-300 mt-0.5">
                                    {isTracking ? earLeft.toFixed(2) : '--'}
                                </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Right Eye EAR</span>
                                <div className="text-base font-black text-indigo-300 mt-0.5">
                                    {isTracking ? earRight.toFixed(2) : '--'}
                                </div>
                            </div>
                        </div>

                        {/* Average EAR & Closure Countdown */}
                        <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-2xl flex items-center justify-between">
                            <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Average EAR</div>
                                <div className="text-xl font-black text-white mt-0.5">
                                    {isTracking ? avgEar.toFixed(2) : '0.00'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Closed Timer</div>
                                <div className={`text-base font-black mt-0.5 ${closureDuration > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`}>
                                    {closureDuration}s / {blinkingGracePeriod}s
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Head Angle & Micro-Motion HUD (Features 2 & 3) */}
                    <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Compass className="w-4 h-4 text-cyan-400" />
                                <span>Head Pose & Motion</span>
                            </h3>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                isHeadDown ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60' : 'bg-slate-800 text-slate-300'
                            }`}>
                                {isHeadDown ? 'Notebook Angle 📓' : 'Facing Screen 💻'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Head Pitch</span>
                                <div className={`text-sm font-black mt-0.5 ${isHeadDown ? 'text-amber-400' : 'text-cyan-400'}`}>
                                    {isTracking ? `${headPitchDeg}° ${isHeadDown ? 'Down (≥30°)' : 'Level (<30°)'}` : '--'}
                                </div>
                                {isTracking && (
                                    <div className="text-[9px] font-bold mt-1">
                                        {headPitchDeg < 35 ? (
                                            <span className="text-emerald-400 font-bold">👁️ Eye Alert Active (&lt;35°)</span>
                                        ) : (
                                            <span className="text-cyan-400 font-bold">✍️ Stillness Mode (≥35°)</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Micro-Motion</span>
                                <div className={`text-sm font-black mt-0.5 ${hasRecentMicroMotion ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {isTracking ? (hasRecentMicroMotion ? 'Active ✍️' : 'Still ⏳') : '--'}
                                </div>
                            </div>
                        </div>

                        {/* Hybrid Stillness Meter (40s Threshold) */}
                        {mode === 'writing' && (
                            <div className="bg-slate-950 border border-cyan-900/40 p-3 rounded-2xl space-y-1.5">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400">Head-Down Stillness:</span>
                                    <span className={stillnessDuration > 25 ? 'text-red-400 font-black' : 'text-cyan-300 font-black'}>
                                        {stillnessDuration}s / 40.0s
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                    <div 
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-500 to-red-500 transition-all duration-200"
                                        style={{ width: `${Math.min(100, (stillnessDuration / 40.0) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Writing notes resets this timer automatically via micro-movements.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Face-Down Alert Timeout (User Request: Can type custom time like 1min, 10min, 30min) */}
                    <div className="bg-slate-900 border border-cyan-900/60 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Compass className="w-4 h-4 text-cyan-400" />
                                <span>Face-Down Alert Timeout (चेहरा नीचे टाइमर)</span>
                            </h3>
                            <span className="text-xs font-black text-cyan-300 bg-cyan-950/90 border border-cyan-700/80 px-2.5 py-1 rounded-lg">
                                {formatDuration(headDownMaxLimit)} Alert
                            </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                            हेड पिच <strong className="text-amber-400 font-bold">30°+ नीचे</strong> होने पर ही फेस-डाउन अलर्ट टाइमर शुरू होता है। <strong className="text-emerald-400 font-bold">35° से कम</strong> नीचे होने पर आँखें बंद होने पर तुरंत आई अलर्ट (Eye Alert) मिलेगा। यदि <strong className="text-cyan-400 font-bold">{formatDuration(headDownMaxLimit)}</strong> तक स्क्रीन की तरफ एक बार भी नहीं देखा, तो अलार्म बजेगा। स्क्रीन पर देखते ही टाइमर 0s रीसेट हो जाएगा।
                        </p>

                        {/* Custom Typing Field: User can write custom time (e.g. 1m, 10m, 30m, etc.) */}
                        <div className="bg-slate-950/90 border border-cyan-900/50 p-3.5 rounded-2xl space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                    <span>✍️</span>
                                    <span>समय लिखकर सेट करें (Type Custom Time):</span>
                                </label>
                                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                                    इकाई: {headDownInputUnit === 'minutes' ? 'Min (मिनट)' : 'Sec (सेकंड)'}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        type="number"
                                        min="1"
                                        max={headDownInputUnit === 'minutes' ? 120 : 7200}
                                        step={headDownInputUnit === 'minutes' ? '0.5' : '1'}
                                        value={headDownInputValue}
                                        onChange={(e) => handleHeadDownInputChange(e.target.value)}
                                        placeholder={headDownInputUnit === 'minutes' ? "उदा. 1, 10, 30" : "उदा. 20, 45, 60"}
                                        className="w-full bg-slate-900 border border-cyan-800/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl px-3.5 py-2.5 text-white font-mono font-black text-base placeholder:text-slate-600 outline-none transition"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">
                                        {headDownInputUnit === 'minutes' ? 'min' : 'sec'}
                                    </span>
                                </div>

                                {/* Unit Switcher */}
                                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleHeadDownUnitToggle('minutes')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                                            headDownInputUnit === 'minutes'
                                                ? 'bg-cyan-600 text-white shadow-md'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                        title="Set time in minutes (मिनट में सेट करें)"
                                    >
                                        Min (मिनट)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleHeadDownUnitToggle('seconds')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                                            headDownInputUnit === 'seconds'
                                                ? 'bg-cyan-600 text-white shadow-md'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                        title="Set time in seconds (सेकंड में सेट करें)"
                                    >
                                        Sec (सेकंड)
                                    </button>
                                </div>
                            </div>

                            {/* Quick Preset Buttons */}
                            <div className="pt-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>त्वरित चयन (Quick Presets):</span>
                                    <span className="text-[9px] text-cyan-400 font-normal">क्लिक करके तुरंत लागू करें</span>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                    {[
                                        { label: '20s', secs: 20, unit: 'seconds' as const },
                                        { label: '1 Min', secs: 60, unit: 'minutes' as const },
                                        { label: '5 Min', secs: 300, unit: 'minutes' as const },
                                        { label: '10 Min', secs: 600, unit: 'minutes' as const },
                                        { label: '15 Min', secs: 900, unit: 'minutes' as const },
                                        { label: '30 Min', secs: 1800, unit: 'minutes' as const },
                                    ].map((preset) => {
                                        const isSelected = Math.abs(headDownMaxLimit - preset.secs) < 0.5;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => handleSelectPreset(preset.secs, preset.unit)}
                                                className={`py-1.5 px-2 rounded-lg text-xs font-black border transition cursor-pointer text-center ${
                                                    isSelected
                                                        ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                                                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Live Face-Down Duration Progress */}
                        <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-2xl space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-400">Face-Down Without Looking:</span>
                                <span className={`font-mono font-black ${
                                    isHeadDownWarning 
                                        ? 'text-red-400 animate-pulse' 
                                        : isHeadDownCaution 
                                        ? 'text-amber-400' 
                                        : 'text-cyan-300'
                                }`}>
                                    {isTracking && isHeadDown ? formatGlanceProgress(headDownDuration, headDownMaxLimit) : '0.0s (Facing Screen 💻)'}
                                </span>
                            </div>
                            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div 
                                    className={`h-full rounded-full transition-all duration-150 ${
                                        isHeadDownWarning
                                            ? 'bg-red-500'
                                            : isHeadDownCaution
                                            ? 'bg-amber-500'
                                            : 'bg-cyan-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (headDownDuration / headDownMaxLimit) * 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                                <span>0s (Screen)</span>
                                <span className="text-amber-400">
                                    {isHeadDown && headDownDuration > 0 
                                        ? (headDownMaxLimit - headDownDuration > 0 ? `${formatDuration(headDownMaxLimit - headDownDuration)} left before alarm` : 'ALERT ACTIVE 🚨') 
                                        : 'Glance at screen resets to 0s'}
                                </span>
                                <span>{formatDuration(headDownMaxLimit)} (Alarm)</span>
                            </div>
                        </div>
                    </div>

                    {/* Blinking Grace Period Slider (Feature 4) */}
                    <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-amber-400" />
                                <span>Blinking Grace Period</span>
                            </h3>
                            <button
                                onClick={() => {
                                    setBlinkingGracePeriod(3.0);
                                    setEarThreshold(0.21);
                                }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                            >
                                Reset 3.0s
                            </button>
                        </div>

                        {/* Grace Period Slider */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-300">Grace Delay Before Alarm:</span>
                                <span className="text-amber-400 font-black">{blinkingGracePeriod.toFixed(1)}s</span>
                            </div>
                            <input 
                                type="range" 
                                min="1.0" 
                                max="5.0" 
                                step="0.5" 
                                value={blinkingGracePeriod}
                                onChange={(e) => setBlinkingGracePeriod(parseFloat(e.target.value))}
                                className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                                <span>1.0s (Strict)</span>
                                <span>3.0s (Normal Blinks Safe)</span>
                                <span>5.0s (Relaxed)</span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-tight mt-1">
                                Natural blinks take 150–400ms. A 3.0s grace period prevents false triggers from blinking, rubbing eyes, or yawning.
                            </p>
                        </div>

                        {/* EAR Cutoff Slider */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-300">EAR Cutoff (Eye Open/Closed):</span>
                                <span className="text-indigo-400 font-black">{earThreshold.toFixed(2)}</span>
                            </div>
                            <input 
                                type="range"
                                min="0.15"
                                max="0.28"
                                step="0.01"
                                value={earThreshold}
                                onChange={(e) => setEarThreshold(parseFloat(e.target.value))}
                                className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                            />
                        </div>
                    </div>

                    {/* Alarm Sound Tone & Louder Volume Customization */}
                    <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-emerald-400" />
                                <span>Alarm Sound & Volume / ध्वनि</span>
                            </h3>
                            <button
                                onClick={() => handlePreviewTone(selectedTone)}
                                className={`text-[11px] font-black px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                                    isAudioTested 
                                        ? 'bg-red-650 text-white border-red-500 animate-pulse' 
                                        : 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/60'
                                }`}
                                title="Click to preview the selected sound"
                            >
                                <Play className="w-3 h-3 fill-current" />
                                <span>{isAudioTested ? 'Playing...' : 'Test Sound 🔊'}</span>
                            </button>
                        </div>

                        {/* Tone Selector List */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                <span>Select Alarm Sound Tone:</span>
                                <span className="text-[10px] text-emerald-400 font-black">5 Custom Tones</span>
                            </label>
                            <div className="space-y-1.5">
                                {ALARM_SOUND_PROFILES.map((profile) => {
                                    const isSelected = selectedTone === profile.id;
                                    return (
                                        <button
                                            key={profile.id}
                                            onClick={() => {
                                                setSelectedTone(profile.id);
                                                handlePreviewTone(profile.id);
                                            }}
                                            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                                isSelected 
                                                    ? 'bg-slate-800 border-emerald-500 shadow-md ring-1 ring-emerald-500/40' 
                                                    : 'bg-slate-950 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className="text-base shrink-0">{profile.icon}</span>
                                                <div className="truncate">
                                                    <div className="text-xs font-black text-white flex items-center gap-1.5">
                                                        <span>{profile.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-medium">({profile.hindiName})</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate">{profile.desc}</div>
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#10b981] ml-2" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Volume Slider with Extra Loud Super-Boost */}
                        <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between text-xs font-bold">
                                <span className="text-slate-300 flex items-center gap-1.5">
                                    <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Loudness (वॉल्यूम):</span>
                                </span>
                                <span className="text-emerald-400 font-black font-mono">
                                    {Math.round(alarmVolume * (isSuperBoost ? 145 : 100))}%
                                </span>
                            </div>
                            <input 
                                type="range"
                                min="0.4"
                                max="1.0"
                                step="0.05"
                                value={alarmVolume}
                                onChange={(e) => setAlarmVolume(parseFloat(e.target.value))}
                                className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                            />
                            
                            {/* Super-Boost Toggle */}
                            <button
                                onClick={() => setIsSuperBoost(prev => !prev)}
                                className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                                    isSuperBoost
                                        ? 'bg-gradient-to-r from-red-950/80 via-amber-950/80 to-slate-950 border-amber-500/80 text-amber-200 shadow-md shadow-amber-950/40'
                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Zap className={`w-4 h-4 ${isSuperBoost ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                                    <div className="text-left">
                                        <div className="text-xs font-black">
                                            {isSuperBoost ? '⚡ Super Loud Boost: ON (145% Power)' : 'Super Boost: OFF (Standard)'}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            Multi-harmonic compressor for deep sleep wake-up
                                        </div>
                                    </div>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    isSuperBoost ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                                }`}>
                                    {isSuperBoost ? 'MAX BOOST 💥' : 'NORMAL'}
                                </span>
                            </button>
                        </div>
                    </div>

                </div>

            </div>

            {/* Hidden HTML5 Audio Backup */}
            <audio ref={audioRef} loop preload="auto">
                <source src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" type="audio/ogg" />
            </audio>

            {/* Standalone Code Export Modal */}
            {isCodeModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        
                        {/* Modal Header */}
                        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                            <div>
                                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                    <Code2 className="w-5 h-5 text-indigo-400" />
                                    <span>Standalone Single-File Code (index.html)</span>
                                </h3>
                                <p className="text-xs text-slate-400 font-medium">
                                    Includes Dual Mode Toggle, Head Pitch detection, 40s Hybrid Sleep Check, and Grace Period Slider.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleCopyCode}
                                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer"
                                >
                                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                                </button>
                                <button 
                                    onClick={handleDownloadCode}
                                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline">Download HTML</span>
                                </button>
                                <button 
                                    onClick={() => setIsCodeModalOpen(false)}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Modal Code Viewer */}
                        <div className="flex-1 overflow-auto p-4 bg-slate-950/80 font-mono text-xs text-indigo-300 selection:bg-indigo-500 selection:text-white">
                            <pre className="whitespace-pre">{STANDALONE_HTML_CODE}</pre>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>💡 Save as <code className="text-indigo-300">anti-sleep.html</code> and double-click to run in any browser!</span>
                            <button 
                                onClick={() => setIsCodeModalOpen(false)}
                                className="font-bold text-slate-300 hover:text-white cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
});

AntiSleepAlarm.displayName = 'AntiSleepAlarm';

export default AntiSleepAlarm;
