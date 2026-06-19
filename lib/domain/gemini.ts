/**
 * Gedeelde helper voor gestructureerde Gemini-calls (REST `generateContent` met
 * `responseSchema`). Gebruikt door de AI-verdeelsleutel (allocation-suggestion.ts)
 * en de AI-PV-tekst (pv-narrative.ts).
 */
export function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function callGeminiStructured<T>(options: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
}): Promise<{ model: string; data: T }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = getGeminiModel();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Voeg deze toe aan je lokale environment om AI-tekst te genereren.",
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: options.userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini response failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const blockReason = payload?.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Gemini blokkeerde het verzoek (${blockReason}).`
        : "Gemini-response bevatte geen bruikbare tekst.",
    );
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error("Gemini-response kon niet als geldige JSON worden gelezen.");
  }

  return { model, data };
}
