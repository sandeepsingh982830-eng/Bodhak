import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export type CategoryType = 'quiz' | 'notes' | 'ans_chak' | 'ca' | 'pyq' | 'other';

// Helper to assemble fallback Gemini API keys
const getGeminiFallbackKeys = (): string[] => {
    const keys: string[] = [];

    if (process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY.trim());
    }

    if (process.env.API_KEY) {
        process.env.API_KEY.split(",").forEach(key => {
            const trimmed = key.trim();
            if (trimmed && !keys.includes(trimmed)) {
                keys.push(trimmed);
            }
        });
    }

    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(",").forEach(key => {
            const trimmed = key.trim();
            if (trimmed && !keys.includes(trimmed)) {
                keys.push(trimmed);
            }
        });
    }

    const fallbackKeys = [
        "AIzaSyBDdcDIzlDE9nFkvbGV4nFOymiUApeT6mQ",
        "AIzaSyAPLK-rDOVoX39xs2Bo3UHmlQA5TulIfTQ",
        "AIzaSyC5f2ga70B4Q-sQNt99T-eebgn2jcG55k8",
        "AIzaSyDAMgy70sa1EvWZp-KHNbMa6HxUNuYB8a8",
        "AIzaSyA11VH1W2IMmssfMLjp0yFl29BMkLNvGQY",
        "AIzaSyA2795ICJF4PnZLEOzxD_rFEC1qWyR2XSM",
        "AIzaSyDxMribymMxX0PuiJD9N1ixuodkpFNrkts",
        "AIzaSyB9Z4609x7q7z6rt426-tzjy2ChCH2EEYc",
        "AIzaSyA0NQpfptqEiOtnvj6o1NahEZ74TglYQIU",
        "AIzaSyCZaHMbbDeMjAM5BbdDl_3SZNlTGd_HKrM",
        "AIzaSyAJda9uTeacCTpcFsnplAoJF4Kw5EZEt6U",
        "AIzaSyB4lLUrgwjztQdmYdEfbOfQram1zaUshOY",
        "AIzaSyAVZL114akd_-6TG9KG6J6Fa8rAg8ZcnmY",
        "AIzaSyAkMjTZO_JfGYBx3Kff2G-NCdEB6Oji3SQ",
        "AIzaSyBlG7RVEQJHW5o6UvTxZ6WWefzMFYW2NZQ",
        "AIzaSyAl-U9vm4T2PZVqMotZzGGmErgoiF-E7Og"
    ];

    fallbackKeys.forEach(key => {
        if (!keys.includes(key)) {
            keys.push(key);
        }
    });

    return keys;
};

const geminiFallbacks = getGeminiFallbackKeys();

const isValidGeminiKey = (key: string): boolean => {
    if (!key) return false;
    const trimmed = key.trim();
    return trimmed.startsWith('AIza') || (!!process.env.GEMINI_API_KEY && trimmed === process.env.GEMINI_API_KEY.trim());
};

const createSanitizedPool = (customKeys: string[] = []): string[] => {
    const validCustom = customKeys.filter(isValidGeminiKey);
    // Combine valid custom Gemini keys with fallback Gemini keys, eliminating duplicates
    const combined = [...geminiFallbacks, ...validCustom];
    return Array.from(new Set(combined.map(k => k.trim()))).filter(Boolean);
};

// Categorized API Key Pools strictly containing valid Gemini API keys
const CATEGORY_KEY_POOLS: Record<CategoryType, string[]> = {
    quiz: createSanitizedPool([
        "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",
        "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",
        "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"
    ]),
    notes: createSanitizedPool([
        "cohere_cGPSa21RyMvFTJbgdFf2uaOTwUcemJopzSfigk0f0VisgM",
        "cohere_864dluApQV7Jws3DOewcu84gLj26rrrOtWEZltuJ3MzylW"
    ]),
    ans_chak: createSanitizedPool([
        "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"
    ]),
    ca: createSanitizedPool([]),
    pyq: createSanitizedPool([]),
    other: createSanitizedPool([])
};

// Independent rotation indices for each category
const CATEGORY_KEY_INDICES: Record<CategoryType, number> = {
    quiz: 0,
    notes: 0,
    ans_chak: 0,
    ca: 0,
    pyq: 0,
    other: 0
};

function getGeminiClientForCategory(category: CategoryType = 'other') {
    const pool = CATEGORY_KEY_POOLS[category] || CATEGORY_KEY_POOLS['other'];
    const idx = CATEGORY_KEY_INDICES[category] ?? 0;
    const apiKey = pool[idx];

    if (!apiKey) {
        throw new Error(`No API key available for category: ${category}`);
    }

    console.log(`[Rotation Pool - Category: ${category}] Using Key Index: ${idx + 1}/${pool.length}`);
    return new GoogleGenAI({
        apiKey,
        httpOptions: {
            headers: {
                'User-Agent': 'aistudio-build',
            }
        }
    });
}

/**
 * Executes an AI request and automatically rotates keys for the specific category on quota/rate/auth errors.
 * Rotates continuously (key 1 -> key 2 ... -> key N -> key 1).
 */
async function callGeminiWithRotation<T>(
    operation: (ai: GoogleGenAI) => Promise<T>,
    category: CategoryType = 'other'
): Promise<T> {
    const pool = CATEGORY_KEY_POOLS[category] || CATEGORY_KEY_POOLS['other'];
    const totalKeys = pool.length;
    if (totalKeys === 0) {
        throw new Error(`Initialization Failed: No API Keys available for category ${category}.`);
    }

    let attempts = 0;
    const maxAttempts = Math.max(totalKeys * 3, 50);

    while (attempts < maxAttempts) {
        try {
            const ai = getGeminiClientForCategory(category);
            return await operation(ai);
        } catch (error: any) {
            attempts++;
            const currentIndex = CATEGORY_KEY_INDICES[category] ?? 0;
            const nextIndex = (currentIndex + 1) % totalKeys;
            CATEGORY_KEY_INDICES[category] = nextIndex;

            console.warn(`[Rotation - Category: ${category}] Key ${currentIndex + 1}/${totalKeys} failed (${error.message}). Rotating to Key ${nextIndex + 1}/${totalKeys} (Attempt ${attempts}/${maxAttempts})`);

            await new Promise(resolve => setTimeout(resolve, 250));
            continue;
        }
    }
    throw new Error("Temporary System Overload: All backup AI systems are currently busy. Please retry in 30-60 seconds.");
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

      const response = await callGeminiWithRotation((ai) => ai.models.generateContent({
        model: "gemini-3.6-flash",
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

let theHinduCache: { en?: { data: any, lastUpdated: number }, hi?: { data: any, lastUpdated: number } } = {};

app.get("/api/the-hindu", async (req, res) => {
    const lang = (req.query.lang as string) || "en";
    try {
        const now = Date.now();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const today5AM = new Date(new Date().getTime() + istOffset);
        today5AM.setHours(5, 0, 0, 0);
        const last5AMTimestamp = today5AM.getTime() - istOffset;

        if (theHinduCache[lang as 'en' | 'hi'] && theHinduCache[lang as 'en' | 'hi']!.lastUpdated > last5AMTimestamp) {
            return res.json(theHinduCache[lang as 'en' | 'hi']!.data);
        }

        const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        const prompt = `Provide 10 in-depth analysis items and editorials from 'The Hindu' newspaper (as of ${today}) tailored for Indian competitive exams (UPSC / Civil Services) in ${lang === 'hi' ? 'Hindi' : 'English'}.
Include key takeaways (points) and relevant syllabus tags (e.g. GS Paper 2 - Polity, GS Paper 3 - Economy).
Return as a JSON array of objects with keys: 'title', 'description', 'date', 'category', 'source', 'points', and 'syllabus_tags'.`;

        const response = await callGeminiWithRotation((ai) => ai.models.generateContent({
            model: "gemini-3.6-flash",
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
                            source: { type: "string" },
                            points: { 
                                type: "array",
                                items: { type: "string" }
                            },
                            syllabus_tags: {
                                type: "array",
                                items: { type: "string" }
                            }
                        },
                        required: ["title", "description", "date", "category", "source", "points", "syllabus_tags"]
                    }
                }
            }
        }), 'ca');

        const masterData = JSON.parse(response.text || "[]");
        if (masterData.length > 0) {
            theHinduCache[lang as 'en' | 'hi'] = { data: masterData, lastUpdated: now };
        }
        res.json(masterData);
    } catch (error: any) {
        console.error("The Hindu API Error:", error);
        if (theHinduCache[lang as 'en' | 'hi']) return res.json(theHinduCache[lang as 'en' | 'hi']!.data);
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

    const response = await callGeminiWithRotation((ai) => ai.models.generateContent({
      model: "gemini-3.6-flash",
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
                let finalModel = "gemini-3.6-flash";
                if (model && (model.includes("3.") || model.includes("2.5") || model.includes("flash") || model.includes("pro"))) {
                    finalModel = model;
                }

                const rawCategory = category || task || 'other';
                const validCategory: CategoryType = ['quiz', 'notes', 'ans_chak', 'ca', 'pyq', 'other'].includes(rawCategory)
                    ? (rawCategory as CategoryType)
                    : 'other';

                const response = await callGeminiWithRotation((ai) => ai.models.generateContent({
                    model: finalModel,
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


function getProjectGeminiClient() {
    try {
        return getGeminiClientForCategory('other');
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
