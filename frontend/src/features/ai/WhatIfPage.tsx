import { useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Brain, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const BASE_DATA = [
  { month: "Oct", base: 88, simulated: 88 },
  { month: "Nov", base: 95, simulated: 95 },
  { month: "Déc", base: 102, simulated: 102 },
  { month: "Jan", base: 86, simulated: 86 },
  { month: "Fév", base: 78, simulated: 78 },
  { month: "Mar", base: 92, simulated: 92 },
];

export default function WhatIfPage() {
  const [demand, setDemand] = useState(0);
  const [leadTime, setLeadTime] = useState(0);
  const [safetyStock, setSafetyStock] = useState(0);

  const simulated = BASE_DATA.map((d) => ({
    ...d,
    simulated: Math.max(0, Math.round(d.base * (1 + demand / 100) * (1 - leadTime / 200))),
  }));

  const totalBase = BASE_DATA.reduce((s, d) => s + d.base, 0);
  const totalSim = simulated.reduce((s, d) => s + d.simulated, 0);
  const diff = totalSim - totalBase;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-teal-ai-500" />
          <span className="text-teal-ai-600 text-sm font-mono">INTELLIGENCE IA</span>
        </div>
        <h1 className="font-display text-3xl text-navy-900">Simulation What-If</h1>
        <p className="text-navy-500 mt-1">Modifiez les paramètres pour projeter les impacts sur votre stock</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-6">
          <div className="bg-white border border-ivory-200 rounded-2xl p-6">
            <h2 className="font-display text-xl text-navy-900 mb-6">Paramètres de simulation</h2>
            {[
              { label: "Variation de la demande", value: demand, set: setDemand, min: -50, max: 100, suffix: "%", color: "text-teal-ai-600" },
              { label: "Variation du délai fournisseur", value: leadTime, set: setLeadTime, min: -50, max: 100, suffix: "%", color: "text-terra-600" },
              { label: "Stock de sécurité supplémentaire", value: safetyStock, set: setSafetyStock, min: 0, max: 200, suffix: " u.", color: "text-gold-700" },
            ].map((ctrl) => (
              <div key={ctrl.label} className="mb-6 last:mb-0">
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-navy-700 font-medium">{ctrl.label}</span>
                  <span className={`font-mono font-medium ${ctrl.color}`}>
                    {ctrl.value > 0 ? "+" : ""}{ctrl.value}{ctrl.suffix}
                  </span>
                </div>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  value={ctrl.value}
                  onChange={(e) => ctrl.set(Number(e.target.value))}
                  className="w-full accent-terra-500"
                />
                <div className="flex justify-between text-xs text-navy-400 mt-1">
                  <span>{ctrl.min}{ctrl.suffix}</span>
                  <span>{ctrl.max}{ctrl.suffix}</span>
                </div>
              </div>
            ))}
            <button
              onClick={() => { setDemand(0); setLeadTime(0); setSafetyStock(0); }}
              className="w-full border border-ivory-300 hover:border-navy-300 text-navy-600 text-sm py-2.5 rounded-xl transition-all mt-2"
            >
              Réinitialiser
            </button>
          </div>

          {/* Impact summary */}
          <div className="bg-navy-900 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-4 h-4 text-gold-500" />
              <span className="text-ivory-100 font-medium text-sm">Impact projeté</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-navy-400 text-xs mb-1">Demande totale projetée</div>
                <div className={`font-display text-3xl ${diff >= 0 ? "text-teal-ai-400" : "text-red-400"}`}>
                  {totalSim} u.
                </div>
              </div>
              <div>
                <div className="text-navy-400 text-xs mb-1">Variation vs baseline</div>
                <div className={`flex items-center gap-2 text-sm ${diff >= 0 ? "text-teal-ai-400" : "text-red-400"}`}>
                  {diff >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span className="font-mono">{diff >= 0 ? "+" : ""}{diff} u. ({Math.round((diff / totalBase) * 100)}%)</span>
                </div>
              </div>
              {demand !== 0 && (
                <div className="bg-navy-800/50 rounded-xl p-3 text-xs text-navy-300">
                  <span className="text-ivory-100">IA analyse :</span> Une hausse de la demande de {demand}% nécessiterait de commander {Math.round(diff * 1.2)} unités supplémentaires pour maintenir le niveau de service.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="xl:col-span-2 bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-1">Projection de la demande</h2>
          <p className="text-navy-500 text-sm mb-6">Scénario baseline vs. simulation · 6 prochains mois</p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={simulated}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3ebda" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0f1a2e", border: "1px solid #1a2b47", borderRadius: 12, color: "#f7f4ef", fontSize: 12 }} />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
              <Line type="monotone" dataKey="base" name="Baseline" stroke="#1a2b47" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#1a2b47", r: 4 }} />
              <Line type="monotone" dataKey="simulated" name="Simulation" stroke="#2dd4bf" strokeWidth={2.5} dot={{ fill: "#2dd4bf", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
