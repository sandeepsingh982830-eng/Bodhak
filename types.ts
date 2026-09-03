
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type QuestionType = 'objective' | 'subjective';
export type Language = 'English' | 'Hindi' | 'Punjabi';
export type QuizMode = 'practice' | 'test';
export type SourceMode = 'exact' | 'similar' | 'related';

export interface QuizConfig {
    subject: string;
    topic: string;
    additionalTopics?: string[];
    topicCounts?: number[];
    excludeQuestions?: string[];
    splitTopics?: boolean;
    numTopics?: number;
    sourceMaterial?: string;
    sourceFileName?: string;
    sourceMode: SourceMode;
    difficulty: Difficulty;
    language: Language;
    type: QuestionType;
    count: number;
    mode: QuizMode;
    includeImages: boolean;
    includeCurrentAffairs: boolean;
    includePYQ: boolean;
    pyqMaterial?: string;
    pyqFileName?: string;
    negativeMarking: boolean;
    timeLimit: number; // in minutes
    timerEnabled: boolean;
    marksPerQuestion: number;
    wordLimit?: number; // for subjective questions (answer length)
    minQuestionWords?: number; // for minimum word count of the question itself
    preserveSourceLanguage?: boolean;
}

export interface Question {
    question: string;
    options?: string[];
    correct_answer?: string;
    model_answer?: string;
    image_prompt?: string;
    imageUrl?: string;
    word_limit?: number;
    category?: 'PYQ' | 'Current Affairs' | 'Normal';
    points?: string[];
    syllabus_tags?: string[];
}

export type NoteTemplate = 'infographic' | 'cornell' | 'cheatsheet' | 'editorial' | 'classic';

export interface NoteConfig {
    subject: string;
    topic: string;
    sourceText?: string;
    sourceFileName?: string;
    language: 'English' | 'Hindi' | 'Punjabi';
    format: 'Smart' | 'Detail' | 'Point';
    template?: NoteTemplate;
    includeCurrentAffairs: boolean;
    includeVocabulary: boolean;
    wordLimit: number;
    minWordLimit?: number;
    timeLimit?: number;
}

export interface SavedNote {
    id: string;
    config: NoteConfig;
    content: string;
    handwrittenImageUrl?: string;
    createdAt: number;
}

export interface FileData {
    id: string;
    name: string;
    mimeType: string;
    url?: string;
    content?: string;
    webViewLink?: string;
    topicTags?: string[];
    fileData?: string;
    description?: string;
    price?: string;
}

export interface QuizHistoryItem {
    id: string;
    config: QuizConfig;
    questions: Question[];
    userAnswers: (string | null)[];
    reviewStatus?: boolean[];
    visitedStatus?: boolean[];
    feedback: string | null;
    score?: number;
    timeTaken?: number; // in seconds
    lastIndex?: number;
    isFinished?: boolean;
    createdAt: number;
}

export interface AnsChakConfig {
    context: string;
    maxMarks: string;
    wordLimit: string;
    answerText: string;
    sourceImage?: string; // base64 or url
    sourceFileName?: string;
}

export interface CriteriaScore {
    name: string;
    weightage: number;
    maxMarks: number;
    awardedMarks: number;
    status: 'WELL DONE' | 'CAN IMPROVE' | 'WRONG';
    justification: string;
}

export interface ActionableImprovement {
    issue: string;
    solution: string;
}

export interface AnsChakFeedback {
    score: number;
    criteriaScores: CriteriaScore[];
    improvements: ActionableImprovement[];
    overallFeedback: string;
    modelIntro: string;
    modelConclusion: string;
}

export interface CoinTransaction {
    id: string;
    amount: number;
    type: 'deduction' | 'addition' | 'reward';
    reason: string;
    timestamp: number;
}

export type GeminiWorkType = 'all' | 'quiz' | 'notes' | 'ans_chak' | 'ca' | 'pyq' | 'chat' | 'ocr';

export interface GeminiKeyConfig {
    id: string;
    key: string;
    label: string;
    workType: GeminiWorkType;
    isActive: boolean;
    createdAt: number;
    lastUsedAt?: number;
    usageCount?: number;
    status?: 'active' | 'quota_exhausted' | 'invalid' | 'unknown';
    lastTestedAt?: number;
    lastTestStatus?: 'valid' | 'invalid' | 'quota_exceeded';
    lastTestMessage?: string;
}

export type AppStep = 'home' | 'create' | 'quiz' | 'result' | 'history' | 'loading' | 'notes' | 'ans-chak' | 'pyq' | 'current-affairs' | 'current-affairs-hindu' | 'manager' | 'buy-m' | 'free-m' | 'anti-sleep';

