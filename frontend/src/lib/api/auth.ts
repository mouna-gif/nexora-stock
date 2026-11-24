// ============================================================
// Endpoints d'authentification /api/v1/auth
// ============================================================
import { api, tokenStore } from "./client";
import type { User, UserRole } from "@/lib/types";

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company: string;
  password: string;
}

/** Rôles autorisés pour l'écran Paramètres / gestion des utilisateurs. */
export const USER_ROLES: readonly UserRole[] = [
  "super_admin",
  "owner_ceo",
  "stock_manager",
  "warehouse_employee",
  "purchasing_manager",
  "sales_manager",
  "commercial_user",
  "accounting_admin",
] as const;

export const authApi = {
  async login(email: string, password: string): Promise<User> {
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    tokenStore.save(data.access_token, data.refresh_token);
    return data.user;
  },

  async register(payload: RegisterPayload): Promise<User> {
    const data = await api.post<AuthResponse>("/auth/register", payload);
    tokenStore.save(data.access_token, data.refresh_token);
    return data.user;
  },

  async me(): Promise<User> {
    return api.get<User>("/auth/me");
  },

  async logout(): Promise<void> {
    try {
      await api.post<void>("/auth/logout");
    } finally {
      tokenStore.clear();
    }
  },

  /** Rôles autorisés pour l'écran Paramètres / gestion des utilisateurs. */
  ROLES: USER_ROLES,
};
