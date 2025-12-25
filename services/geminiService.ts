
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, AIAnalysisResult } from "../types";
import { MEDICATIONS } from "../constants";

export const analyzeHealthStatus = async (state: AppState): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const takenMeds = MEDICATIONS.filter(m => state.takenMedications[m.id]).map(m => m.name);
  const missedMeds = MEDICATIONS.filter(m => !state.takenMedications[m.id]).map(m => m.name);
  
  const sleepLabels: Record<string, string> = { good: 'جيد', fair: 'متوسط', poor: 'سيء' };
  const appetiteLabels: Record<string, string> = { good: 'مفتوحة/جيدة', fair: 'عادية', poor: 'ضعيفة' };

  const prompt = `
    أنت خبير طبي مساعد ذكي باللغة العربية. حلل البيانات الصحية التالية لمريض عمره ${state.patientAge} واسمه ${state.patientName}:
    - الأدوية التي تم تناولها اليوم: ${takenMeds.join(', ') || 'لا يوجد'}
    - الأدوية المتبقية: ${missedMeds.join(', ') || 'الكل مأخوذ'}
    - تقييم الصحة العام (1-5): ${state.currentReport.healthRating}
    - مستوى الألم (0-10): ${state.currentReport.painLevel}
    - موقع الألم: ${state.currentReport.painLocation || 'لا يوجد ألم محدد'}
    - جودة النوم بالأمس: ${sleepLabels[state.currentReport.sleepQuality] || 'غير محدد'}
    - حالة الشهية اليوم: ${appetiteLabels[state.currentReport.appetite] || 'غير محدد'}
    - الأعراض الحالية: ${state.currentReport.symptoms.join(', ') || 'لا توجد أعراض'}
    - ملاحظات إضافية: ${state.currentReport.notes || 'لا توجد'}

    المطلوب تحليل دقيق بلهجة حكيمة ومطمئنة:
    1. ملخص شامل للحالة بناءً على توازن الأدوية والأعراض.
    2. توصيات محددة (تغذية، نشاط، أو مراجعة طبيب).
    3. تحذيرات صارمة إذا كانت الأعراض تتعارض مع أدوية السيولة (مثل Eliquis/Plavix) أو الضرة أو تشير لشدة ألم عالية.
    4. نقاط إيجابية لتشجيع المريض على الالتزام.

    يجب أن يكون الرد JSON باللغة العربية.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 4000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "ملخص عام للحالة الصحية" },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "قائمة التوصيات" },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "تحذيرات هامة" },
          positivePoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "نقاط إيجابية" }
        },
        required: ["summary", "recommendations", "warnings", "positivePoints"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from AI");
  return JSON.parse(text) as AIAnalysisResult;
};
