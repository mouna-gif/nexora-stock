/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de base de l'API FastAPI, ex. http://127.0.0.1:8000 (sans / final) */
  readonly VITE_API_BASE_URL?: string;
  /** Cible du proxy de dev Vite (par défaut http://127.0.0.1:8000) */
  readonly VITE_PROXY_TARGET?: string;
  /** WebSocket temps réel, ex. ws://127.0.0.1:8000 (dérivé de VITE_API_BASE_URL si absent) */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
