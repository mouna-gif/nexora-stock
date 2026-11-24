import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Brain, AlertTriangle, Package, ShoppingCart, Warehouse, CheckCircle2, Clock } from "lucide-react";
import { useAlerts } from "@/hooks/useApi";
import type { Alert } from "@/lib/types";

const TYPE_CONFIG = {
  stock: { icon: Package, color: "text-red-600", bg: "bg-red-100" },
  ai: { icon: Brain, color: "text-teal-ai-600", bg: "bg-teal-ai-500/20" },
  inventory: { icon: Package, color: "text-amber-600", bg: "bg-amber-100" },
  purchasing: { icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-100" },
  warehouse: { icon: Warehouse, color: "text-navy-600", bg: "bg-navy-100" },
  system: { icon: Bell, color: "text-navy-600", bg: "bg-navy-100" },
  anomaly: { icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-100" },
};

const SEV_LABELS = { critical: "Critique", warning: "Avertissement", info: "Info" };
const SEV_COLORS = { critical: "bg-red-50 text-red-700 border-red-200", warning: "bg-amber-50 text-amber-700 border-amber-200", info: "bg-blue-50 text-blue-700 border-blue-200" };

function AlertCard({ alert }: { alert: Alert }) {
  const [read, setRead] = useState(alert.isRead);
  const [resolved, setResolved] = useState(alert.isResolved);
  const cfg = TYPE_CONFIG[alert.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border rounded-2xl p-5 transition-all hover:shadow-sm ${resolved ? "opacity-50" : ""} ${!read ? "border-terra-200" : "border-ivory-200"}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
          <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              {!read && <span className="w-2 h-2 rounded-full bg-terra-500 flex-shrink-0" />}
              <h3 className="text-navy-900 font-medium text-sm">{alert.title}</h3>
            </div>
            <span className={`flex-shrink-0 text-xs px-2.5 py-0.5 rounded-full border ${SEV_COLORS[alert.severity]}`}>
              {SEV_LABELS[alert.severity]}
            </span>
          </div>
          <p className="text-navy-500 text-sm mb-3">{alert.message}</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-navy-400 text-xs">
              <Clock className="w-3 h-3" />
              {new Date(alert.createdAt).toLocaleDateString("fr-FR")} à {new Date(alert.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex gap-2">
              {!read && (
                <button onClick={() => setRead(true)} className="text-xs text-navy-500 hover:text-navy-700 px-3 py-1.5 border border-ivory-200 rounded-lg transition-all">
                  Marquer lu
                </button>
              )}
              {!resolved && (
                <button onClick={() => setResolved(true)} className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-all">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Résoudre
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function AlertsPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");

  // Alertes réelles via /api/v1/alerts — repli automatique sur les mocks.
  const { data: alerts } = useAlerts();

  const filtered = alerts.filter((a) => {
    if (filter === "unread") return !a.isRead;
    if (filter === "critical") return a.severity === "critical";
    return true;
  });

  const unread = alerts.filter((a) => !a.isRead).length;
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Centre d'Alertes</h1>
          <p className="text-navy-500 mt-1">{unread} non lues · {critical} critiques · {alerts.length} au total</p>
        </div>
        <button className="text-sm text-navy-500 hover:text-navy-700 border border-ivory-200 hover:border-ivory-300 px-4 py-2 rounded-xl transition-all">
          Tout marquer comme lu
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {[["all", `Toutes (${alerts.length})`], ["unread", `Non lues (${unread})`], ["critical", `Critiques (${critical})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === key ? "bg-navy-900 text-white" : "bg-white border border-ivory-200 text-navy-600 hover:border-navy-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
        {filtered.length === 0 && (
          <div className="text-center py-20">
            <Bell className="w-12 h-12 text-ivory-400 mx-auto mb-4" />
            <p className="text-navy-500">Aucune alerte dans cette catégorie.</p>
          </div>
        )}
      </div>
    </div>
  );
}
