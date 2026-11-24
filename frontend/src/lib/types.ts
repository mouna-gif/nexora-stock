// ============================================================
// Nexora Smart Stock AI — Core TypeScript Types
// ============================================================

export type UserRole =
  | "super_admin"
  | "owner_ceo"
  | "stock_manager"
  | "warehouse_employee"
  | "purchasing_manager"
  | "sales_manager"
  | "commercial_user"
  | "accounting_admin";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  company: string;
  avatar?: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export type ProductStatus = "in_stock" | "low_stock" | "out_of_stock" | "discontinued";
export type AIRiskLevel = "critical" | "high" | "medium" | "low" | "none";

export interface Product {
  id: string;
  sku: string;
  name: string;
  nameAr?: string;
  category: string;
  subcategory?: string;
  productType?: string;
  brand: string;
  image?: string;
  images?: ProductImage[];
  barcode?: string;
  description?: string;
  descriptionShort?: string;
  unit: string;
  unitConversions?: UnitConversion[];
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  taxRate?: number;
  discountEligible?: boolean;
  stock: number;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  status: ProductStatus;
  isActive?: boolean;
  aiRisk: AIRiskLevel;
  aiRiskScore: number;
  warehouseId: string;
  supplierId: string;
  leadTimeDays: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  mediaId: string;
  url: string;
  filename: string;
  isPrimary: boolean;
}

export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  factor: number;
}

// ── Gestion commerciale ──────────────────────────────────────

export interface DocTotals {
  totalHt: number;
  totalTax: number;
  totalTtc: number;
  taxBreakdown: Record<string, number>;
}

export interface DocLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  totalTtc: number;
  orderLineId?: string;
  poLineId?: string;
}

export interface HistoryEntry {
  action: string;
  details?: string;
  user_id?: string;
  user_name?: string;
  at: string;
}

export type DocStatus =
  | "draft" | "sent" | "accepted" | "rejected" | "cancelled"
  | "confirmed" | "partial" | "delivered"
  | "validated" | "paid" | "received"
  | "pending" | "approved" | "ordered";

export interface Customer {
  id: string;
  code: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTermsDays: number;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface SalesQuotation {
  id: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "cancelled";
  customerId: string;
  customerName: string;
  customerSnapshot?: Record<string, string>;
  date?: string;
  validUntil?: string;
  lines: DocLine[];
  totals: DocTotals;
  currency: string;
  notes: string;
  terms: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  history?: HistoryEntry[];
}

export interface SalesOrderLine extends DocLine {
  deliveredQuantity: number;
  invoicedQuantity: number;
}

export interface SalesOrder {
  id: string;
  number: string;
  status: "draft" | "confirmed" | "partial" | "delivered" | "cancelled";
  customerId: string;
  customerName: string;
  customerSnapshot?: Record<string, string>;
  quotationId?: string;
  quotationNumber?: string;
  lines: SalesOrderLine[];
  totals: DocTotals;
  currency: string;
  deliveryAddress: string;
  deliveryCity: string;
  expectedDeliveryDate?: string;
  paymentTermsDays: number;
  notes: string;
  createdAt?: string;
  createdByName?: string;
  history?: HistoryEntry[];
}

export interface DeliveryNoteLine {
  id: string;
  orderLineId: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  orderedQuantity: number;
  deliveredOnOrder: number;
  warehouseId: string;
  warehouseName: string;
  locationId?: string;
}

export interface DeliveryNote {
  id: string;
  number: string;
  status: "draft" | "validated" | "delivered" | "cancelled";
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName: string;
  customerSnapshot?: Record<string, string>;
  lines: DeliveryNoteLine[];
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDate?: string;
  driver: string;
  signatureName: string;
  notes: string;
  movementIds: string[];
  currency?: string;
  createdAt?: string;
  validatedAt?: string;
  history?: HistoryEntry[];
}

export interface CustomerInvoice {
  id: string;
  number: string;
  status: "draft" | "validated" | "partial" | "paid" | "cancelled";
  customerId: string;
  customerName: string;
  customerSnapshot?: Record<string, string>;
  quotationId?: string;
  quotationNumber?: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
  deliveryNoteIds: string[];
  deliveryNoteNumbers: string[];
  lines: DocLine[];
  totals: DocTotals;
  currency: string;
  amountPaid: number;
  balanceDue: number;
  paymentTermsDays: number;
  dueDate?: string;
  overdue: boolean;
  notes: string;
  createdAt?: string;
  validatedAt?: string;
  history?: HistoryEntry[];
}

export interface Payment {
  id: string;
  number: string;
  direction: "customer" | "supplier";
  invoiceId: string;
  invoiceNumber: string;
  partyId: string;
  partyName: string;
  amount: number;
  method: "cash" | "cheque" | "bank_transfer" | "card" | "other";
  reference: string;
  paidAt?: string;
  notes: string;
  currency: string;
  createdByName?: string;
  createdAt?: string;
}

export interface SupplierQuotation {
  id: string;
  number: string;
  status: "draft" | "received" | "accepted" | "rejected" | "cancelled";
  supplierId: string;
  supplierName: string;
  lines: DocLine[];
  totals: DocTotals;
  deliveryCost: number;
  leadTimeDays: number;
  validUntil?: string;
  currency: string;
  notes: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  createdAt?: string;
  createdByName?: string;
  history?: HistoryEntry[];
}

export interface GoodsReceiptLine {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  quantityDamaged: number;
  quantityMissing: number;
  notes: string;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  status: "draft" | "validated";
  poId: string;
  poReference: string;
  supplierId: string;
  supplierName: string;
  lines: GoodsReceiptLine[];
  warehouseId: string;
  warehouseName: string;
  locationId?: string;
  movementIds: string[];
  notes: string;
  createdAt?: string;
  validatedAt?: string;
  history?: HistoryEntry[];
}

export interface SupplierInvoice {
  id: string;
  number: string;
  status: "draft" | "validated" | "partial" | "paid";
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  goodsReceiptIds: string[];
  goodsReceiptNumbers: string[];
  lines: DocLine[];
  totals: DocTotals;
  currency: string;
  amountPaid: number;
  balanceDue: number;
  dueDate?: string;
  overdue: boolean;
  discrepancies: { sku: string; name: string; ordered: number; received: number; invoiced: number; type: string }[];
  notes: string;
  createdAt?: string;
  history?: HistoryEntry[];
}

export interface CompanySettings {
  companyName: string;
  legalForm: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  customsCode: string;
  currency: string;
  defaultTaxRate: number;
  paymentTermsDays: number;
  bankName: string;
  bankRib: string;
  bankIban: string;
  footerLegal: string;
  logoMediaId?: string;
  numbering: Record<string, { prefix?: string; digits?: number }>;
}

export interface MediaAsset {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  uploadedByName?: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  username: string;
  details: Record<string, unknown>;
  createdAt?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  capacity: number;
  usedCapacity: number;
  zones: Zone[];
  manager: string;
  isActive: boolean;
}

export interface Zone {
  id: string;
  warehouseId: string;
  name: string;
  code: string;
  type: "storage" | "receiving" | "dispatch" | "quarantine";
  capacity: number;
  usedCapacity: number;
  locations: Location[];
}

export interface Location {
  id: string;
  zoneId: string;
  code: string;
  row: string;
  column: string;
  level: string;
  productId?: string;
  quantity: number;
  maxQuantity: number;
}

export type MovementType = "in" | "out" | "transfer" | "adjustment" | "inventory";

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  userId: string;
  createdAt: string;
  syncStatus: "synced" | "pending" | "failed";
}

export type OrderStatus = "draft" | "pending" | "approved" | "ordered" | "partial" | "received" | "cancelled";

export interface PurchaseOrder {
  id: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  lines: PurchaseLine[];
  totals?: DocTotals;
  totalAmount: number;
  expectedDelivery: string;
  aiRecommended: boolean;
  supplierQuotationId?: string;
  supplierQuotationNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  history?: HistoryEntry[];
}

export interface PurchaseLine {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productSku: string;
  unit?: string;
  quantity: number;
  receivedQuantity: number;
  invoicedQuantity?: number;
  unitPrice: number;
  discountPct?: number;
  taxRate?: number;
  grossAmount?: number;
  discountAmount?: number;
  netAmount?: number;
  taxAmount?: number;
  totalTtc?: number;
  totalPrice: number;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  country: string;
  city: string;
  contact: string;
  email: string;
  phone: string;
  performanceScore: number;
  reliabilityScore: number;
  avgLeadTimeDays: number;
  totalOrders: number;
  onTimeDeliveryRate: number;
  categories: string[];
  isActive: boolean;
  createdAt: string;
}

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType = "stock" | "ai" | "inventory" | "purchasing" | "warehouse" | "system" | "anomaly";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  productId?: string;
  warehouseId?: string;
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface ForecastDataPoint {
  date: string;
  historical?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
}

export interface Forecast {
  productId: string;
  productName: string;
  horizon: number;
  confidence: number;
  model: string;
  data: ForecastDataPoint[];
  recommendation: string;
  factors: string[];
}

export type AnomalyType = "stockout_spike" | "overstock" | "unusual_movement" | "price_anomaly" | "supplier_delay";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  productId: string;
  productName: string;
  warehouseId: string;
  score: number;
  severity: AlertSeverity;
  description: string;
  detectedAt: string;
  isResolved: boolean;
  recommendation: string;
}

export interface SmartProcurementRecommendation {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  currentStock: number;
  forecastDemand: number;
  recommendedQuantity: number;
  leadTimeDays: number;
  safetyStock: number;
  confidence: number;
  reasons: string[];
  estimatedCost: number;
  urgency: "critical" | "high" | "medium" | "low";
  supplierId: string;
  supplierName: string;
  status: "pending" | "approved" | "ignored" | "ordered";
}

export interface StockHealthScore {
  overall: number;
  availability: number;
  rotation: number;
  overstock: number;
  demand: number;
  risk: number;
  supplierPerformance: number;
  trend: "up" | "down" | "stable";
  previousScore: number;
}

export interface DashboardKPIs {
  stockValue: number;
  stockValueTrend: number;
  revenue: number;
  revenueTrend: number;
  margin: number;
  marginTrend: number;
  rotation: number;
  rotationTrend: number;
  criticalProducts: number;
  forecastedRisks: number;
  pendingOrders: number;
  activeAlerts: number;
}

// ─── Offline / Sync ───────────────────────────────────────────
export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export interface SyncOperation {
  id: string;
  type: "inventory" | "receiving" | "dispatch" | "transfer" | "adjustment";
  timestamp: string;
  userId: string;
  device: string;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retryCount: number;
  syncedAt?: string;
  error?: string;
}

// ─── AI Copilot ───────────────────────────────────────────────
export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  components?: AIMessageComponent[];
}

export type AIMessageComponent =
  | { type: "kpi"; data: { label: string; value: string | number; trend?: number; unit?: string } }
  | { type: "product_list"; data: Product[] }
  | { type: "recommendation"; data: SmartProcurementRecommendation }
  | { type: "chart"; data: { title: string; points: { label: string; value: number }[] } };
