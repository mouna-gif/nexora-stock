// ============================================================
// Endpoints alertes /api/v1/alerts
// ============================================================
import { api } from "./client";
import type { Alert } from "@/lib/types";

export interface AlertListParams {
  unreadOnly?: boolean;
  severity?: Alert["severity"];
  type?: Alert["type"];
  skip?: number;
  limit?: number;
}

export const alertsApi = {
  list: (params: AlertListParams = {}) => api.get<{ items: Alert[]; total: number }>("/alerts", { ...params }),
  markRead: (id: string) => api.patch<Alert>(`/alerts/${id}/read`),
  resolve: (id: string) => api.patch<Alert>(`/alerts/${id}/resolve`),
};
