import React, { useMemo } from 'react';
import { NoteConfig, NoteTemplate } from '../types';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';
import { 
    BookOpen, 
    Sparkles, 
    Layers, 
    ShieldCheck, 
    Target, 
    Compass, 
    Lightbulb, 
    Brain, 
    Globe, 
    Clock, 
    Star, 
    Flame, 
    Cpu 
} from 'lucide-react';
import { BodhakLogo } from './Layout';

export interface NoteTemplateRendererProps {
    note: {
        config: NoteConfig;
        content: string;
        handwrittenImageUrl?: string;
        createdAt?: number;
    };
    activeTemplate?: NoteTemplate;
    onSelectTemplate?: (template: NoteTemplate) => void;
}

export interface ParsedSection {
    id: string;
    title: string;
    iconName?: string;
    colorIndex: number;
    content: string;
    bulletPoints: string[];
    highlights: string[];
    isVocabulary?: boolean;
    isCurrentAffairs?: boolean;
    isSummary?: boolean;
}

export interface ParsedNoteData {
    title: string;
    subject: string;
    definition: string;
    sections: ParsedSection[];
    currentAffairs: string[];
    vocabulary: { word: string; meaning: string }[];
    summary: string;
    rawContent: string;
}

const GRADIENT_THEMES = [
    {
        name: 'orange',
        header: 'from-amber-500 via-orange-500 to-orange-600',
        badge: 'bg-orange-50 text-orange-700 border-orange-200',
        iconBg: 'bg-orange-500 text-white',
        border: 'border-orange-200 hover:border-orange-300',
        bullet: 'bg-orange-500',
        bulletRing: 'ring-orange-100',
        highlightBg: 'bg-orange-50/80 border-orange-200 text-orange-950',
        cardBg: 'bg-white',
        accentText: 'text-orange-600'
    },
    {
        name: 'teal',
        header: 'from-teal-500 via-emerald-500 to-teal-600',
        badge: 'bg-teal-50 text-teal-700 border-teal-200',
        iconBg: 'bg-teal-500 text-white',
        border: 'border-teal-200 hover:border-teal-300',
        bullet: 'bg-teal-500',
        bulletRing: 'ring-teal-100',
        highlightBg: 'bg-teal-50/80 border-teal-200 text-teal-950',
        cardBg: 'bg-white',
        accentText: 'text-teal-600'
    },
    {
        name: 'purple',
        header: 'from-indigo-500 via-purple-500 to-purple-600',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
        iconBg: 'bg-purple-500 text-white',
        border: 'border-purple-200 hover:border-purple-300',
        bullet: 'bg-purple-500',
        bulletRing: 'ring-purple-100',
        highlightBg: 'bg-purple-50/80 border-purple-200 text-purple-950',
        cardBg: 'bg-white',
        accentText: 'text-purple-600'
    },
    {
        name: 'emerald',
        header: 'from-emerald-500 via-green-500 to-emerald-600',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        iconBg: 'bg-emerald-500 text-white',
        border: 'border-emerald-200 hover:border-emerald-300',
        bullet: 'bg-emerald-500',
        bulletRing: 'ring-emerald-100',
        highlightBg: 'bg-emerald-50/80 border-emerald-200 text-emerald-950',
        cardBg: 'bg-white',
        accentText: 'text-emerald-600'
    },
    {
        name: 'rose',
        header: 'from-rose-500 via-pink-500 to-rose-600',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        iconBg: 'bg-rose-500 text-white',
        border: 'border-rose-200 hover:border-rose-300',
        bullet: 'bg-rose-500',
        bulletRing: 'ring-rose-100',
        highlightBg: 'bg-rose-50/80 border-rose-200 text-rose-950',
        cardBg: 'bg-white',
        accentText: 'text-rose-600'
    },
    {
        name: 'cyan',
        header: 'from-sky-500 via-blue-500 to-indigo-600',
        badge: 'bg-sky-50 text-sky-700 border-sky-200',
        iconBg: 'bg-sky-500 text-white',
        border: 'border-sky-200 hover:border-sky-300',
        bullet: 'bg-sky-500',
        bulletRing: 'ring-sky-100',
        highlightBg: 'bg-sky-50/80 border-sky-200 text-sky-950',
        cardBg: 'bg-white',
        accentText: 'text-sky-600'
    }
];

const SECTION_ICONS = [
    Sparkles, 
    Layers, 
    ShieldCheck, 
    Compass, 
    Target, 
    Lightbulb, 
    Brain, 
    Flame, 
    Star, 
    Cpu, 
    BookOpen
];

// Helper to parse markdown into structured infographic sections
export const parseNoteContent = (rawMarkdown: string, defaultSubject: string, defaultTopic: string): ParsedNoteData => {
    if (!rawMarkdown) {
        return {
            title: defaultTopic || 'Study Notes',
            subject: defaultSubject || 'General',
            definition: '',
            sections: [],
            currentAffairs: [],
            vocabulary: [],
            summary: '',
            rawContent: ''
        };
    }

    const lines = rawMarkdown.split('\n');
    let title = defaultTopic || '';
    let subject = defaultSubject || 'Study Notes';
    let definition = '';
    const sections: ParsedSection[] = [];
    const currentAffairs: string[] = [];
    const vocabulary: { word: string; meaning: string }[] = [];
    let summary = '';

    let currentSection: ParsedSection | null = null;
    let foundFirstHeading = false;
    let definitionBuffer: string[] = [];
    let isParsingDefinition = false;
    let isParsingVocab = false;
    let isParsingCA = false;
    let isParsingSummary = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Check for top H1 Title
        if (line.startsWith('# ') && !foundFirstHeading) {
            foundFirstHeading = true;
            const headingText = line.replace(/^#\s+/, '').replace(/\*\*/g, '').trim();
            if (headingText.includes(':')) {
                const parts = headingText.split(':');
                if (parts[0] && parts[1]) {
                    subject = parts[0].trim();
                    title = parts.slice(1).join(':').trim();
                } else {
                    title = headingText;
                }
            } else {
                title = headingText;
            }
            continue;
        }

        // Check for H2 or H3 section boundaries
        if (line.startsWith('## ') || line.startsWith('### ')) {
            const rawHeading = line.replace(/^#{2,3}\s+/, '').replace(/\*\*/g, '').trim();
            const lowerHeading = rawHeading.toLowerCase();

            // Save previous section if exists
            if (currentSection) {
                sections.push(currentSection);
                currentSection = null;
            }

            // Check if this is definition / overview
            if (lowerHeading.includes('definition') || lowerHeading.includes('overview') || lowerHeading.includes('introduction') || lowerHeading.includes('परिभाषा') || lowerHeading.includes('अवधारणा')) {
                isParsingDefinition = true;
                isParsingVocab = false;
                isParsingCA = false;
                isParsingSummary = false;
                continue;
            } else if (lowerHeading.includes('vocabulary') || lowerHeading.includes('शब्दावली') || lowerHeading.includes('terms') || lowerHeading.includes('glossary')) {
                isParsingVocab = true;
                isParsingDefinition = false;
                isParsingCA = false;
                isParsingSummary = false;
                continue;
            } else if (lowerHeading.includes('current affair') || lowerHeading.includes('recent') || lowerHeading.includes('समसामयिकी') || lowerHeading.includes('developments')) {
                isParsingCA = true;
                isParsingDefinition = false;
                isParsingVocab = false;
                isParsingSummary = false;
                continue;
            } else if (lowerHeading.includes('summary') || lowerHeading.includes('takeaway') || lowerHeading.includes('निष्कर्ष') || lowerHeading.includes('conclusion')) {
                isParsingSummary = true;
                isParsingDefinition = false;
                isParsingVocab = false;
                isParsingCA = false;
                continue;
            } else {
                isParsingDefinition = false;
                isParsingVocab = false;
                isParsingCA = false;
                isParsingSummary = false;

                // Clean emojis and markers from heading title
                const cleanTitle = rawHeading.replace(/^[^\w\s\u0900-\u097F\u0A00-\u0A7F]+/, '').trim();
                const colorIdx = sections.length % GRADIENT_THEMES.length;

                currentSection = {
                    id: `sec-${sections.length}-${Date.now()}`,
                    title: cleanTitle || rawHeading,
                    colorIndex: colorIdx,
                    content: '',
                    bulletPoints: [],
                    highlights: []
                };
                continue;
            }
        }

        // Process line content based on current active section/state
        if (isParsingDefinition) {
            definitionBuffer.push(line);
        } else if (isParsingVocab) {
            // Line format: e.g. "1. **Word** - Meaning" or "- Word: Meaning"
            const cleanLine = line.replace(/^(\d+[\.\)]|\-|\*)\s+/, '').trim();
            const parts = cleanLine.split(/[\:\-–—]\s+/);
            if (parts.length >= 2) {
                vocabulary.push({
                    word: parts[0].replace(/\*\*/g, '').trim(),
                    meaning: parts.slice(1).join(' - ').replace(/\*\*/g, '').trim()
                });
            } else if (cleanLine) {
                vocabulary.push({
                    word: cleanLine.replace(/\*\*/g, '').trim(),
                    meaning: ''
                });
            }
        } else if (isParsingCA) {
            const cleanLine = line.replace(/^(\d+[\.\)]|\-|\*)\s+/, '').trim();
            if (cleanLine) {
                currentAffairs.push(cleanLine);
            }
        } else if (isParsingSummary) {
            summary += (summary ? '\n' : '') + line;
        } else if (currentSection) {
            // Check if bullet point or standard paragraph
            if (line.startsWith('- ') || line.startsWith('* ') || /^\d+[\.\)]\s/.test(line)) {
                const bulletText = line.replace(/^(\-|\*|\d+[\.\)])\s+/, '').trim();
                if (bulletText.toLowerCase().includes('highlight') || bulletText.toLowerCase().includes('note:') || bulletText.toLowerCase().includes('key fact')) {
                    currentSection.highlights.push(bulletText);
                } else {
                    currentSection.bulletPoints.push(bulletText);
                }
            } else if (line.startsWith('>')) {
                currentSection.highlights.push(line.replace(/^>\s*/, '').trim());
            } else {
                // If it's a prominent sentence, add to bullet points or content
                currentSection.bulletPoints.push(line);
            }
        } else if (!currentSection && !isParsingVocab && !isParsingCA && !isParsingSummary) {
            // Text or blockquotes between # Title and the first ## heading (e.g. executive brief or intro)
            definitionBuffer.push(line);
        }
    }

    if (currentSection) {
        sections.push(currentSection);
    }

    definition = definitionBuffer.join('\n\n').trim();

    // If definition is empty but we have sections, extract first paragraph or section
    if (!definition && sections.length > 0 && sections[0].bulletPoints.length > 0) {
        definition = sections[0].bulletPoints[0];
    }

    // Fallback if no sections were parsed (e.g. flat text)
    if (sections.length === 0 && rawMarkdown) {
        const paragraphs = rawMarkdown.split('\n\n').filter(p => p.trim());
        if (paragraphs.length > 0) {
            definition = paragraphs[0];
            for (let i = 1; i < paragraphs.length; i++) {
                sections.push({
                    id: `sec-fallback-${i}`,
                    title: `Key Concept ${i}`,
                    colorIndex: (i - 1) % GRADIENT_THEMES.length,
                    content: paragraphs[i],
                    bulletPoints: [paragraphs[i]],
                    highlights: []
                });
            }
        }
    }

    return {
        title: title || defaultTopic || 'Key Topic Notes',
        subject: subject || defaultSubject || 'Study Material',
        definition,
        sections,
        currentAffairs,
        vocabulary,
        summary,
        rawContent: rawMarkdown
    };
};

export const TemplateMiniWireframe: React.FC<{ templateId: NoteTemplate; isSelected?: boolean }> = ({ templateId, isSelected }) => {
    switch (templateId) {
        case 'infographic':
            return (
                <div className="w-full h-full bg-white rounded-lg p-1.5 border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                    {/* Top frame with gradient strip */}
                    <div className="rounded bg-gradient-to-r from-orange-50 via-teal-50 to-indigo-50 border border-indigo-150 p-1">
                        <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-teal-500 to-indigo-600 rounded-full mb-1" />
                        <div className="h-1.5 w-3/4 bg-slate-800 rounded mb-0.5" />
                        <div className="h-1 w-1/2 bg-indigo-400 rounded" />
                    </div>
                    {/* Wide Definition Box */}
                    <div className="h-2 bg-slate-50 rounded border border-indigo-200/60 flex items-center px-1">
                        <div className="h-0.5 w-full bg-slate-400 rounded" />
                    </div>
                    {/* Vertically Stacked Full-Width Colourful Cards */}
                    <div className="space-y-1 my-0.5">
                        <div className="h-3 rounded bg-orange-50/90 border border-orange-200 p-0.5 flex items-center justify-between">
                            <div className="h-1 w-1/3 bg-orange-500 rounded" />
                            <div className="h-0.5 w-1/2 bg-orange-300 rounded" />
                        </div>
                        <div className="h-3 rounded bg-teal-50/90 border border-teal-200 p-0.5 flex items-center justify-between">
                            <div className="h-1 w-1/3 bg-teal-500 rounded" />
                            <div className="h-0.5 w-1/2 bg-teal-300 rounded" />
                        </div>
                        <div className="h-3 rounded bg-purple-50/90 border border-purple-200 p-0.5 flex items-center justify-between">
                            <div className="h-1 w-1/3 bg-purple-500 rounded" />
                            <div className="h-0.5 w-1/2 bg-purple-300 rounded" />
                        </div>
                    </div>
                </div>
            );
        case 'cornell':
            return (
                <div className="w-full h-full bg-white rounded-lg p-1.5 border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                    {/* Header line */}
                    <div className="border-b-2 border-indigo-600 pb-0.5">
                        <div className="h-1.5 w-3/4 bg-slate-800 rounded" />
                    </div>
                    {/* 2-Column split */}
                    <div className="grid grid-cols-5 gap-1 flex-1 py-1">
                        <div className="col-span-2 bg-slate-50 border-r border-slate-200 p-0.5 space-y-1">
                            <div className="h-1 w-4 bg-indigo-600 rounded" />
                            <div className="h-1 w-5 bg-indigo-300 rounded" />
                            <div className="h-1 w-3 bg-indigo-400 rounded" />
                        </div>
                        <div className="col-span-3 space-y-1 p-0.5">
                            <div className="h-1 w-full bg-slate-600 rounded" />
                            <div className="h-1 w-5/6 bg-slate-400 rounded" />
                            <div className="h-1 w-full bg-slate-400 rounded" />
                            <div className="h-1 w-4/5 bg-slate-400 rounded" />
                        </div>
                    </div>
                    {/* Bottom Summary */}
                    <div className="h-3 bg-indigo-50 border border-indigo-200 rounded p-0.5 flex items-center">
                        <div className="h-1 w-4/5 bg-indigo-500 rounded" />
                    </div>
                </div>
            );
        case 'cheatsheet':
            return (
                <div className="w-full h-full bg-slate-100 rounded-lg p-1.5 border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                    {/* Dark top header */}
                    <div className="bg-slate-900 rounded p-1 flex items-center justify-between">
                        <div className="h-1.5 w-1/2 bg-white rounded" />
                        <div className="h-1 w-3 bg-amber-400 rounded" />
                    </div>
                    {/* 4 bento grid cards */}
                    <div className="grid grid-cols-2 gap-1 my-1">
                        <div className="bg-white border border-slate-200 rounded p-1 space-y-1">
                            <div className="h-1 w-3 bg-indigo-500 rounded" />
                            <div className="h-0.5 w-full bg-slate-300 rounded" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded p-1 space-y-1">
                            <div className="h-1 w-3 bg-emerald-500 rounded" />
                            <div className="h-0.5 w-full bg-slate-300 rounded" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded p-1 space-y-1">
                            <div className="h-1 w-3 bg-purple-500 rounded" />
                            <div className="h-0.5 w-full bg-slate-300 rounded" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded p-1 space-y-1">
                            <div className="h-1 w-3 bg-amber-500 rounded" />
                            <div className="h-0.5 w-full bg-slate-300 rounded" />
                        </div>
                    </div>
                    <div className="h-1.5 bg-white border border-slate-200 rounded flex items-center px-1">
                        <div className="h-0.5 w-full bg-slate-400 rounded" />
                    </div>
                </div>
            );
        case 'editorial':
            return (
                <div className="w-full h-full bg-white rounded-lg p-1.5 border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                    {/* Editorial top line */}
                    <div className="border-b-2 border-slate-900 pb-0.5">
                        <div className="h-0.5 w-6 bg-slate-400 mb-0.5" />
                        <div className="h-2 w-3/4 bg-slate-900 rounded" />
                    </div>
                    {/* Quote box */}
                    <div className="bg-slate-50 border-y border-slate-300 py-1 px-1 my-1">
                        <div className="h-1 w-full bg-slate-600 rounded italic" />
                    </div>
                    {/* 2 paragraph blocks */}
                    <div className="space-y-1">
                        <div className="h-1 w-full bg-slate-400 rounded" />
                        <div className="h-1 w-5/6 bg-slate-400 rounded" />
                        <div className="h-1 w-4/6 bg-slate-400 rounded" />
                    </div>
                </div>
            );
        case 'classic':
            return (
                <div className="w-full h-full bg-white rounded-lg p-1.5 border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                    {/* Centered title */}
                    <div className="flex flex-col items-center border-b border-indigo-400 pb-1">
                        <div className="h-1.5 w-2/3 bg-slate-800 rounded" />
                        <div className="h-0.5 w-1/3 bg-indigo-400 rounded mt-0.5" />
                    </div>
                    {/* Classic document lines */}
                    <div className="space-y-1.5 py-1">
                        <div className="h-1 w-full bg-slate-400 rounded" />
                        <div className="h-1 w-11/12 bg-slate-400 rounded" />
                        <div className="flex items-center space-x-1">
                            <div className="w-1 h-1 rounded-full bg-indigo-600" />
                            <div className="h-1 w-4/5 bg-slate-500 rounded" />
                        </div>
                        <div className="flex items-center space-x-1">
                            <div className="w-1 h-1 rounded-full bg-indigo-600" />
                            <div className="h-1 w-3/4 bg-slate-500 rounded" />
                        </div>
                    </div>
                </div>
            );
        default:
            return null;
    }
};

export const TEMPLATE_OPTIONS: {
    id: NoteTemplate;
    name: string;
    shortName: string;
    hindiName: string;
    description: string;
    badge?: string;
    icon: string;
}[] = [
    {
        id: 'infographic',
        name: 'A4 Educational Infographic',
        shortName: 'Infographic',
        hindiName: 'इन्फोग्राफिक',
        description: 'Clean A4 vertical infographic with title frame, wide definition box, and colorful square cards grid on desktop.',
        badge: 'Recommended',
        icon: '🎨'
    },
    {
        id: 'cornell',
        name: 'Cornell Study Sheet',
        shortName: 'Cornell',
        hindiName: 'कॉर्नेल',
        description: '2-column layout (left cue keywords, right detailed notes, bottom summary).',
        badge: 'Exam Prep',
        icon: '📑'
    },
    {
        id: 'cheatsheet',
        name: 'Cheat Sheet Grid',
        shortName: 'Cheat Sheet',
        hindiName: 'चीट शीट',
        description: 'High-density bento grid for quick exam revision.',
        badge: 'Revision',
        icon: '⚡'
    },
    {
        id: 'editorial',
        name: 'Editorial Executive Brief',
        shortName: 'Editorial',
        hindiName: 'एडिटोरियल',
        description: 'Refined editorial typography and callouts.',
        badge: 'Formal',
        icon: '📰'
    },
    {
        id: 'classic',
        name: 'Classic Document',
        shortName: 'Classic',
        hindiName: 'क्लासिक',
        description: 'Clean linear markdown document layout with standard headings.',
        icon: '📝'
    }
];

export const NoteTemplateRenderer: React.FC<NoteTemplateRendererProps> = ({
    note,
    activeTemplate = 'infographic',
    onSelectTemplate
}) => {
    const { config, content, handwrittenImageUrl, createdAt } = note;
    const template = config.template || activeTemplate || 'infographic';

    const parsedData = useMemo(() => {
        return parseNoteContent(content, config.subject, config.topic);
    }, [content, config.subject, config.topic]);

    const formattedDate = useMemo(() => {
        const d = createdAt ? new Date(createdAt) : new Date();
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }, [createdAt]);

    // Template 1: Clean A4 Vertical Educational Infographic (With Square Desktop Cards & Smooth Scroll Animations)
    const renderInfographicTemplate = () => {
        return (
            <div className="w-full max-w-5xl mx-auto bg-white text-slate-900 shadow-2xl rounded-3xl p-6 sm:p-10 md:p-12 border border-slate-200 relative overflow-hidden font-sans">
                {/* Minimalist Flat Vector Educational Corner Accents */}
                <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-indigo-400/80 pointer-events-none rounded-tl" />
                <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-indigo-400/80 pointer-events-none rounded-tr" />
                <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-indigo-400/80 pointer-events-none rounded-bl" />
                <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-indigo-400/80 pointer-events-none rounded-br" />

                {/* Top Subtle Background Accents */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-indigo-50/60 to-transparent pointer-events-none -z-0" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-radial from-amber-50/60 to-transparent pointer-events-none -z-0" />

                {/* 1. TOP DECORATIVE FRAME FOR TITLE (Wide full-width rectangular header) */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-20px" }}
                    transition={{ duration: 0.4 }}
                    className="relative z-10 mb-8 pb-6 border-b-2 border-slate-100"
                >
                    <div className="bg-gradient-to-r from-indigo-50 via-slate-50 to-amber-50 rounded-2xl p-5 md:p-7 border-2 border-indigo-150 shadow-xs relative overflow-hidden">
                        {/* Decorative Top Accent Line */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-teal-500 to-indigo-600" />
                        
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div className="flex items-center space-x-2">
                                <span className="px-3 py-1 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider rounded-full shadow-xs">
                                    {parsedData.subject || config.subject || 'SUBJECT'}
                                </span>
                                <span className="px-2.5 py-0.5 bg-white border border-slate-250 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                                    {config.language || 'English'}
                                </span>
                            </div>
                            <div className="flex items-center space-x-2 text-slate-450 text-[11px] font-bold">
                                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                <span>{formattedDate}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600 font-extrabold tracking-wider">BODHAK STUDY SHEET</span>
                            </div>
                        </div>

                        {/* Big Topic Title */}
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                            {parsedData.title || config.topic || 'Comprehensive Topic Overview'}
                        </h1>
                    </div>
                </motion.div>

                {/* Handwritten Note (If present in Smart mode) */}
                {handwrittenImageUrl && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4 }}
                        className="mb-8 flex flex-col items-center"
                    >
                        <div className="relative group max-w-2xl w-full border-4 border-white shadow-xl rounded-2xl overflow-hidden bg-slate-50">
                            <img 
                                src={handwrittenImageUrl} 
                                alt="Handwritten Concept Map" 
                                className="w-full h-auto"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <p className="mt-2 text-[10px] font-mono uppercase tracking-[0.25em] text-slate-400 font-bold">Visual Concept Map</p>
                    </motion.div>
                )}

                {/* 2. WIDE RECTANGULAR BOX BELOW FOR DEFINITION & CORE CONCEPT (Full-width) */}
                {parsedData.definition && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-20px" }}
                        transition={{ duration: 0.4 }}
                        className="relative z-10 mb-8"
                    >
                        <div className="bg-slate-50/90 border-2 border-indigo-150/80 rounded-2xl p-5 md:p-6 shadow-xs relative overflow-hidden">
                            <div className="flex items-center space-x-2 mb-2.5">
                                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                    📌
                                </div>
                                <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-indigo-900">
                                    Core Concept & Definition / मुख्य अवधारणा
                                </h3>
                            </div>
                            <div className="text-slate-700 text-sm md:text-base leading-relaxed font-semibold">
                                <Markdown>{parsedData.definition}</Markdown>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* 3. VERTICAL FULL-WIDTH COLOURFUL SECTIONS (Upar-Neeche) WITH SCROLL ANIMATIONS */}
                <div className="space-y-6 relative z-10">
                    {parsedData.sections.map((section, idx) => {
                        const theme = GRADIENT_THEMES[section.colorIndex % GRADIENT_THEMES.length];
                        const IconComponent = SECTION_ICONS[idx % SECTION_ICONS.length];

                        return (
                            <motion.div 
                                key={section.id || idx}
                                initial={{ opacity: 0, y: 25 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-20px" }}
                                transition={{ duration: 0.4 }}
                                className={`rounded-2xl border-2 ${theme.border} ${theme.cardBg} shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between`}
                            >
                                <div>
                                    {/* Card Header with Vibrant Gradient Banner & Icon */}
                                    <div className={`bg-gradient-to-r ${theme.header} p-4 sm:px-5 py-3 text-white flex items-center justify-between`}>
                                        <div className="flex items-center space-x-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-xs border border-white/30">
                                                <IconComponent className="w-3.5 h-3.5" />
                                            </div>
                                            <h3 className="font-extrabold text-sm md:text-base tracking-tight text-white drop-shadow-xs line-clamp-1">
                                                {section.title}
                                            </h3>
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-widest bg-black/20 px-2 py-0.5 rounded-full text-white/90">
                                            0{idx + 1}
                                        </span>
                                    </div>

                                    {/* Card Body with Neat Square-Proportioned Bullet Points */}
                                    <div className="p-4 sm:p-5 space-y-3 bg-white">
                                        {section.bulletPoints.length > 0 ? (
                                            <div className="space-y-2.5">
                                                {section.bulletPoints.map((pt, ptIdx) => (
                                                    <div key={ptIdx} className="flex items-start space-x-2.5">
                                                        <div className={`mt-1.5 w-2 h-2 rounded-full ${theme.bullet} flex-shrink-0 ring-4 ${theme.bulletRing}`} />
                                                        <div className="text-slate-700 text-xs sm:text-[13.5px] leading-relaxed font-semibold flex-1">
                                                            <Markdown>{pt}</Markdown>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-slate-700 text-xs sm:text-sm leading-relaxed font-semibold">
                                                <Markdown>{section.content}</Markdown>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Highlights inside card if any */}
                                {section.highlights.length > 0 && (
                                    <div className="p-4 pt-0 bg-white">
                                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                            {section.highlights.map((hl, hlIdx) => (
                                                <div key={hlIdx} className={`p-2.5 rounded-xl border ${theme.highlightBg} text-xs font-bold flex items-start space-x-2`}>
                                                    <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                                                    <div className="flex-1 text-[11.5px] leading-snug">
                                                        <Markdown>{hl}</Markdown>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* 4. CURRENT AFFAIRS SECTION (If Included) */}
                {parsedData.currentAffairs.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 25 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-20px" }}
                        transition={{ duration: 0.45 }}
                        className="mt-8 relative z-10 rounded-2xl border-2 border-sky-300 bg-sky-50/40 p-5 md:p-6 shadow-xs"
                    >
                        <div className="flex items-center space-x-2.5 mb-4">
                            <div className="w-7 h-7 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                                <Globe className="w-4 h-4" />
                            </div>
                            <h3 className="font-black text-sm md:text-base uppercase tracking-wider text-sky-900">
                                Recent Developments & Current Affairs / समसामयिकी
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {parsedData.currentAffairs.map((ca, caIdx) => (
                                <div key={caIdx} className="flex items-start space-x-3 bg-white p-3.5 rounded-xl border border-sky-150 shadow-xs">
                                    <div className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 flex-shrink-0" />
                                    <div className="text-slate-700 text-xs sm:text-[13px] font-semibold flex-1 leading-relaxed">
                                        <Markdown>{ca}</Markdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* 5. VOCABULARY LIST SECTION (If Included) */}
                {parsedData.vocabulary.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 25 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-20px" }}
                        transition={{ duration: 0.45 }}
                        className="mt-8 relative z-10 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-5 md:p-6 shadow-xs"
                    >
                        <div className="flex items-center space-x-2.5 mb-4">
                            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                <BookOpen className="w-4 h-4" />
                            </div>
                            <h3 className="font-black text-sm md:text-base uppercase tracking-wider text-emerald-900">
                                Vocabulary & Key Terminology / महत्वपूर्ण शब्दावली
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {parsedData.vocabulary.map((vocab, vIdx) => (
                                <div key={vIdx} className="bg-white p-3 rounded-xl border border-emerald-150 shadow-xs flex flex-col justify-between">
                                    <div className="font-black text-emerald-700 text-xs sm:text-[13px]">
                                        {vocab.word}
                                    </div>
                                    {vocab.meaning && (
                                        <div className="text-slate-600 text-[11px] sm:text-xs font-semibold mt-1">
                                            {vocab.meaning}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* 6. SUMMARY / KEY TAKEAWAYS FOOTER */}
                {parsedData.summary && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-20px" }}
                        transition={{ duration: 0.4 }}
                        className="mt-8 relative z-10 rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 md:p-6"
                    >
                        <div className="flex items-center space-x-2 mb-2">
                            <Target className="w-5 h-5 text-amber-600" />
                            <h3 className="font-black text-xs md:text-sm uppercase tracking-wider text-amber-900">
                                Quick Revision Takeaways / मुख्य निष्कर्ष
                            </h3>
                        </div>
                        <div className="text-slate-800 text-xs sm:text-sm font-semibold leading-relaxed">
                            <Markdown>{parsedData.summary}</Markdown>
                        </div>
                    </motion.div>
                )}

                {/* BOTTOM BRANDING & HIGH-RES PRINT FOOTER */}
                <div className="mt-12 pt-6 border-t-2 border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-slate-400">
                    <div className="flex items-center space-x-2">
                        <div className="scale-75 -ml-2 -my-2">
                            <BodhakLogo />
                        </div>
                        <span className="text-indigo-600 font-extrabold uppercase tracking-wider">Bodhak: Smart Notes</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <span>A4 Infographic Edition</span>
                        <span>•</span>
                        <span>High-Yield Study Material</span>
                    </div>
                </div>
            </div>
        );
    };

    // Template 2: Cornell Method Dual-Column Study Sheet
    const renderCornellTemplate = () => {
        return (
            <div className="w-full max-w-4xl mx-auto bg-white text-slate-900 shadow-2xl rounded-2xl p-6 sm:p-10 border border-slate-200 font-sans">
                {/* Header Frame */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="border-b-4 border-indigo-600 pb-4 mb-6"
                >
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-2">
                        <span className="uppercase tracking-widest text-indigo-600">CORNELL METHOD STUDY SYSTEM</span>
                        <span>{formattedDate}</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{parsedData.subject}: {parsedData.title}</h1>
                </motion.div>

                {/* Definition Box */}
                {parsedData.definition && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-6 p-4 bg-slate-50 border-l-4 border-indigo-600 rounded-r-xl"
                    >
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-600 mb-1">Core Topic Foundation</h4>
                        <div className="text-sm font-semibold text-slate-700 leading-relaxed">
                            <Markdown>{parsedData.definition}</Markdown>
                        </div>
                    </motion.div>
                )}

                {/* 2-Column Cornell Layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[600px] border-b-2 border-slate-200 pb-8 mb-6">
                    {/* Left Column: Cues, Questions, Key Terms (30%) */}
                    <div className="md:col-span-4 border-r-0 md:border-r-2 md:border-slate-200 pr-0 md:pr-4 space-y-6 bg-slate-50/40 p-4 rounded-xl">
                        <div className="text-[11px] font-black text-indigo-600 uppercase tracking-widest border-b border-slate-200 pb-1">
                            Key Cues & Themes
                        </div>
                        {parsedData.sections.map((sec, idx) => (
                            <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.3, delay: idx * 0.05 }}
                                className="space-y-1"
                            >
                                <div className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                    <span>{sec.title}</span>
                                </div>
                                {sec.highlights.length > 0 && (
                                    <div className="text-[10px] text-amber-700 font-bold bg-amber-50 p-1.5 rounded border border-amber-200">
                                        💡 {sec.highlights[0]}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>

                    {/* Right Column: Detailed Notes & Explanations (70%) */}
                    <div className="md:col-span-8 space-y-6">
                        <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1">
                            Comprehensive Study Notes
                        </div>
                        {parsedData.sections.map((sec, idx) => (
                            <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, y: 15 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.35, delay: idx * 0.06 }}
                                className="space-y-2"
                            >
                                <h3 className="font-black text-sm md:text-base text-indigo-950 flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">0{idx + 1}</span>
                                    <span>{sec.title}</span>
                                </h3>
                                <div className="space-y-2 pl-2">
                                    {sec.bulletPoints.map((pt, pIdx) => (
                                        <div key={pIdx} className="flex items-start space-x-2 text-xs sm:text-sm font-semibold text-slate-700">
                                            <span className="text-indigo-500 font-bold mt-0.5">•</span>
                                            <div className="flex-1"><Markdown>{pt}</Markdown></div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom Cornell Summary */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl"
                >
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900 mb-1">Bottom Summary & Key Takeaways</h3>
                    <div className="text-xs md:text-sm font-semibold text-slate-700 leading-relaxed">
                        <Markdown>{parsedData.summary || parsedData.definition}</Markdown>
                    </div>
                </motion.div>
            </div>
        );
    };

    // Template 3: Exam Cheat Sheet Grid
    const renderCheatSheetTemplate = () => {
        return (
            <div className="w-full max-w-4xl mx-auto bg-slate-50 text-slate-900 shadow-2xl rounded-2xl p-6 sm:p-10 border border-slate-200 font-sans">
                {/* Header Banner */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 mb-6 flex justify-between items-center"
                >
                    <div>
                        <span className="px-2.5 py-1 bg-amber-400 text-slate-950 font-black text-[10px] uppercase rounded-md tracking-wider">
                            EXAM CHEAT SHEET
                        </span>
                        <h1 className="text-xl sm:text-2xl font-black mt-2 text-white">{parsedData.subject}: {parsedData.title}</h1>
                    </div>
                    <div className="text-right text-xs text-slate-300 font-bold">
                        <div>{formattedDate}</div>
                        <div className="text-amber-400 font-black">High Density Grid</div>
                    </div>
                </motion.div>

                {/* Definition Row */}
                {parsedData.definition && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-xs"
                    >
                        <div className="font-black text-xs text-indigo-600 uppercase mb-1">Concept Summary</div>
                        <div className="text-xs sm:text-sm font-semibold text-slate-700"><Markdown>{parsedData.definition}</Markdown></div>
                    </motion.div>
                )}

                {/* 2-Column Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parsedData.sections.map((sec, idx) => {
                        const theme = GRADIENT_THEMES[idx % GRADIENT_THEMES.length];
                        return (
                            <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.35, delay: (idx % 2) * 0.08 }}
                                className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-indigo-300 transition flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                                        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${theme.bullet}`} />
                                            <span>{sec.title}</span>
                                        </h3>
                                        <span className="text-[10px] text-slate-400 font-bold">#0{idx + 1}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {sec.bulletPoints.map((pt, pIdx) => (
                                            <div key={pIdx} className="text-xs font-semibold text-slate-700 flex items-start gap-2">
                                                <span className="text-slate-450 mt-0.5">•</span>
                                                <div className="flex-1"><Markdown>{pt}</Markdown></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Template 4: Editorial Executive Style
    const renderEditorialTemplate = () => {
        return (
            <div className="w-full max-w-4xl mx-auto bg-white text-slate-900 shadow-2xl rounded-2xl p-8 sm:p-12 border border-slate-200 font-serif">
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="border-b-2 border-slate-900 pb-4 mb-8 flex justify-between items-end font-sans"
                >
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">EXECUTIVE BRIEFING</div>
                        <h1 className="text-3xl sm:text-4xl font-serif font-black text-slate-950 mt-1">{parsedData.title}</h1>
                        <div className="text-xs font-bold text-slate-500 mt-1 font-sans">{parsedData.subject} • {formattedDate}</div>
                    </div>
                </motion.div>

                {parsedData.definition && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-8 p-6 bg-slate-50 border-y-2 border-slate-900 font-serif text-base sm:text-lg italic text-slate-800 leading-relaxed"
                    >
                        <Markdown>{parsedData.definition}</Markdown>
                    </motion.div>
                )}

                <div className="space-y-8 font-sans">
                    {parsedData.sections.map((sec, idx) => (
                        <motion.div 
                            key={idx} 
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                            className="space-y-3"
                        >
                            <h2 className="font-serif font-bold text-xl text-slate-950 border-b border-slate-200 pb-2 flex items-center justify-between">
                                <span>{sec.title}</span>
                                <span className="text-xs font-sans text-slate-400 font-normal">Section {idx + 1}</span>
                            </h2>
                            <div className="space-y-2 font-sans">
                                {sec.bulletPoints.map((pt, pIdx) => (
                                    <div key={pIdx} className="text-sm font-semibold text-slate-700 leading-relaxed flex items-start gap-2.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2 flex-shrink-0" />
                                        <div className="flex-1"><Markdown>{pt}</Markdown></div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    };

    // Template 5: Standard Classic Document
    const renderClassicTemplate = () => {
        return (
            <div className="w-full max-w-4xl mx-auto bg-white text-slate-800 shadow-xl rounded-2xl p-6 sm:p-10 border border-slate-200 font-sans">
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2 border-b-2 border-indigo-400 pb-4 text-center leading-snug">
                        {parsedData.subject}: {parsedData.title}
                    </h1>
                    <div className="text-center text-[10px] text-indigo-500 font-black tracking-[0.25em] mb-8 uppercase">
                        Bodhak: Smart Notes
                    </div>
                </motion.div>

                <div className="prose prose-slate prose-indigo max-w-none 
                    prose-headings:font-black prose-headings:text-slate-800
                    prose-h2:text-lg prose-h2:border-b prose-h2:pb-2
                    prose-p:text-slate-650 prose-p:leading-relaxed prose-p:text-sm md:prose-p:text-base prose-p:font-semibold
                    prose-blockquote:border-l-4 prose-blockquote:border-yellow-400 prose-blockquote:bg-yellow-50/50 prose-blockquote:p-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-slate-700
                    prose-ul:text-slate-650 prose-li:marker:text-indigo-600
                ">
                    <Markdown>{content}</Markdown>
                </div>
            </div>
        );
    };

    // Render active template
    switch (template) {
        case 'infographic':
            return renderInfographicTemplate();
        case 'cornell':
            return renderCornellTemplate();
        case 'cheatsheet':
            return renderCheatSheetTemplate();
        case 'editorial':
            return renderEditorialTemplate();
        case 'classic':
            return renderClassicTemplate();
        default:
            return renderInfographicTemplate();
    }
};

export default NoteTemplateRenderer;
