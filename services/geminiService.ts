
// GenAI types matching @google/genai
export enum Type {
    TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
    STRING = "STRING",
    NUMBER = "NUMBER",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    ARRAY = "ARRAY",
    OBJECT = "OBJECT",
    NULL = "NULL",
}

import { QuizConfig, Question, QuestionType, NoteConfig, AnsChakFeedback } from "../types";

// Helper to call backend Gemini API
const callGeminiAPI = async (action: string, payload: any) => {
    const response = await fetch(`/api/gemini/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
        let errorMessage = `Failed to call Gemini API: ${action} (${response.status})`;
        try {
            if (contentType && contentType.includes("application/json")) {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } else {
                const text = await response.text();
                // If it's HTML, it's likely a server error page or 404
                if (text.includes("<html>")) {
                    errorMessage = `Server Error (${response.status}): The request could not be processed. This often happens with very large documents.`;
                } else {
                    errorMessage = text || errorMessage;
                }
            }
        } catch (e) {
            console.error("Error parsing error response:", e);
        }
        throw new Error(errorMessage);
    }
    
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    } else {
        const text = await response.text();
        throw new Error(`Expected JSON response but received: ${text.substring(0, 100)}...`);
    }
};

const ai = {
    models: {
        generateContent: async (args: any, category?: string) => {
            const payload = category ? { ...args, category } : args;
            return await callGeminiAPI("generate-content", payload);
        }
    }
};

// Utility to parse JSON safely from AI responses
const parseAIJson = (text: string | undefined): any => {
    if (!text) return null;
    try {
        // Remove markdown code blocks if present
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
        const cleanJson = jsonMatch ? jsonMatch[1] : text;
        return JSON.parse(cleanJson.trim());
    } catch (e) {
        console.error("Failed to parse AI JSON:", e, text);
        return null;
    }
};

// Define quiz schema for JSON response
const getQuizSchema = (count: number, type: QuestionType) => {
  const properties: any = {
    question: { 
      type: Type.STRING,
      description: "The full question text."
    },
    model_answer: { 
      type: Type.STRING, 
      description: type === 'objective' 
        ? "Detailed academic explanation justifying the answer." 
        : "A comprehensive, high-quality model answer that would receive full marks." 
    },
    image_prompt: { type: Type.STRING, description: "Visual description for a technical diagram. Optional." },
    category: { 
      type: Type.STRING, 
      enum: ["PYQ", "Current Affairs", "Normal"],
      description: "The category of the question."
    }
  };

  const required = ["question", "model_answer"];

  if (type === 'objective') {
    properties.options = { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Exactly 4 options. The correct answer must be SHUFFLED and placed at a RANDOM index (0, 1, 2, or 3) for every question."
    };
    properties.correct_answer = { 
      type: Type.STRING, 
      description: "The exact correct option text. This text MUST exist within the 'options' array." 
    };
    required.push("options", "correct_answer", "category");
  } else {
    // Subjective specific
    properties.word_limit = {
      type: Type.INTEGER,
      description: "The recommended word limit for the answer."
    };
    required.push("word_limit", "category");
  }

  return {
    type: Type.ARRAY,
    description: `An array containing EXACTLY ${count} ${type} question objects.`,
    items: {
      type: Type.OBJECT,
      properties,
      required
    }
  };
};

const generateImage = async (prompt: string): Promise<string | undefined> => {
    try {
        const stylePrompt = "Create a clear, black and white 2D line-art diagram on a solid white background. Educational textbook style. " + prompt;
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: { parts: [{ text: stylePrompt }] },
            config: {}
        });
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    } catch (error) {
        console.error("Image Gen Error:", error);
    }
    return undefined;
};

const generateHandwrittenImage = async (topic: string): Promise<string | undefined> => {
    try {
        const prompt = `Create a handwritten study note about "${topic}". Use a messy but legible student handwriting font on clean White paper. Use a yellow neon marker to highlight important terms so I can revise during exams and draw red circles around important dates. Add small doodles to explain the concepts better on A4 printable size paper.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: { parts: [{ text: prompt }] },
            config: {}
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
            }
        }
    } catch (error: any) {
        console.error("Handwritten Image Gen Error:", error);
        if (error.message?.includes('429') || error.message?.includes('quota')) {
            return `https://placehold.co/600x800/111827/3b82f6?text=${encodeURIComponent('Handwritten Mapper (Limit Reached)\nContinuing with Textual Notes')}`;
        }
    }
    return undefined;
};

export const generateQuizQuestions = async (config: QuizConfig): Promise<Question[]> => {
  const { subject, topic, additionalTopics, splitTopics, numTopics, sourceMaterial, sourceMode, difficulty, language, type, count, includeImages, wordLimit, minQuestionWords, includeCurrentAffairs, includePYQ, pyqMaterial } = config;

  let difficultyInstruction = "";
  
  const nTopics = splitTopics ? (numTopics || 2) : 1;
  const topicsList = [topic, ...(additionalTopics || []).slice(0, nTopics - 1)];
  
  // Use specified topic counts if available, otherwise distribute
  let topicCounts: number[] = [];
  const specifiedCounts = config.topicCounts || [];
  
  if (splitTopics) {
    for (let i = 0; i < nTopics; i++) {
        topicCounts.push(specifiedCounts[i] || 0);
    }
    
    // Fill in zeros with distributed remainder if total count is higher
    const currentSum = topicCounts.reduce((a, b) => a + b, 0);
    const zeroIndices = topicCounts.map((c, i) => c === 0 ? i : -1).filter(i => i !== -1);
    
    if (currentSum < count && zeroIndices.length > 0) {
        const remaining = count - currentSum;
        const perZero = Math.floor(remaining / zeroIndices.length);
        const extra = remaining % zeroIndices.length;
        
        zeroIndices.forEach((idx, i) => {
            topicCounts[idx] = perZero + (i < extra ? 1 : 0);
        });
    } else if (currentSum === 0) {
        // Fallback distribution
        const baseCountPerTopic = Math.floor(count / nTopics);
        const remainder = count % nTopics;
        topicCounts = Array(nTopics).fill(baseCountPerTopic).map((c, i) => i < remainder ? c + 1 : c);
    }
    // If currentSum > count, we just use requested counts (the total 'count' in config might be out of sync, but gemini will follow topicCounts instruction)
  } else {
    topicCounts = [count];
  }

  const topicInstruction = splitTopics 
    ? `You MUST split the questions between ${nTopics} topics:
       ${topicsList.map((t, i) => `- Generate exactly ${topicCounts[i]} questions for Topic ${i + 1}: "${t}".`).join('\n')}`
    : `Generate questions for the Topic: "${topic}".`;

  if (type === 'subjective') {
    difficultyInstruction = `
    ROLE: Academic Professor.
    TASK: ${topicInstruction}
    Total questions: EXACTLY ${count} SUBJECTIVE (descriptive/open-ended) questions.
    
    GUIDELINES:
    - DO NOT provide multiple-choice options.
    - Provide a detailed 'model_answer' for evaluation purposes.
    - Questions must require descriptive written answers.
    ${wordLimit ? `- MANDATORY: The 'model_answer' MUST be a comprehensive response that meets or exceeds a target of ${wordLimit} words to serve as a high-quality reference.` : ''}`;

    if (difficulty === 'Easy') {
      difficultyInstruction += `\n- EASY MODE: Generate simple direct questions (e.g., Define, State, List, Name).`;
    } else if (difficulty === 'Hard') {
      difficultyInstruction += `\n- HARD MODE: Generate analytical, evaluative, or critical thinking questions (e.g., Evaluate, Analyze, Compare and Contrast, Discuss).`;
    }
  } else {
    // Objective logic
    if (difficulty === 'Hard') {
      difficultyInstruction = `
      ROLE: Expert Exam Content Creator (UPSC/GMAT style). 
      TASK: ${topicInstruction}
      Total questions: EXACTLY ${count} objective questions using complex patterns:
      1. Multi-Statement Pattern (1, 2, 3).
      2. Assertion (A) & Reasoning (R).
      3. Data Matching.`;
    } else if (difficulty === 'Easy') {
      difficultyInstruction = `
      ROLE: Primary Education Teacher.
      TASK: ${topicInstruction}
      Total questions: EXACTLY ${count} SIMPLE ONE-LINE FACTUAL objective questions.
      - Questions must be direct one-sentence facts.`;
    } else {
      difficultyInstruction = `
      TASK: ${topicInstruction}
      Total questions: EXACTLY ${count} standard objective questions with a mix of conceptual and factual knowledge.`;
    }
  }

  const questionLengthInstruction = minQuestionWords ? `
  MANDATORY: Each generated question must be detailed and descriptive. 
  - Every question text (the 'question' field) MUST be at least ${minQuestionWords} words long. 
  - Do NOT generate short one-line questions. Expand the context, provide background, or add premises to each question to meet this word count.` : "";

  const currentAffairsInstruction = includeCurrentAffairs ? `
  MANDATORY: At least 30% of the questions MUST be related to RECENT CURRENT AFFAIRS (last 1-2 years) specifically tied to the topic or subject. 
  If the topic is static, relate it to recent discoveries, news, or contemporary relevance.
  Set 'category' to 'Current Affairs' for these questions.` : "";

  const pyqInstruction = (includePYQ && pyqMaterial) ? `
  MANDATORY: At least 30% of the questions MUST be extracted from the provided PYQ MATERIAL.
  These questions should be exactly as they appear in the PYQ material but relevant to the topic.
  Set 'category' to 'PYQ' for these questions.` : "";

  const ratioInstruction = (includeCurrentAffairs && includePYQ && pyqMaterial) ? `
  DISTRIBUTION RATIO (CRITICAL):
  - 30% of questions must be 'Current Affairs'.
  - 30% of questions must be 'PYQ' (from PYQ material).
  - 40% of questions must be 'Normal' (general academic knowledge).` : "";

  const excludeInstruction = (config.excludeQuestions && config.excludeQuestions.length > 0) ? `
  MANDATORY: DO NOT repeat any of the following questions that were previously generated:
  ${config.excludeQuestions.map(q => `- ${q}`).join('\n')}
  ` : "";

  const preserveLangInstruction = (config.sourceMaterial && config.preserveSourceLanguage) ? `
  MANDATORY: LANGUAGE SKILLS PROTECTION ENABLED.
  The SOURCE MATERIAL may contain sections specifically for "Language Skills" (e.g., English Grammar/Skills, Punjabi Grammar/Skills).
  - You MUST detect these sections and generate those specific questions in their ORIGINAL language (e.g., questions from an English section MUST be in English, questions from a Punjabi section MUST be in Punjabi).
  - This applies regardless of the global quiz language setting (${language}).
  - DO NOT translate Language Skills questions; they must test the candidate in the original language intended by the PDF.
  - For other general knowledge questions in the PDF, you may follow the global setting of ${language} unless they are specifically bilingual in the source.` : "";

  const systemInstruction = `You are an elite academic examiner for Civil Services Exams.
  Subject: ${subject}
  Language: ${language}
  Difficulty: ${difficulty}
  Question Type: ${type}
  
  MANDATORY REQUIREMENTS:
  1. You MUST generate EXACTLY ${count} questions.
  2. ${difficultyInstruction}
  3. ${questionLengthInstruction}
  4. ${currentAffairsInstruction}
  5. ${pyqInstruction}
  6. ${ratioInstruction}
  7. ${excludeInstruction}
  8. ${preserveLangInstruction}
  9. For any question not falling into 'PYQ' or 'Current Affairs', set 'category' to 'Normal'.
  10. FORMATTING PROTOCOL (CRITICAL):
     - For statement-based questions (Kathan), each statement MUST be on a new line.
     - Use double newlines (\n\n) before and after each numbered statement (1., 2., 3., etc.) to ensure they render as a list.
     - For Assertion-Reason questions (Kathan-Karan), the Assertion and Reason MUST be on separate lines.
     - Use double newlines (\n\n) between 'Assertion (A):' and 'Reason (R):' (or 'कथन (A):' and 'कारण (R):').
     - Example:
       कथन (A): ...
       
       कारण (R): ...
  10. RANDOMIZATION PROTOCOL (CRITICAL):
     - For objective questions, you MUST NOT always put the correct answer in the first position (Option A).
     - You must use a TRUE RANDOM distribution for the correct answer across indices 0, 1, 2, and 3 (A, B, C, D).
     - Across the set of ${count} questions, ensure that Option A, Option B, Option C, and Option D are all used as the correct answer roughly equally.
     - DO NOT FOLLOW A REPEATABLE PATTERN. Make it unpredictable.

  Return the output as a valid JSON array matching the requested schema.`;

  const contextSource = `
  ${topicsList.map((t, i) => `TOPIC ${i + 1}: ${t}`).join('\n')}
  ${sourceMaterial ? `SOURCE MATERIAL:\n${sourceMaterial}` : ''}
  ${(includePYQ && pyqMaterial) ? `PYQ MATERIAL (Extract questions from here):\n${pyqMaterial}` : ''}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contextSource,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: getQuizSchema(count, type),
        // High temperature ensures high entropy in answer positioning
        temperature: 0.8,
        tools: includeCurrentAffairs ? [{ googleSearch: {} }] : undefined
      },
      category: includePYQ ? 'pyq' : 'quiz'
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    let questions = JSON.parse(text) as Question[];
    
    if (questions.length !== count) {
        questions = questions.slice(0, count);
    }

    return await Promise.all(questions.map(async (q) => {
        let imageUrl: string | undefined = undefined;
        if (includeImages && q.image_prompt) {
            imageUrl = await generateImage(q.image_prompt);
        }

        let shuffledOptions = q.options ? [...q.options] : (type === 'objective' ? [] : undefined);
        let finalCorrectAnswer = q.correct_answer || (type === 'objective' ? '' : undefined);

        // Programmatic shuffling of options to prevent LLM biases and guarantee Option A, B, C, D are equally likely
        if (type === 'objective' && shuffledOptions && shuffledOptions.length > 0) {
            const correctText = finalCorrectAnswer || shuffledOptions[0];
            const hasCorrect = shuffledOptions.some(opt => opt.trim().toLowerCase() === correctText.trim().toLowerCase());
            if (!hasCorrect) {
                shuffledOptions[0] = correctText;
            }
            // Standard Fisher-Yates array shuffle for true equal distribution (25% chance per index)
            for (let i = shuffledOptions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = shuffledOptions[i];
                shuffledOptions[i] = shuffledOptions[j];
                shuffledOptions[j] = temp;
            }
            const matchedOption = shuffledOptions.find(opt => opt.trim().toLowerCase() === correctText.trim().toLowerCase());
            if (matchedOption) {
                finalCorrectAnswer = matchedOption;
            } else {
                finalCorrectAnswer = correctText;
            }
        }

        return {
            ...q,
            options: shuffledOptions,
            correct_answer: finalCorrectAnswer,
            model_answer: q.model_answer || '',
            imageUrl: imageUrl,
            word_limit: q.word_limit || wordLimit
        };
    }));

  } catch (error: any) {
    console.error("Quiz Generation Error:", error);
    throw new Error(error?.message || "Failed to generate questions. Please check your topic and try again.");
  }
};

export const verifyAndFixQuestion = async (question: Question, subject: string, language: string): Promise<{status: 'OK' | 'FIXED', correctedQuestion?: Question}> => {
  const systemInstruction = `You are a fact-checker. 
  TASK:
  1. Verify if the question is factually correct.
  2. Verify if the 'correct_answer' EXACTLY matches one of the 'options'.
  3. If there is a mismatch, typo, or factual error, set status to 'FIXED' and provide the corrected question object.
  4. Ensure the correct answer is randomized among options.
  5. Respond strictly in ${language}.`;
  
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING },
      correctedQuestion: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correct_answer: { type: Type.STRING },
          model_answer: { type: Type.STRING }
        }
      }
    },
    required: ["status"]
  };
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: `Subject: ${subject}, Question: ${JSON.stringify(question)}`,
    config: { systemInstruction, responseMimeType: "application/json", responseSchema },
    category: 'quiz'
  });
  return JSON.parse(response.text || '{"status": "OK"}');
};

export const analyzeAnswer = async (
  question: string, 
  userAnswer: string | null, 
  correctAnswer: string, 
  subject: string, 
  language: string,
  isSubjective: boolean = false,
  maxMarks: number = 1
): Promise<string> => {
  let systemInstruction = `You are an elite academic mentor. Respond strictly in ${language}. 
  Provide a detailed, highly learning-centric, and POINTWISE (numbered list 1., 2., 3., etc.) factual analysis of the correct answer and the options.
  
  MANDATORY PROTOCOLS:
  1. Translate your answer into a clean sequence of numbered factual points. DO NOT write continuous paragraphs.
  2. Clearly explain the historic, scientific, or conceptual facts relevant to the correct answer.
  3. Keep the feedback sharp, extremely high-yield, and educational. Maximum 200 words total.`;
  let contents = `Subject: ${subject}, Question: ${question}, Student Answer: ${userAnswer || "Not answered"}, Correct Answer for reference: ${correctAnswer}`;

  if (isSubjective) {
    systemInstruction = `Act as a strict and highly analytical UPSC / Civil Services Examiner. 
    Respond strictly in ${language}.
    
Your task is to comprehensively evaluate the answer based on the provided model answer, calculate the marks based on a strict 9-criteria rubric, and provide detailed feedback.

### SCORING RUBRIC (Mandatory):
1. Relevance & Depth (25%)
2. Originality & Analysis (15%)
3. Argumentation (10%)
4. Balanced Approach (10%)
5. Coherence & Flow (10%)
6. Clarity of Expression (10%)
7. Presentation (10%)
8. Conciseness (5%)
9. Language Proficiency (5%)

Follow this exact output format:

**OVERALL SCORE:** [Total Marks Awarded] / [Maximum Marks]

**SUMMARY**
[A 4-5 line overview of the quality. Highlight main strengths and critical gaps.]

**DETAILED EVALUATION**
1. Relevance & Depth (25%): **[Marks] / [25% of Max]** | Tag: [WELL DONE/CAN IMPROVE/WRONG]
* Justification: [Reasoning]

2. Originality & Analysis (15%): **[Marks] / [15% of Max]** | Tag: [Tag]
* Justification: [Reasoning]

... (Include all 9 criteria following the same pattern) ...

**IMPROVEMENT PLAN**
[3-4 specific strategies for next time.]`;

    contents = `
---
**EVALUATION DATA:**
* Maximum Marks: ${maxMarks}
* Question: ${question}
* Student's Answer: ${userAnswer || "No answer provided."}
* Model Answer (for reference): ${correctAnswer}
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
      config: { 
        systemInstruction
      },
      category: 'ans_chak'
    });
    return response.text || (language === 'Hindi' ? "क्षमा करें, वर्तमान में विश्लेषण उपलब्ध नहीं है।" : (language === 'Punjabi' ? "ਮਾਫ ਕਰਨਾ, ਇਸ ਸਮੇਂ ਵਿਸ਼ਲੇਸ਼ਣ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।" : "Sorry, analysis is currently unavailable."));
  } catch (error) {
    console.error("Analysis Error:", error);
    return language === 'Hindi' ? "एआई से जुड़ने में त्रुटि। कृपया पुनः प्रयास करें।" : "Error connecting to AI. Please try again.";
  }
};

export const extractTextFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Data } },
        { text: "OCR TASK: Extract all text precisely." }
      ]
    },
    category: 'other'
  });
  return response.text || "";
};

export const cleanTranscribedText = async (text: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Clean and fix punctuation for the following transcribed text:\n\n${text}`,
        config: {
            systemInstruction: "You are a transcription assistant. Fix grammar, spelling, and punctuation without changing the original meaning or intent of the text."
        }
    });
    return response.text || text;
};

export const suggestTopicTag = async (content: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Suggest a single, short topic tag (max 2 words) for the following content:\n\n${content}`,
        config: {
            systemInstruction: "You are a categorization assistant. Respond with ONLY the tag."
        }
    });
    return (response.text || "General").trim();
};

export const suggestBookTags = async (title: string, description?: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: `Generate a list of AT LEAST 10 highly relevant subject, exam, and topic tags for a study material or book titled "${title}".
Description: ${description || 'N/A'}

Examples of tags: UPSC, Polity, Civics, Indian Constitution, Article 370, Fundamental Rights, Civil Services, GS Paper 2, Competitive Exams, Governance, Prelims, Mains, NCERT, Practice Set.

Respond with ONLY a comma-separated list of at least 10 tags. Do not write numbered lists, explanations, or quotes.`,
            config: {
                systemInstruction: "You are an expert academic taxonomy assistant. Respond with ONLY a comma-separated list of 10 or more tags."
            }
        });
        return (response.text || "").trim();
    } catch (e) {
        console.error("Error generating book tags:", e);
        return "Study Book, Exam Prep, Competitive Exam, NCERT, General Knowledge, Practice Set, Notes, Syllabus, Revision, Self Study";
    }
};

export const evaluateSubjectiveQuiz = async (questions: Question[], userAnswers: (string | null)[], subject: string): Promise<number> => {
    const content = `Subject: ${subject}, Evaluate each answer by comparing it to the provided model answer. Assign a merit score (0-100) per question. Calculate the weighted average across all questions.
    ${questions.map((q, i) => `Q${i+1}: ${q.question}\nModel: ${q.model_answer}\nUser: ${userAnswers[i] || "None"}`).join('\n\n')}`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: content,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { score: { type: Type.INTEGER, description: "Average merit score from 0 to 100." } },
                    required: ["score"]
                }
            },
            category: 'quiz'
        });
        const result = parseAIJson(response.text) || { score: 0 };
        return Math.min(100, Math.max(0, result.score));
    } catch (error) {
        console.error("Evaluation Error:", error);
        return 0;
    }
};

export const generateNotes = async (config: NoteConfig): Promise<{ content: string; handwrittenImageUrl?: string }> => {
    const { subject, topic, sourceText, language, format, includeCurrentAffairs, includeVocabulary, wordLimit, minWordLimit } = config;

    let formatInstruction = "";
    let limitInstruction = `Target Word Limit: ${wordLimit} words. Minimum required: ${minWordLimit || 500} words. You MUST write at least the minimum word count. Expand on theoretical concepts, historical context, examples, and deep analysis to ensure the final output meets or exceeds this word count constraint.`;

    switch (format) {
        case 'Smart':
            formatInstruction = "Provide ONLY main keywords and vital terms of the topics in a strictly point-wise list. DO NOT USE FULL SENTENCES. DO NOT provide detailed explanations or descriptions. Focus on keyword density for quick reference. NO paragraphs allowed.";
            limitInstruction = `MAXIMUM Word Limit: 300 words. Since this is a 'Smart' point-wise keyword format, you MUST be extremely concise. Do not exceed this limit.`;
            break;
        case 'Detail':
            formatInstruction = "Provide in-depth and comprehensive information. Explore the topic thoroughly.";
            break;
        case 'Point':
            formatInstruction = "Provide the notes STRICTLY ONLY in bullet points. DO NOT include any introduction, preface, or conclusion.";
            break;
    }

    const currentAffairsInstruction = includeCurrentAffairs ? "Include recent developments or current affairs related to this topic from the last 1 to 2 years." : "";
    const vocabularyInstruction = includeVocabulary ? "Include a 'Vocabulary List' section at the very end. Format it as a point-wise list (numbered or bulleted) containing at least 20 difficult or important words related to the topic and their definitions/meanings. Each word must be on a new line, like: '1. **Word** - Meaning'." : "";

    const negativeConstraints = `
    STRICTLY PROHIBITED:
    1. DO NOT include any tables (Markdown or otherwise).
    2. DO NOT mention names of any competitive exams (e.g., UPSC, State PCS, Banking, SSC, etc.).
    3. DO NOT include any quizzes, MCQs, or practice questions within the notes.`;

    const systemInstruction = `You are an expert educator creating high-quality study notes.
    Target Language: ${language}
    ${limitInstruction}
    
    INSTRUCTIONS:
    1. Organize the notes clearly with headings (H1, H2, H3), bold text for emphasis, and bullet lists where appropriate.
    2. Format: ${formatInstruction}
    3. ${currentAffairsInstruction}
    4. ${vocabularyInstruction}
    5. ${negativeConstraints}
    6. Return the notes formatted entirely in standard Markdown.`;

    const contents = `
    Subject: ${subject}
    Topic: ${topic}
    ${sourceText ? `\nSOURCE MATERIAL:\n${sourceText}` : ''}
    
    Please generate the study notes based on the instructions above.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: contents,
            config: { 
                systemInstruction
            },
            category: 'notes'
        });

        let handwrittenImageUrl: string | undefined = undefined;
        if (format === 'Smart') {
            try {
                handwrittenImageUrl = await generateHandwrittenImage(topic);
            } catch (e) {
                console.warn("Handwritten image generation skipped:", e);
            }
        }

        const resultMarkdown = response.text || "";

        return {
            content: resultMarkdown,
            handwrittenImageUrl
        };
    } catch (error: any) {
        console.error("Notes Generation Error:", error);
        throw new Error(error?.message || "Failed to generate notes. Please try again.");
    }
};

export const evaluateAnsChak = async (
    config: {
        context: string;
        maxMarks: string;
        wordLimit: string;
        answerText: string;
    }
): Promise<AnsChakFeedback> => {
    const { context, maxMarks, wordLimit, answerText } = config;

    const systemInstruction = `You are a strict but helpful exam evaluator. 
Evaluate the descriptive answer provided below based on the specific 9-criteria rubric. Calculate the score according to the assigned weightages and provide constructive, actionable feedback.

Answer Context/Topic: ${context}
Max Marks: ${maxMarks}
Word Limit: ${wordLimit}

Evaluation Rubric (Total 100% / Marks scale as per question):

1. Content & Analysis (60%)
- Relevance & Depth (25%): Does the answer directly address the core demand of the question? Is there a profound understanding of the topic?
- Originality & Analysis (15%): Does the candidate provide independent analysis rather than just rote facts? Are the insights well-thought-out?
- Argumentation (10%): Are arguments substantiated with relevant facts, data, reports, constitutional articles, or examples?
- Balanced Approach (10%): Is the answer objective? Are both sides of the issue (pros and cons) discussed, concluding with a balanced, forward-looking approach?

2. Structure & Articulation (25%)
- Clarity of Expression (10%): Is the language simple, clear, and easy to understand?
- Coherence & Flow (10%): Is there a logical progression from the Introduction to the Body and the Conclusion? Do the paragraphs connect seamlessly?
- Conciseness (5%): Does the answer adhere to the word limit while maximizing information density?

3. Language & Mechanics (15%)
- Presentation (10%): Are sub-headings, bullet points, flowcharts, or diagrams used effectively to make the answer scannable?
- Language Proficiency (5%): Is the grammar correct? Is appropriate technical/administrative terminology used?

Provide the feedback as a JSON object with the following schema:
{
    "score": (number, calculated based on the rubric applied to ${maxMarks}),
    "criteriaScores": [
        {
            "name": (string, criterion name e.g., "Relevance & Depth"),
            "weightage": (number, percentage weight of this criterion),
            "maxMarks": (number, calculated max marks for this criterion based on total ${maxMarks}),
            "awardedMarks": (number, actual marks awarded for this criterion),
            "status": (string, exactly "WELL DONE", "CAN IMPROVE", or "WRONG"),
            "justification": (string, specific justification for the marks and status)
        }
    ],
    "improvements": [
        {
            "issue": (string, identified issue),
            "solution": (string, concrete solution with specific data/frameworks)
        }
    ],
    "modelIntro": (string, a sample introduction that would elevate this specific answer),
    "modelConclusion": (string, a sample conclusion that would elevate this specific answer),
    "overallFeedback": (string, a summary feedback message)
}
Answer in the same language as the provided answer.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: answerText || "No answer provided.",
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.NUMBER },
                        criteriaScores: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    weightage: { type: Type.NUMBER },
                                    maxMarks: { type: Type.NUMBER },
                                    awardedMarks: { type: Type.NUMBER },
                                    status: { type: Type.STRING }, // "WELL DONE" | "CAN IMPROVE" | "WRONG"
                                    justification: { type: Type.STRING }
                                },
                                required: ["name", "weightage", "maxMarks", "awardedMarks", "status", "justification"]
                            }
                        },
                        improvements: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    issue: { type: Type.STRING },
                                    solution: { type: Type.STRING }
                                },
                                required: ["issue", "solution"]
                            }
                        },
                        modelIntro: { type: Type.STRING },
                        modelConclusion: { type: Type.STRING },
                        overallFeedback: { type: Type.STRING }
                    },
                    required: ["score", "criteriaScores", "improvements", "modelIntro", "modelConclusion", "overallFeedback"]
                }
            },
            category: 'ans_chak'
        });

        const result = parseAIJson(response.text);
        if (result && typeof result.score === 'number') {
            return result as AnsChakFeedback;
        }
    } catch (error) {
        console.error("evaluateAnsChak Error:", error);
    }
    
    return {
        score: 0,
        criteriaScores: [],
        improvements: [{ issue: "Evaluation failed", solution: "Please try submitting the answer again." }],
        modelIntro: "",
        modelConclusion: "",
        overallFeedback: "Evaluation failed. Error generating feedback."
    };
};

export interface ScanResult {
    answer: string;
    sourceFile: string;
    location: string;
    matchType: string;
}

export const scanDocumentForQuery = async (files: { base64?: string, text?: string, mimeType: string, filename: string }[], query: string): Promise<ScanResult> => {
    const prompt = `Your primary function is to accurately scan uploaded documents (PDF, TXT, CSV, HTML, XML) and find specific information requested by the user.

Task: You will be provided with a [User Query] and [Document Context] (which includes the text, file name, and page/line numbers). You must analyze the context and provide a highly detailed, clean, and point-wise response based ONLY on the provided text.

Rules & Guidelines:
1. Strict Boundary: Do not use your external knowledge. Answer strictly based on the provided [Document Context]. If the answer is not in the documents, clearly state: "Information not found in the uploaded documents."
2. Comprehensive Answering: Please provide BOTH direct information (explicit statements) AND indirect information (inferred, summarized, or related contexts) from the document to give a complete answer.
3. Clean Formatting (CRITICAL): 
   - Provide the answer in a strictly point-wise (bullet point) format.
   - DO NOT use any markdown symbols like **, #, __, or \` in the response.
   - Every point must be clear, professional, and easy to read.
4. Match Categorization:
   - Detail whether your answer is a "Direct Match", "Indirect Match", or "Both".
5. Citation is Mandatory: You must always cite the exact file name and page number/location.

Output Format Required:
Please format your response strictly as follows:
- Answer:
[Point 1]
[Point 2]
...
- Source File: [Name of the file]
- Page Number / Location: [Location in document]
- Match Type: [Direct Match / Indirect Match]

-----------------------------------------
[Document Context]: (Filenames: ${files.map(f => f.filename).join(', ')})
[User Query]: ${query}`;

    try {
        const parts: any[] = [];
        files.forEach(f => {
            if (f.text) {
                parts.push({ text: `\n--- DOCUMENT: ${f.filename} ---\n${f.text}\n--- END OF DOCUMENT ---\n` });
            } else if (f.base64) {
                parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
            }
        });
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: {
                parts: parts
            },
            category: 'pyq'
        });
        
        const rawText = response.text || "";
        
        const answerMatch = rawText.match(/- Answer:\s*([\s\S]*?)(?:- Source File:)/i);
        const sourceMatch = rawText.match(/- Source File:\s*(.*?)(?:\s*- Page Number \/ Location:)/i);
        const locationMatch = rawText.match(/- Page Number \/ Location:\s*(.*?)(?:\s*- Match Type:)/i);
        const typeMatch = rawText.match(/- Match Type:\s*(.*)/i);
        
        return {
            answer: answerMatch ? answerMatch[1].trim() : (rawText || "Information not found."),
            sourceFile: sourceMatch ? sourceMatch[1].trim() : files.map(f => f.filename).join(', '),
            location: locationMatch ? locationMatch[1].trim() : "Unknown",
            matchType: typeMatch ? typeMatch[1].trim() : "Indirect Match"
        };
    } catch (e: any) {
        console.error("Scan error", e);
        let errorMsg = e.message || "An unknown error occurred while scanning.";
        if (errorMsg.toLowerCase().includes("no pages") || errorMsg.includes("INVALID_ARGUMENT")) {
            errorMsg = "One of the uploaded PDF documents has no pages or is empty. Please check your documents.";
        }
        throw new Error(errorMsg);
    }
};


