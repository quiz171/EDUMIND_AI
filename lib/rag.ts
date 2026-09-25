import mammoth from "mammoth";
import * as pdfParseModule from "pdf-parse";
import { GoogleGenAI } from "@google/genai";

// Global in-memory storage for uploaded document chunks (bounded to 3,000 chunks to prevent memory bloat)
export const globalChunks: string[] = [];

export function appendChunks(newChunks: string[]) {
  if (!newChunks || newChunks.length === 0) return;
  globalChunks.push(...newChunks);
  if (globalChunks.length > 3000) {
    globalChunks.splice(0, globalChunks.length - 3000);
  }
}

export function chunkText(text: string, size: number = 1000, overlap: number = 100): string[] {
  if (!text || text.trim().length === 0) return [];
  
  const chunks: string[] = [];
  let startIndex = 0;
  const cleanText = text.replace(/\r\n/g, "\n").trim();

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + size;

    // If we're not at the very end, try to break at a newline or space
    if (endIndex < cleanText.length) {
      const nextNewline = cleanText.lastIndexOf("\n", endIndex);
      const nextSpace = cleanText.lastIndexOf(" ", endIndex);
      
      if (nextNewline > startIndex + size * 0.6) {
        endIndex = nextNewline + 1;
      } else if (nextSpace > startIndex + size * 0.6) {
        endIndex = nextSpace + 1;
      }
    } else {
      endIndex = cleanText.length;
    }

    const chunk = cleanText.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (endIndex >= cleanText.length) {
      break;
    }

    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
}

export async function processFile(
  buffer: Buffer,
  fileName: string
): Promise<{ text: string; chunks: string[] }> {
  let text = "";

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    try {
      const pdfModule: any = pdfParseModule;
      if (pdfModule && pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const res = await parser.getText();
        text = res?.text || "";
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      } else if (typeof pdfModule === "function") {
        const pdfData = await pdfModule(buffer);
        text = pdfData?.text || "";
      } else if (typeof pdfModule?.default === "function") {
        const pdfData = await pdfModule.default(buffer);
        text = pdfData?.text || "";
      } else {
        text = buffer.toString("utf-8");
      }
    } catch (err) {
      console.warn("PDF parse failed, falling back to raw text extraction:", err);
      text = buffer.toString("utf-8");
    }
  } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } catch (err) {
      console.warn("DOCX extraction failed, falling back to filtered text:", err);
      text = buffer.toString("utf-8");
    }
  } else if (
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".bmp")
  ) {
    // Educational Image OCR / Past Question photo extraction using Gemini
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const ai = new GoogleGenAI({ apiKey });
        const base64Image = buffer.toString("base64");
        const mime = lowerName.endsWith(".png") ? "image/png" : lowerName.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const ocrRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: mime,
                data: base64Image,
              },
            },
            {
              text: "Extract and transcribe all educational text, questions, options, formulas, diagrams, labels, and numbers visible in this study material or exam past question paper. Include question numbers and complete text so a student can study, search, and practice it.",
            },
          ],
        });
        text = ocrRes.text || "";
      }
    } catch (ocrErr) {
      console.warn("Gemini vision transcription for image failed:", ocrErr);
      text = `[Exam Past Question / Study Material Image: ${fileName}]`;
    }
  } else {
    // Plain text, markdown, csv, code files, json, etc.
    text = buffer.toString("utf-8");
  }

  // Remove XML tags if any were left over from zipped docx/xml files
  if (text.includes("<w:") || text.includes("</w:")) {
    text = text.replace(/<[^>]+>/g, " ");
  }

  // Clean non-printable characters except newlines/tabs
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  text = text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

  // If text is still empty or minimal, provide a fallback description so indexing doesn't fail
  if (!text || text.length < 5) {
    text = `Document: ${fileName}\n(Content parsed from uploaded student material)`;
  }

  const chunks = chunkText(text, 1000, 100);

  // Store in global chunks cache
  for (const c of chunks) {
    if (!globalChunks.includes(c)) {
      globalChunks.push(c);
    }
  }

  return {
    text,
    chunks: chunks.length > 0 ? chunks : [text],
  };
}

/**
 * TF-IDF / Keyword match scoring to rank chunks for a query
 */
export function getRelevantChunks(
  query: string,
  allChunks: string[] = globalChunks,
  topK: number = 5
): string[] {
  if (!query || allChunks.length === 0) return [];

  // Extract query keywords (alphanumeric, lowercase, length > 2)
  const stopWords = new Set([
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "in", "for", "to", "of", "with",
    "what", "how", "why", "who", "when", "where", "can", "you", "tell", "me", "about", "explain"
  ]);

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (queryTerms.length === 0) {
    return allChunks.slice(0, topK);
  }

  // Document frequencies for IDF calculation
  const docFreq: { [term: string]: number } = {};
  for (const term of queryTerms) {
    docFreq[term] = 0;
    for (const chunk of allChunks) {
      if (chunk.toLowerCase().includes(term)) {
        docFreq[term]++;
      }
    }
  }

  const N = allChunks.length;

  // Score each chunk
  const scoredChunks = allChunks.map((chunk) => {
    const lowerChunk = chunk.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (docFreq[term] > 0) {
        // Term frequency in chunk
        const regex = new RegExp(`\\b${term}\\b`, "g");
        const matchCount = (lowerChunk.match(regex) || []).length;
        const tf = matchCount > 0 ? 1 + Math.log10(matchCount) : 0;
        
        // Inverse document frequency
        const idf = Math.log10((N + 1) / (docFreq[term] + 1)) + 1;
        score += tf * idf;
      }
    }

    return { chunk, score };
  });

  // Filter chunks with positive match score, sort descending
  const relevant = scoredChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.chunk);

  if (relevant.length === 0) {
    return [];
  }

  return relevant.slice(0, topK);
}
