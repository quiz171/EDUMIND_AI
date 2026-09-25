/**
 * EduMind AI - Child Protection & Academic Content Safety Guard
 * Multi-layer safety enforcement for student data, document processing, and chat prompts.
 */

// Blocked video and non-academic media extensions
export const BLOCKED_VIDEO_EXTENSIONS = [
  '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.3gp', '.m4v', '.ts', '.vob', '.ogv'
];

// Allowed educational image extensions for past question photos, handwritten notes, and diagrams
export const ALLOWED_IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.heic'
];

export const BLOCKED_EXEC_EXTENSIONS = [
  '.exe', '.sh', '.bat', '.bin', '.cmd', '.vbs', '.msi', '.dll', '.so', '.apk', '.dmg', '.iso'
];

// Allowed educational document and image extensions
export const ALLOWED_DOC_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.txt', '.rtf', '.md', '.csv', '.xlsx', '.xls', '.pptx', '.ppt',
  '.png', '.jpg', '.jpeg', '.webp',
  '.py', '.java', '.c', '.cpp', '.cs', '.js', '.ts', '.html', '.css', '.json'
];

// Adult / Sexually explicit keywords filter (regex matching whole words or substrings)
const EXPLICIT_KEYWORDS = [
  'porn', 'pornography', 'pornographic', 'xxx', 'nsfw', 'hentai', 'erotic', 'nude', 'nudity', 
  'sex video', 'sex tape', 'blowjob', 'handjob', 'orgasm', 'masturbat', 'penis',
  'vagina', 'clitoris', 'boobs', 'breast', 'dick', 'pussy', 'slut', 'whore',
  'pedophile', 'pedophilia', 'child abuse', 'underage sex', 'csam', 'incest'
];

export interface SafetyCheckResult {
  isSafe: boolean;
  reason?: string;
  category?: 'video_restriction' | 'image_restriction' | 'explicit_content' | 'malicious_file' | 'policy_violation';
}

/**
 * Checks if a file upload complies with academic safety guidelines.
 */
export function validateFileUpload(fileName: string, mimeType?: string, fileSize?: number): SafetyCheckResult {
  const lowerName = fileName.toLowerCase().trim();

  // 1. Check video files (maintain strict minor protection against video uploads)
  for (const ext of BLOCKED_VIDEO_EXTENSIONS) {
    if (lowerName.endsWith(ext) || (mimeType && mimeType.startsWith('video/'))) {
      return {
        isSafe: false,
        category: 'video_restriction',
        reason: 'Video uploads are strictly restricted. EduMind AI accepts past question images (JPG, PNG) and academic text documents (PDF, DOCX, TXT) to maintain focused educational boundaries.',
      };
    }
  }

  // 2. Check executables / malicious binaries
  for (const ext of BLOCKED_EXEC_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      return {
        isSafe: false,
        category: 'malicious_file',
        reason: `Executable or script format (${ext}) is blocked for safety and integrity.`,
      };
    }
  }

  // 3. Check explicit terms in filename
  for (const word of EXPLICIT_KEYWORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lowerName) || lowerName.includes(word)) {
      return {
        isSafe: false,
        category: 'explicit_content',
        reason: 'Safety policy violation: The uploaded file name contains restricted or adult terminology. Underage and pornographic content is strictly prohibited.',
      };
    }
  }

  return { isSafe: true };
}

/**
 * Validates text content extracted from documents for sexually explicit / inappropriate content.
 */
export function validateExtractedText(text: string): SafetyCheckResult {
  if (!text) return { isSafe: true };
  const lowerText = text.toLowerCase();

  // Check density of explicit terms
  let violations = 0;
  for (const word of EXPLICIT_KEYWORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      violations += matches.length;
      if (violations >= 2 || word === 'csam' || word === 'pedophilia' || word === 'underage sex') {
        return {
          isSafe: false,
          category: 'explicit_content',
          reason: 'Document safety rejection: The document contains explicit, adult, or inappropriate content violating academic child safety standards.',
        };
      }
    }
  }

  return { isSafe: true };
}

/**
 * Validates a user's chat prompt for child safety and explicit content.
 */
export function validateChatPrompt(prompt: string): SafetyCheckResult {
  if (!prompt) return { isSafe: true };
  const lower = prompt.toLowerCase();

  for (const word of EXPLICIT_KEYWORDS) {
    // Check specific dangerous patterns
    if (
      word === 'csam' || 
      word === 'pedophilia' || 
      word === 'underage sex' || 
      word === 'child abuse'
    ) {
      if (lower.includes(word)) {
        return {
          isSafe: false,
          category: 'policy_violation',
          reason: 'Zero-tolerance policy violation: Queries involving child abuse or exploitation are strictly prohibited and immediately blocked.',
        };
      }
    }

    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lower)) {
      return {
        isSafe: false,
        category: 'explicit_content',
        reason: 'Content Policy Restriction: EduMind AI is an academic educational Second Brain. Inappropriate, adult, or sexually explicit requests are not permitted.',
      };
    }
  }

  return { isSafe: true };
}
