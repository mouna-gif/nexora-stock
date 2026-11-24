// ============================================================
// Cycle d'ACHATS — devis fournisseurs, réceptions, factures
// et règlements fournisseurs. /api/v1/purchasing/*, /receipts
// ============================================================
import { api } from "./client";
import type { GoodsReceipt, Payment, PurchaseOrder, SupplierInvoice, SupplierQuotation } from "@/lib/types";
import type { Paginated } from "./products";
import type { DocLinePayload } from "./sales";

export interface SupplierQuotationPayload {
  supplierId: string;
  lines: DocLinePayload[];
  deliveryCost?: number;
  leadTimeDays?: number;
  validUntil?: string;
  notes?: string;
}

export interface GoodsReceiptPayload {
  poId: string;
  warehouseId: string;
  locationId?: string;
  lines: { lineId: string; quantity: number; quantityDamaged?: number; quantityMissing?: number; notes?: string }[];
  notes?: string;
}

export interface SupplierInvoicePayload {
  purchaseOrderId?: string;
  supplierId?: string;
  lines?: DocLinePayload[];
  notes?: string;
}

export const purchasingApi = {
  supplierQuotations: {
    list: (params: { status?: string; supplierId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<SupplierQuotation>>("/purchasing/supplier-quotations", { ...params }),
    get: (id: string) => api.get<SupplierQuotation>(`/purchasing/supplier-quotations/${id}`),
    create: (payload: SupplierQuotationPayload) =>
      api.post<SupplierQuotation>("/purchasing/supplier-quotations", payload),
    update: (id: string, payload: Partial<SupplierQuotationPayload>) =>
      api.patch<SupplierQuotation>(`/purchasing/supplier-quotations/${id}`, payload),
    transition: (id: string, to: string) =>
      api.post<SupplierQuotation>(`/purchasing/supplier-quotations/${id}/transition`, { to }),
    convert: (id: string) => api.post<PurchaseOrder>(`/purchasing/supplier-quotations/${id}/convert`),
  },
  compare: (productId: string) =>
    api.get<{
      productId: string;
      productSku: string;
      productName: string;
      offers: {
        supplierQuotationId: string;
        number: string;
        supplierId: string;
        supplierName: string;
        quantity: number;
        unitPrice: number;
        discountPct: number;
        netUnitPrice: number;
        leadTimeDays: number;
        status: string;
      }[];
    }>("/purchasing/compare", { productId }),
  purchaseOrders: {
    list: (params: { status?: string; supplierId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<PurchaseOrder>>("/purchase-orders", { ...params }),
    get: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
    create: (payload: {
      supplierId: string;
      lines: DocLinePayload[];
      expectedDelivery?: string;
      notes?: string;
      supplierQuotationId?: string;
    }) => api.post<PurchaseOrder>("/purchase-orders", payload),
    transition: (id: string, to: string) =>
      api.post<PurchaseOrder>(`/purchase-orders/${id}/transition`, { to }),
  },
  goodsReceipts: {
    list: (params: { poId?: string; status?: string; limit?: number } = {}) =>
      api.get<Paginated<GoodsReceipt>>("/receipts", { ...params }),
    get: (id: string) => api.get<GoodsReceipt>(`/receipts/${id}`),
    create: (payload: GoodsReceiptPayload) => api.post<GoodsReceipt>("/receipts", payload),
    validate: (id: string) => api.post<GoodsReceipt>(`/receipts/${id}/validate`),
  },
  supplierInvoices: {
    list: (params: { status?: string; supplierId?: string; purchaseOrderId?: string; search?: string; limit?: number } = {}) =>
      api.get<Paginated<SupplierInvoice>>("/purchasing/supplier-invoices", { ...params }),
    get: (id: string) => api.get<SupplierInvoice>(`/purchasing/supplier-invoices/${id}`),
    create: (payload: SupplierInvoicePayload) =>
      api.post<SupplierInvoice>("/purchasing/supplier-invoices", payload),
    validate: (id: string) => api.post<SupplierInvoice>(`/purchasing/supplier-invoices/${id}/validate`),
    cancel: (id: string) => api.post<SupplierInvoice>(`/purchasing/supplier-invoices/${id}/cancel`, {}),
  },
  payments: {
    list: (params: { invoiceId?: string; supplierId?: string; limit?: number } = {}) =>
      api.get<Paginated<Payment>>("/purchasing/supplier-payments", { ...params }),
    get: (id: string) => api.get<Payment>(`/purchasing/supplier-payments/${id}`),
    register: (payload: {
      invoiceId: string;
      amount: number;
      method?: string;
      reference?: string;
      paidAt?: string;
      notes?: string;
    }) => api.post<Payment>("/purchasing/supplier-payments", payload),
  },
};
