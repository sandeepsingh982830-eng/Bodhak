import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export type CategoryType = 'quiz' | 'notes' | 'ans_chak' | 'ca' | 'pyq' | 'chat' | 'ocr' | 'other';

export interface GeminiKeyRecord {
    id: string;
    key: string;
    label: string;
    workType: 'all' | 'quiz' | 'notes' | 'ans_chak' | 'ca' | 'pyq' | 'chat' | 'ocr';
    isActive: boolean;
    createdAt: number;
    lastUsedAt?: number;
    usageCount?: number;
    status?: 'active' | 'quota_exhausted' | 'invalid' | 'unknown';
}

const GEMINI_KEYS_CONFIG_FILE = path.join(process.cwd(), 'gemini_keys_config.json');

const loadManagerKeysFromFile = (): GeminiKeyRecord[] => {
    try {
        if (fs.existsSync(GEMINI_KEYS_CONFIG_FILE)) {
            const raw = fs.readFileSync(GEMINI_KEYS_CONFIG_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
                return data;
            }
        }
    } catch (e) {
        console.warn("[Gemini Keys] Error loading keys from file:", e);
    }
    return [];
};

const saveManagerKeysToFile = (keys: GeminiKeyRecord[]) => {
    try {
        fs.writeFileSync(GEMINI_KEYS_CONFIG_FILE, JSON.stringify(keys, null, 2), 'utf-8');
    } catch (e) {
        console.warn("[Gemini Keys] Error saving keys to file:", e);
    }
};

// In-memory manager keys storage
let managerGeminiKeys: GeminiKeyRecord[] = loadManagerKeysFromFile();

// Helper to gather all valid Gemini API keys from environment
const getActiveEnvGeminiKeys = (): string[] => {
    const keys: string[] = [];

    const addKey = (k?: string) => {
        if (!k) return;
        const trimmed = k.trim();
        if (trimmed && (trimmed.startsWith('AIza') || trimmed.length > 20) && !trimmed.startsWith('gsk_') && !trimmed.startsWith('cohere_') && !trimmed.startsWith('sk-') && !keys.includes(trimmed)) {
            keys.push(trimmed);
        }
    };

    if (process.env.GEMINI_API_KEY) {
        addKey(process.env.GEMINI_API_KEY);
    }
    if (process.env.API_KEY) {
        process.env.API_KEY.split(",").forEach(addKey);
    }
    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(",").forEach(addKey);
    }

    return keys;
};

const invalidKeys = new Set<string>();
const categoryIndices: Record<string, number> = {};

/**
 * Gets candidate Gemini keys for a specific category/work type with intelligent fallback:
 * 1. Category-specific Manager keys (e.g. 'quiz', 'ca', 'notes', 'ans_chak', 'pyq')
 * 2. 'All Work' / Global Manager keys
 * 3. Environment variable keys (process.env.GEMINI_API_KEY, etc.)
 */
function getCandidateKeysForCategory(category: CategoryType = 'other'): Array<{ key: string; source: string; record?: GeminiKeyRecord }> {
    const candidates: Array<{ key: string; source: string; record?: GeminiKeyRecord }> = [];
    const seenKeys = new Set<string>();

    const addCandidate = (k: string, src: string, record?: GeminiKeyRecord) => {
        const clean = k.trim();
        if (!clean || invalidKeys.has(clean) || seenKeys.has(clean)) return;
        seenKeys.add(clean);
        candidates.push({ key: clean, source: src, record });
    };

    // 1. Specific workType Manager keys
    if (category !== 'other') {
        const specificManagerKeys = managerGeminiKeys.filter(k => k.isActive && k.workType === category);
        for (const k of specificManagerKeys) {
            addCandidate(k.key, `Manager (${category})`, k);
        }
    }

    // 2. Global / 'all' workType Manager keys
    const globalManagerKeys = managerGeminiKeys.filter(k => k.isActive && (k.workType === 'all' || !k.workType));
    for (const k of globalManagerKeys) {
        addCandidate(k.key, 'Manager (All Work)', k);
    }

    // 3. Environment keys
    const envKeys = getActiveEnvGeminiKeys();
    for (const k of envKeys) {
        addCandidate(k, 'Environment Variable');
    }

    return candidates;
}

function getNextGeminiClient(category: CategoryType = 'other'): { ai: GoogleGenAI; key: string; candidate: { key: string; source: string; record?: GeminiKeyRecord } } {
    const candidates = getCandidateKeysForCategory(category);
    
    if (candidates.length === 0) {
        // Check if any keys are configured in manager or env even if disabled/invalid
        const totalConfigured = managerGeminiKeys.length + getActiveEnvGeminiKeys().length;
        if (totalConfigured === 0) {
            throw new Error("No Gemini API key configured. Please add your Gemini API Key in Manager Portal > 'GEMINI API KEYS' (मैनेजर पोर्टल में जाकर अपनी API Key जोड़ें).");
        }
        
        // If all filtered out as invalid, try resetting invalid pool once
        if (invalidKeys.size > 0 && totalConfigured > 0) {
            console.warn("[Gemini Auth] Resetting invalid keys filter to re-attempt configured keys...");
            invalidKeys.clear();
            const recheck = getCandidateKeysForCategory(category);
            if (recheck.length > 0) {
                return {
                    ai: new GoogleGenAI({ apiKey: recheck[0].key, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } }),
                    key: recheck[0].key,
                    candidate: recheck[0]
                };
            }
        }

        throw new Error("All configured Gemini API keys are currently rate-limited or invalid. Please add a fresh API key in Manager Portal > 'GEMINI API KEYS'.");
    }

    const catKey = category || 'other';
    const currentIndex = categoryIndices[catKey] || 0;
    const selectedIndex = currentIndex % candidates.length;
    categoryIndices[catKey] = selectedIndex + 1;

    const candidate = candidates[selectedIndex];

    return {
        ai: new GoogleGenAI({
            apiKey: candidate.key,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        }),
        key: candidate.key,
        candidate
    };
}

/**
 * Executes an AI request with intelligent key rotation, rate limit (429) backoff, and model failover.
 */
async function callGeminiWithRotation<T>(
    operation: (ai: GoogleGenAI, attemptModel?: string) => Promise<T>,
    category: CategoryType = 'other'
): Promise<T> {
    const candidates = getCandidateKeysForCategory(category);
    const totalKeys = Math.max(candidates.length, 1);
    const maxAttempts = Math.min(Math.max(totalKeys * 3, 4), 12);
    let attempts = 0;

    // Fallback model list if the requested model hits rate limit or quota
    const fallbackModels = [undefined, "gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

    while (attempts < maxAttempts) {
        attempts++;
        const { ai, key, candidate } = getNextGeminiClient(category);
        const currentModel = attempts > 1 ? fallbackModels[attempts % fallbackModels.length] : undefined;

        try {
            const result = await operation(ai, currentModel);
            
            // Mark usage if it's a manager key
            if (candidate.record) {
                candidate.record.lastUsedAt = Date.now();
                candidate.record.usageCount = (candidate.record.usageCount || 0) + 1;
                candidate.record.status = 'active';
            }

            return result;
        } catch (error: any) {
            const errorMsg = (error?.message || '').toLowerCase();
            const isInvalidKey = errorMsg.includes('api key not valid') || errorMsg.includes('api_key_invalid') || error?.status === 'INVALID_ARGUMENT';
            const isQuotaOrRateLimit = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted') || errorMsg.includes('too many requests');

            if (isInvalidKey) {
                console.warn(`[Gemini Auth] Pruning invalid API key from ${candidate.source}: ${key.substring(0, 8)}...`);
                invalidKeys.add(key);
                if (candidate.record) {
                    candidate.record.status = 'invalid';
                    saveManagerKeysToFile(managerGeminiKeys);
                }
                continue;
            }

            if (isQuotaOrRateLimit) {
                console.warn(`[Gemini Rate Limit 429] Key from ${candidate.source} reached quota (Attempt ${attempts}/${maxAttempts}). Rotating key & trying fallback model...`);
                if (candidate.record) {
                    candidate.record.status = 'quota_exhausted';
                }
                
                const delayMs = Math.min(600 * attempts, 2500);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }

            // For other transient errors, rotate and brief delay
            await new Promise(resolve => setTimeout(resolve, 350));
        }
    }

    throw new Error("AI service is currently busy handling high volume or keys have reached quota limit. Please try again in a moment or add another Gemini Key in Manager Portal.");
}

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

let affairsCache: { en?: { data: any, lastUpdated: number }, hi?: { data: any, lastUpdated: number } } = {};

app.get("/api/current-affairs", async (req, res) => {
    const lang = (req.query.lang as string) || "en";
    const topic = (req.query.topic as string) || "";
    const timeRange = (req.query.timeRange as string) || "";
  try {
    const now = Date.now();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const today5AM = new Date(new Date().getTime() + istOffset);
    today5AM.setHours(5, 0, 0, 0);
    const last5AMTimestamp = today5AM.getTime() - istOffset;

    // Use cache only for general (no topic and no timeRange) requests
    if (!topic && !timeRange && affairsCache[lang as 'en' | 'hi'] && affairsCache[lang as 'en' | 'hi']!.lastUpdated > last5AMTimestamp) {
      return res.json(affairsCache[lang as 'en' | 'hi']!.data);
    }

    let masterData = [];
    
    if (!topic && !timeRange) {
      // General news from API + Fallback
      const NEWS_API_KEY = process.env.NEWSDATA_API_KEY || "pub_aa7790f1fa624233b2b52b85921f066a";
      try {
        const newsResponse = await fetch(`https://newsdata.io/api/1/news?apikey=${NEWS_API_KEY}&country=in&language=${lang}&category=politics,science,technology,world,top`);
        const newsData = await newsResponse.json();

        if (newsData.status === "success" && newsData.results && newsData.results.length >= 10) {
          masterData = newsData.results.map((article: any) => ({
            title: article.title,
            description: article.description || article.content?.substring(0, 200) || (lang === 'hi' ? "इस अपडेट के बारे में और पढ़ें..." : "Read more about this update..."),
            date: article.pubDate ? new Date(article.pubDate).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString(),
            category: article.category?.[0]?.toUpperCase() || (lang === 'hi' ? "सामान्य" : "GENERAL"),
            source: article.source_id?.toUpperCase() || (lang === 'hi' ? "समाचार अपडेट" : "NEWS UPDATE")
          })).slice(0, 15);
        }
      } catch (newsError) {
        console.error("NewsData API Error:", newsError);
      }
    }

    // Generate with Gemini if: 
    // 1. Topic requested
    // 2. OR Time range requested
    // 3. OR General news fetching failed/returned too few
    if (topic || timeRange || masterData.length < 10) {
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
      
      let timeContext = "";
      if (timeRange === 'today') {
        timeContext = `STRICTLY from today (${today}). Do NOT include anything from previous days.`;
      } else if (timeRange && timeRange !== 'all') {
        timeContext = `STRICTLY from the exact period of the last ${timeRange.replace('m', ' months').replace('y', ' years')}. Do NOT include anything older than this specific period.`;
      } else {
        timeContext = "from the last 1-2 years";
      }

      const prompt = topic 
        ? `Find and summarize 10 significant current affairs items exclusively about "${topic}" ${timeContext} (as of ${today}) in ${lang === 'hi' ? 'Hindi' : 'English'}.
           Ensure they are suitable for competitive exam prep.
           Return as a JSON array of objects with keys: 'title', 'description', 'date', 'category', and 'source'.`
        : `Provide exactly 15 significant current affairs items ${timeContext} (as of ${today}) in ${lang === 'hi' ? 'Hindi' : 'English'}. 
           CRITICAL: Only include topics relevant for Indian competitive exams (UPSC, SSC, Banking, IBPS). 
           Focus on: National News, Economy, Science & Tech, Environment, and International Relations.
           Return as a JSON array of objects with keys: 'title', 'description', 'date', 'category', and 'source'.`;

      const response = await callGeminiWithRotation((ai, attemptModel) => ai.models.generateContent({
        model: attemptModel || "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                date: { type: "string" },
                category: { type: "string" },
                source: { type: "string" }
              },
              required: ["title", "description", "date", "category", "source"]
            }
          }
        }
      }), 'ca');
      masterData = JSON.parse(response.text || "[]");
    }

    if (!topic && masterData.length > 0) {
      affairsCache[lang as 'en' | 'hi'] = { data: masterData, lastUpdated: now };
    }
    res.json(masterData);
  } catch (error: any) {
    console.error("API Error:", error);
    if (!topic && affairsCache[lang as 'en' | 'hi']) return res.json(affairsCache[lang as 'en' | 'hi']!.data);
    
    // Better 429 handling
    if (error.message?.includes('429') || error.message?.toLowerCase().includes('quota')) {
      return res.status(429).json({ 
        error: "Quota Exceeded: The AI is busy helping many students right now. Please try again in 1 minute.",
        details: error.message
      });
    }
    
    res.status(500).json({ error: error.message || "Failed to fetch current affairs" });
  }
});

interface TheHinduArticleBilingual {
    category: string;
    source: string;
    date: string;
    title_en: string;
    title_hi: string;
    description_en: string;
    description_hi: string;
    points_en: string[];
    points_hi: string[];
    syllabus_tags_en: string[];
    syllabus_tags_hi: string[];
}

interface TheHinduDailyBundle {
    dateKey: string;
    dateFormatted: string;
    generatedAt: number;
    articles: TheHinduArticleBilingual[];
}

const THE_HINDU_CACHE_FILE = path.join(process.cwd(), 'the_hindu_daily.json');

const getISTDateKey = (): string => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    return istDate.toISOString().slice(0, 10); // YYYY-MM-DD
};

const getISTFormattedDate = (): string => {
    return new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const loadTheHinduCacheFromFile = (): TheHinduDailyBundle | null => {
    try {
        if (fs.existsSync(THE_HINDU_CACHE_FILE)) {
            const raw = fs.readFileSync(THE_HINDU_CACHE_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (data && Array.isArray(data.articles) && data.articles.length > 0 && data.dateKey) {
                return data as TheHinduDailyBundle;
            }
        }
    } catch (e) {
        console.warn("[The Hindu] Error reading persistent cache file:", e);
    }
    return null;
};

const saveTheHinduCacheToFile = (cache: TheHinduDailyBundle) => {
    try {
        fs.writeFileSync(THE_HINDU_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (e) {
        console.warn("[The Hindu] Error writing persistent cache file:", e);
    }
};

let theHinduDailyCache: TheHinduDailyBundle | null = loadTheHinduCacheFromFile();
let theHinduFetchPromise: Promise<TheHinduDailyBundle> | null = null;

app.get("/api/the-hindu", async (req, res) => {
    const lang = ((req.query.lang as string) || "en").toLowerCase();
    const forceRefresh = req.query.refresh === "true";
    const dateKey = getISTDateKey();
    const formattedDate = getISTFormattedDate();

    const formatOutput = (articles: TheHinduArticleBilingual[]) => {
        return articles.map(item => ({
            title: lang === 'hi' ? (item.title_hi || item.title_en) : (item.title_en || item.title_hi),
            description: lang === 'hi' ? (item.description_hi || item.description_en) : (item.description_en || item.description_hi),
            points: lang === 'hi' ? (item.points_hi && item.points_hi.length > 0 ? item.points_hi : item.points_en) : (item.points_en && item.points_en.length > 0 ? item.points_en : item.points_hi),
            syllabus_tags: lang === 'hi' ? (item.syllabus_tags_hi && item.syllabus_tags_hi.length > 0 ? item.syllabus_tags_hi : item.syllabus_tags_en) : (item.syllabus_tags_en && item.syllabus_tags_en.length > 0 ? item.syllabus_tags_en : item.syllabus_tags_hi),
            category: item.category,
            source: item.source,
            date: item.date || formattedDate
        }));
    };

    try {
        // 1. Check in-memory / file cache for today
        if (!forceRefresh) {
            if (!theHinduDailyCache) {
                theHinduDailyCache = loadTheHinduCacheFromFile();
            }
            if (theHinduDailyCache && theHinduDailyCache.dateKey === dateKey && theHinduDailyCache.articles?.length > 0) {
                return res.json(formatOutput(theHinduDailyCache.articles));
            }
        }

        // 2. Prevent concurrent duplicate generations with a shared promise
        if (!theHinduFetchPromise) {
            theHinduFetchPromise = (async (): Promise<TheHinduDailyBundle> => {
                const prompt = `You are a Senior UPSC Current Affairs Editor and Academic Examiner analyzing 'The Hindu' newspaper for Civil Services Exam (UPSC CSE, State PSCs, SSC CGL).
Provide 10 in-depth analytical news articles and editorials from 'The Hindu' (as of ${formattedDate}).

CRITICAL MANDATE: STRICT BILINGUAL 1:1 PAIRING (SAME 10 NEWS STORIES IN BOTH HINDI & ENGLISH)
For EACH of the 10 articles, provide both English and Hindi versions representing the EXACT SAME underlying news facts, figures, constitutional context, and analysis:

1. 'title_en': Formal, authoritative English headline from The Hindu.
   'title_hi': Corresponding authentic Hindi headline (सटीक व प्रामाणिक हिंदी शीर्षक).
2. 'description_en': Detailed, comprehensive analytical overview of MINIMUM 100 to 150 words covering background context, mechanisms, and multidimensional implications.
   'description_hi': Exact matching in-depth Hindi analytical overview of MINIMUM 100 to 150 words covering the identical background, mechanisms, and implications in standard UPSC Hindi.
3. 'points_en': 5 to 7 detailed, high-yield examination bullet points:
   - Point 1: Core Fact, Policy, Bill, or Incident details
   - Point 2: Background, Genesis, or Historical/Constitutional context
   - Point 3: Key Arguments, Pros & Cons, or Sectoral Impacts
   - Point 4: Government Initiatives, Schemes, Committees, or Supreme Court judgments
   - Point 5+: Critical Analytical Takeaway, Future Way Forward, and Prelims/Mains Exam Relevance
   (Use **bold terms** for key concepts, article numbers, and keywords).
   'points_hi': Same 5 to 7 detailed examination bullet points translated into formal Hindi with matching bold terms and facts.
4. 'syllabus_tags_en': 2 to 4 syllabus topics (e.g., 'GS Paper 2 - Polity & Governance', 'GS Paper 3 - Economy', 'GS Paper 3 - Environment', 'GS Paper 2 - International Relations').
   'syllabus_tags_hi': Corresponding Hindi GS syllabus tags (e.g., 'GS पेपर 2 - राजव्यवस्था एवं शासन', 'GS पेपर 3 - अर्थव्यवस्था').
5. 'category': 'National' | 'Economy' | 'Polity' | 'Science & Tech' | 'Environment' | 'International Relations' | 'Editorials'.
6. 'source': 'The Hindu Editorial' or 'The Hindu National / Business'.
7. 'date': '${formattedDate}'.

Return strictly as a JSON array of 10 objects matching the schema.`;

                const response = await callGeminiWithRotation((ai, attemptModel) => ai.models.generateContent({
                    model: attemptModel || "gemini-3.7-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title_en: { type: "string" },
                                    title_hi: { type: "string" },
                                    description_en: { type: "string" },
                                    description_hi: { type: "string" },
                                    date: { type: "string" },
                                    category: { type: "string" },
                                    source: { type: "string" },
                                    points_en: { 
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    points_hi: { 
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    syllabus_tags_en: {
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    syllabus_tags_hi: {
                                        type: "array",
                                        items: { type: "string" }
                                    }
                                },
                                required: [
                                    "title_en", "title_hi", 
                                    "description_en", "description_hi", 
                                    "date", "category", "source", 
                                    "points_en", "points_hi", 
                                    "syllabus_tags_en", "syllabus_tags_hi"
                                ]
                            }
                        }
                    }
                }), 'ca');

                const parsed = JSON.parse(response.text || "[]");
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const bundle: TheHinduDailyBundle = {
                        dateKey,
                        dateFormatted: formattedDate,
                        generatedAt: Date.now(),
                        articles: parsed
                    };
                    theHinduDailyCache = bundle;
                    saveTheHinduCacheToFile(bundle);
                    return bundle;
                }
                throw new Error("Failed to parse valid The Hindu daily articles");
            })();
        }

        const bundle = await theHinduFetchPromise;
        theHinduFetchPromise = null;
        return res.json(formatOutput(bundle.articles));
    } catch (error: any) {
        theHinduFetchPromise = null;
        console.error("The Hindu API Error:", error);
        // Fallback: If we have ANY existing cache, serve it
        if (theHinduDailyCache && theHinduDailyCache.articles?.length > 0) {
            return res.json(formatOutput(theHinduDailyCache.articles));
        }
        res.status(500).json({ error: error.message || "Failed to fetch The Hindu news" });
    }
});

app.post("/api/generate-quiz", async (req, res) => {
  const { affairs, lang = 'en' } = req.body;
  try {
    const prompt = lang === 'hi' 
      ? `दिए गए करंट अफेयर्स के आधार पर 5 बहुविकल्पीय प्रश्न (MCQs) बनाएं। प्रत्येक प्रश्न के 4 विकल्प और एक सही उत्तर होना चाहिए।
        डेटा: ${JSON.stringify(affairs)}`
      : `Generate 5 multiple choice questions (MCQs) based on these current affairs. Each question must have 4 options and one correct answer.
        Data: ${JSON.stringify(affairs)}`;

    const response = await callGeminiWithRotation((ai, attemptModel) => ai.models.generateContent({
      model: attemptModel || "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { 
                type: "array", 
                items: { type: "string" }
              },
              correctAnswer: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    }), 'quiz');

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Quiz Generation Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate quiz" });
  }
});

// Proxy for other Gemini tasks
app.post("/api/gemini/:action", async (req, res) => {
    const { action } = req.params;
    
    try {
        switch (action) {
            case "generate-content": {
                const { model, contents, config, category, task } = req.body;
                
                // Ensure we map any requested model to a valid Gemini model
                let finalModel = "gemini-3.7-flash";
                if (model && (model.includes("3.") || model.includes("2.5") || model.includes("flash") || model.includes("pro"))) {
                    finalModel = model;
                }

                const rawCategory = category || task || 'other';
                const validCategory: CategoryType = ['quiz', 'notes', 'ans_chak', 'ca', 'pyq', 'other'].includes(rawCategory)
                    ? (rawCategory as CategoryType)
                    : 'other';

                const response = await callGeminiWithRotation((ai, attemptModel) => ai.models.generateContent({
                    model: attemptModel || finalModel,
                    contents,
                    config
                }), validCategory);

                return res.json({
                    text: response.text,
                    candidates: response.candidates,
                    usageMetadata: response.usageMetadata
                });
            }
            default:
                res.status(400).json({ error: "Unknown action" });
        }
    } catch (error: any) {
        console.error(`Gemini Action ${action} Error:`, error);
        res.status(500).json({ error: error.message || "Failed to process Gemini request" });
    }
});


// Manager Gemini API Keys Management Endpoints
app.get("/api/manager/gemini-keys", (req, res) => {
    try {
        const envCount = getActiveEnvGeminiKeys().length;
        const totalActive = managerGeminiKeys.filter(k => k.isActive).length + envCount;
        
        res.json({
            keys: managerGeminiKeys,
            stats: {
                totalKeys: managerGeminiKeys.length,
                activeManagerKeys: managerGeminiKeys.filter(k => k.isActive).length,
                envKeysCount: envCount,
                totalWorking: totalActive,
                invalidCount: invalidKeys.size
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to load keys" });
    }
});

app.post("/api/manager/gemini-keys", (req, res) => {
    try {
        const { keys } = req.body;
        if (!Array.isArray(keys)) {
            return res.status(400).json({ error: "Expected an array of keys" });
        }

        // Validate and sanitize keys
        const sanitized: GeminiKeyRecord[] = keys.map((item: any) => ({
            id: item.id || `key_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            key: (item.key || '').trim(),
            label: (item.label || 'Gemini Key').trim(),
            workType: item.workType || 'all',
            isActive: item.isActive !== false,
            createdAt: item.createdAt || Date.now(),
            lastUsedAt: item.lastUsedAt || undefined,
            usageCount: item.usageCount || 0,
            status: item.status || 'active'
        })).filter(k => k.key.length > 10);

        // Clear invalid status for any revived/updated active keys
        for (const k of sanitized) {
            if (k.isActive && invalidKeys.has(k.key)) {
                invalidKeys.delete(k.key);
            }
        }

        managerGeminiKeys = sanitized;
        saveManagerKeysToFile(managerGeminiKeys);

        console.log(`[Gemini Keys] Successfully updated ${sanitized.length} manager Gemini keys.`);
        return res.json({ success: true, count: sanitized.length, keys: sanitized });
    } catch (error: any) {
        console.error("Error saving manager Gemini keys:", error);
        res.status(500).json({ error: error.message || "Failed to save keys" });
    }
});

app.delete("/api/manager/gemini-keys/:id", (req, res) => {
    try {
        const { id } = req.params;
        const keyRecord = managerGeminiKeys.find(k => k.id === id);
        if (keyRecord) {
            invalidKeys.delete(keyRecord.key);
        }
        managerGeminiKeys = managerGeminiKeys.filter(k => k.id !== id);
        saveManagerKeysToFile(managerGeminiKeys);
        return res.json({ success: true, count: managerGeminiKeys.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to delete key" });
    }
});

app.post("/api/manager/gemini-keys/test", async (req, res) => {
    const { key, model } = req.body;
    if (!key || typeof key !== 'string') {
        return res.status(400).json({ success: false, error: "API key string is required for testing" });
    }

    const trimmedKey = key.trim();
    const startTime = Date.now();
    const testModel = model || "gemini-3.7-flash";

    try {
        const testClient = new GoogleGenAI({
            apiKey: trimmedKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build-test' } }
        });

        const testResponse = await testClient.models.generateContent({
            model: testModel,
            contents: "Hi! Reply with exactly the word 'READY' to verify connection.",
            config: {
                maxOutputTokens: 10,
                temperature: 0.1
            }
        });

        const latencyMs = Date.now() - startTime;
        const reply = (testResponse.text || '').trim();

        // If key was in invalid set, remove it since it just succeeded
        invalidKeys.delete(trimmedKey);

        return res.json({
            success: true,
            valid: true,
            latencyMs,
            model: testModel,
            responsePreview: reply
        });
    } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        const errorMsg = error?.message || "Unknown error";
        const isQuota = errorMsg.toLowerCase().includes('429') || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('resource_exhausted');
        const isInvalid = errorMsg.toLowerCase().includes('api key not valid') || errorMsg.toLowerCase().includes('invalid_argument');

        return res.json({
            success: false,
            valid: false,
            latencyMs,
            isQuota,
            isInvalid,
            error: errorMsg
        });
    }
});

function getProjectGeminiClient() {
    try {
        return getNextGeminiClient().ai;
    } catch (e) {
        return null;
    }
}

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical: Failed to start server:", err);
  process.exit(1);
});
