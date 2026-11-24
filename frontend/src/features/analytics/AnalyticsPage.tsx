import { motion } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { MOCK_REVENUE_TREND, MOCK_CATEGORY_STOCK, MOCK_PRODUCTS } from "@/lib/mock-data";
import { TrendingUp, TrendingDown } from "lucide-react";

const ABC_DATA = [
  { label: "A", products: 12, value: 68, color: "#c4714a" },
  { label: "B", products: 28, value: 24, color: "#c9a96e" },
  { label: "C", products: 60, value: 8, color: "#2dd4bf" },
];

const ROTATION_DATA = [
  { product: "Carrelage Plain", rotation: 8.4 },
  { product: "WC Suspendu", rotation: 6.2 },
  { product: "Faïence Marbre", rotation: 4.8 },
  { product: "Porte Laquée", rotation: 3.6 },
  { product: "Meuble SDB", rotation: 2.1 },
  { product: "Piscine Antr.", rotation: 1.8 },
];

function KPICard({ label, value, unit, trend, positive }: { label: string; value: string; unit?: string; trend?: string; positive?: boolean }) {
  return (
    <div className="bg-white border border-ivory-200 rounded-2xl p-6">
      <div className="text-navy-500 text-sm mb-2">{label}</div>
      <div className="flex items-end gap-2 mb-2">
        <span className="font-display text-3xl text-navy-900">{value}</span>
        {unit && <span className="text-navy-500 text-sm mb-1">{unit}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs ${positive ? "text-emerald-600" : "text-red-500"}`}>
          {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend}
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="text-navy-400 text-xs font-mono mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? p.value.toLocaleString("fr-FR") : p.value}</p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-navy-900">Analytique</h1>
        <p className="text-navy-500 mt-1">Performance du stock · Septembre 2026</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Valeur totale du stock" value="1 842 500" unit="€" trend="+4.2% vs mois précédent" positive />
        <KPICard label="Taux de rotation moyen" value="3.8" unit="×/an" trend="+0.3 vs objectif" positive />
        <KPICard label="Marge brute" value="38.4" unit="%" trend="-1.2% vs mois précédent" />
        <KPICard label="Couverture moyenne" value="42" unit="jours" trend="-3 jours vs objectif" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-1">Évolution Revenus & Coûts</h2>
          <p className="text-navy-500 text-sm mb-6">6 derniers mois (€)</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={MOCK_REVENUE_TREND}>
              <defs>
                <linearGradient id="arev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c4714a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#c4714a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3ebda" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenus" stroke="#c4714a" strokeWidth={2.5} fill="url(#arev)" />
              <Line type="monotone" dataKey="cost" name="Coûts" stroke="#1a2b47" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ABC Analysis */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-1">Analyse ABC</h2>
          <p className="text-navy-500 text-sm mb-6">Pareto des références</p>
          <div className="space-y-4">
            {ABC_DATA.map((c) => (
              <div key={c.label} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display text-lg" style={{ backgroundColor: c.color }}>
                  {c.label}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-navy-700">{c.products} références</span>
                    <span className="font-mono text-navy-900">{c.value}% valeur</span>
                  </div>
                  <div className="h-2 bg-ivory-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.value * 1.4}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 bg-ivory-50 rounded-xl p-4 text-xs text-navy-500">
            <strong className="text-navy-700">A</strong> = 20% références = 80% valeur<br />
            <strong className="text-navy-700">B</strong> = 30% références = 15% valeur<br />
            <strong className="text-navy-700">C</strong> = 50% références = 5% valeur
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-1">Rotation par produit</h2>
          <p className="text-navy-500 text-sm mb-6">Fois par an</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ROTATION_DATA} layout="vertical" margin={{ left: 80, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3ebda" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="product" tick={{ fontSize: 11, fill: "#6b5e42" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="rotation" name="Rotation" radius={[0, 6, 6, 0]}>
                {ROTATION_DATA.map((entry, index) => (
                  <Cell key={index} fill={entry.rotation < 3 ? "#c4714a" : entry.rotation < 5 ? "#c9a96e" : "#2dd4bf"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-1">Stock par catégorie</h2>
          <p className="text-navy-500 text-sm mb-6">% de la valeur totale</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={MOCK_CATEGORY_STOCK} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                {MOCK_CATEGORY_STOCK.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: "#0f1a2e", border: "1px solid #1a2b47", borderRadius: 12, color: "#f7f4ef" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {MOCK_CATEGORY_STOCK.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-navy-600 text-xs">{c.name}</span>
                <span className="text-navy-700 font-mono text-xs ml-auto">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
