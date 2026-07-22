'use client';
import { create } from 'zustand';
import { api, clearToken, getToken, setToken } from '@/lib/api';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: async () => {
    if (!getToken()) {
      set({ loading: false, user: null });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      clearToken();
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    set({ user: data.user });
  },
  register: async (email, name, password) => {
    const { data } = await api.post('/auth/register', { email, name, password });
    setToken(data.token);
    set({ user: data.user });
  },
  logout: () => {
    clearToken();
    set({ user: null });
    window.location.href = '/login';
  },
}));
