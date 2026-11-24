import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import LandingPage from "@/features/landing/LandingPage";
import LoginPage from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import AppShell from "@/features/app/AppShell";
import DashboardPage from "@/features/dashboard/DashboardPage";
import ProductsPage from "@/features/products/ProductsPage";
import InventoryPage from "@/features/inventory/InventoryPage";
import WarehousePage from "@/features/warehouses/WarehousePage";
import PurchasingPage from "@/features/purchasing/PurchasingPage";
import SuppliersPage from "@/features/suppliers/SuppliersPage";
import AnalyticsPage from "@/features/analytics/AnalyticsPage";
import ForecastingPage from "@/features/ai/ForecastingPage";
import AnomaliesPage from "@/features/ai/AnomaliesPage";
import DeadStockPage from "@/features/ai/DeadStockPage";
import SmartProcurementPage from "@/features/ai/SmartProcurementPage";
import AICopilotPage from "@/features/ai/AICopilotPage";
import WhatIfPage from "@/features/ai/WhatIfPage";
import AlertsPage from "@/features/alerts/AlertsPage";
import MobileAppPage from "@/features/mobile/MobileAppPage";
import SettingsPage from "@/features/settings/SettingsPage";
import DocumentPrintPage from "@/features/commercial/DocumentPrint";
import CustomersPage from "@/features/sales/CustomersPage";
import {
  QuotationsPage, SalesOrdersPage, DeliveryNotesPage,
  CustomerInvoicesPage, CustomerPaymentsPage,
} from "@/features/sales/SalesPages";
import {
  SupplierQuotationsPage, PurchaseOrdersPage, GoodsReceiptsPage,
  SupplierInvoicesPage, SupplierPaymentsPage,
} from "@/features/purchasing/PurchasingPages";
import { useEffect } from "react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-ivory-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-navy-200 border-t-terra-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const hydrateSession = useAuthStore((s) => s.hydrateSession);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected app */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="warehouses" element={<WarehousePage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="quotations" element={<QuotationsPage />} />
          <Route path="sales-orders" element={<SalesOrdersPage />} />
          <Route path="delivery-notes" element={<DeliveryNotesPage />} />
          <Route path="customer-invoices" element={<CustomerInvoicesPage />} />
          <Route path="customer-payments" element={<CustomerPaymentsPage />} />
          <Route path="supplier-quotations" element={<SupplierQuotationsPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="receipts" element={<GoodsReceiptsPage />} />
          <Route path="supplier-invoices" element={<SupplierInvoicesPage />} />
          <Route path="supplier-payments" element={<SupplierPaymentsPage />} />
          <Route path="purchases" element={<PurchasingPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="forecasting" element={<ForecastingPage />} />
          <Route path="anomalies" element={<AnomaliesPage />} />
          <Route path="dead-stock" element={<DeadStockPage />} />
          <Route path="smart-procurement" element={<SmartProcurementPage />} />
          <Route path="ai-copilot" element={<AICopilotPage />} />
          <Route path="what-if" element={<WhatIfPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="mobile" element={<MobileAppPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Impression A4 des documents commerciaux (plein écran) */}
        <Route
          path="/app/print/:type/:id"
          element={
            <ProtectedRoute>
              <DocumentPrintPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
