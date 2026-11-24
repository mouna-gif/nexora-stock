// ============================================================
// Clients — /api/v1/customers
// ============================================================
import { api } from "./client";
import type { Customer } from "@/lib/types";
import type { Paginated } from "./products";

export interface CustomerPayload {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTermsDays?: number;
  notes?: string;
  isActive?: boolean;
}

export const customersApi = {
  list: (params: { search?: string; includeInactive?: boolean; limit?: number } = {}) =>
    api.get<Paginated<Customer>>("/customers", { ...params }),
  get: (id: string) => api.get<Customer>(`/customers/${id}`),
  create: (payload: CustomerPayload) => api.post<Customer>("/customers", payload),
  update: (id: string, payload: Partial<CustomerPayload>) =>
    api.patch<Customer>(`/customers/${id}`, payload),
};
