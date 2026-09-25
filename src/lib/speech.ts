// Web Speech API utilities for Voice Dictation and Read Aloud

export const isSpeechRecognitionSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
};

export const createSpeechRecognizer = (
  onTranscript: (transcript: { final: string; interim: string; full: string }) => void,
  onError: (error: string) => void,
  onEnd: () => void
) => {
  if (typeof window === 'undefined') return null;
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError('Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    try {
      recognition.lang = 'en-NG';
    } catch {
      recognition.lang = 'en-US';
    }

    let finalAccumulated = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalAccumulated += (finalAccumulated ? ' ' : '') + transcript.trim();
        } else {
          interim += transcript;
        }
      }

      const full = [finalAccumulated, interim.trim()].filter(Boolean).join(' ');
      onTranscript({
        final: finalAccumulated,
        interim: interim.trim(),
        full,
      });
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        onError(`Microphone: ${event.error}`);
      }
    };

    recognition.onend = () => {
      onEnd();
    };

    return recognition;
  } catch (err: any) {
    onError(err.message || 'Failed to start microphone.');
    return null;
  }
};

let currentUtterance: SpeechSynthesisUtterance | null = null;

export const speakText = (
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  rate = 1.0
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  // Strip markdown formatting symbols for natural speech
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#+\s+/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .slice(0, 3000); // limit reasonable speech length

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = rate;
  utterance.pitch = 1.0;
  utterance.lang = 'en-US';

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  utterance.onend = () => {
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  utterance.onerror = () => {
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
};
