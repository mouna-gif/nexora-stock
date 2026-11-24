// ============================================================
// Endpoints tableau de bord & analytique /api/v1/analytics
// ============================================================
import { api } from "./client";
import type { DashboardKPIs, StockHealthScore } from "@/lib/types";

export interface RevenuePoint {
  month: string;
  revenue: number;
  cost: number;
}

export interface CategoryStockPoint {
  name: string;
  value: number;
  color?: string;
}

export const analyticsApi = {
  kpis: () => api.get<DashboardKPIs>("/analytics/kpis"),
  stockHealth: () => api.get<StockHealthScore>("/analytics/stock-health"),
  revenueTrend: () => api.get<RevenuePoint[]>("/analytics/revenue-trend"),
  categoryStock: () => api.get<CategoryStockPoint[]>("/analytics/category-stock"),
};
