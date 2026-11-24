// ============================================================
// Paramètres société (documents imprimables) + audit
// ============================================================
import { api } from "./client";
import type { CompanySettings, AuditLog } from "@/lib/types";

export interface NumberingConfig {
  [docType: string]: { prefix?: string; digits?: number };
}

export const settingsApi = {
  getCompany: () => api.get<CompanySettings>("/settings/company"),
  updateCompany: (payload: Partial<CompanySettings> & { numbering?: NumberingConfig }) =>
    api.put<CompanySettings>("/settings/company", payload),
};

export const auditApi = {
  list: (params: { entityType?: string; entityId?: string; limit?: number } = {}) =>
    api.get<{ items: AuditLog[]; total: number }>("/audit", { ...params }),
};
