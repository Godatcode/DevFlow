import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      console.log('Initializing auth...');
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          console.log('Found existing token, validating...');
          const userData = await authService.validateToken(token);
          setUser(userData);
          console.log('User authenticated:', userData);
        } else if (import.meta.env.DEV) {
          console.log('Development mode: auto-login...');
          // Auto-login in development mode
          const { user: userData, token: newToken } = await authService.login('demo@devflow.ai', 'password');
          localStorage.setItem('auth_token', newToken);
          setUser(userData);
          console.log('Auto-login successful:', userData);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        localStorage.removeItem('auth_token');
      } finally {
        console.log('Auth initialization complete');
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { user: userData, token } = await authService.login(email, password);
      localStorage.setItem('auth_token', token);
      setUser(userData);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}