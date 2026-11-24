import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";
import { authApi, setAuthFailureHandler, tokenStore } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Store d'authentification — consomme l'API FastAPI (/api/v1/auth).
// Jetons : accès court (15 min) + refresh sécurisé (rotation),
// stockés côté navigateur et rejoués par le client API typé.
// ─────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    company: string;
    password: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  hydrateSession: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const user = await authApi.login(email, password);
          set({ user, isAuthenticated: true, isLoading: false });
          return true;
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return false;
        }
      },

      register: async (payload) => {
        set({ isLoading: true });
        try {
          const user = await authApi.register(payload);
          set({ user, isAuthenticated: true, isLoading: false });
          return true;
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return false;
        }
      },

      logout: async () => {
        await authApi.logout();
        set({ user: null, isAuthenticated: false });
      },

      hydrateSession: async () => {
        try {
          if (!tokenStore.access() && !tokenStore.refresh()) {
            throw new Error("signed-out");
          }
          const user = await authApi.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          tokenStore.clear();
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: "sss-auth",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Session expirée non rattrapable (refresh refusé) → déconnexion globale.
setAuthFailureHandler(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});
