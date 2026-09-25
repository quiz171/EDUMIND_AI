import React from 'react';
import { AuthPage } from '../../components/auth/AuthPage';

interface SignUpLoginPageProps {
  onNavigate: (route: string) => void;
}

export const SignUpLoginPage: React.FC<SignUpLoginPageProps> = ({ onNavigate }) => {
  return <AuthPage onNavigate={onNavigate} />;
};

export default SignUpLoginPage;
