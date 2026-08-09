import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AuthState } from '../types/index.js';
import { api, setAccessToken } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, timezone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserTimezone: (timezone: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    loading: true,
  });

  // Load user session on startup
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Attempt silent login via refresh token cookie
        const res = await api.post('/auth/refresh');
        const token = res.data.data.accessToken;
        const user = res.data.data.user;

        setAccessToken(token);
        setState({
          user,
          accessToken: token,
          loading: false,
        });
      } catch (error) {
        // Refresh token invalid or expired; user is unauthenticated
        setAccessToken(null);
        setState({
          user: null,
          accessToken: null,
          loading: false,
        });
      }
    };

    initAuth();

    // Listen to background session expiration events
    const handleExpiredSession = () => {
      setAccessToken(null);
      setState({
        user: null,
        accessToken: null,
        loading: false,
      });
    };

    window.addEventListener('auth:logout', handleExpiredSession);
    return () => {
      window.removeEventListener('auth:logout', handleExpiredSession);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const token = res.data.data.accessToken;
    const user = res.data.data.user;

    setAccessToken(token);
    setState({
      user,
      accessToken: token,
      loading: false,
    });
  };

  const signup = async (email: string, password: string, timezone: string) => {
    const res = await api.post('/auth/register', { email, password, timezone });
    const token = res.data.data.accessToken;
    const user = res.data.data.user;

    setAccessToken(token);
    setState({
      user,
      accessToken: token,
      loading: false,
    });
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout request failed', e);
    } finally {
      setAccessToken(null);
      setState({
        user: null,
        accessToken: null,
        loading: false,
      });
    }
  };

  const updateUserTimezone = (timezone: string) => {
    if (state.user) {
      setState((prev) => ({
        ...prev,
        user: prev.user ? { ...prev.user, timezone } : null,
      }));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        loading: state.loading,
        login,
        signup,
        logout,
        updateUserTimezone,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
