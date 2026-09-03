export type Language = 'en' | 'hi';

export interface AppTranslations {
    appName: string;
    slogan: string;
    home: string;
    notes: string;
    ansChak: string;
    pyqScanner: string;
    currentAffairs: string;
    quizGen: string;
    history: string;
    profile: string;
    managerPortal: string;
    logout: string;
    settings: string;
    language: string;
    buyCoins: string;
    coinBalance: string;
    announcements: string;
    recentAnnouncements: string;
    noAnnouncements: string;
    latestUpdates: string;
    downloadApp: string;
    activeTitle: string;
    quoteOfDay: string;
    quoteAuthor: string;
    aiDoubtSolver: string;
    aiAssistantDesc: string;
    supportDesk: string;
    askAnythingPrompt: string;
    typeMessage: string;
    send: string;
    attachImage: string;
    imageLimitMsg: string;
    solvingDoubt: string;
    selectLanguage: string;
    chat: string;
    close: string;
    quickBuyCoins: string;
    buyNow: string;
    coinsCount: string;
    adminBroadcast: string;
    broadcastLabel: string;
    broadcastPlaceholder: string;
    broadcasting: string;
    broadcastSuccess: string;
    deleteConfirm: string;
    sentBy: string;
    quizGeneratorTitle: string;
    ansChakTitle: string;
    notesTitle: string;
    pyqTitle: string;
    buyM: string;
    freeM: string;
    antiSleepAlarm: string;
}

export const translations: Record<Language, AppTranslations> = {
    en: {
        appName: "Bodhak",
        slogan: "Your Intelligent Preparation Buddy!",
        home: "Home",
        notes: "Notes",
        ansChak: "Ans. Chak",
        pyqScanner: "PYQ",
        currentAffairs: "CA",
        quizGen: "Quiz",
        history: "History",
        profile: "My Profile",
        managerPortal: "Manager Portal",
        logout: "Log Out",
        settings: "Settings",
        language: "App Language",
        buyCoins: "Buy Coins",
        coinBalance: "Coins",
        announcements: "Manager Announcements 📢",
        recentAnnouncements: "Recent Announcements",
        noAnnouncements: "No announcements yet",
        latestUpdates: "Latest Updates",
        downloadApp: "Download App",
        activeTitle: "Active Tools",
        quoteOfDay: "Quote of the Day",
        quoteAuthor: "Bodhak Team",
        aiDoubtSolver: "AI Doubt Solver 🤖",
        aiAssistantDesc: "Ask study doubts, crop questions, or ask coin queries instantly!",
        supportDesk: "Manager Support Desk 💬",
        askAnythingPrompt: "Type any academic doubt, or attach a photo of a question!",
        typeMessage: "Type a message...",
        send: "Send",
        attachImage: "Attach Photo",
        imageLimitMsg: "Image limit is 600KB",
        solvingDoubt: "Analyzing question & writing solution...",
        selectLanguage: "Select App Language",
        chat: "AI Chat",
        close: "Close",
        quickBuyCoins: "Quickly want to buy coins?",
        buyNow: "Buy Now",
        coinsCount: "Coins Count",
        adminBroadcast: "Send New Announcement",
        broadcastLabel: "Title (English or Hindi)",
        broadcastPlaceholder: "What is happening today...",
        broadcasting: "Broadcasting announcement...",
        broadcastSuccess: "Broadcasted successfully!",
        deleteConfirm: "Are you sure you want to delete this notification?",
        sentBy: "Sent by",
        quizGeneratorTitle: "Quiz Generator / मॉक टेस्ट ⚡",
        ansChakTitle: "Ans. Chak / उत्तर जाँचे 📝",
        notesTitle: "Smart Notes / नोट्स 📚",
        pyqTitle: "PYQ Scanner / पिछले वर्ष के प्रश्न 🔍",
        buyM: "Buy Materials",
        freeM: "Free Materials",
        antiSleepAlarm: "Anti-Sleep Alarm 👁️"
    },
    hi: {
        appName: "बोधक (Bodhak)",
        slogan: "आपकी तैयारी का स्मार्ट साथी! 📲",
        home: "मुख्य पृष्ठ",
        notes: "नोट्स",
        ansChak: "उत्तर जाँचे",
        pyqScanner: "PYQ",
        currentAffairs: "CA",
        quizGen: "Quiz",
        history: "इतिहास",
        profile: "प्रोफ़ाइल",
        managerPortal: "मैनेजर पोर्टल",
        logout: "लॉग आउट",
        settings: "सेटिंग्स",
        language: "ऐप की भाषा",
        buyCoins: "कॉइन्स खरीदें",
        coinBalance: "सिक्के का बैलेंस",
        announcements: "महत्वपूर्ण घोषणाएं 📢",
        recentAnnouncements: "नवीनतम घोषणाएं",
        noAnnouncements: "कोई घोषणा उपलब्ध नहीं है",
        latestUpdates: "ताजा खबरें",
        downloadApp: "एप डाउनलोड करें",
        activeTitle: "सक्रिय अध्ययन टूल्स",
        quoteOfDay: "आज का सुविचार",
        quoteAuthor: "बोधक",
        aiDoubtSolver: "AI शंका समाधान 🤖",
        aiAssistantDesc: "पढ़ाई की कोई शंका पूछें, प्रश्न की फ़ोटो भेजें या सवाल करें!",
        supportDesk: "मदद और सहायता डेस्क 💬",
        askAnythingPrompt: "कोई भी पढ़ाई का सवाल लिखें, या सवाल की तस्वीर भेजें!",
        typeMessage: "अपना सन्देश लिखें या प्रश्न पूछें...",
        send: "भेजें",
        attachImage: "फोटो जोड़ें",
        imageLimitMsg: "चित्र का आकार 600KB से कम होना चाहिए।",
        solvingDoubt: "आपके प्रश्न का विश्लेषण कर रहे हैं...",
        selectLanguage: "ऐप की भाषा चुनें",
        chat: "AI चैट",
        close: "बंद करें",
        quickBuyCoins: "क्या आप और कॉइन्स खरीदना चाहते हैं?",
        buyNow: "अभी खरीदें",
        coinsCount: "सिक्के",
        adminBroadcast: "नई घोषणा भेजें",
        broadcastLabel: "घोषणा शीर्षक (हिंदी या अंग्रेजी)",
        broadcastPlaceholder: "यहाँ नया सन्देश टाइप करें...",
        broadcasting: "घोषणा प्रसारित की जा रही है...",
        broadcastSuccess: "घोषणा सफलतापूर्वक भेजी गयी!",
        deleteConfirm: "क्या आप वाकई इस सूचना को हटाना चाहते हैं?",
        sentBy: "प्रेषक",
        quizGeneratorTitle: "Quiz / मॉक टेस्ट ⚡",
        ansChakTitle: "Ans. Chak / उत्तर जाँचे 📝",
        notesTitle: "Smart Notes / नोट्स 📚",
        pyqTitle: "PYQ Scanner / पिछले वर्ष के प्रश्न 🔍",
        buyM: "स्टडी मटेरियल खरीदें",
        freeM: "फ्री मटेरियल",
        antiSleepAlarm: "एंटी-स्लीप अलार्म 👁️"
    }
};
