// ============================================================
// Endpoints catalogue produits /api/v1/products
// ============================================================
import { api } from "./client";
import type { Product } from "@/lib/types";

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ProductListParams {
  search?: string;
  category?: string;
  brand?: string;
  status?: Product["status"];
  warehouseId?: string;
  skip?: number;
  limit?: number;
}

export interface ProductImagePayload {
  productId: string;
  quantity?: number;
  warehouseId?: string;
  locationId?: string;
}

export interface UnitConversionPayload {
  fromUnit: string;
  toUnit: string;
  factor: number;
}

export interface ProductCreatePayload {
  sku: string;
  name: string;
  nameAr?: string;
  category: string;
  subcategory?: string;
  productType?: string;
  brand: string;
  image?: string;
  images?: { mediaId: string; url: string; filename: string; isPrimary: boolean }[];
  barcode?: string;
  description?: string;
  descriptionShort?: string;
  unit: string;
  unitConversions?: UnitConversionPayload[];
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  taxRate?: number;
  discountEligible?: boolean;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  warehouseId: string;
  supplierId: string;
  leadTimeDays: number;
  isActive?: boolean;
  tags?: string[];
  /** Stock initial : passe par un vrai mouvement de stock côté backend. */
  initialStock?: { warehouseId?: string; locationId?: string; quantity: number };
}

export type ProductUpdatePayload = Partial<ProductCreatePayload>;

export const productsApi = {
  list: (params: ProductListParams = {}) => api.get<Paginated<Product>>("/products", { ...params }),
  get: (id: string) => api.get<Product>(`/products/${id}`),
  create: (payload: ProductCreatePayload) => api.post<Product>("/products", payload),
  update: (id: string, payload: ProductUpdatePayload) => api.patch<Product>(`/products/${id}`, payload),
  // Images (références persistées côté backend — media_id + URL stable)
  attachImage: (productId: string, mediaId: string, isPrimary = false) =>
    api.post<Product>(`/products/${productId}/images`, { mediaId, isPrimary }),
  setPrimaryImage: (productId: string, mediaId: string) =>
    api.patch<Product>(`/products/${productId}/images/${mediaId}/primary`, {}),
  removeImage: (productId: string, mediaId: string) =>
    api.delete<Product>(`/products/${productId}/images/${mediaId}`),
};
