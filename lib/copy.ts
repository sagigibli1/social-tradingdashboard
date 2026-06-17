// Single source of truth for Hebrew UI strings.
// Every visible label, button, tooltip, empty state, error toast - lives here.
// Style: plain everyday Israeli Hebrew (per MEMORY.md). No formal/literary words.
// Punctuation AFTER Hebrew text: "רוצים ללמוד עוד?" not "?רוצים ללמוד עוד".

export const copy = {
  // App brand / chrome
  appBrand: "מערכת מעקב טריידינג",
  appBrandSubtitle: "כלי לימודי",
  pageTitle: "מערכת מעקב טריידינג - כלי לימודי",
  pageDescription:
    "אגרגטור חדשות ורשתות חברתיות לטיקרים פופולריים. כלי לימודי בלבד, לא ייעוץ השקעות.",

  // Top-level nav (left rail)
  navOverview: "סקירה כללית",
  navFeed: "פיד",
  navTrends: "מגמות",
  navSources: "מקורות",
  navTerms: "תנאי שימוש",

  // Sync button + status
  syncButton: "סנכרן עכשיו",
  syncButtonLoading: "מסנכרן...",
  syncStatusIdle: "מוכן לסנכרון",
  syncStatusRunning: "מסנכרן מקורות...",
  syncStatusDoneShort: "סנכרון הסתיים",
  syncStatusFailed: "הסנכרון נכשל",
  syncRateLimited: "סנכרון זמין שוב בעוד רגע",
  syncRateLimitedSeconds: (n: number) => `המתינו ${n} שניות לפני סנכרון נוסף`,

  // Sentiment labels (describe text TONE, not investment direction)
  sentimentPositive: "טון חיובי",
  sentimentNegative: "טון שלילי",
  sentimentNeutral: "טון ניטרלי",
  sentimentColumnHeader: "נימת הטקסט",
  sentimentTooltip: "מתאר את אופי הטקסט בלבד, לא הערכת השקעה.",

  // Disclaimer strip + modal
  disclaimerStrip: "כלי לימודי בלבד. לא ייעוץ השקעות, לא המלצות, לא תחזיות.",
  disclaimerLink: "פרטים",
  disclaimerModalTitle: "כלי לימודי",
  disclaimerModalBody:
    "המערכת אוספת פוסטים וכתבות מ-X, רדיט, RSS ו-Hacker News כדי להראות איך בונים אגרגטור עם קלוד קוד. אין כאן ייעוץ השקעות, אין המלצת קנייה או מכירה, ואין תחזית מחיר. כל החלטה כלכלית באחריותכם. תוויות הטון מתארות את אופי הטקסט שמצאנו ברשת, לא את כיוון השוק.",
  disclaimerModalAck: "הבנתי, בואו נמשיך",

  // Watchlist (right rail)
  watchlistTitle: "רשימת מעקב",
  watchlistColTicker: "טיקר",
  watchlistColMentions24h: "אזכורים 24 שעות",
  watchlistColTrend: "מגמה",
  watchlistColSentiment: "טון",
  watchlistEmpty: "אין אזכורים עדיין. לחצו סנכרן עכשיו.",

  // Feed table
  feedTitle: "פיד מלא",
  feedColTime: "זמן",
  feedColSource: "מקור",
  feedColTitle: "כותרת",
  feedColTickers: "טיקרים",
  feedColSentiment: "טון",
  feedColEngagement: "מעורבות",
  feedFilterAll: "הכל",
  feedFilterSource: "מקור",
  feedFilterTicker: "טיקר",
  feedFilterLang: "שפה",
  feedRowOpen: "פתחו פריט",

  // Item drawer
  drawerOriginalSource: "מקור מקורי",
  drawerAuthor: "מחבר",
  drawerPublishedAt: "פורסם",
  drawerEngagement: "מעורבות",
  drawerTickers: "טיקרים שזוהו",
  drawerSentimentSection: "ניתוח טון",
  drawerSummaryLabel: "סיכום קצר",
  drawerOpenExternal: "פתחו במקור",

  // Trends page
  trendsTitle: "מגמות לפי טיקר",
  trendsSpikeBadge: "ספייק פעילות",
  trendsVelocityLabel: "מהירות",
  trendsWindow1h: "שעה אחרונה",
  trendsWindow24h: "24 שעות אחרונות",
  trendsWindow7d: "7 ימים אחרונים",
  trendsEmpty: "עדיין אין נתוני מגמה. לחצו סנכרן עכשיו.",

  // Sources page
  sourcesTitle: "ניהול מקורות",
  sourcesTabFeeds: "ערוצי מידע",
  sourcesTabTickers: "טיקרים",
  sourcesAddFeed: "הוסיפו ערוץ",
  sourcesAddTicker: "הוסיפו טיקר",
  sourcesToggleEnable: "פעיל",
  sourcesToggleDisable: "מבוטל",
  sourcesRemove: "הסירו",

  // Terms page
  termsTitle: "תנאי שימוש",

  // Empty states + loaders
  emptyFeed: "אין פריטים עדיין. לחצו סנכרן עכשיו להתחיל.",
  loading: "טוען...",
  loadingSync: "מסנכרן מקורות...",

  // Error toasts
  errorGeneric: "משהו השתבש. נסו שוב בעוד רגע.",
  errorSyncFailed: "הסנכרון נכשל. בדקו את החיבור לאינטרנט.",
  errorNoData: "אין נתונים להצגה.",

  // Pause / a11y
  pauseTickerTape: "השהו פס הטיקרים",
  resumeTickerTape: "המשיכו פס הטיקרים",
  pausePulse: "השהו אנימציית סנכרון",
  resumePulse: "המשיכו אנימציית סנכרון",

  // Bottom panel
  bottomPanelOpen: "פתחו פאנל תחתון",
  bottomPanelClose: "סגרו פאנל תחתון",
  bottomTabFilters: "סינונים",
  bottomTabActions: "פעולות",
  bottomTabHistory: "היסטוריה",
  bottomHistoryEmpty: "אין סנכרונים שמורים.",
  bottomActionsHint: "סמנו פריטים בפיד כדי להפעיל פעולות בקבוצה.",
  bottomFiltersHint: "פתחו את עמוד הפיד לסינון פריטים לפי מקור, טיקר ושפה.",

  // Left rail toggles
  railExpand: "הרחיבו תפריט",
  railCollapse: "כווצו תפריט",

  // Watchlist toggle
  watchlistHide: "הסתירו רשימת מעקב",
  watchlistShow: "הציגו רשימת מעקב",

  // Overview page sections
  overviewTopTickers: "טיקרים בולטים",
  overviewVelocity: "מהירות אזכורים",
  overviewLiveFeed: "הזרם החי",
  overviewSeeAll: "לפיד המלא",

  // Feed drawer
  feedDrawerClose: "סגרו פריט",
  feedDrawerEngagementLabel: "מעורבות מנורמלת",
  feedDrawerRawEngagement: "מעורבות גולמית",
  feedDrawerNoSentiment: "טרם נותח טון לפריט הזה.",

  // Bulk actions placeholder
  feedBulkSelected: "פריטים מסומנים",
  feedBulkHide: "הסתירו",
  feedBulkCopyUrl: "העתיקו קישור",
  feedBulkCopied: "הקישורים הועתקו",

  // Trends detail
  trendsBackToGrid: "חזרה לרשימת הטיקרים",
  trendsRecentItems: "אזכורים אחרונים",
  sourceBreakdownTitle: "פילוח לפי מקור",
  sourceBreakdownEmpty: "אין אזכורים בחלון הזמן שנבחר.",
  trendsForecastLabel: "תחזית מגמה",
  trendsActualLabel: "פעילות בפועל",

  // Tooltip explanations (English)
  tooltipTrendExplain:
    "How much more this stock is being talked about vs. its usual level. 9.0x = mentioned 9× more than normal. Higher number = bigger spike in attention.",
  tooltipEngagementExplain:
    "How popular this post is compared to other recent posts from the same source. 100% = most engaging post. Based on likes, shares, and comments.",

  // Sources page bits
  sourcesColType: "סוג מקור",
  sourcesColHandle: "ערוץ",
  sourcesColItems: "פריטים",
  sourcesColLastSync: "סנכרון אחרון",
  sourcesColStatus: "סטטוס",
  sourcesEditLater: "ניהול ערוצים נוסף יגיע בגרסה הבאה.",
  sourcesNever: "טרם סונכרן",
  sourcesTickersTitle: "טיקרים במעקב",

  // Lang filter labels
  langEnglish: "אנגלית",
  langHebrew: "עברית",
  langOther: "אחר",

  // Terms page section headings (page body uses inline Hebrew prose)
  termsLastUpdated: "עודכן לאחרונה",

  // Generic
  closeButton: "סגרו",
  retry: "נסו שוב",
  yes: "כן",
  no: "לא",
  search: "חיפוש",

  // Pagination
  paginationPrev: "הקודם",
  paginationNext: "הבא",

  // Trends grid card labels
  trendsCardMentions: "אזכורים",
  trendsCardVelocity: "מהירות",
  trendsCardSpark: "מגמת 7 ימים",

  // Sources extras
  sourcesReadOnlyNote: "עריכת מקורות תבוא בגרסה הבאה. כרגע לקריאה בלבד.",
  sourcesTickerCategoryStock: "מניה",
  sourcesTickerCategoryCrypto: "קריפטו",
  sourcesTickerCategoryAi: "מונח AI",
  sourcesTickerColSymbol: "סימול",
  sourcesTickerColName: "שם",
  sourcesTickerColCategory: "קטגוריה",
} as const;

export type CopyKey = keyof typeof copy;
