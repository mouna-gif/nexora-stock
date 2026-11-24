// ============================================================
// Cycle de VENTES — devis, commandes, bons de livraison,
// factures clients, règlements. /api/v1/sales/*
// ============================================================
import { api } from "./client";
import type {
  CustomerInvoice,
  DeliveryNote,
  Payment,
  SalesOrder,
  SalesQuotation,
} from "@/lib/types";
import type { Paginated } from "./products";

export interface DocLinePayload {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountPct?: number;
  taxRate?: number;
}

export interface QuotationPayload {
  customerId: string;
  lines: DocLinePayload[];
  validUntil?: string;
  notes?: string;
  terms?: string;
}

export interface OrderPayload {
  customerId: string;
  lines: DocLinePayload[];
  deliveryAddress?: string;
  deliveryCity?: string;
  expectedDeliveryDate?: string;
  paymentTermsDays?: number;
  notes?: string;
}

export interface DeliveryNotePayload {
  salesOrderId: string;
  warehouseId: string;
  locationId?: string;
  lines: { lineId: string; quantity: number }[];
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDate?: string;
  driver?: string;
  signatureName?: string;
  notes?: string;
}

export const salesApi = {
  // Devis
  quotations: {
    list: (params: { status?: string; customerId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<SalesQuotation>>("/sales/quotations", { ...params }),
    get: (id: string) => api.get<SalesQuotation>(`/sales/quotations/${id}`),
    create: (payload: QuotationPayload) => api.post<SalesQuotation>("/sales/quotations", payload),
    update: (id: string, payload: Partial<QuotationPayload>) =>
      api.patch<SalesQuotation>(`/sales/quotations/${id}`, payload),
    transition: (id: string, to: string) =>
      api.post<SalesQuotation>(`/sales/quotations/${id}/transition`, { to }),
    convert: (id: string) => api.post<SalesOrder>(`/sales/quotations/${id}/convert`),
  },
  // Commandes clients
  orders: {
    list: (params: { status?: string; customerId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<SalesOrder>>("/sales/orders", { ...params }),
    get: (id: string) => api.get<SalesOrder>(`/sales/orders/${id}`),
    create: (payload: OrderPayload) => api.post<SalesOrder>("/sales/orders", payload),
    update: (id: string, payload: Partial<OrderPayload>) =>
      api.patch<SalesOrder>(`/sales/orders/${id}`, payload),
    transition: (id: string, to: string) =>
      api.post<SalesOrder>(`/sales/orders/${id}/transition`, { to }),
  },
  // Bons de livraison
  deliveryNotes: {
    list: (params: { status?: string; salesOrderId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<DeliveryNote>>("/sales/delivery-notes", { ...params }),
    get: (id: string) => api.get<DeliveryNote>(`/sales/delivery-notes/${id}`),
    create: (payload: DeliveryNotePayload) =>
      api.post<DeliveryNote>("/sales/delivery-notes", payload),
    validate: (id: string) => api.post<DeliveryNote>(`/sales/delivery-notes/${id}/validate`),
    transition: (id: string, to: string) =>
      api.post<DeliveryNote>(`/sales/delivery-notes/${id}/transition`, { to }),
  },
  // Factures clients
  invoices: {
    list: (params: { status?: string; customerId?: string; salesOrderId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<CustomerInvoice>>("/sales/invoices", { ...params }),
    get: (id: string) => api.get<CustomerInvoice>(`/sales/invoices/${id}`),
    generate: (salesOrderId: string, lines: { lineId: string; quantity: number }[] = [], notes = "") =>
      api.post<CustomerInvoice>("/sales/invoices/generate", { salesOrderId, lines, notes }),
    update: (id: string, payload: { lines: DocLinePayload[]; notes?: string }) =>
      api.patch<CustomerInvoice>(`/sales/invoices/${id}`, payload),
    validate: (id: string) => api.post<CustomerInvoice>(`/sales/invoices/${id}/validate`),
    cancel: (id: string) => api.post<CustomerInvoice>(`/sales/invoices/${id}/cancel`, {}),
  },
  // Règlements clients
  payments: {
    list: (params: { invoiceId?: string; customerId?: string; limit?: number } = {}) =>
      api.get<Paginated<Payment>>("/sales/payments", { ...params }),
    get: (id: string) => api.get<Payment>(`/sales/payments/${id}`),
    register: (payload: {
      invoiceId: string;
      amount: number;
      method?: string;
      reference?: string;
      paidAt?: string;
      notes?: string;
    }) => api.post<Payment>("/sales/payments", payload),
  },
};
