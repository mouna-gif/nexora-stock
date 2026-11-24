import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Brain, TrendingUp, AlertTriangle, Calendar } from "lucide-react";
import { MOCK_FORECAST, MOCK_PRODUCTS } from "@/lib/mock-data";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl px-4 py-3 shadow-xl text-xs">
      <p className="text-navy-400 font-mono mb-2">{label}</p>
      {payload.map((p: any) => p.value !== undefined && (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "historical" ? "Historique" : p.name === "forecast" ? "Prévision" : p.name === "lower" ? "Borne inf." : "Borne sup."}: {p.value} m²
        </p>
      ))}
    </div>
  );
};

const RISK_PRODUCTS = MOCK_PRODUCTS.filter((p) => p.aiRisk === "critical" || p.aiRisk === "high");

export default function ForecastingPage() {
  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-teal-ai-500" />
            <span className="text-teal-ai-600 text-sm font-mono">INTELLIGENCE IA</span>
          </div>
          <h1 className="font-display text-3xl text-navy-900">Prévisions de Demande</h1>
          <p className="text-navy-500 mt-1">Modèle Prophet + XGBoost · Horizon 90 jours · Confiance {Math.round(MOCK_FORECAST.confidence * 100)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main forecast chart */}
        <div className="xl:col-span-2 bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="font-display text-xl text-navy-900">{MOCK_FORECAST.productName}</h2>
              <p className="text-navy-500 text-sm">Demande historique + prévision 90 jours</p>
            </div>
            <div className="text-right">
              <div className="text-teal-ai-600 text-xs font-mono">CONFIANCE</div>
              <div className="font-display text-2xl text-navy-900">{Math.round(MOCK_FORECAST.confidence * 100)}%</div>
            </div>
          </div>

          <div className="flex gap-6 text-xs mb-6 mt-4">
            {[
              { color: "#1a2b47", label: "Historique", style: "solid" },
              { color: "#2dd4bf", label: "Prévision", style: "dashed" },
              { color: "#2dd4bf", label: "Intervalle de confiance", style: "area", opacity: 0.2 },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-5 h-0.5" style={{ backgroundColor: l.color, opacity: l.opacity || 1 }} />
                <span className="text-navy-500">{l.label}</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={MOCK_FORECAST.data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3ebda" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false}
                tickFormatter={(v) => new Date(v).toLocaleDateString("fr-FR", { month: "short" })} />
              <YAxis tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine x="2026-10-01" stroke="#c4714a" strokeDasharray="4 4" label={{ value: "Aujourd'hui →", fill: "#c4714a", fontSize: 10 }} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="url(#fc)" />
              <Area type="monotone" dataKey="lower" stroke="none" fill="white" />
              <Area type="monotone" dataKey="historical" name="historical" stroke="#1a2b47" strokeWidth={2.5} fill="none" dot={{ fill: "#1a2b47", r: 3 }} />
              <Area type="monotone" dataKey="forecast" name="forecast" stroke="#2dd4bf" strokeWidth={2} strokeDasharray="6 3" fill="none" dot={{ fill: "#2dd4bf", r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>

          {/* AI Recommendation box */}
          <div className="mt-6 bg-teal-ai-500/10 border border-teal-ai-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-teal-ai-500" />
              <span className="text-teal-ai-700 text-xs font-mono">RECOMMANDATION IA</span>
            </div>
            <p className="text-navy-800 text-sm font-medium mb-2">{MOCK_FORECAST.recommendation}</p>
            <div className="flex flex-wrap gap-2">
              {MOCK_FORECAST.factors.map((f) => (
                <span key={f} className="bg-teal-ai-500/10 text-teal-ai-700 text-xs px-2.5 py-1 rounded-full">{f}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Risk panel */}
        <div className="space-y-4">
          <div className="bg-navy-900 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-terra-400" />
              <h2 className="font-display text-xl text-ivory-50">Risques de Rupture</h2>
            </div>
            <div className="space-y-4">
              {RISK_PRODUCTS.map((p) => (
                <div key={p.id} className="border border-navy-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-ivory-100 text-sm font-medium leading-snug">{p.name}</p>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${p.aiRisk === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
                  </div>
                  <div className="text-navy-400 text-xs font-mono mb-3">{p.sku}</div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-navy-400">Stock actuel</span>
                    <span className={`font-mono ${p.stock === 0 ? "text-red-400" : p.stock < p.minStock ? "text-amber-400" : "text-teal-ai-400"}`}>
                      {p.stock} {p.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mb-3">
                    <span className="text-navy-400">Risque IA</span>
                    <span className="font-mono text-red-400">{p.aiRiskScore}%</span>
                  </div>
                  <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p.aiRiskScore > 80 ? "bg-red-500" : "bg-amber-400"}`}
                      style={{ width: `${p.aiRiskScore}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-ivory-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-teal-ai-500" />
              <span className="text-navy-700 text-sm font-medium">Modèle IA</span>
            </div>
            <div className="space-y-2 text-xs text-navy-500">
              <div className="flex justify-between">
                <span>Algorithme</span>
                <span className="font-mono text-navy-700">{MOCK_FORECAST.model}</span>
              </div>
              <div className="flex justify-between">
                <span>Horizon</span>
                <span className="font-mono text-navy-700">{MOCK_FORECAST.horizon} jours</span>
              </div>
              <div className="flex justify-between">
                <span>Confiance globale</span>
                <span className="font-mono text-teal-ai-600">{Math.round(MOCK_FORECAST.confidence * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Dernière mise à jour</span>
                <span className="font-mono text-navy-700">04/09/2026 08:47</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
