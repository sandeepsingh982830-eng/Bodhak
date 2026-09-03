import React, { useState, useEffect } from 'react';
import { 
    Key, 
    Plus, 
    Trash2, 
    CheckCircle, 
    AlertCircle, 
    RefreshCw, 
    Copy, 
    Eye, 
    EyeOff, 
    Play, 
    Zap, 
    Layers, 
    Check, 
    Sparkles, 
    ExternalLink, 
    FileText, 
    Clock, 
    Sliders,
    Activity,
    Upload
} from 'lucide-react';
import { GeminiKeyConfig, GeminiWorkType } from '../types';
import { 
    WORK_TYPE_METADATA, 
    fetchConfiguredGeminiKeys, 
    saveConfiguredGeminiKeys, 
    testSingleGeminiKey 
} from '../services/geminiKeyManagerService';

interface ManagerGeminiKeysProps {
    onBack?: () => void;
}

export const ManagerGeminiKeys: React.FC<ManagerGeminiKeysProps> = () => {
    const [keys, setKeys] = useState<GeminiKeyConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filterWorkType, setFilterWorkType] = useState<string>('all_filter');
    const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);
    
    // Testing state
    const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, {
        valid: boolean;
        latencyMs?: number;
        model?: string;
        error?: string;
        isQuota?: boolean;
    }>>({});
    const [isTestingAll, setIsTestingAll] = useState(false);

    // Modal state for Add Key
    const [showAddModal, setShowAddModal] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newWorkType, setNewWorkType] = useState<GeminiWorkType>('all');
    const [newIsActive, setNewIsActive] = useState(true);
    const [addModalTesting, setAddModalTesting] = useState(false);
    const [addModalTestResult, setAddModalTestResult] = useState<{ valid: boolean; latencyMs?: number; error?: string } | null>(null);

    // Batch Import Modal
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [batchInput, setBatchInput] = useState('');
    const [batchWorkType, setBatchWorkType] = useState<GeminiWorkType>('all');

    // Confirm Delete
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Notifications
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 5000);
    };

    const loadKeys = async () => {
        setLoading(true);
        try {
            const data = await fetchConfiguredGeminiKeys();
            setKeys(data);
        } catch (e: any) {
            showNotification('error', 'Failed to load Gemini API keys.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadKeys();
    }, []);

    const handleToggleVisibility = (id: string) => {
        setVisibleKeyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleToggleActive = async (id: string) => {
        const updated = keys.map(k => k.id === id ? { ...k, isActive: !k.isActive } : k);
        setKeys(updated);
        await saveConfiguredGeminiKeys(updated);
        showNotification('success', 'Key status updated.');
    };

    const handleChangeWorkType = async (id: string, newType: GeminiWorkType) => {
        const updated = keys.map(k => k.id === id ? { ...k, workType: newType } : k);
        setKeys(updated);
        await saveConfiguredGeminiKeys(updated);
        showNotification('success', `Assigned key to: ${WORK_TYPE_METADATA[newType].labelHi}`);
    };

    const handleDeleteKey = async (id: string) => {
        const updated = keys.filter(k => k.id !== id);
        setKeys(updated);
        setConfirmDeleteId(null);
        await saveConfiguredGeminiKeys(updated);
        showNotification('success', 'Gemini API Key removed.');
    };

    const handleTestKey = async (item: GeminiKeyConfig) => {
        setTestingKeyId(item.id);
        try {
            const res = await testSingleGeminiKey(item.key);
            setTestResults(prev => ({
                ...prev,
                [item.id]: {
                    valid: !!res.valid,
                    latencyMs: res.latencyMs,
                    model: res.model,
                    error: res.error,
                    isQuota: res.isQuota
                }
            }));
            if (res.valid) {
                const modelInfo = res.model ? ` (${res.model})` : '';
                const noteInfo = res.note ? ` • ${res.note}` : '';
                showNotification('success', `Key is working${modelInfo}! Response time: ${res.latencyMs}ms${noteInfo}`);
            } else {
                showNotification('error', `Key test: ${res.error || 'Test unverified'}`);
            }
        } catch (e: any) {
            setTestResults(prev => ({
                ...prev,
                [item.id]: { valid: false, error: e?.message || 'Failed' }
            }));
        } finally {
            setTestingKeyId(null);
        }
    };

    const handleTestAllKeys = async () => {
        const activeList = keys.filter(k => k.isActive);
        if (activeList.length === 0) {
            showNotification('error', 'No active keys to test.');
            return;
        }
        setIsTestingAll(true);
        let successCount = 0;
        for (const item of activeList) {
            try {
                const res = await testSingleGeminiKey(item.key);
                setTestResults(prev => ({
                    ...prev,
                    [item.id]: {
                        valid: !!res.valid,
                        latencyMs: res.latencyMs,
                        model: res.model,
                        error: res.error,
                        isQuota: res.isQuota
                    }
                }));
                if (res.valid) successCount++;
            } catch (e: any) {
                setTestResults(prev => ({
                    ...prev,
                    [item.id]: { valid: false, error: e?.message }
                }));
            }
        }
        setIsTestingAll(false);
        showNotification('success', `Tested ${activeList.length} keys: ${successCount} verified working.`);
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newKey.trim();
        if (!trimmed) {
            showNotification('error', 'Please enter a valid API key.');
            return;
        }

        setSaving(true);
        const newRecord: GeminiKeyConfig = {
            id: `key_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            key: trimmed,
            label: newLabel.trim() || `Gemini Key (${WORK_TYPE_METADATA[newWorkType].labelEn})`,
            workType: newWorkType,
            isActive: newIsActive,
            createdAt: Date.now(),
            status: 'active'
        };

        const updated = [...keys, newRecord];
        setKeys(updated);
        await saveConfiguredGeminiKeys(updated);
        setSaving(false);

        // Reset and close
        setNewKey('');
        setNewLabel('');
        setNewWorkType('all');
        setAddModalTestResult(null);
        setShowAddModal(false);
        showNotification('success', 'New Gemini API Key added and synced successfully!');
    };

    const handleTestAddKey = async () => {
        const trimmed = newKey.trim();
        if (!trimmed) {
            showNotification('error', 'Please enter an API key first.');
            return;
        }
        setAddModalTesting(true);
        setAddModalTestResult(null);
        try {
            const res = await testSingleGeminiKey(trimmed);
            setAddModalTestResult({
                valid: !!res.valid,
                latencyMs: res.latencyMs,
                error: res.error
            });
        } catch (e: any) {
            setAddModalTestResult({ valid: false, error: e?.message });
        } finally {
            setAddModalTesting(false);
        }
    };

    const handleBatchImport = async (e: React.FormEvent) => {
        e.preventDefault();
        const lines = batchInput.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 15);
        if (lines.length === 0) {
            showNotification('error', 'No valid API keys found in the pasted text.');
            return;
        }

        setSaving(true);
        const newRecords: GeminiKeyConfig[] = lines.map((k, idx) => ({
            id: `key_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
            key: k,
            label: `Batch Key ${keys.length + idx + 1} (${WORK_TYPE_METADATA[batchWorkType].labelEn})`,
            workType: batchWorkType,
            isActive: true,
            createdAt: Date.now(),
            status: 'active'
        }));

        const updated = [...keys, ...newRecords];
        setKeys(updated);
        await saveConfiguredGeminiKeys(updated);
        setSaving(false);
        setBatchInput('');
        setShowBatchModal(false);
        showNotification('success', `Successfully imported ${newRecords.length} Gemini API keys!`);
    };

    // Filter keys
    const filteredKeys = keys.filter(k => {
        if (filterWorkType === 'all_filter') return true;
        return k.workType === filterWorkType;
    });

    const activeCount = keys.filter(k => k.isActive).length;
    const totalCount = keys.length;

    // Group counts
    const workTypeCounts: Record<string, number> = {};
    keys.forEach(k => {
        if (k.isActive) {
            workTypeCounts[k.workType] = (workTypeCounts[k.workType] || 0) + 1;
        }
    });

    return (
        <div className="space-y-6 max-w-5xl text-left bg-transparent">
            {/* Top Notification Toast */}
            {feedback && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-black shadow-md animate-in slide-in-from-top-2 ${
                    feedback.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                    {feedback.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                    <span>{feedback.message}</span>
                </div>
            )}

            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative z-10 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black tracking-widest uppercase border border-indigo-400/30">
                                <Key className="w-3.5 h-3.5" />
                                <span>Multi-Key AI Routing & Failover System</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2.5">
                                <span>Gemini API Keys Management / जेमिनी एपीआई की प्रबंधन 🔑</span>
                            </h3>
                            <p className="text-slate-300 text-xs font-medium leading-relaxed max-w-2xl">
                                यहाँ आप अपनी जेमिनी API Keys जोड़ सकते हैं और तय कर सकते हैं कि कौन सी Key किस कार्य (Quiz, Current Affairs, Notes, AnsChak, PYQ या All Work) के लिए इस्तेमाल होगी। पब्लिश करने पर ऐप बिना किसी रुकावट के चलेगी।
                            </p>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>+ Add New Key</span>
                            </button>
                            <button
                                onClick={() => setShowBatchModal(true)}
                                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-extrabold rounded-2xl border border-white/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Batch Import</span>
                            </button>
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl">
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">Active Keys</span>
                            <div className="text-2xl font-black text-emerald-400 mt-0.5 flex items-center gap-1.5">
                                <span>{activeCount}</span>
                                <span className="text-xs font-semibold text-slate-400">/ {totalCount} total</span>
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl">
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">Global (All Work)</span>
                            <div className="text-2xl font-black text-indigo-300 mt-0.5">
                                {workTypeCounts['all'] || 0}
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl">
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">Feature Dedicated</span>
                            <div className="text-2xl font-black text-amber-300 mt-0.5">
                                {Object.entries(workTypeCounts).filter(([k]) => k !== 'all').reduce((acc, [, c]) => acc + c, 0)}
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl flex flex-col justify-between">
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider block">System Status</span>
                            <div className="flex items-center gap-2 mt-1">
                                {activeCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-black">
                                        <Check className="w-3 h-3" /> Ready / चालू
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-black">
                                        <AlertCircle className="w-3 h-3" /> Add Key / की जोड़ें
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Helper Info Card */}
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold">
                        💡
                    </div>
                    <div>
                        <p className="font-extrabold text-slate-800">
                            Get Free Gemini API Keys from Google AI Studio / मुफ्त जेमिनी की प्राप्त करें:
                        </p>
                        <p className="text-slate-600 text-[11px] mt-0.5">
                            आप Google AI Studio से फ्री में अनलिमिटेड API Keys बना सकते हैं। अलग-अलग फीचर्स (Quiz, CA, Notes, AnsChak) के लिए अलग Keys सेट करने से 429 Rate Limit का सामना नहीं करना पड़ता।
                        </p>
                    </div>
                </div>
                <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-indigo-700 font-black rounded-xl border border-indigo-200 hover:bg-indigo-50 shadow-sm shrink-0 transition text-xs"
                >
                    <span>Get Free Key</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>

            {/* Controls & Category Filter */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                            Filter by Work Assignment / कार्य के अनुसार देखें:
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleTestAllKeys}
                            disabled={isTestingAll || activeCount === 0}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                            <Play className={`w-3 h-3 text-indigo-600 ${isTestingAll ? 'animate-spin' : ''}`} />
                            <span>{isTestingAll ? 'Testing All...' : 'Test All Active Keys'}</span>
                        </button>
                        <button
                            onClick={loadKeys}
                            disabled={loading}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition disabled:opacity-50 cursor-pointer"
                            title="Refresh Keys"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Work Type Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                        onClick={() => setFilterWorkType('all_filter')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition whitespace-nowrap cursor-pointer ${
                            filterWorkType === 'all_filter'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Show All ({keys.length})
                    </button>
                    {(Object.keys(WORK_TYPE_METADATA) as GeminiWorkType[]).map(typeKey => {
                        const meta = WORK_TYPE_METADATA[typeKey];
                        const count = keys.filter(k => k.workType === typeKey).length;
                        return (
                            <button
                                key={typeKey}
                                onClick={() => setFilterWorkType(typeKey)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                    filterWorkType === typeKey
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <span>{meta.icon}</span>
                                <span>{meta.labelEn.split('/')[0].trim()}</span>
                                <span className="text-[10px] opacity-75 font-mono">({count})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Keys List */}
            {loading ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="text-xs font-bold">Loading configured API keys...</span>
                </div>
            ) : filteredKeys.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto text-2xl shadow-inner">
                        🔑
                    </div>
                    <div className="space-y-1 max-w-md mx-auto">
                        <h4 className="text-base font-black text-slate-800">
                            {filterWorkType === 'all_filter' ? 'No Gemini API Keys Configured' : 'No Keys in this Category'}
                        </h4>
                        <p className="text-slate-500 text-xs font-medium leading-relaxed">
                            {filterWorkType === 'all_filter'
                                ? 'Add your first Gemini API Key to enable AI question generation, current affairs, answer checking, and notes across the app.'
                                : 'There are no active keys specifically assigned to this category. You can add one or assign an existing key.'}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            if (filterWorkType !== 'all_filter') {
                                setNewWorkType(filterWorkType as GeminiWorkType);
                            }
                            setShowAddModal(true);
                        }}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-2xl shadow-md transition cursor-pointer"
                    >
                        + Add Gemini API Key Now
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredKeys.map((item, index) => {
                        const meta = WORK_TYPE_METADATA[item.workType] || WORK_TYPE_METADATA.all;
                        const isVisible = visibleKeyIds.has(item.id);
                        const isCopied = copiedId === item.id;
                        const testState = testResults[item.id];
                        const isTesting = testingKeyId === item.id;

                        // Mask key
                        const masked = isVisible 
                            ? item.key 
                            : `${item.key.slice(0, 7)}${'•'.repeat(Math.max(item.key.length - 11, 10))}${item.key.slice(-4)}`;

                        return (
                            <div 
                                key={item.id}
                                className={`bg-white border rounded-3xl p-5 shadow-sm transition-all duration-200 ${
                                    item.isActive 
                                        ? 'border-slate-200/90 hover:border-indigo-300' 
                                        : 'border-slate-200/50 bg-slate-50/50 opacity-70'
                                }`}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    {/* Left: Info, Label, Key */}
                                    <div className="space-y-2.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-mono text-xs font-black flex items-center justify-center">
                                                {index + 1}
                                            </span>
                                            <h4 className="text-sm font-black text-slate-800 tracking-tight truncate">
                                                {item.label}
                                            </h4>

                                            {/* Work Type Badge */}
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border ${meta.color}`}>
                                                <span>{meta.icon}</span>
                                                <span>{meta.labelHi}</span>
                                            </span>

                                            {/* Status Badge */}
                                            {item.isActive ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black">
                                                    Disabled
                                                </span>
                                            )}

                                            {/* Live Test Result Badge */}
                                            {testState && (
                                                testState.valid ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-extrabold border border-emerald-200">
                                                        <Check className="w-3 h-3 text-emerald-600" />
                                                        Verified ({testState.latencyMs}ms)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-800 rounded-lg text-[10px] font-extrabold border border-rose-200" title={testState.error}>
                                                        <AlertCircle className="w-3 h-3 text-rose-600" />
                                                        {testState.isQuota ? 'Quota Limit (429)' : 'Test Failed'}
                                                    </span>
                                                )
                                            )}
                                        </div>

                                        {/* Key Display Bar */}
                                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2 text-xs font-mono text-slate-700">
                                            <Key className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate select-all font-semibold flex-1">
                                                {masked}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleVisibility(item.id)}
                                                className="p-1 text-slate-400 hover:text-slate-700 transition"
                                                title={isVisible ? 'Hide Key' : 'Show Key'}
                                            >
                                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(item.id, item.key)}
                                                className="p-1 text-slate-400 hover:text-indigo-600 transition"
                                                title="Copy Key"
                                            >
                                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>

                                        {/* Metadata and stats footer */}
                                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 pl-1">
                                            <span>Added: {new Date(item.createdAt).toLocaleDateString()}</span>
                                            {item.usageCount !== undefined && item.usageCount > 0 && (
                                                <span className="text-indigo-600">Calls Handled: {item.usageCount}</span>
                                            )}
                                            {item.lastUsedAt && (
                                                <span>Last Used: {new Date(item.lastUsedAt).toLocaleTimeString()}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Controls (Category Dropdown, Test, Toggle, Delete) */}
                                    <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                                        {/* Quick Category Select */}
                                        <div className="relative">
                                            <select
                                                value={item.workType}
                                                onChange={(e) => handleChangeWorkType(item.id, e.target.value as GeminiWorkType)}
                                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl px-3 py-2 border border-slate-200 outline-none transition cursor-pointer appearance-none pr-7"
                                                title="Change Work Assignment"
                                            >
                                                {(Object.keys(WORK_TYPE_METADATA) as GeminiWorkType[]).map(typeKey => (
                                                    <option key={typeKey} value={typeKey}>
                                                        {WORK_TYPE_METADATA[typeKey].icon} {WORK_TYPE_METADATA[typeKey].labelEn}
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                                                ▼
                                            </span>
                                        </div>

                                        {/* Test Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleTestKey(item)}
                                            disabled={isTesting}
                                            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl border border-indigo-200 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                            title="Test this API Key"
                                        >
                                            <Zap className={`w-3.5 h-3.5 text-indigo-600 ${isTesting ? 'animate-spin' : ''}`} />
                                            <span>{isTesting ? 'Testing...' : 'Test'}</span>
                                        </button>

                                        {/* Active Switch */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleActive(item.id)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                item.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                                            }`}
                                            title={item.isActive ? 'Disable Key' : 'Enable Key'}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    item.isActive ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>

                                        {/* Delete Button */}
                                        {confirmDeleteId === item.id ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteKey(item.id)}
                                                    className="px-2.5 py-1.5 bg-rose-600 text-white rounded-xl text-[10px] font-black transition active:scale-95"
                                                >
                                                    Confirm Delete
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteId(item.id)}
                                                className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                                                title="Delete Key"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Key Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 text-left">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                                    <Key className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800">Add New Gemini API Key</h3>
                                    <p className="text-slate-400 text-xs font-semibold">नई जेमिनी एपीआई की जोड़ें</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setAddModalTestResult(null);
                                }}
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleAddKey} className="space-y-4">
                            {/* API Key Input */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                    Gemini API Key (AIzaSy...) <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={newKey}
                                        onChange={(e) => {
                                            setNewKey(e.target.value);
                                            setAddModalTestResult(null);
                                        }}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleTestAddKey}
                                        disabled={addModalTesting || !newKey.trim()}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[11px] font-black transition disabled:opacity-40"
                                    >
                                        {addModalTesting ? 'Testing...' : 'Test Key'}
                                    </button>
                                </div>

                                {addModalTestResult && (
                                    <div className={`p-2.5 rounded-xl text-xs font-bold mt-1.5 flex items-center gap-2 ${
                                        addModalTestResult.valid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                                    }`}>
                                        {addModalTestResult.valid ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                                        <span>
                                            {addModalTestResult.valid 
                                                ? `Key Verified! Latency: ${addModalTestResult.latencyMs}ms` 
                                                : `Test Failed: ${addModalTestResult.error || 'Invalid Key'}`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Label */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                    Key Label / नाम (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="e.g. Daily Current Affairs Key, Backup Quiz Key"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition"
                                />
                            </div>

                            {/* Work Category */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                    Designated Work / कार्य का चयन करें:
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(Object.keys(WORK_TYPE_METADATA) as GeminiWorkType[]).map((typeKey) => {
                                        const meta = WORK_TYPE_METADATA[typeKey];
                                        const isSelected = newWorkType === typeKey;
                                        return (
                                            <button
                                                type="button"
                                                key={typeKey}
                                                onClick={() => setNewWorkType(typeKey)}
                                                className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 ${
                                                    isSelected 
                                                        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm' 
                                                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="text-lg">{meta.icon}</span>
                                                <div>
                                                    <p className={`text-xs font-extrabold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                        {meta.labelEn}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                        {meta.labelHi}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                                <div>
                                    <span className="text-xs font-black text-slate-800 block">Enable Key Immediately</span>
                                    <span className="text-[10px] text-slate-400 font-semibold">की को तुरंत सक्रिय रखें</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setNewIsActive(!newIsActive)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                        newIsActive ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            newIsActive ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl text-xs transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !newKey.trim()}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-lg shadow-indigo-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    <span>Save & Activate Key</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Batch Import Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 text-left">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                                    <Upload className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800">Batch Import Gemini Keys</h3>
                                    <p className="text-slate-400 text-xs font-semibold">एक साथ कई API Keys जोड़ें</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowBatchModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleBatchImport} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                    Paste API Keys (One per line or comma-separated)
                                </label>
                                <textarea
                                    rows={5}
                                    required
                                    value={batchInput}
                                    onChange={(e) => setBatchInput(e.target.value)}
                                    placeholder={`AIzaSyA...\nAIzaSyB...\nAIzaSyC...`}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition"
                                />
                                <p className="text-[10px] text-slate-400 font-bold ml-1">
                                    Lines starting with AIza will be automatically recognized and imported.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                    Default Work Assignment for Imported Keys:
                                </label>
                                <select
                                    value={batchWorkType}
                                    onChange={(e) => setBatchWorkType(e.target.value as GeminiWorkType)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-100 outline-none transition cursor-pointer"
                                >
                                    {(Object.keys(WORK_TYPE_METADATA) as GeminiWorkType[]).map(typeKey => (
                                        <option key={typeKey} value={typeKey}>
                                            {WORK_TYPE_METADATA[typeKey].icon} {WORK_TYPE_METADATA[typeKey].labelEn} ({WORK_TYPE_METADATA[typeKey].labelHi})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBatchModal(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl text-xs transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !batchInput.trim()}
                                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl text-xs shadow-lg shadow-purple-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    <span>Import All Keys</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManagerGeminiKeys;
