import { useState } from "react";
import { motion } from "framer-motion";
import { Archive, CheckCircle2, Clock, AlertTriangle, BarChart2 } from "lucide-react";
import { MOCK_PRODUCTS, MOCK_WAREHOUSES } from "@/lib/mock-data";

export default function InventoryPage() {
  const [warehouse, setWarehouse] = useState(MOCK_WAREHOUSES[0].id);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Inventaire</h1>
          <p className="text-navy-500 mt-1">Suivi des stocks par entrepôt · Dernier inventaire: 28/08/2026</p>
        </div>
        <button className="bg-navy-900 hover:bg-navy-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Lancer inventaire
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total références", value: MOCK_PRODUCTS.length, icon: Archive, color: "text-navy-600" },
          { label: "En stock normal", value: MOCK_PRODUCTS.filter((p) => p.status === "in_stock").length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Stock bas", value: MOCK_PRODUCTS.filter((p) => p.status === "low_stock").length, icon: AlertTriangle, color: "text-amber-600" },
          { label: "Ruptures", value: MOCK_PRODUCTS.filter((p) => p.status === "out_of_stock").length, icon: AlertTriangle, color: "text-red-600" },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-ivory-200 rounded-2xl p-5">
            <card.icon className={`w-5 h-5 ${card.color} mb-3`} />
            <div className="font-display text-3xl text-navy-900 mb-1">{card.value}</div>
            <div className="text-navy-500 text-sm">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        {MOCK_WAREHOUSES.map((wh) => (
          <button
            key={wh.id}
            onClick={() => setWarehouse(wh.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              warehouse === wh.id ? "bg-navy-900 text-white" : "bg-white border border-ivory-200 text-navy-600 hover:border-navy-300"
            }`}
          >
            {wh.name}
          </button>
        ))}
      </div>

      <div className="bg-white border border-ivory-200 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-4 p-4 border-b border-ivory-100 bg-ivory-50 text-xs font-mono text-navy-500 uppercase tracking-wide">
          <div className="w-12 flex-shrink-0" />
          <div className="flex-1">Produit</div>
          <div className="w-32">Stock actuel</div>
          <div className="w-24">Min / Max</div>
          <div className="w-28">Taux occupation</div>
          <div className="w-24">Statut</div>
        </div>
        {MOCK_PRODUCTS.map((p, i) => {
          const pct = Math.min((p.stock / p.maxStock) * 100, 100);
          const barColor = p.stock === 0 ? "bg-red-500" : p.stock < p.minStock ? "bg-amber-400" : "bg-teal-ai-500";
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 p-4 border-b border-ivory-100 hover:bg-ivory-50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-ivory-100 flex-shrink-0">
                {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Archive className="w-5 h-5 text-ivory-400 m-auto mt-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-navy-800 text-sm font-medium truncate">{p.name}</div>
                <div className="text-navy-500 text-xs font-mono">{p.sku}</div>
              </div>
              <div className="w-32">
                <div className="font-mono text-navy-800 text-sm">{p.stock.toLocaleString()} {p.unit}</div>
              </div>
              <div className="w-24 text-xs text-navy-500 font-mono">
                {p.minStock} / {p.maxStock}
              </div>
              <div className="w-28">
                <div className="h-1.5 bg-ivory-200 rounded-full overflow-hidden mb-1">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-navy-500 font-mono">{Math.round(pct)}%</div>
              </div>
              <div className="w-24">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  p.status === "in_stock" ? "bg-emerald-50 text-emerald-700" :
                  p.status === "low_stock" ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {p.status === "in_stock" ? "En stock" : p.status === "low_stock" ? "Bas" : "Rupture"}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
