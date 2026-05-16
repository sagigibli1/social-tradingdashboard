import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "תנאי שימוש - מערכת מעקב טריידינג",
};

export default function TermsPage() {
  return (
    <div className="p-6 min-h-full">
      <article className="max-w-3xl mx-auto text-[#D1D4DC] leading-7">
        <h1 className="text-[20px] font-semibold mb-4">תנאי שימוש</h1>

        <h2 className="text-[15px] font-semibold mt-5 mb-2">מהות הכלי</h2>
        <p className="text-[13px] mb-3">
          המערכת היא כלי לימודי בלבד. היא נועדה להמחיש שימוש בכלי AI ובשליפת
          מידע ממקורות ציבוריים, ולהראות איך בונים אגרגטור עם קלוד קוד. אין כאן
          מוצר השקעות, אין שירות פיננסי ואין פלטפורמת מסחר.
        </p>

        <h2 className="text-[15px] font-semibold mt-5 mb-2">מה הכלי לא</h2>
        <ul className="text-[13px] mb-3 list-disc pe-5 space-y-1">
          <li>לא ייעוץ השקעות</li>
          <li>לא המלצות קנייה או מכירה</li>
          <li>לא חיזוי מחירים</li>
          <li>לא הערכת שווי</li>
          <li>לא תחזית מסחר</li>
        </ul>

        <h2 className="text-[15px] font-semibold mt-5 mb-2">אחריות המשתמש</h2>
        <p className="text-[13px] mb-3">
          כל שימוש במידע או במערכת נעשה באחריות המשתמש בלבד. אין להסתמך על המידע
          לקבלת החלטות פיננסיות. הנתונים מוצגים כפי שהם, ללא אחריות לדיוק, שלמות
          או עדכניות.
        </p>

        <h2 className="text-[15px] font-semibold mt-5 mb-2">מקורות מידע</h2>
        <p className="text-[13px] mb-3">
          המידע נאסף ממקורות ציבוריים: רשתות חברתיות (X, Reddit, Hacker News),
          הזנות RSS של אתרי חדשות. הכלי אינו אוסף מידע אישי על המשתמש, ואינו
          שומר נתוני התנהגות באתר.
        </p>

        <h2 className="text-[15px] font-semibold mt-5 mb-2">שינויים</h2>
        <p className="text-[13px] mb-3">
          התנאים ניתנים לעדכון. תאריך עדכון אחרון: 17.5.2026.
        </p>
      </article>
    </div>
  );
}
