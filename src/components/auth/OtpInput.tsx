import React, { useRef, useEffect, useState, useId } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export type OtpVerificationStatus = 'idle' | 'verifying' | 'success' | 'error';

export interface OtpInputProps {
  /** Total number of digits (default: 6) */
  length?: number;
  /** Current value of the OTP (string or digits array) */
  value: string;
  /** Callback fired whenever digits change */
  onChange: (otp: string) => void;
  /** Callback fired automatically when all digits are filled */
  onComplete?: (otp: string) => void;
  /** Visual verification status */
  status?: OtpVerificationStatus;
  /** Custom error message to display under the input */
  errorMessage?: string | null;
  /** Custom success message to display under the input */
  successMessage?: string | null;
  /** Whether the inputs are disabled */
  disabled?: boolean;
  /** Whether to auto-focus the first box on mount */
  autoFocus?: boolean;
  /** Optional custom ID prefix for accessibility */
  id?: string;
  /** Optional container class name */
  className?: string;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  length = 6,
  value = '',
  onChange,
  onComplete,
  status = 'idle',
  errorMessage = null,
  successMessage = null,
  disabled = false,
  autoFocus = true,
  id: customId,
  className = '',
}) => {
  const generatedId = useId();
  const baseId = customId || `otp-${generatedId}`;

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Split value into an array of characters padded to length
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  // Trigger shake animation whenever status transitions to 'error'
  useEffect(() => {
    if (status === 'error') {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 450);
      return () => clearTimeout(timer);
    }
  }, [status, errorMessage]);

  // Auto-focus the first empty box or first box on mount
  useEffect(() => {
    if (autoFocus && !disabled && status !== 'verifying') {
      const firstEmptyIndex = digits.findIndex((d) => !d);
      const targetIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
      inputRefs.current[targetIndex]?.focus();
      setActiveIndex(targetIndex);
    }
  }, []); // Run on mount

  // Focus a specific box
  const focusBox = (index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index));
    inputRefs.current[clamped]?.focus();
    inputRefs.current[clamped]?.select();
    setActiveIndex(clamped);
  };

  // Handle single character input
  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || status === 'verifying') return;

    const rawVal = e.target.value;
    // Extract only digits
    const cleanDigit = rawVal.replace(/\D/g, '');

    if (!cleanDigit) {
      // Empty input
      const newDigits = [...digits];
      newDigits[index] = '';
      const newOtp = newDigits.join('');
      onChange(newOtp);
      return;
    }

    // Take the last entered character if multiple characters arrived
    const char = cleanDigit.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    const newOtp = newDigits.join('');
    onChange(newOtp);

    // Auto-advance to the next box
    if (index < length - 1) {
      focusBox(index + 1);
    }

    // If fully filled, trigger completion callback
    if (newOtp.length === length) {
      onComplete?.(newOtp);
    }
  };

  // Keyboard navigation: Backspace, Arrows, Delete
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || status === 'verifying') return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];

      if (digits[index]) {
        // Clear current box if it has a digit
        newDigits[index] = '';
        onChange(newDigits.join(''));
      } else if (index > 0) {
        // Move to previous box and clear it
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        focusBox(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (index > 0) focusBox(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (index < length - 1) focusBox(index + 1);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
    }
  };

  // Handle Paste
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled || status === 'verifying') return;
    e.preventDefault();

    const pastedData = e.clipboardData.getData('text');
    // Extract numeric characters only
    const numericChars = pastedData.replace(/\D/g, '').slice(0, length);

    if (!numericChars) return;

    const newDigits = [...digits];
    for (let i = 0; i < length; i++) {
      newDigits[i] = numericChars[i] || '';
    }

    const newOtp = newDigits.join('');
    onChange(newOtp);

    // Move focus to next unfilled box or to the last filled box
    const nextUnfilled = numericChars.length < length ? numericChars.length : length - 1;
    focusBox(nextUnfilled);

    // Auto-complete if full code is pasted
    if (numericChars.length === length) {
      onComplete?.(numericChars);
    }
  };

  // Compute container visual status classes
  const getBoxStatusClasses = (index: number, hasVal: boolean) => {
    const isCurrentActive = activeIndex === index && !disabled && status !== 'verifying';

    if (status === 'error') {
      return 'border-rose-500/80 bg-rose-950/30 text-rose-200 ring-2 ring-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.25)]';
    }

    if (status === 'success') {
      return 'border-emerald-400 bg-emerald-950/30 text-emerald-300 ring-2 ring-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.25)]';
    }

    if (status === 'verifying') {
      return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300/80 ring-1 ring-emerald-500/20 animate-pulse cursor-wait';
    }

    if (isCurrentActive) {
      return 'border-emerald-400 bg-emerald-500/10 text-white ring-2 ring-emerald-400/40 shadow-[0_0_16px_rgba(16,185,129,0.2)] scale-[1.03]';
    }

    if (hasVal) {
      return 'border-white/30 bg-white/[0.08] text-white hover:border-white/40';
    }

    return 'border-white/15 bg-white/[0.04] text-white hover:border-white/30 hover:bg-white/[0.06]';
  };

  return (
    <div
      id={`${baseId}-container`}
      className={`w-full flex flex-col items-center gap-3 ${className}`}
    >
      {/* 6 Distinct OTP Input Boxes */}
      <div
        id={`${baseId}-boxes-wrapper`}
        className={`flex items-center justify-center gap-2 sm:gap-2.5 transition-transform duration-200 ${
          isShaking ? 'animate-otp-shake' : ''
        } ${status === 'success' ? 'animate-otp-success' : ''}`}
        onPaste={handlePaste}
      >
        {digits.map((digit, idx) => {
          const boxId = `${baseId}-box-${idx}`;
          const isFilled = Boolean(digit);

          return (
            <div key={idx} className="relative group">
              <input
                id={boxId}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                disabled={disabled || status === 'verifying'}
                aria-label={`Digit ${idx + 1} of ${length}`}
                aria-required="true"
                aria-invalid={status === 'error'}
                onChange={(e) => handleChange(idx, e)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onFocus={() => setActiveIndex(idx)}
                onClick={() => focusBox(idx)}
                className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-bold rounded-xl outline-none transition-all duration-150 select-all ${getBoxStatusClasses(
                  idx,
                  isFilled
                )}`}
              />

              {/* Subtle bottom indicator dot when active */}
              {activeIndex === idx && !disabled && status === 'idle' && (
                <div
                  id={`${boxId}-indicator`}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Visual Status Feedback Banner */}
      <div id={`${baseId}-status-feedback`} className="min-h-[22px] flex items-center justify-center">
        {status === 'verifying' && (
          <div
            id={`${baseId}-verifying-indicator`}
            className="flex items-center gap-2 text-xs font-medium text-emerald-400 animate-pulse"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Verifying code...</span>
          </div>
        )}

        {status === 'success' && (
          <div
            id={`${baseId}-success-indicator`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 animate-in fade-in duration-150"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{successMessage || 'Code verified successfully!'}</span>
          </div>
        )}

        {status === 'error' && (
          <div
            id={`${baseId}-error-indicator`}
            className="flex items-center gap-1.5 text-xs font-medium text-rose-400 animate-in fade-in duration-150"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{errorMessage || 'Incorrect code. Please try again.'}</span>
          </div>
        )}

        {status === 'idle' && (
          <p id={`${baseId}-helper-text`} className="text-[11px] text-stone-400 tracking-wide">
            Enter the 6 digits sent to your email
          </p>
        )}
      </div>
    </div>
  );
};

export default OtpInput;
