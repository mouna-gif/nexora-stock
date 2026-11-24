// ============================================================
// Hooks d'accès API — API d'abord, repli mocks si indisponible
// ============================================================
// Stratégie de migration « écran par écran » :
//   • Si le backend répond → données réelles MongoDB via /api/v1.
//   • Sinon (backend éteint, preview Figma Make) → mock-data.ts.
// Le rendu et les parcours restent identiques dans les deux cas.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { productsApi, alertsApi } from "@/lib/api";
import type { Product, Alert } from "@/lib/types";
import { MOCK_PRODUCTS, MOCK_ALERTS } from "@/lib/mock-data";

export interface ApiResource<T> {
  data: T;
  /** true tant que la première réponse API n'est pas résolue. */
  loading: boolean;
  /** true si les données affichées viennent du backend. */
  fromApi: boolean;
  /** true si on est retombé sur les mocks. */
  usingFallback: boolean;
  refresh: () => void;
}

export function useApiResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  deps: unknown[] = [],
): ApiResource<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [fromApi, setFromApi] = useState(false);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setLoading(true);
    fetcher(controller.signal)
      .then((result) => {
        if (!mounted.current) return;
        setData(result);
        setFromApi(true);
      })
      .catch((err) => {
        if (!mounted.current || controller.signal.aborted) return;
        if (err?.name === "AbortError") return;
        setData(fallback);
        setFromApi(false);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return {
    data,
    loading,
    fromApi,
    usingFallback: !fromApi,
    refresh: () => setTick((t) => t + 1),
  };
}

// ─── Ressources pré-câblées ──────────────────────────────────

/** Produits : /api/v1/products (repli : MOCK_PRODUCTS). */
export function useProducts(): ApiResource<Product[]> {
  return useApiResource<Product[]>(
    async (signal) => {
      const page = await productsApi.list({ limit: 250 });
      return page.items;
    },
    MOCK_PRODUCTS,
  );
}

/** Alertes : /api/v1/alerts (repli : MOCK_ALERTS). */
export function useAlerts(): ApiResource<Alert[]> {
  return useApiResource<Alert[]>(
    async (signal) => {
      const res = await alertsApi.list({ limit: 250 });
      return res.items;
    },
    MOCK_ALERTS,
  );
}

/** Compteur d'alertes non lues pour la barre latérale. */
export function useUnreadAlertsCount(): number {
  const { data } = useAlerts();
  return data.filter((a) => !a.isRead && !a.isResolved).length;
}
