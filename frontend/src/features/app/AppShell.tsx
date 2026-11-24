import { useState } from "react";
import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, Users, BarChart3,
  TrendingUp, AlertTriangle, Archive, Zap, Brain, FlaskConical, Bell,
  Smartphone, Settings, LogOut, ChevronLeft, ChevronRight,
  Menu, X, Search, ChevronDown, AlertCircle, FileText, Receipt, Truck,
  ClipboardList, Banknote, Handshake, PackageCheck,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUnreadAlertsCount } from "@/hooks/useApi";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  ai?: boolean;
  badge?: number;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "OPÉRATIONS",
    items: [
      { to: "/app/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
      { to: "/app/products", icon: Package, label: "Articles" },
      { to: "/app/inventory", icon: Archive, label: "Inventaire" },
      { to: "/app/warehouses", icon: Warehouse, label: "Entrepôts" },
      { to: "/app/customers", icon: Users, label: "Clients" },
    ],
  },
  {
    label: "VENTES",
    items: [
      { to: "/app/quotations", icon: FileText, label: "Devis" },
      { to: "/app/sales-orders", icon: ClipboardList, label: "Commandes clients" },
      { to: "/app/delivery-notes", icon: Truck, label: "Bons de livraison" },
      { to: "/app/customer-invoices", icon: Receipt, label: "Factures clients" },
      { to: "/app/customer-payments", icon: Banknote, label: "Règlements clients" },
    ],
  },
  {
    label: "ACHATS",
    items: [
      { to: "/app/supplier-quotations", icon: Handshake, label: "Devis fournisseurs" },
      { to: "/app/purchase-orders", icon: ShoppingCart, label: "Commandes fournisseurs" },
      { to: "/app/receipts", icon: PackageCheck, label: "Réceptions" },
      { to: "/app/supplier-invoices", icon: Receipt, label: "Factures fournisseurs" },
      { to: "/app/supplier-payments", icon: Banknote, label: "Règlements fournisseurs" },
      { to: "/app/suppliers", icon: Users, label: "Fournisseurs" },
    ],
  },
  {
    label: "ANALYTIQUE",
    items: [
      { to: "/app/analytics", icon: BarChart3, label: "Analytique" },
      { to: "/app/forecasting", icon: TrendingUp, label: "Prévisions" },
    ],
  },
  {
    label: "INTELLIGENCE IA",
    items: [
      { to: "/app/ai-copilot", icon: Brain, label: "AI Copilot", ai: true },
      { to: "/app/anomalies", icon: AlertTriangle, label: "Anomalies", ai: true },
      { to: "/app/dead-stock", icon: Archive, label: "Stock mort", ai: true },
      { to: "/app/smart-procurement", icon: Zap, label: "Approvisionnement IA", ai: true },
      { to: "/app/what-if", icon: FlaskConical, label: "Simulation What-if", ai: true },
    ],
  },
  {
    label: "SYSTÈME",
    items: [
      { to: "/app/alerts", icon: Bell, label: "Alertes" },
      { to: "/app/mobile", icon: Smartphone, label: "Application Mobile" },
      { to: "/app/settings", icon: Settings, label: "Paramètres" },
    ],
  },
];

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
          isActive
            ? item.ai
              ? "bg-teal-ai-500/15 text-teal-ai-400"
              : "bg-terra-500/15 text-terra-600"
            : "text-navy-400 hover:text-navy-200 hover:bg-navy-800/50"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-active"
              className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-full ${item.ai ? "bg-teal-ai-400" : "bg-terra-500"}`}
            />
          )}
          <item.icon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && (
            <span className="flex-1 truncate">{item.label}</span>
          )}
          {!collapsed && item.badge !== undefined && item.badge > 0 && (
            <span className="bg-terra-500 text-white text-xs font-mono px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {item.badge}
            </span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-3 bg-navy-800 text-navy-100 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
              {item.label}
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const unreadAlerts = useUnreadAlertsCount();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 h-16 border-b border-navy-800 ${collapsed ? "justify-center" : ""}`}>
        <img src="/nexora-logo.png" alt="Nexora" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        {!collapsed && (
          <div>
            <div className="font-display text-white text-lg leading-tight">Nexora</div>
            <div className="text-teal-ai-400 text-xs font-mono">Smart Stock AI</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="text-navy-600 text-xs font-mono tracking-widest px-3 mb-2">{section.label}</div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarItem
                  key={item.to}
                  item={item.to === "/app/alerts" ? { ...item, badge: unreadAlerts } : item}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-navy-800 p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-terra-500 rounded-lg flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
              {user?.avatar || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-navy-100 text-sm font-medium truncate">{user?.firstName} {user?.lastName}</div>
              <div className="text-navy-500 text-xs truncate">{user?.role === "owner_ceo" ? "PDG / Propriétaire" : user?.role}</div>
            </div>
            <button onClick={handleLogout} className="text-navy-500 hover:text-navy-200 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center text-navy-500 hover:text-navy-200 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-ivory-50">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="hidden lg:flex flex-col bg-navy-900 border-r border-navy-800 flex-shrink-0 relative overflow-hidden"
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 bg-navy-700 border border-navy-600 rounded-full flex items-center justify-center text-navy-300 hover:text-white transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-navy-900 z-50 flex flex-col"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-ivory-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-navy-500 hover:text-navy-700">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
              <input
                type="text"
                placeholder="Rechercher produits, entrepôts, commandes..."
                className="bg-ivory-100 border border-ivory-200 focus:border-terra-300 focus:ring-2 focus:ring-terra-300/20 rounded-xl pl-10 pr-4 py-2 text-sm text-navy-700 placeholder-navy-400 outline-none w-80 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NavLink
              to="/app/alerts"
              className="relative p-2 text-navy-500 hover:text-navy-700 hover:bg-ivory-100 rounded-xl transition-all"
            >
              <Bell className="w-5 h-5" />
              {unreadAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-terra-500 text-white text-[10px] font-mono w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadAlerts}
                </span>
              )}
            </NavLink>

            <div className="flex items-center gap-2 bg-teal-ai-500/10 border border-teal-ai-500/20 text-teal-ai-600 text-xs font-mono px-3 py-1.5 rounded-full">
              <span className="status-dot ai" />
              IA Active
            </div>

            <div className="flex items-center gap-2 cursor-pointer hover:bg-ivory-100 rounded-xl px-3 py-2 transition-all">
              <div className="w-8 h-8 bg-terra-500 rounded-lg flex items-center justify-center text-white text-sm font-medium">
                {user?.avatar || "U"}
              </div>
              <div className="hidden md:block">
                <div className="text-navy-800 text-sm font-medium leading-none">{user?.firstName}</div>
                <div className="text-navy-500 text-xs">PDG</div>
              </div>
              <ChevronDown className="w-4 h-4 text-navy-400 hidden md:block" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
