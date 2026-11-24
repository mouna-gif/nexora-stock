// ============================================================
// Nexora Smart Stock AI — Client API typé (FastAPI)
// ============================================================
// Point d'entrée unique vers le backend. React ne parle JAMAIS
// directement à MongoDB : tout passe par /api/v1/*.
// ------------------------------------------------------------
//  • VITE_API_BASE_URL = http://127.0.0.1:8000  (production/build)
//  • Vide ou relatif ("" )  => appels relatifs, proxy de dev Vite.
// ============================================================

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE_URL = RAW_BASE.replace(/\/+$/, "");
export const API_ROOT = `${API_BASE_URL}/api/v1`;

/** URL WebSocket temps réel (mouvements, alertes). */
export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (API_BASE_URL) {
    return `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/ws`;
  }
  // Même origine (proxy de dev) — laisse le navigateur choisir ws/wss.
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/ws`;
}

// ─── Jetons ──────────────────────────────────────────────────
const ACCESS_KEY = "sss.access_token";
const REFRESH_KEY = "sss.refresh_token";

export const tokenStore = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  save(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Callback déclenché quand la session est définitivement invalide. */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: (() => void) | null) {
  onAuthFailure = fn;
}

// ─── Erreurs ─────────────────────────────────────────────────
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Erreur HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: string; message?: string; detail?: string };
    if (body?.error) code = body.error;
    if (body?.message) message = body.message;
    else if (body?.detail) message = String(body.detail);
  } catch {
    /* corps non JSON */
  }
  return new ApiError(response.status, code, message);
}

// ─── Rafraîchissement de jeton ───────────────────────────────
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh();
  if (!refresh) return false;
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_ROOT}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string; refresh_token: string };
      tokenStore.save(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      // Libère le verrou après un micro-délai pour laisser lire le résultat.
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
}

// ─── Requête générique ───────────────────────────────────────
type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Paramètres de requête (undefined ignoré). */
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal } = options;

  const url = new URL(`${API_ROOT}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const doFetch = (token: string | null) =>
    fetch(url.toString(), {
      method,
      signal,
      headers: {
        ...(body !== undefined && !isFormData ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });

  let response = await doFetch(tokenStore.access());

  // 401 → tentative unique de rafraîchissement puis rejeu.
  if (response.status === 401 && tokenStore.refresh()) {
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      response = await doFetch(tokenStore.access());
    } else {
      tokenStore.clear();
      onAuthFailure?.();
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  /** Upload multipart (images produits). */
  upload: <T>(path: string, formData: FormData) =>
    apiFetch<T>(path, { method: "POST", body: formData }),
};
