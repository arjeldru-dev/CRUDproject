import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Shape of the authenticated user object returned by the backend. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Auth store state + actions. */
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

/**
 * Global auth store powered by Zustand with localStorage persistence.
 * Survives full page refreshes automatically.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      login: (user: AuthUser, token: string) => {
        set({ user, token });
      },

      logout: () => {
        set({ user: null, token: null });
      },

      isAuthenticated: () => {
        return get().token !== null && get().user !== null;
      },
    }),
    {
      name: 'auth-storage', // localStorage key — matches api.ts interceptor
    },
  ),
);
