import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, CheckCircle2, X, ShoppingCart, TrendingUp } from "lucide-react";
import { MOCK_PROCUREMENT } from "@/lib/mock-data";
import type { SmartProcurementRecommendation } from "@/lib/types";

const URGENCY_CONFIG = {
  critical: { label: "Critique", color: "bg-red-50 text-red-700 border-red-200" },
  high: { label: "Urgent", color: "bg-amber-50 text-amber-700 border-amber-200" },
  medium: { label: "Moyen", color: "bg-gold-100 text-gold-800 border-gold-200" },
  low: { label: "Faible", color: "bg-ivory-100 text-navy-600 border-ivory-200" },
};

function RecCard({ rec }: { rec: SmartProcurementRecommendation }) {
  const [status, setStatus] = useState(rec.status);
  const urg = URGENCY_CONFIG[rec.urgency];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border rounded-2xl p-6 transition-all ${status === "ignored" ? "opacity-40" : "hover:shadow-md"} ${
        rec.urgency === "critical" ? "border-red-200" : "border-ivory-200"
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${rec.urgency === "critical" ? "bg-red-100" : "bg-teal-ai-500/10"}`}>
            <Brain className={`w-5 h-5 ${rec.urgency === "critical" ? "text-red-600" : "text-teal-ai-500"}`} />
          </div>
          <div>
            <h3 className="font-medium text-navy-900 text-sm">{rec.productName}</h3>
            <div className="text-navy-500 text-xs font-mono">{rec.productSku}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${urg.color}`}>{urg.label}</span>
          <span className="text-teal-ai-600 text-xs font-mono">{Math.round(rec.confidence * 100)}% conf.</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Stock actuel", value: rec.currentStock, suffix: "", color: rec.currentStock === 0 ? "text-red-600" : rec.currentStock < rec.safetyStock ? "text-amber-600" : "text-navy-900" },
          { label: "Demande prévue", value: rec.forecastDemand, suffix: "", color: "text-navy-900" },
          { label: "Recommandé", value: rec.recommendedQuantity, suffix: "", color: "text-teal-ai-700" },
          { label: "Délai fourn.", value: rec.leadTimeDays, suffix: "j", color: "text-navy-900" },
          { label: "Stock sécurité", value: rec.safetyStock, suffix: "", color: "text-navy-900" },
          { label: "Coût estimé", value: `${rec.estimatedCost.toLocaleString("fr-FR")} €`, suffix: "", color: "text-navy-900" },
        ].map((m) => (
          <div key={m.label} className="bg-ivory-50 rounded-xl p-3 text-center">
            <div className="text-navy-400 text-xs mb-1">{m.label}</div>
            <div className={`font-display text-xl ${m.color}`}>{m.value}{m.suffix}</div>
          </div>
        ))}
      </div>

      {/* Reasons */}
      <div className="mb-4 space-y-1">
        {rec.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-navy-500">
            <TrendingUp className="w-3.5 h-3.5 text-teal-ai-500 mt-0.5 flex-shrink-0" />
            {r}
          </div>
        ))}
      </div>

      <div className="text-xs text-navy-400 mb-3">
        Fournisseur recommandé: <strong className="text-navy-700">{rec.supplierName}</strong>
      </div>

      {/* Actions */}
      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => setStatus("approved")}
            className="flex-1 flex items-center justify-center gap-2 bg-teal-ai-500 hover:bg-teal-ai-600 text-white py-2.5 rounded-xl text-sm font-medium transition-all"
          >
            <CheckCircle2 className="w-4 h-4" /> Approuver
          </button>
          <button
            onClick={() => setStatus("ignored")}
            className="flex items-center justify-center gap-2 border border-ivory-300 hover:border-red-200 text-navy-500 hover:text-red-500 px-4 py-2.5 rounded-xl text-sm transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {status === "approved" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-teal-ai-600 text-sm">
            <CheckCircle2 className="w-4 h-4" /> Approuvé
          </div>
          <button className="flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-xs transition-all">
            <ShoppingCart className="w-3.5 h-3.5" /> Créer commande
          </button>
        </div>
      )}
      {status === "ordered" && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm">
          <CheckCircle2 className="w-4 h-4" /> Commandé
        </div>
      )}
      {status === "ignored" && (
        <div className="text-navy-400 text-sm">Ignoré</div>
      )}
    </motion.div>
  );
}

export default function SmartProcurementPage() {
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-teal-ai-500" />
            <span className="text-teal-ai-600 text-sm font-mono">INTELLIGENCE IA</span>
          </div>
          <h1 className="font-display text-3xl text-navy-900">Approvisionnement Intelligent</h1>
          <p className="text-navy-500 mt-1">{MOCK_PROCUREMENT.filter((r) => r.status === "pending").length} recommandations en attente · Total estimé: {MOCK_PROCUREMENT.reduce((s, r) => s + r.estimatedCost, 0).toLocaleString("fr-FR")} €</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_PROCUREMENT.map((rec) => <RecCard key={rec.id} rec={rec} />)}
      </div>
    </div>
  );
}
