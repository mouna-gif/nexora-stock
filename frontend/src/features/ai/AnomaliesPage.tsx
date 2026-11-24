import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Brain, CheckCircle2, Clock } from "lucide-react";
import { MOCK_ANOMALIES } from "@/lib/mock-data";

const TYPE_LABELS: Record<string, string> = {
  stockout_spike: "Pic de rupture",
  overstock: "Surstock",
  unusual_movement: "Mouvement inhabitual",
  price_anomaly: "Anomalie de prix",
  supplier_delay: "Retard fournisseur",
};

export default function AnomaliesPage() {
  const [filter, setFilter] = useState("all");

  const filtered = MOCK_ANOMALIES.filter((a) => filter === "all" || a.type === filter);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-teal-ai-500" />
            <span className="text-teal-ai-600 text-sm font-mono">INTELLIGENCE IA</span>
          </div>
          <h1 className="font-display text-3xl text-navy-900">Détection d'Anomalies</h1>
          <p className="text-navy-500 mt-1">{MOCK_ANOMALIES.filter((a) => !a.isResolved).length} anomalies actives · Mis à jour il y a 3 min</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Anomalies actives", value: MOCK_ANOMALIES.filter((a) => !a.isResolved).length, color: "text-red-600", bg: "bg-red-50 border-red-200" },
          { label: "Score moyen", value: `${Math.round(MOCK_ANOMALIES.reduce((a, c) => a + c.score, 0) / MOCK_ANOMALIES.length * 100)}%`, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
          { label: "Résolues ce mois", value: 12, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
        ].map((card) => (
          <div key={card.label} className={`border rounded-2xl p-5 ${card.bg}`}>
            <div className={`font-display text-4xl mb-1 ${card.color}`}>{card.value}</div>
            <div className="text-navy-600 text-sm">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Anomalies list */}
      <div className="space-y-4">
        {filtered.map((anomaly, i) => (
          <motion.div
            key={anomaly.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white border border-ivory-200 rounded-2xl p-6 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${anomaly.severity === "critical" ? "bg-red-100" : "bg-amber-100"}`}>
                  <AlertTriangle className={`w-5 h-5 ${anomaly.severity === "critical" ? "text-red-600" : "text-amber-600"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-navy-900">{anomaly.productName}</h3>
                    <span className="text-xs bg-ivory-100 text-navy-600 px-2.5 py-0.5 rounded-full">{TYPE_LABELS[anomaly.type]}</span>
                  </div>
                  <p className="text-navy-500 text-sm">{anomaly.description}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-navy-400 font-mono mb-1">SCORE ANOMALIE</div>
                <div className={`font-display text-3xl ${anomaly.score > 0.8 ? "text-red-600" : "text-amber-600"}`}>
                  {Math.round(anomaly.score * 100)}%
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="mb-4">
              <div className="h-2 bg-ivory-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${anomaly.score > 0.8 ? "bg-red-500" : "bg-amber-400"}`}
                  style={{ width: `${anomaly.score * 100}%` }}
                />
              </div>
            </div>

            {/* AI Recommendation */}
            <div className="bg-teal-ai-500/5 border border-teal-ai-500/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-3.5 h-3.5 text-teal-ai-500" />
                <span className="text-teal-ai-700 text-xs font-mono">RECOMMANDATION IA</span>
              </div>
              <p className="text-navy-700 text-sm">{anomaly.recommendation}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-navy-400 text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Détecté le {new Date(anomaly.detectedAt).toLocaleDateString("fr-FR")} à {new Date(anomaly.detectedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="flex gap-2">
                <button className="bg-teal-ai-500/10 hover:bg-teal-ai-500/20 text-teal-ai-700 text-xs px-4 py-2 rounded-xl transition-all">
                  Investiguer
                </button>
                <button className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs px-4 py-2 rounded-xl transition-all">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Résoudre
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
