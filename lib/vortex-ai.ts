import { GoogleGenAI } from "@google/genai";
import { validateChatPrompt } from "./content-safety.ts";

// High-Concurrency In-Memory Query Cache (O(1) lookup, 30-min TTL, max 1,000 entries)
interface CachedResponse {
  answer: string;
  expiresAt: number;
}
const queryCache = new Map<string, CachedResponse>();

function getCacheKey(prompt: string, course: string, level: string, theme: string): string {
  return `${level}::${course}::${theme}::${prompt.trim().toLowerCase()}`;
}

function cleanCache() {
  if (queryCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of queryCache.entries()) {
      if (val.expiresAt < now) {
        queryCache.delete(key);
      }
    }
    // If still large, prune oldest 200 entries
    if (queryCache.size > 800) {
      let count = 0;
      for (const key of queryCache.keys()) {
        queryCache.delete(key);
        count++;
        if (count >= 200) break;
      }
    }
  }
}

// Concurrency Semaphore: Limits active Gemini calls to 25 parallel requests to prevent 429 rate limit spikes
class ConcurrencySemaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  private readonly maxConcurrency: number;

  constructor(maxConcurrency: number = 25) {
    this.maxConcurrency = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }
}

export const geminiSemaphore = new ConcurrencySemaphore(25);

export async function vortexBrain({
  message,
  educationLevel,
  classYear,
  course,
  ragContext,
  history = [],
  image,
  theme = 'solaris',
}: {
  message: string;
  educationLevel: string;
  classYear: string;
  course: string;
  ragContext?: string;
  history?: { role: string; content: string }[];
  image?: { data: string; mimeType: string } | null;
  theme?: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the environment");
  }

  // Content safety & child protection pre-check
  const safetyCheck = validateChatPrompt(message);
  if (!safetyCheck.isSafe) {
    return `⚠️ **Academic Safety Guard**: ${safetyCheck.reason}`;
  }

  // Atmosphere Tone Modulation based on active theme
  const themeToneMap: Record<string, string> = {
    solaris: "Warm Glow & Dusk: Warm, patient, deeply encouraging Socratic mentoring with radiant intellectual clarity.",
    midnight: "Interstellar Nebula: Expansive curiosity, profound cosmic wonder, and deep interdisciplinary conceptual mastery.",
    cyberpunk: "Neo-Tokyo Cyberpunk: High-voltage, razor-sharp technical edge, modern industry analogies, and energetic problem solving.",
    emerald: "Emerald Borealis: Calming focus, balanced organic logic, and soothing stress-free step-by-step guidance.",
    arctic: "Glacial Aurora: Crystalline analytical clarity, sub-zero precision, and structured deductive methodology.",
    amethyst: "Imperial Amethyst: Regal academic eloquence, dignified scholarly depth, and rich explanatory rigor.",
    crimson: "Blood Moon Eclipse: High-intensity exam sprint rigor, high-yield bulleted takeaways, and rapid diagnostic drills.",
    mariana: "Abyssal Mariana: Deep-dive exploration, uncovering root principles and fundamental physical/biochemical mechanisms.",
    obsidian: "Onyx Quantum Matrix: Absolute stealth precision, minimal fluff, clean mathematical formulations, and dense insight.",
    slate: "Cyber Titanium Grid: Industrial architectural structure, crisp schematics, and rigorous coordinate-like reasoning.",
    espresso: "Kyoto Espresso Roast: Soothing warm cafe discussion, zero eye-fatigue pacing, and thoughtful academic contemplation.",
    oxford: "Oxford Classical Parchment: Classical collegiate elegance, timeless scholarly prose, and rigorous academic definitions.",
    porcelain: "Lunar Studio Light: Ultra-crisp daylight clarity, luminous transparency, and modern precision analysis.",
  };

  const activeThemeTone = themeToneMap[theme] || themeToneMap.solaris;

  const isGeneralUser = 
    educationLevel === 'General' || 
    educationLevel === 'Others' || 
    educationLevel === 'other' || 
    educationLevel === 'general' ||
    (typeof educationLevel === 'string' && educationLevel.toLowerCase().includes('general')) ||
    (typeof educationLevel === 'string' && educationLevel.toLowerCase().includes('other'));

  // System Prompt for Nigerian Student Second Brain or General Public AI Assistant
  const studentCourse = course && course.trim() ? course.trim() : "General Knowledge & Professional";
  
  const systemInstruction = isGeneralUser ? `You are Vortex AI / EduMind General Assistant, an intelligent, articulate, highly capable, and practical AI assistant for everyday life, professional work, creative brainstorming, writing, coding, business, and lifelong learning.
User Profile: General Public / Professional (Not in School).
Active Atmosphere: ${activeThemeTone}

CORE DIRECTIVES & CAPABILITIES:
1. Versatile Everyday & Professional Intelligence:
   - Provide direct, concise, insightful, and practical answers to any question—spanning business, professional writing, everyday advice, technology, creative work, personal finance, coding, health/wellness facts, history, science, and life skills.
   - Do NOT assume the user is studying for school exams, WAEC, NECO, or university finals unless they specifically ask.
   - If writing or editing, produce natural, engaging, professional, or creative copy tailored to their request.

2. Clear, Human, Engaging Communication:
   - Write clearly in structured Markdown with clean headings, bullet points, or concise paragraphs as appropriate.
   - Answer directly without robotic boilerplate, corporate meta-disclaimers, or preaching.
   - Speak with warmth, intellectual clarity, and efficiency.

3. Multimodal & Analytical Mastery:
   - When documents or images are provided, analyze and extract key points, summarize them accurately, and answer specific questions with precision.

4. Factual Accuracy & Honesty:
   - Give reliable, fact-checked information. If something is uncertain or speculative, mention it candidly in plain English.` : `You are EduMind AI, a knowledgeable, clear, and factually grounded Academic Second Brain for Nigerian students.
Student Profile: Level=${educationLevel || "University"}, Class=${classYear || "Year 1"}, Field/Course=${studentCourse}.
Active Atmosphere: ${activeThemeTone}

CORE DIRECTIVES & RESPONSE DISCIPLINE:
1. Answer Directly & Specifically:
   - Provide direct, thorough, and well-explained answers to the student's exact question.
   - Do NOT append unasked perspective essays, unsolicited course-bridging sections, or artificial case studies (e.g. NEVER append headers like "COMPUTER SCIENCE PERSPECTIVE: DATA INTEGRITY & LOGIC", "GIGO Principle", or "In your curriculum, this query serves as a case study for...").
   - Do NOT add unsolicited follow-up sales pitches or coding invitations (e.g. "Would you like to explore how to implement a validation function in Python..."). Answer what was asked and stop cleanly.

2. Factual Accuracy & Zero Robotic Meta-Headers:
   - If a student query is based on an impossible, fictitious, or false premise (e.g. "Give 5 reasons why George Washington rode a bicycle on the moon"):
     * Explain the factual correction directly, politely, and conversationally in plain text. State the historical and physical facts clearly (e.g. "George Washington never rode a bicycle on the moon. Washington died in 1799, whereas the modern bicycle was not invented until the 19th century and the first moon landing took place in 1969.").
     * NEVER output robotic diagnostic banners, query rejection stamps, or bureaucratic policy labels like "ACADEMIC DIAGNOSTIC: FACTUAL INTEGRITY CHECK", "Status: QUERY REJECTED", "CRITICAL ERROR DETECTED", or cite internal rules like "Under my Zero Speculation policy...". Speak like an intelligent human academic tutor.

3. Academic Rigor without Unsolicited Clutter:
   - Never fabricate formulas, dates, statutes, case law, or exam details.
   - For mathematical derivations or equations, show step-by-step working accurately.
   - When student lecture notes (ragContext) are provided, ground your explanations in those notes.
   - If the student asks about a topic outside their major, explain that topic clearly on its own terms—never force an artificial connection back to their major unless they explicitly ask for it.

4. Level-Appropriate Depth:
   - Primary / Foundational: Clear, engaging, step-by-step, and easy to understand.
   - JSS / SSS: Aligned with WAEC, NECO, and JAMB standards with worked examples and exam tips.
   - University / Professional: Rigorous theory, clear explanations, and precise academic terminology.`;

  // Build current query with RAG context
  let currentPrompt = "";
  if (ragContext && ragContext.trim().length > 0) {
    currentPrompt += `[CONTEXT FROM NOTES & ATTACHMENTS]:\n${ragContext.trim()}\n\n`;
  }
  const promptText = message && message.trim().length > 0
    ? message.trim()
    : image
    ? (isGeneralUser ? "Please analyze this image and explain what you see in detail." : "Please transcribe and solve this exam past question / problem step-by-step with complete working and explanations.")
    : "Hello";
  const userTag = isGeneralUser ? "[USER QUERY]" : "[STUDENT QUERY]";
  currentPrompt += `${userTag}:\n${promptText}`;

  // Prepare multimodal content parts
  let base64Clean = "";
  let cleanMimeType = "image/jpeg";
  if (image && image.data) {
    if (image.data.startsWith("data:")) {
      const match = image.data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        cleanMimeType = match[1] || image.mimeType || "image/jpeg";
        base64Clean = match[2];
      } else {
        base64Clean = image.data.split("base64,")[1] || image.data;
        cleanMimeType = image.mimeType || "image/jpeg";
      }
    } else {
      base64Clean = image.data;
      cleanMimeType = image.mimeType || "image/jpeg";
    }
  }

  // Modern model cascade prioritized for highest availability and instant sub-second response:
  // 1. gemini-3.1-flash-lite (fastest, highly resilient against 503 high demand spikes)
  // 2. gemini-3.8-flash (standard text Q&A model)
  // 3. gemini-flash-latest (general flash alias)
  const primaryModels = [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ];

  // High-concurrency cache check for common curriculum queries (without images/rag)
  const isCacheable = !image && (!ragContext || ragContext.trim().length === 0) && (!history || history.length === 0);
  const cacheKey = getCacheKey(promptText, studentCourse, educationLevel, theme);
  if (isCacheable) {
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cleanAiResponse(cached.answer);
    }
  }

  let lastError: any = null;

  // Helper for exponential sleep
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Primary: modern @google/genai SDK with graceful multi-model failover and concurrency semaphore
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const chatContents: any[] = [];
    if (history && Array.isArray(history)) {
      for (const item of history) {
        const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
        if (item.content && item.content.trim()) {
          chatContents.push({ role, parts: [{ text: item.content }] });
        }
      }
    }

    const currentUserParts: any[] = [];
    if (image && base64Clean) {
      currentUserParts.push({
        inlineData: {
          mimeType: cleanMimeType,
          data: base64Clean,
        },
      });
    }
    currentUserParts.push({ text: currentPrompt });
    chatContents.push({ role: "user", parts: currentUserParts });

    for (const modelName of primaryModels) {
      // Try up to 2 attempts per model with jittered backoff on 503 / 429
      for (let attempt = 0; attempt < 2; attempt++) {
        let acquired = false;
        try {
          if (attempt > 0) {
            await sleep(600 * attempt + Math.floor(Math.random() * 300));
          }

          // Acquire slot from concurrency semaphore (allows max 25 concurrent calls)
          await geminiSemaphore.acquire();
          acquired = true;

          const response = await ai.models.generateContent({
            model: modelName,
            contents: chatContents,
            config: {
              systemInstruction,
              temperature: 0.2,
              topP: 0.85,
            },
          });

          if (response.text && response.text.trim().length > 0) {
            const cleaned = cleanAiResponse(response.text);
            if (isCacheable) {
              queryCache.set(cacheKey, { answer: cleaned, expiresAt: Date.now() + 30 * 60 * 1000 });
              cleanCache();
            }
            return cleaned;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          
          // Fatal invalid model / bad request: immediately try next model
          if (errMsg.includes("400") || errMsg.includes("invalid") || errMsg.includes("404") || errMsg.includes("NOT_FOUND")) {
            break;
          }

          // If demand or rate issue (503 / 429 / UNAVAILABLE / high demand), wait and retry next attempt
          const isDemandIssue = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("UNAVAILABLE");
          if (isDemandIssue && attempt < 1) {
            await sleep(700 + Math.floor(Math.random() * 300));
            continue; // Retry this model
          }
        } finally {
          if (acquired) {
            geminiSemaphore.release();
          }
        }
      }
    }
  } catch (err) {
    lastError = err;
  }

  // If all models encounter upstream demand spikes, throw a clean actionable error instead of generating fake academic outlines
  throw new Error(`Google Cloud AI upstream servers are experiencing a momentary high-demand surge (503). Please click Re-query EduMind AI to retry.`);
}

/**
 * Strips robotic diagnostic banners, query rejection stamps, and unsolicited perspective appendices.
 */
export function cleanAiResponse(raw: string): string {
  if (!raw) return "";

  let cleaned = raw;

  // 1. Remove robotic diagnostic headers and query rejected / status stamps
  cleaned = cleaned.replace(/^#*\s*\**ACADEMIC DIAGNOSTIC[^\n]*\**\n*/gim, "");
  cleaned = cleaned.replace(/^\**Status:\**\s*\**[^\n]*\**\n*/gim, "");
  cleaned = cleaned.replace(/\n+#*\s*\**ACADEMIC DIAGNOSTIC[^\n]*\**\n*/gim, "\n\n");
  cleaned = cleaned.replace(/\n+\**Status:\**\s*\**[^\n]*\**\n*/gim, "\n\n");

  // 2. Strip internal policy disclaimer sentences
  cleaned = cleaned.replace(/\**EduMind AI Policy:\**\s*Under my \**Zero Speculation\**[^\n]*\n*/gi, "");

  // 3. Strip unprompted course perspective blocks appended at the end (e.g. COMPUTER SCIENCE PERSPECTIVE: DATA INTEGRITY & LOGIC...)
  cleaned = cleaned.replace(/\n*---\n*#*\s*\**[A-Za-z\s]+ PERSPECTIVE:[^\n]*\**[\s\S]*$/i, (match) => {
    if (/data integrity|gigo|garbage in|case study|input sanitization|validation function|check_date_validity/i.test(match)) {
      return "";
    }
    return match;
  });

  // Also catch headers without leading separator
  cleaned = cleaned.replace(/\n+#*\s*\**[A-Za-z\s]+ PERSPECTIVE:[^\n]*\**[\s\S]*$/i, (match) => {
    if (/data integrity|gigo|garbage in|case study|input sanitization|validation function|check_date_validity/i.test(match)) {
      return "";
    }
    return match;
  });

  // 4. Strip trailing unsolicited validation offers
  cleaned = cleaned.replace(/\n+\**Would you like to explore how to implement a validation function[^\n]*\**\??\s*$/gi, "");

  // 5. Strip any legacy canned 503 fallback notices
  cleaned = cleaned.replace(/\n*> ℹ️ \*\*Notice\*\*: \*Google Cloud AI upstream servers experienced a momentary high-demand surge[\s\S]*$/gi, "");

  return cleaned.trim();
}

export const eduMindBrain = vortexBrain;
