import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, ArrowRight, Lock, Mail, User as UserIcon, BookOpen, GraduationCap, AlertCircle, AlertTriangle, X, Check, ShieldCheck, RefreshCw, ArrowLeft, KeyRound, CheckCircle2, Compass, Briefcase, Eye, EyeOff } from 'lucide-react';
import { User } from '../../types';
import { OtpInput, OtpVerificationStatus } from './OtpInput';
import { BackgroundWatermark } from '../chat/BackgroundWatermark';
import { VortexLogo } from '../common/VortexLogo';

interface AuthPageProps {
  onNavigate: (route: string) => void;
}

const getInitialTab = (): 'signup' | 'login' => {
  if (typeof window !== 'undefined') {
    const mode = localStorage.getItem('vortex_auth_mode');
    if (mode === 'login' || window.location.hash.includes('login')) {
      return 'login';
    }
  }
  return 'signup';
};

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [tab, setTab] = useState<'signup' | 'login'>(getInitialTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // OTP Verification State
  const [otpStep, setOtpStep] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStatus, setOtpStatus] = useState<OtpVerificationStatus>('idle');
  const [otpResendTimer, setOtpResendTimer] = useState(30);
  const [otpResending, setOtpResending] = useState(false);
  const [otpSuccessMsg, setOtpSuccessMsg] = useState<string | null>(null);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const [otpFallbackCode, setOtpFallbackCode] = useState<string | null>(null);
  const [otpDeliveryWarning, setOtpDeliveryWarning] = useState<string | null>(null);

  // Google Identity Services (GSI) Verified Authentication State
  const DEFAULT_GOOGLE_CLIENT_ID = '270002984301-gqoi85e60pi7fner35btd40b7gljhpk5.apps.googleusercontent.com';
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>(DEFAULT_GOOGLE_CLIENT_ID);
  const [gsiButtonRendered, setGsiButtonRendered] = useState(false);
  const [modalGsiRendered, setModalGsiRendered] = useState(false);
  const [showGcpNotice, setShowGcpNotice] = useState(false);
  const [copiedField, setCopiedField] = useState<'origin' | 'redirect' | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const modalGoogleBtnRef = useRef<HTMLDivElement>(null);

  // Forgot Password Flow State
  const [forgotStep, setForgotStep] = useState<'none' | 'request' | 'verify' | 'success'>('none');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string | null>(null);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);
  const [forgotResendTimer, setForgotResendTimer] = useState(30);
  const [forgotResending, setForgotResending] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forgotFallbackCode, setForgotFallbackCode] = useState<string | null>(null);
  const [forgotDeliveryWarning, setForgotDeliveryWarning] = useState<string | null>(null);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpStep && otpResendTimer > 0) {
      const timer = setTimeout(() => {
        setOtpResendTimer((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [otpStep, otpResendTimer]);

  // When OTP step is active, query pending code if not already received so user is never stranded
  useEffect(() => {
    if (otpStep && otpEmail && !otpFallbackCode) {
      fetch(`/api/auth/pending-code?email=${encodeURIComponent(otpEmail)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.hasCode && data.code) {
            setOtpFallbackCode(data.code);
          }
        })
        .catch(() => {});
    }
  }, [otpStep, otpEmail, otpFallbackCode]);

  // Countdown timer for Forgot Password resend
  useEffect(() => {
    if (forgotStep === 'verify' && forgotResendTimer > 0) {
      const timer = setTimeout(() => {
        setForgotResendTimer((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [forgotStep, forgotResendTimer]);

  // Sync tab with route hash or localStorage
  useEffect(() => {
    const syncTab = () => {
      const mode = localStorage.getItem('vortex_auth_mode');
      if (mode === 'login' || window.location.hash.includes('login')) {
        setTab('login');
      } else if (window.location.hash.includes('signup')) {
        setTab('signup');
      }
    };
    syncTab();
    window.addEventListener('hashchange', syncTab);
    return () => window.removeEventListener('hashchange', syncTab);
  }, []);

  // Signup form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [educationLevel, setEducationLevel] = useState('University');
  const [classYear, setClassYear] = useState('400L');
  const [course, setCourse] = useState('Computer Science');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Post-Signup Role Selection & Academic Setup state
  const [onboardingData, setOnboardingData] = useState<{
    user: User;
    token: string;
  } | null>(null);
  const [roleStep, setRoleStep] = useState<'picker' | 'student_form'>('picker');
  const [setupLevel, setSetupLevel] = useState<string>('University');
  const [setupClassYear, setSetupClassYear] = useState<string>('400L');
  const [setupCourse, setSetupCourse] = useState<string>('Computer Science');
  const [setupSaving, setSetupSaving] = useState<boolean>(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Dynamic class year options based on selected level
  const getClassYearOptions = (level: string) => {
    switch (level) {
      case 'Primary':
        return ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'];
      case 'JSS':
        return ['JSS1', 'JSS2', 'JSS3'];
      case 'SSS':
        return ['SS1', 'SS2', 'SS3', 'JAMB Candidate'];
      case 'Polytechnic':
        return ['ND1', 'ND2', 'HND1', 'HND2'];
      case 'University':
      default:
        return [
          '100L',
          '200L',
          '300L',
          '400L',
          '500L',
          '600L (MBBS / Vet Med / PharmD / BDS)',
          'Postgraduate / Masters',
          'PhD',
        ];
    }
  };

  // Recommended course suggestions based on level
  const getSuggestedCourses = (level: string) => {
    switch (level) {
      case 'Primary':
        return ['General Primary Curriculum', 'Basic Mathematics', 'Basic Science & Tech', 'English & Phonics', 'Creative Arts'];
      case 'JSS':
        return ['Basic Science & Tech', 'General Mathematics', 'English Studies', 'Business Studies', 'Social Studies', 'Civic Education'];
      case 'SSS':
        return ['Science (WAEC/JAMB)', 'Commercial & Accounting', 'Arts & Humanities', 'WAEC/NECO/JAMB Prep', 'Technical Science'];
      case 'Polytechnic':
        return ['Computer Science', 'Electrical/Electronic Eng', 'Accountancy', 'Business Administration', 'Mechanical Engineering'];
      case 'University':
      default:
        return [
          'Computer Science',
          'Medicine & Surgery (MBBS)',
          'Law (LL.B)',
          'Pharmacy (PharmD)',
          'Nursing Science',
          'Mechanical Engineering',
          'Accounting & Finance',
          'Economics',
        ];
    }
  };

  const handleSetupLevelChange = (lvl: string) => {
    setSetupLevel(lvl);
    const classOpts = getClassYearOptions(lvl);
    if (!classOpts.includes(setupClassYear)) {
      setSetupClassYear(classOpts[0] || '100L');
    }
    const suggestions = getSuggestedCourses(lvl);
    if (lvl === 'Primary') {
      setSetupCourse('General Primary Curriculum');
    } else if (suggestions.length > 0) {
      setSetupCourse(suggestions[0]);
    }
  };

  // Fetch Google Client ID and initialize Google Identity Services SDK
  const initGsi = useCallback(() => {
    if (!googleClientId || !(window as any).google?.accounts?.id) return;

    try {
      (window as any).google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => {
          if (response && response.credential) {
            executeGoogleLogin({ credential: response.credential });
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = '';
        (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: tab === 'signup' ? 'signup_with' : 'signin_with',
          width: Math.min(320, window.innerWidth - 48),
        });
        setTimeout(() => {
          if (googleBtnRef.current && googleBtnRef.current.children.length > 0) {
            setGsiButtonRendered(true);
          }
        }, 300);
      }

      if (modalGoogleBtnRef.current) {
        modalGoogleBtnRef.current.innerHTML = '';
        (window as any).google.accounts.id.renderButton(modalGoogleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(320, window.innerWidth - 48),
        });
        setTimeout(() => {
          if (modalGoogleBtnRef.current && modalGoogleBtnRef.current.children.length > 0) {
            setModalGsiRendered(true);
          }
        }, 300);
      }
    } catch (e) {
      console.warn('Google Identity Services init notice:', e);
    }
  }, [googleClientId, tab]);

  // Listen for Google OAuth popup callback completion
  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        const { token, user, isNewUser } = event.data;
        if (token && user) {
          localStorage.setItem('edumind_user', JSON.stringify(user));
          localStorage.setItem('edumind_token', token);
          localStorage.setItem('vortex_user', JSON.stringify(user));
          localStorage.setItem('vortex_token', token);

          setShowGoogleModal(false);

          if (tab === 'signup' || isNewUser) {
            const initialLvl = user.educationLevel || 'University';
            const validClassYears = getClassYearOptions(initialLvl);
            const defaultClass = validClassYears.includes(user.classYear) 
              ? user.classYear 
              : validClassYears[0];
            const defaultCourse = user.course && user.course !== 'General Studies' 
              ? user.course 
              : 'Computer Science';

            setSetupLevel(initialLvl);
            setSetupClassYear(defaultClass);
            setSetupCourse(defaultCourse);
            setOnboardingData(user);
          } else {
            onNavigate('/chat-app');
          }
        }
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, [tab, onNavigate]);

  useEffect(() => {
    // 1. Check Vite env var
    const rawEnvClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
    const envClientId = rawEnvClientId.replace(/^["']|["']$/g, '').trim();
    if (envClientId) {
      setGoogleClientId(envClientId);
    }
    // 2. Fetch from server endpoint
    fetch('/api/auth/google/client-id')
      .then((res) => res.json())
      .then((data) => {
        if (data.clientId) {
          const cleanId = String(data.clientId).replace(/^["']|["']$/g, '').trim();
          setGoogleClientId(cleanId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    if ((window as any).google?.accounts?.id) {
      initGsi();
    } else {
      const timer = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(timer);
          initGsi();
        }
      }, 300);
      return () => clearInterval(timer);
    }
  }, [googleClientId, initGsi]);

  // Authenticate with Google ID Token Credential or OAuth Access Token
  const executeGoogleLogin = async ({
    credential,
    accessToken,
  }: {
    credential?: string;
    accessToken?: string;
  }) => {
    setErrorMsg(null);
    setGoogleAuthError(null);
    setShowGcpNotice(false);
    setGoogleAuthLoading(true);
    setLoading(true);

    try {
      const isOthers = educationLevel === 'General' || educationLevel === 'Others';
      const resolvedLevel = isOthers ? 'General' : (educationLevel || 'University');
      const resolvedClass = isOthers ? 'General' : (classYear || '100L');
      const resolvedCourse = isOthers ? 'General Public' : (course || 'Computer Science');
      const resolvedUserType = isOthers ? 'others' : (tab === 'signup' ? 'student' : undefined);

      const res = await fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential,
          accessToken,
          educationLevel: resolvedLevel,
          classYear: resolvedClass,
          course: resolvedCourse,
          userType: resolvedUserType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }

      localStorage.setItem('edumind_user', JSON.stringify(data.user));
      localStorage.setItem('edumind_token', data.token);
      localStorage.setItem('vortex_user', JSON.stringify(data.user));
      localStorage.setItem('vortex_token', data.token);

      setShowGoogleModal(false);

      // On Google Sign Up (or when user is new or clicked signup tab), open profile picker
      if (tab === 'signup' || data.isNewUser) {
        const initialLvl = data.user.educationLevel || 'University';
        const validClassYears = getClassYearOptions(initialLvl);
        const defaultClass = validClassYears.includes(data.user.classYear) 
          ? data.user.classYear 
          : validClassYears[0];
        const defaultCourse = data.user.course && data.user.course !== 'General Studies' 
          ? data.user.course 
          : 'Computer Science';

        setSetupLevel(initialLvl);
        setSetupClassYear(defaultClass);
        setSetupCourse(defaultCourse);
        setOnboardingData({
          user: data.user,
          token: data.token,
        });
        setRoleStep('picker');
      } else {
        onNavigate('/chat-app');
      }
    } catch (err: any) {
      setGoogleAuthError(err.message || 'Authentication error');
      setErrorMsg(err.message || 'Google Sign-In failed');
    } finally {
      setGoogleAuthLoading(false);
      setLoading(false);
    }
  };

  // User chose "Others" (Not in school) -> sets General role and launches General Chatbot immediately!
  const handleSelectOthers = async () => {
    if (!onboardingData) return;
    setSetupSaving(true);
    setSetupError(null);

    const chosenLevel = 'General';
    const chosenClass = 'General';
    const chosenCourse = 'General Public';

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${onboardingData.token}`,
        },
        body: JSON.stringify({
          educationLevel: chosenLevel,
          classYear: chosenClass,
          course: chosenCourse,
          userType: 'others',
        }),
      });

      const data = await res.json();
      const updatedUser: User = {
        ...onboardingData.user,
        ...(data.user || {}),
        educationLevel: chosenLevel,
        classYear: chosenClass,
        course: chosenCourse,
        userType: 'others',
        role: 'others',
      };

      localStorage.setItem('edumind_user', JSON.stringify(updatedUser));
      localStorage.setItem('vortex_user', JSON.stringify(updatedUser));
      setOnboardingData(null);
      onNavigate('/chat-app');
    } catch (err: any) {
      const fallbackUser: User = {
        ...onboardingData.user,
        educationLevel: chosenLevel,
        classYear: chosenClass,
        course: chosenCourse,
        userType: 'others',
        role: 'others',
      };
      localStorage.setItem('edumind_user', JSON.stringify(fallbackUser));
      localStorage.setItem('vortex_user', JSON.stringify(fallbackUser));
      setOnboardingData(null);
      onNavigate('/chat-app');
    } finally {
      setSetupSaving(false);
    }
  };

  // User chose "Student" -> transitions to class & course form
  const handleSelectStudent = () => {
    setRoleStep('student_form');
  };

  // Save the student's selected class, course & level after signup
  const handleSaveStudentForm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onboardingData) return;

    setSetupSaving(true);
    setSetupError(null);

    const chosenLevel = setupLevel || 'University';
    const chosenClass = setupClassYear || getClassYearOptions(chosenLevel)[0];
    const chosenCourse = setupCourse.trim() || 'General Studies';

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${onboardingData.token}`,
        },
        body: JSON.stringify({
          educationLevel: chosenLevel,
          classYear: chosenClass,
          course: chosenCourse,
          userType: 'student',
        }),
      });

      const data = await res.json();
      const updatedUser: User = {
        ...onboardingData.user,
        ...(data.user || {}),
        educationLevel: chosenLevel,
        classYear: chosenClass,
        course: chosenCourse,
        userType: 'student',
        role: 'student',
      };

      localStorage.setItem('edumind_user', JSON.stringify(updatedUser));
      localStorage.setItem('vortex_user', JSON.stringify(updatedUser));
      setOnboardingData(null);
      onNavigate('/chat-app');
    } catch (err: any) {
      const fallbackUser: User = {
        ...onboardingData.user,
        educationLevel: chosenLevel,
        classYear: chosenClass,
        course: chosenCourse,
        userType: 'student',
        role: 'student',
      };
      localStorage.setItem('edumind_user', JSON.stringify(fallbackUser));
      localStorage.setItem('vortex_user', JSON.stringify(fallbackUser));
      setOnboardingData(null);
      onNavigate('/chat-app');
    } finally {
      setSetupSaving(false);
    }
  };

  const openGooglePopup = () => {
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popupUrl = `/auth/google/popup?origin=${encodeURIComponent(window.location.origin)}`;
    window.open(
      popupUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
    );
  };

  const handleGoogleSignIn = () => {
    setErrorMsg(null);
    setGoogleAuthError(null);
    setShowGcpNotice(false);

    // 1. Try Google Identity Services Token Client (OAuth popup flow without secret requirement)
    if (googleClientId && (window as any).google?.accounts?.oauth2?.initTokenClient) {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              executeGoogleLogin({ accessToken: tokenResponse.access_token });
            } else if (tokenResponse && tokenResponse.error) {
              console.warn('Google token client error:', tokenResponse);
              if (tokenResponse.error === 'origin_mismatch') {
                setShowGcpNotice(true);
                setGoogleAuthError(`Google OAuth Origin Notice: "${window.location.origin}" must be added to Authorized JavaScript Origins in your Google Cloud Console.`);
              } else {
                setGoogleAuthError(`Google error: ${tokenResponse.error_description || tokenResponse.error}`);
              }
            }
          },
          error_callback: (err: any) => {
            console.warn('GSI token client error:', err);
            setShowGcpNotice(true);
            setGoogleAuthError(`Google OAuth Origin Notice: "${window.location.origin}" is not authorized for this Client ID in Google Cloud Console.`);
          },
        });
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn('Google initTokenClient notice:', e);
      }
    }

    // 2. Try Google Identity Services One Tap prompt if supported
    if (googleClientId && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.prompt((notification: any) => {
          if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
            const reason = notification?.getNotDisplayedReason?.();
            if (reason === 'origin_mismatch') {
              setShowGcpNotice(true);
              setGoogleAuthError(`Google OAuth Origin Notice: "${window.location.origin}" must be added to Authorized JavaScript Origins in your Google Cloud Console.`);
            }
            openGooglePopup();
          }
        });
        return;
      } catch (e) {
        console.warn('GSI prompt notice:', e);
      }
    }

    // 3. Direct authentic Google OAuth popup flow
    openGooglePopup();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      // If server asks for OTP verification (standard security flow)
      if (data.requiresOtp) {
        setOtpStep(true);
        setOtpEmail(data.email || email.toLowerCase().trim());
        setOtpCode('');
        setOtpStatus('idle');
        setOtpResendTimer(30);
        setOtpSuccessMsg(data.message || `A 6-digit code has been sent to ${data.email || email}`);
        setOtpErrorMsg(null);
        if (data.fallbackCode) {
          setOtpFallbackCode(data.fallbackCode);
        }
        if (data.deliveryWarning) {
          setOtpDeliveryWarning(data.deliveryWarning);
        }
        return;
      }

      // Direct signup fallback (if no OTP requested)
      localStorage.setItem('edumind_user', JSON.stringify(data.user));
      localStorage.setItem('edumind_token', data.token);
      localStorage.setItem('vortex_user', JSON.stringify(data.user));
      localStorage.setItem('vortex_token', data.token);

      setOnboardingData({
        user: data.user,
        token: data.token,
      });
      setRoleStep('picker');
    } catch (err: any) {
      setErrorMsg(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP 6-Digit Verification
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify ?? otpCode).trim();
    if (code.length !== 6) {
      setOtpStatus('error');
      setOtpErrorMsg('Please enter the full 6-digit verification code');
      return;
    }

    setOtpErrorMsg(null);
    setOtpStatus('verifying');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: otpEmail,
          otp: code,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification code failed');
      }

      localStorage.setItem('edumind_user', JSON.stringify(data.user));
      localStorage.setItem('edumind_token', data.token);
      localStorage.setItem('vortex_user', JSON.stringify(data.user));
      localStorage.setItem('vortex_token', data.token);

      setOtpStatus('success');
      setOtpSuccessMsg('Email verified successfully! Setting up your profile...');

      setTimeout(() => {
        setOtpStep(false);
        setOnboardingData({
          user: data.user,
          token: data.token,
        });
        setRoleStep('picker');
      }, 350);
    } catch (err: any) {
      setOtpStatus('error');
      setOtpErrorMsg(err.message || 'Verification failed. Please check the code.');
    }
  };

  // Handle Resending OTP Code
  const handleResendOtp = async () => {
    if (otpResendTimer > 0 || otpResending) return;
    setOtpErrorMsg(null);
    setOtpResending(true);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setOtpCode('');
      setOtpStatus('idle');
      setOtpResendTimer(30);
      setOtpSuccessMsg(data.message || 'A fresh 6-digit verification code was sent!');
      if (data.fallbackCode) {
        setOtpFallbackCode(data.fallbackCode);
      }
      if (data.deliveryWarning) {
        setOtpDeliveryWarning(data.deliveryWarning);
      }
    } catch (err: any) {
      setOtpErrorMsg(err.message || 'Could not resend code. Please wait and try again.');
    } finally {
      setOtpResending(false);
    }
  };

  const handleOtpChange = (newVal: string) => {
    setOtpCode(newVal);
    if (otpStatus === 'error') {
      setOtpStatus('idle');
      setOtpErrorMsg(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log in');
      }

      localStorage.setItem('edumind_user', JSON.stringify(data.user));
      localStorage.setItem('edumind_token', data.token);
      localStorage.setItem('vortex_user', JSON.stringify(data.user));
      localStorage.setItem('vortex_token', data.token);

      onNavigate('/chat-app');
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Request 6-digit Password Reset Code
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotErrorMsg('Please enter your registered email address');
      return;
    }

    setForgotLoading(true);
    setForgotErrorMsg(null);
    setForgotSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reset code');
      }

      setForgotSuccessMsg(data.message || 'Verification code sent to your email');
      setForgotResendTimer(30);
      if (data.fallbackCode) {
        setForgotFallbackCode(data.fallbackCode);
      }
      if (data.deliveryWarning) {
        setForgotDeliveryWarning(data.deliveryWarning);
      }
      setForgotStep('verify');
    } catch (err: any) {
      setForgotErrorMsg(err.message || 'Failed to send reset code');
    } finally {
      setForgotLoading(false);
    }
  };

  // Resend Password Reset Code
  const handleResendResetCode = async () => {
    if (forgotResendTimer > 0 || forgotResending) return;
    setForgotResending(true);
    setForgotErrorMsg(null);

    try {
      const res = await fetch('/api/auth/resend-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend reset code');
      }

      setForgotSuccessMsg('A fresh 6-digit reset code has been sent');
      setForgotResendTimer(30);
      if (data.fallbackCode) {
        setForgotFallbackCode(data.fallbackCode);
      }
      if (data.deliveryWarning) {
        setForgotDeliveryWarning(data.deliveryWarning);
      }
    } catch (err: any) {
      setForgotErrorMsg(err.message || 'Failed to resend code');
    } finally {
      setForgotResending(false);
    }
  };

  // Complete Password Reset
  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = forgotCode.trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setForgotErrorMsg('Please enter the 6-digit verification code');
      return;
    }

    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotErrorMsg('New password must be at least 6 characters long');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotErrorMsg('Passwords do not match. Please verify both fields.');
      return;
    }

    setForgotLoading(true);
    setForgotErrorMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: cleanCode,
          newPassword: forgotNewPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setForgotStep('success');
      setLoginEmail(forgotEmail.trim());
      setLoginPassword('');
    } catch (err: any) {
      setForgotErrorMsg(err.message || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleEducationChange = (lvl: string) => {
    setEducationLevel(lvl);
    const options = getClassYearOptions(lvl);
    if (!options.includes(classYear)) {
      setClassYear(options[options.length - 1] || options[0]);
    }
    if (lvl === 'Primary') {
      setCourse('General Primary');
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-stone-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Watermark */}
      <BackgroundWatermark />

      {/* Dynamic Ambient Background Illumination */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Top Header / Back Link */}
      <div className="mb-6 text-center z-10">
        <button
          onClick={() => onNavigate('/landing-page')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-400 hover:text-white transition-colors cursor-pointer mb-3 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10"
        >
          ← Back to Homepage
        </button>
        <div className="flex items-center justify-center">
          <VortexLogo size="lg" showTagline={true} />
        </div>
      </div>

      {/* Glassmorphism Dark Modal */}
      <div className="glass-panel w-full max-w-md p-6 md:p-8 rounded-3xl relative z-10 shadow-2xl">
        {forgotStep !== 'none' ? (
          /* Human-Crafted Forgot Password Flow */
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Step Progress Tracker */}
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  forgotStep === 'request'
                    ? 'bg-emerald-400 text-black'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {forgotStep === 'request' ? '1' : '✓'}
                </span>
                <span className={`text-xs ${forgotStep === 'request' ? 'font-bold text-white' : 'text-stone-400'}`}>
                  Account Email
                </span>
              </div>

              <div className="h-[1px] w-6 bg-white/10" />

              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  forgotStep === 'verify'
                    ? 'bg-emerald-400 text-black'
                    : forgotStep === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-stone-500 border border-white/10'
                }`}>
                  {forgotStep === 'success' ? '✓' : '2'}
                </span>
                <span className={`text-xs ${forgotStep === 'verify' ? 'font-bold text-white' : 'text-stone-400'}`}>
                  Reset Password
                </span>
              </div>

              <div className="h-[1px] w-6 bg-white/10" />

              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  forgotStep === 'success'
                    ? 'bg-emerald-400 text-black'
                    : 'bg-white/5 text-stone-500 border border-white/10'
                }`}>
                  3
                </span>
                <span className={`text-xs ${forgotStep === 'success' ? 'font-bold text-white' : 'text-stone-400'}`}>
                  Done
                </span>
              </div>
            </div>

            {/* STEP 1: Enter Account Email */}
            {forgotStep === 'request' && (
              <div className="space-y-5">
                <div className="text-left space-y-1.5">
                  <h2 className="text-xl font-bold text-white tracking-tight">Trouble signing in?</h2>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    It happens to everyone. Tell us the email address linked to your EduMind AI account, and we'll send you a 6-digit confirmation code.
                  </p>
                </div>

                {forgotErrorMsg && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{forgotErrorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-stone-300">
                      Your Registered Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        autoFocus
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          if (forgotErrorMsg) setForgotErrorMsg(null);
                        }}
                        placeholder="e.g. nelson@example.com"
                        className="w-full pl-10 pr-4 py-3 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <p className="text-[11px] text-stone-500">
                      We'll verify your account exists before generating a security code.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail.trim()}
                    className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 active:scale-98 text-black font-black text-sm transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {forgotLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Finding account & sending code...</span>
                      </div>
                    ) : (
                      <>
                        <span>Continue & Send Code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('none');
                        setForgotErrorMsg(null);
                        setForgotSuccessMsg(null);
                      }}
                      className="text-xs text-stone-400 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Remembered your password? Back to Sign In</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STEP 2: Verify Code & Set New Password */}
            {forgotStep === 'verify' && (
              <div className="space-y-5">
                <div className="text-left space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight">Create a new password</h2>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    We sent a 6-digit confirmation code to{' '}
                    <span className="font-semibold text-emerald-300">{forgotEmail}</span>.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('request');
                        setForgotErrorMsg(null);
                      }}
                      className="text-stone-400 hover:text-white underline cursor-pointer"
                    >
                      Change email
                    </button>
                  </p>
                </div>

                {forgotSuccessMsg && (
                  <div className="p-3 bg-emerald-950/50 border border-emerald-600/50 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{forgotSuccessMsg}</span>
                  </div>
                )}

                {forgotErrorMsg && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{forgotErrorMsg}</span>
                  </div>
                )}

                {/* Password Reset Code Fallback Banner */}
                {forgotFallbackCode && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 text-left animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1.5">
                        <p className="font-semibold text-amber-300 text-xs">
                          {forgotDeliveryWarning || "Email Delivery Notice (Google SMTP)"}
                        </p>
                        <p className="text-[11px] text-amber-200/80 leading-relaxed">
                          Your 6-digit password reset code is ready below:
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="font-mono text-base font-extrabold text-white bg-black/60 px-3 py-1 rounded-xl border border-amber-400/40 tracking-widest">
                            {forgotFallbackCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForgotCode(forgotFallbackCode)}
                            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Auto-fill Code</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleCompletePasswordReset} className="space-y-4">
                  {/* 6-Digit Code */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-stone-300 text-center">
                      Enter 6-Digit Security Code
                    </label>
                    <OtpInput
                      id="forgot-otp"
                      length={6}
                      value={forgotCode}
                      onChange={(code) => {
                        setForgotCode(code);
                        setForgotErrorMsg(null);
                      }}
                      autoFocus={true}
                    />
                  </div>

                  {/* New Password with Eye Toggle */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-stone-300">
                      Choose New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={forgotNewPassword}
                        onChange={(e) => {
                          setForgotNewPassword(e.target.value);
                          if (forgotErrorMsg) setForgotErrorMsg(null);
                        }}
                        placeholder="At least 6 characters"
                        className="w-full pl-10 pr-10 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="p-1.5 text-stone-500 hover:text-stone-300 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                        title={showNewPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Human Password Strength Meter */}
                    {forgotNewPassword.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-stone-400">Password strength:</span>
                          <span className={`font-semibold ${
                            forgotNewPassword.length >= 8 && /[0-9]/.test(forgotNewPassword)
                              ? 'text-emerald-400'
                              : forgotNewPassword.length >= 6
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}>
                            {forgotNewPassword.length < 6
                              ? 'Too short (min. 6)'
                              : forgotNewPassword.length >= 8 && /[0-9]/.test(forgotNewPassword)
                              ? 'Strong'
                              : 'Good'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-800 rounded-full overflow-hidden flex gap-1">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              forgotNewPassword.length >= 6 ? 'bg-amber-400 w-1/2' : 'bg-rose-500 w-1/4'
                            } ${forgotNewPassword.length >= 8 && /[0-9]/.test(forgotNewPassword) ? 'bg-emerald-400 !w-full' : ''}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password with Eye Toggle */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-stone-300">
                        Confirm New Password
                      </label>
                      {forgotConfirmPassword.length > 0 && (
                        <span className={`text-[11px] font-medium flex items-center gap-1 ${
                          forgotNewPassword === forgotConfirmPassword ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {forgotNewPassword === forgotConfirmPassword ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Passwords match</span>
                            </>
                          ) : (
                            <span>Does not match yet</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={forgotConfirmPassword}
                        onChange={(e) => {
                          setForgotConfirmPassword(e.target.value);
                          if (forgotErrorMsg) setForgotErrorMsg(null);
                        }}
                        placeholder="Re-enter your new password"
                        className="w-full pl-10 pr-10 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="p-1.5 text-stone-500 hover:text-stone-300 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      forgotLoading ||
                      forgotCode.trim().length !== 6 ||
                      forgotNewPassword.length < 6 ||
                      forgotNewPassword !== forgotConfirmPassword
                    }
                    className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 active:scale-98 text-black font-black text-sm transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                  >
                    {forgotLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Updating your password...</span>
                      </div>
                    ) : (
                      <>
                        <span>Save New Password & Continue</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={handleResendResetCode}
                      disabled={forgotResendTimer > 0 || forgotResending}
                      className="text-stone-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${forgotResending ? 'animate-spin' : ''}`} />
                      <span>
                        {forgotResendTimer > 0
                          ? `Resend code in ${forgotResendTimer}s`
                          : 'Resend code'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('none');
                        setForgotErrorMsg(null);
                        setForgotSuccessMsg(null);
                      }}
                      className="text-stone-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STEP 3: Success Confirmation */}
            {forgotStep === 'success' && (
              <div className="text-center space-y-5 py-4 animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white tracking-tight">You're all set!</h2>
                  <p className="text-xs text-stone-300 leading-relaxed max-w-xs mx-auto">
                    Your password has been securely updated. You can now sign in to your EduMind AI account right away.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStep('none');
                    setTab('login');
                    setForgotErrorMsg(null);
                    setForgotSuccessMsg(null);
                  }}
                  className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 active:scale-98 text-black font-black text-sm transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Sign In with New Password</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : otpStep ? (
          /* OTP 6-Digit Email Verification Screen */
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Back to registration link */}
            <button
              type="button"
              onClick={() => {
                setOtpStep(false);
                setOtpErrorMsg(null);
                setOtpSuccessMsg(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to registration</span>
            </button>

            {/* Header with Icon */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Verify Your Email</h2>
              <p className="text-xs text-stone-300 leading-relaxed max-w-xs mx-auto">
                We've generated a 6-digit verification code for
                <br />
                <span className="font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg inline-block mt-1">
                  {otpEmail}
                </span>
              </p>
            </div>

            {/* Email Delivery Notice & Immediate Verification Fallback */}
            {otpFallbackCode && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 text-left animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="font-semibold text-amber-300 text-xs">
                      {otpDeliveryWarning || "Live Email Delivery Alert (Gmail SMTP 535 Bad Credentials)"}
                    </p>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Google requires a 16-character App Password to deliver live emails. Your verification code is provided below so you can proceed immediately:
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="font-mono text-base font-extrabold text-white bg-black/60 px-3 py-1 rounded-xl border border-amber-400/40 tracking-widest">
                        {otpFallbackCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpCode(otpFallbackCode);
                          handleVerifyOtp(otpFallbackCode);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Auto-fill & Verify</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dedicated 6-Box OTP Input with Auto-focusing & Visual Status Feedback */}
            <div className="py-1">
              <OtpInput
                id="signup-otp"
                length={6}
                value={otpCode}
                onChange={handleOtpChange}
                onComplete={(code) => handleVerifyOtp(code)}
                status={otpStatus}
                errorMessage={otpErrorMsg}
                successMessage={otpSuccessMsg}
                disabled={otpStatus === 'verifying'}
                autoFocus={true}
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={otpStatus === 'verifying' || otpCode.trim().length !== 6}
                className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 active:scale-98 text-black font-black text-sm transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {otpStatus === 'verifying' ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Code...</span>
                  </div>
                ) : otpStatus === 'success' ? (
                  <div className="flex items-center gap-2 text-black">
                    <Check className="w-4 h-4" />
                    <span>Verified! Redirecting...</span>
                  </div>
                ) : (
                  <>
                    <span>Verify & Complete Signup</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Resend Code Section */}
              <div className="text-center">
                {otpResendTimer > 0 ? (
                  <p className="text-xs text-stone-400">
                    Resend code in <span className="text-stone-200 font-semibold">{otpResendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpResending}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${otpResending ? 'animate-spin' : ''}`} />
                    <span>Didn't receive code? Resend OTP</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Switcher */}
            <div className="flex bg-white/[0.04] p-1 rounded-2xl border border-white/10 mb-6">
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === 'signup'
                ? 'bg-white text-black shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === 'login'
                ? 'bg-white text-black shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Google Sign-In Container */}
        <div className="w-full flex flex-col items-center">
          <div 
            ref={googleBtnRef} 
            className={`w-full flex justify-center ${gsiButtonRendered ? 'block' : 'hidden'}`} 
          />
          {!gsiButtonRendered && (
            <button
              type="button"
              onClick={() => handleGoogleSignIn()}
              disabled={loading || googleAuthLoading}
              className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-stone-100 active:bg-stone-200 text-stone-900 font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-50 border border-stone-200"
              title="Continue with your Google Account"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>{googleAuthLoading ? 'Connecting to Google...' : (tab === 'signup' ? 'Sign up with Google' : 'Sign in with Google')}</span>
            </button>
          )}

          {/* Google OAuth GCP Setup Helper if Origin Mismatch Occurs */}
          {showGcpNotice && (
            <div className="w-full mt-3 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-600/40 text-left text-xs text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Google OAuth Configuration Needed</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                To enable Google Sign-In for this domain in Google Cloud Console:
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between bg-black/60 p-2 rounded-xl border border-amber-900/50">
                  <span className="text-[10px] text-stone-400">Authorized JavaScript Origin:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      setCopiedField('origin');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="text-[10px] text-amber-400 hover:text-white underline cursor-pointer font-mono font-medium"
                  >
                    {copiedField === 'origin' ? 'Copied!' : 'Copy Origin'}
                  </button>
                </div>
                <div className="flex items-center justify-between bg-black/60 p-2 rounded-xl border border-amber-900/50">
                  <span className="text-[10px] text-stone-400">Authorized Redirect URI:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/auth/google/callback`);
                      setCopiedField('redirect');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="text-[10px] text-amber-400 hover:text-white underline cursor-pointer font-mono font-medium"
                  >
                    {copiedField === 'redirect' ? 'Copied!' : 'Copy Callback'}
                  </button>
                </div>
              </div>
              <div className="pt-1 flex items-center justify-between">
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-amber-400 hover:text-amber-200 underline font-medium"
                >
                  Open Google Cloud Console &rarr;
                </a>
                <button
                  type="button"
                  onClick={() => setShowGcpNotice(false)}
                  className="text-[10px] text-stone-400 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Or continue with email divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            or continue with email
          </span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {errorMsg && (
          <div className="mb-5 flex items-center gap-2 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/50 p-3 rounded-2xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Signup Form */}
        {tab === 'signup' ? (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Amina Bello"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600"
                />
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-stone-300 text-xs flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-[11px] leading-relaxed text-stone-300">
                After signup, you will pick if you are a <strong className="text-emerald-300">Student</strong> or <strong className="text-cyan-300">Others</strong> to connect you to the right chatbot.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-full bg-white text-black hover:bg-stone-200 active:scale-98 font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="student@vortex.ai"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-stone-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStep('request');
                    setForgotEmail(loginEmail || '');
                    setForgotErrorMsg(null);
                    setForgotSuccessMsg(null);
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder:text-stone-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-full bg-white text-black hover:bg-stone-200 active:scale-98 font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </>
    )}
  </div>

      {/* Post-Signup Profile Setup Modal: Pick "Student" or "Others" */}
      {onboardingData && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#141416] border border-white/15 rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            {roleStep === 'picker' ? (
              /* Phase 1: Pick Student vs Others */
              <div className="p-6 sm:p-8 relative z-10 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-white/20 flex items-center justify-center mx-auto text-cyan-400 mb-2 shadow-lg">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Welcome{onboardingData.user.fullName ? `, ${onboardingData.user.fullName.split(' ')[0]}` : ''}!
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-300 max-w-sm mx-auto leading-relaxed">
                    Pick if you are a <strong className="text-emerald-300">Student</strong> or <strong className="text-cyan-300">Others</strong> to connect you to the right AI chatbot:
                  </p>
                </div>

                {setupError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option 1: Student */}
                  <button
                    type="button"
                    onClick={handleSelectStudent}
                    className="p-5 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/10 border border-white/15 hover:border-emerald-500/50 text-left transition-all cursor-pointer group flex flex-col justify-between shadow-md hover:shadow-emerald-500/10 active:scale-98"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                          Student
                        </span>
                        <ArrowRight className="w-4 h-4 text-emerald-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                      <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">
                        I am currently in school, college, polytechnic, or university.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span>Fill class & course details</span>
                    </div>
                  </button>

                  {/* Option 2: Others (Not in school) */}
                  <button
                    type="button"
                    onClick={handleSelectOthers}
                    disabled={setupSaving}
                    className="p-5 rounded-2xl bg-white/[0.04] hover:bg-cyan-500/10 border border-white/15 hover:border-cyan-500/50 text-left transition-all cursor-pointer group flex flex-col justify-between shadow-md hover:shadow-cyan-500/10 active:scale-98 disabled:opacity-50"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                        <Compass className="w-6 h-6" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                          Others
                        </span>
                        <ArrowRight className="w-4 h-4 text-cyan-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                      <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">
                        I am working, learning independently, or not in school.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-cyan-400 font-semibold flex items-center gap-1">
                      <span>Direct to General Chatbot</span>
                    </div>
                  </button>
                </div>

                {setupSaving && (
                  <div className="flex items-center justify-center gap-2 text-xs text-stone-400 pt-2">
                    <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span>Launching your General Chatbot...</span>
                  </div>
                )}
              </div>
            ) : (
              /* Phase 2: Student Academic Form (Class & Course) */
              <div className="p-5 sm:p-6 relative z-10 flex flex-col">
                <button
                  type="button"
                  onClick={() => setRoleStep('picker')}
                  className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-white transition-colors cursor-pointer mb-3 self-start"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to profile selection</span>
                </button>

                <div className="space-y-1 mb-4">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                    <GraduationCap className="w-4 h-4" />
                    <span>Student Setup</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Fill Your Class and Course</h3>
                  <p className="text-xs text-stone-400">
                    Tell us what you study so EduMind AI can tailor solutions, formulas, and syllabus explanations to your curriculum.
                  </p>
                </div>

                {setupError && (
                  <div className="mb-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveStudentForm} className="space-y-4">
                  {/* Step 1: Education Level */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                      1. Education Level
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'University', label: 'University', sub: '100L - 600L / Postgrad' },
                        { id: 'Polytechnic', label: 'Polytechnic', sub: 'ND1 - HND2' },
                        { id: 'SSS', label: 'Senior Secondary', sub: 'SS1 - SS3 / JAMB' },
                        { id: 'JSS', label: 'Junior Secondary', sub: 'JSS1 - JSS3' },
                        { id: 'Primary', label: 'Primary School', sub: 'Primary 1 - 6' },
                      ].map((lvl) => {
                        const isSelected = setupLevel === lvl.id;
                        return (
                          <button
                            key={lvl.id}
                            type="button"
                            onClick={() => handleSetupLevelChange(lvl.id)}
                            className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-xs ring-1 ring-emerald-500/40'
                                : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10 text-stone-300'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className="text-xs font-bold truncate">{lvl.label}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            </div>
                            <span className="text-[10px] text-stone-400 truncate">{lvl.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Class / Year */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-stone-300">
                        2. Class / Academic Year
                      </label>
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        Selected: {setupClassYear}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {getClassYearOptions(setupLevel).map((yr) => {
                        const isSelected = setupClassYear === yr;
                        return (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => setSetupClassYear(yr)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-white text-black border-white shadow-sm font-bold scale-[1.02]'
                                : 'bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 border-white/10'
                            }`}
                          >
                            {yr}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 3: Course / Field of Study */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                      3. Course / Department
                    </label>
                    <input
                      type="text"
                      required
                      value={setupCourse}
                      onChange={(e) => setSetupCourse(e.target.value)}
                      placeholder="e.g. Computer Science, Medicine, Law, Science..."
                      className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs sm:text-sm text-white placeholder:text-stone-600 mb-2 border border-white/15 focus:border-emerald-400 outline-none"
                    />

                    {/* Course quick suggestions */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-500">
                        Recommended for {setupLevel}:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {getSuggestedCourses(setupLevel).map((sugg) => (
                          <button
                            key={sugg}
                            type="button"
                            onClick={() => setSetupCourse(sugg)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer truncate ${
                              setupCourse.toLowerCase() === sugg.toLowerCase()
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-stone-200 border-white/10'
                            }`}
                          >
                            {sugg}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-white/10 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={setupSaving || !setupCourse.trim()}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 active:scale-98 text-black font-bold text-xs sm:text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {setupSaving ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Save & Launch Student Assistant</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Official In-App Google Account Chooser Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[420px] bg-[#202124] text-[#e8eaed] border border-[#5f6368]/50 rounded-2xl p-6 sm:p-7 shadow-2xl relative overflow-hidden">
            {/* Indeterminate Loading Progress Bar */}
            {googleAuthLoading && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#1a73e8]/20 overflow-hidden">
                <div className="h-full bg-[#8ab4f8] animate-pulse w-full" />
              </div>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                if (!googleAuthLoading) setShowGoogleModal(false);
              }}
              className="absolute top-4 right-4 p-1.5 text-[#9aa0a6] hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Google Header */}
            <div className="text-center pt-1 mb-5">
              <svg className="w-10 h-10 mx-auto mb-3" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <h3 className="text-xl font-medium text-white tracking-tight">Choose an account</h3>
              <p className="text-xs text-[#9aa0a6] mt-1">
                to continue to <span className="font-semibold text-white">EduMind AI</span>
              </p>
            </div>

            {googleAuthError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{googleAuthError}</span>
              </div>
            )}

            {/* Google Identity Modal Content */}
            <div className="space-y-4 my-4">
              {googleClientId ? (
                <div className="flex flex-col items-center gap-3 py-2 w-full">
                  <div 
                    ref={modalGoogleBtnRef} 
                    className={`w-full flex justify-center ${modalGsiRendered ? 'block' : 'hidden'}`} 
                  />
                  {!modalGsiRendered && (
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn()}
                      disabled={loading || googleAuthLoading}
                      className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-stone-100 active:bg-stone-200 text-stone-900 font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-50 border border-stone-200"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>{googleAuthLoading ? 'Connecting...' : 'Continue with Google'}</span>
                    </button>
                  )}
                  {showGcpNotice && (
                    <div className="w-full mt-2 p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-left text-xs text-amber-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-300 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Origin Authorization Required</span>
                      </div>
                      <p className="text-[10px] text-amber-200/90 leading-tight">
                        Add this domain to Authorized JavaScript Origins in Google Cloud Console:
                      </p>
                      <div className="flex items-center justify-between bg-black/60 p-1.5 rounded-lg border border-amber-900/50">
                        <span className="text-[9px] text-stone-400 font-mono truncate max-w-[200px]">{window.location.origin}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.origin);
                            setCopiedField('origin');
                            setTimeout(() => setCopiedField(null), 2000);
                          }}
                          className="text-[9px] text-amber-400 hover:text-white underline cursor-pointer"
                        >
                          {copiedField === 'origin' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-[#9aa0a6] text-center">
                    Authenticate securely with your verified Google Account.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/50 text-xs text-amber-200 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Google Client ID Configuration Required</span>
                  </div>
                  <p className="leading-relaxed">
                    To enable Google Sign-In, configure your <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-amber-200">GOOGLE_CLIENT_ID</code> in your server environment variables.
                  </p>
                  <p className="text-[11px] text-stone-400">
                    Once set, Google Identity Services will cryptographically verify and issue authentic ID tokens directly to the application.
                  </p>
                </div>
              )}
            </div>

            {/* Official Google Disclosure */}
            <div className="text-[11px] text-[#9aa0a6] leading-relaxed pt-3 border-t border-[#3c4043] space-y-1">
              <p>
                To continue, Google will share your name, email address, language preference, and profile picture with EduMind AI.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
