import React, { useState, useEffect } from 'react';
import { ShoppingBag, ExternalLink, Loader2, ChevronRight, BookOpen, Share2, Check, Sparkles } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { FileData } from '../types';
import { identifyTopicTags } from '../services/geminiService';

interface BookRecommendationsProps {
    topic: string;
    title?: string;
    description?: string;
}

const RELATION_MAPS: { [key: string]: string[] } = {
    polity: [
        "polity", "constitution", "pm", "parliament", "nyapalika", "judiciary", "article", "governor", 
        "president", "sansad", "samvidhan", "rajvyavastha", "lok sabha", "rajya sabha", "fundamental rights", 
        "mool adhikar", "elections", "supreme court", "high court", "panchayat", "laxmikanth", "civics", "governance"
    ],
    history: [
        "history", "itihas", "modern", "ancient", "medieval", "gandhi", "freedom struggle", "mughal", 
        "harappa", "maurya", "spectrum", "bipin chandra", "national movement", "independence", "itihasa"
    ],
    geography: [
        "geography", "bhugol", "mapping", "river", "mountain", "climate", "soil", "agriculture", 
        "monsoon", "ocean", "continent", "atlas", "gc leong", "ncert geography", "krishi"
    ],
    economy: [
        "economy", "arthvyavastha", "budget", "gdp", "inflation", "banking", "rbi", "taxation", 
        "gst", "finance", "mrunal", "ramesh singh", "economic survey", "arthik"
    ],
    science: [
        "science", "vigyan", "biology", "physics", "chemistry", "technology", "space", "health", 
        "disease", "isro", "it", "biotech", "tech"
    ],
    environment: [
        "environment", "paryavaran", "ecology", "biodiversity", "climate change", "pollution", 
        "national park", "shankar ias", "wildlife", "van"
    ],
    current: [
        "current affairs", "samayiki", "news", "weekly", "monthly", "newspaper", "current", "pt 365", "magazine"
    ]
};

export const BookRecommendations: React.FC<BookRecommendationsProps> = ({ topic, title, description }) => {
    const [books, setBooks] = useState<FileData[]>([]);
    const [loading, setLoading] = useState(false);
    const [copiedBookId, setCopiedBookId] = useState<string | null>(null);
    const [lang, setLang] = useState<'hi' | 'en'>(() => {
        const saved = localStorage.getItem('app_lang');
        return saved === 'hi' ? 'hi' : 'en';
    });

    useEffect(() => {
        const fetchRecommendedBooks = async () => {
            const rawTopic = (topic || title || description || '').trim();
            if (!rawTopic) {
                setBooks([]);
                return;
            }

            setLoading(true);
            try {
                const allBooks: FileData[] = [];
                
                // Fetch all categories (buyMaterials) first
                const buyMaterialsRef = collection(db, 'buyMaterials');
                const categoriesSnap = await getDocs(buyMaterialsRef);
                
                // Fetch books for each category in parallel
                const fetchPromises = categoriesSnap.docs.map(async (folderDoc) => {
                    const filesRef = collection(db, 'buyMaterials', folderDoc.id, 'files');
                    const q = query(filesRef, where('type', '==', 'book'));
                    const filesSnap = await getDocs(q);
                    filesSnap.forEach(doc => {
                        allBooks.push({ id: doc.id, categoryId: folderDoc.id, ...doc.data() } as unknown as FileData);
                    });
                });
                
                await Promise.all(fetchPromises);

                if (allBooks.length === 0) {
                    setBooks([]);
                    return;
                }

                // Helper to clean and split string into lowercase words/terms
                const getTerms = (str: string) => {
                    return str
                        .toLowerCase()
                        .replace(/[^\w\s\u0900-\u097F]/g, ' ') // support Hindi letters
                        .split(/\s+/)
                        .filter(w => w.length > 1);
                };

                const searchTopic = topic ? topic.trim().toLowerCase() : '';
                const searchTitle = title ? title.trim().toLowerCase() : '';
                const searchDesc = description ? description.trim().toLowerCase() : '';

                const topicsList = searchTopic 
                    ? searchTopic.split(/[,#\s/]+/).map(t => t.trim()).filter(t => t.length > 1) 
                    : [];

                const topicTerms = getTerms(searchTopic);
                const titleTerms = getTerms(searchTitle);
                const descTerms = getTerms(searchDesc);

                // Combine text terms and subject relation keywords for rich semantic coverage
                const allIdentifiedTags = Array.from(
                    new Set([...topicsList, ...topicTerms, ...titleTerms, ...descTerms])
                ).filter(t => t.length > 1);

                // Score each book STRICTLY on tag match with the identified topic
                const scoredBooks = allBooks.map(book => {
                    let score = 0;
                    let hasTagMatch = false;
                    const bookTags = (book.topicTags || []).map(t => t.toLowerCase().trim()).filter(Boolean);
                    
                    // Match against book's explicit topic tags
                    for (const tag of bookTags) {
                        // Direct match with AI identified tags or topic terms
                        for (const idTag of allIdentifiedTags) {
                            if (tag === idTag) {
                                score += 20;
                                hasTagMatch = true;
                            } else if (tag.includes(idTag) || idTag.includes(tag)) {
                                score += 12;
                                hasTagMatch = true;
                            }
                        }

                        // Subject category mapping
                        Object.entries(RELATION_MAPS).forEach(([_category, terms]) => {
                            const tagInCat = terms.some(term => term === tag || term.includes(tag) || tag.includes(term));
                            if (tagInCat) {
                                const searchInCat = allIdentifiedTags.some(idTag => 
                                    terms.some(term => term === idTag || term.includes(idTag) || idTag.includes(term))
                                );
                                if (searchInCat) {
                                    score += 15;
                                    hasTagMatch = true;
                                }
                            }
                        });
                    }

                    // Also check if book name or category name explicitly contains the identified tags
                    const bookNameLower = (book.name || '').toLowerCase();
                    const bookDescLower = (book.description || '').toLowerCase();
                    for (const idTag of allIdentifiedTags) {
                        if (bookNameLower.includes(idTag) && idTag.length > 2) {
                            score += 8;
                            hasTagMatch = true;
                        }
                        if (bookDescLower.includes(idTag) && idTag.length > 3) {
                            score += 4;
                            hasTagMatch = true;
                        }
                    }

                    return { book, score, hasTagMatch };
                });

                // STRICT FILTERING: Only include books that genuinely match the topic's tags (hasTagMatch && score > 0)
                const matched = scoredBooks
                    .filter(item => item.hasTagMatch && item.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .map(item => item.book);

                // Set ONLY strictly matched books (no fallback to unrelated books)
                setBooks(matched.slice(0, 6));
            } catch (err) {
                console.error("Error fetching recommended books:", err);
                setBooks([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendedBooks();
    }, [topic, title, description]);

    const handleShare = async (e: React.MouseEvent, book: FileData) => {
        e.preventDefault();
        e.stopPropagation();
        const shareText = `📚 *${book.name}*\n${book.url ? `🛒 Buy Link: ${book.url}` : ''}\nShared from Prep AI`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: book.name,
                    text: shareText,
                    url: book.url || window.location.href,
                });
                return;
            } catch (err) {
                // fallback to clipboard
            }
        }
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareText);
            setCopiedBookId(book.id);
            setTimeout(() => setCopiedBookId(null), 2500);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-pulse my-4">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-xs font-bold text-slate-500">
                    {lang === 'hi' ? 'आपके लिए बेहतरीन पुस्तकों की तलाश...' : 'Finding best recommended books for you...'}
                </span>
            </div>
        );
    }

    if (books.length === 0) return null;

    return (
        <div className="mt-6 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className="bg-violet-100 p-1.5 rounded-lg border border-violet-200">
                        <ShoppingBag className="w-4 h-4 text-violet-600" />
                    </div>
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">
                        {lang === 'hi' ? 'रेकमेंडेड स्टडी मटीरियल (पुस्तकें)' : 'Recommended Study Material (Books)'}
                    </h3>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-violet-600 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-100">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500"></span>
                    </span>
                    {lang === 'hi' ? 'टॉपिक मैच' : 'Topic Match'}
                </div>
            </div>

            {/* Grid layout (Phone min 2, Laptop min 4) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
                {books.map((book) => (
                    <div
                        key={book.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-violet-300 transition group relative overflow-hidden text-left"
                    >
                        <div>
                            {/* Square Book Cover */}
                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 border border-slate-100 relative shrink-0 mb-2.5">
                                {book.fileData ? (
                                    <img 
                                        src={book.fileData} 
                                        alt={book.name} 
                                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-violet-50 flex flex-col items-center justify-center text-violet-500">
                                        <BookOpen className="w-7 h-7 mb-1" />
                                        <span className="text-[9px] font-black uppercase">Book</span>
                                    </div>
                                )}
                            </div>

                            <h4 className="font-black text-slate-900 text-xs leading-snug line-clamp-2 min-h-[2.25rem]">
                                {book.name}
                            </h4>
                        </div>

                        {/* Action buttons (Share & Buy) */}
                        <div className="flex items-center justify-between gap-1.5 mt-3 pt-2 border-t border-slate-100">
                            {book.url ? (
                                <a 
                                    href={book.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-[10px] sm:text-xs rounded-xl transition shadow-xs flex items-center gap-1 cursor-pointer"
                                >
                                    <span>{lang === 'hi' ? 'खरीदें 🛒' : 'Buy 🛒'}</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            ) : (
                                <span className="text-[9px] text-slate-400 font-bold uppercase">
                                    {lang === 'hi' ? 'पुस्तक' : 'Book'}
                                </span>
                            )}

                            <button
                                onClick={(e) => handleShare(e, book)}
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl transition active:scale-95 flex items-center gap-1 text-[10px] font-extrabold cursor-pointer shrink-0"
                                title={lang === 'hi' ? 'शेयर करें' : 'Share Book'}
                            >
                                {copiedBookId === book.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{copiedBookId === book.id ? (lang === 'hi' ? 'कॉपी!' : 'Copied!') : (lang === 'hi' ? 'शेयर' : 'Share')}</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-[9px] text-slate-400 font-bold mt-2.5 px-1 italic">
                {lang === 'hi' 
                    ? '* यह पुस्तकें आपके वर्तमान अध्ययन विषय के आधार पर सुझाई गई हैं।' 
                    : '* These recommended books are matched with your study topic.'}
            </p>
        </div>
    );
};

