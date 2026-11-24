import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  AlertTriangle, Brain, TrendingUp, TrendingDown, ArrowRight, Package,
  Zap, Activity, ChevronRight, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { MOCK_KPIS, MOCK_STOCK_HEALTH, MOCK_ALERTS, MOCK_PROCUREMENT, MOCK_REVENUE_TREND, MOCK_CATEGORY_STOCK, MOCK_ANOMALIES } from "@/lib/mock-data";

function useAnimatedNumber(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

function StockHealthRing({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 300);
    return () => clearTimeout(t);
  }, [score]);

  const r = 56;
  const circ = 2 * Math.PI * r;
  const color = score >= 80 ? "#2dd4bf" : score >= 60 ? "#c9a96e" : "#c4714a";

  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1a2b47" strokeWidth="10" />
        <motion.circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${circ * animated / 100} ${circ}` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="font-display text-4xl text-ivory-50"
          style={{ color }}
        >
          {score}
        </motion.span>
        <span className="text-navy-400 text-xs">/100</span>
      </div>
    </div>
  );
}

function KPICard({ label, value, prefix, suffix, trend, trendLabel, icon: Icon, color = "default" }: {
  label: string; value: number; prefix?: string; suffix?: string;
  trend?: number; trendLabel?: string; icon: React.ElementType; color?: string;
}) {
  const animated = useAnimatedNumber(value);
  const isUp = (trend ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-ivory-200 rounded-2xl p-6 hover:shadow-md hover:border-ivory-300 transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          color === "teal" ? "bg-teal-ai-500/10" : color === "terra" ? "bg-terra-500/10" : "bg-navy-50"
        }`}>
          <Icon className={`w-5 h-5 ${
            color === "teal" ? "text-teal-ai-600" : color === "terra" ? "text-terra-600" : "text-navy-600"
          }`} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-full ${
            isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          }`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="font-display text-3xl text-navy-900 mb-1">
        {prefix}{animated.toLocaleString("fr-FR")}{suffix}
      </div>
      <div className="text-navy-500 text-sm">{label}</div>
      {trendLabel && <div className="text-navy-400 text-xs mt-1">{trendLabel}</div>}
    </motion.div>
  );
}

const ATTENTION_ITEMS = [
  {
    severity: "critical",
    icon: AlertTriangle,
    text: "8 produits présentent un risque élevé de rupture.",
    action: "Voir les produits",
    to: "/app/forecasting",
  },
  {
    severity: "warning",
    icon: Brain,
    text: "€42K de stock est dormant — actions recommandées.",
    action: "Voir le stock mort",
    to: "/app/dead-stock",
  },
  {
    severity: "ai",
    icon: Zap,
    text: "L'IA recommande 6 commandes d'achat prioritaires.",
    action: "Voir les recommandations",
    to: "/app/smart-procurement",
  },
  {
    severity: "warning",
    icon: AlertTriangle,
    text: "3 anomalies nécessitent une vérification.",
    action: "Voir les anomalies",
    to: "/app/anomalies",
  },
];

const HEALTH_METRICS = [
  { label: "Disponibilité", value: MOCK_STOCK_HEALTH.availability, color: "#2dd4bf" },
  { label: "Rotation", value: MOCK_STOCK_HEALTH.rotation, color: "#c4714a" },
  { label: "Surstock", value: MOCK_STOCK_HEALTH.overstock, color: "#c9a96e" },
  { label: "Demande", value: MOCK_STOCK_HEALTH.demand, color: "#3a64a3" },
  { label: "Risque", value: MOCK_STOCK_HEALTH.risk, color: "#dc2626" },
  { label: "Fournisseurs", value: MOCK_STOCK_HEALTH.supplierPerformance, color: "#059669" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-navy-400 text-xs font-mono mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-sm" style={{ color: p.color }}>
          {p.name}: {p.value?.toLocaleString("fr-FR")} €
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [healthExpanded, setHealthExpanded] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-3xl text-navy-900"
          >
            Ce qui mérite votre attention aujourd'hui.
          </motion.h1>
          <p className="text-navy-500 mt-1 text-sm">
            4 septembre 2026 · Entrepôts actifs: 2 · IA synchronisée il y a 3 min
          </p>
        </div>
        <div className="flex items-center gap-2 bg-teal-ai-500/10 border border-teal-ai-500/20 text-teal-ai-600 text-xs font-mono px-3 py-2 rounded-xl">
          <span className="status-dot ai" />
          IA Active · Mise à jour: 08h47
        </div>
      </div>

      {/* Attention Center */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {ATTENTION_ITEMS.map((item, i) => (
          <motion.div
            key={item.text}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Link
              to={item.to}
              className={`group flex items-start gap-4 p-4 rounded-2xl border transition-all hover:shadow-md ${
                item.severity === "critical"
                  ? "bg-red-50 border-red-200 hover:border-red-300"
                  : item.severity === "ai"
                  ? "bg-teal-ai-500/5 border-teal-ai-500/20 hover:border-teal-ai-500/40"
                  : "bg-amber-50 border-amber-200 hover:border-amber-300"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                item.severity === "critical" ? "bg-red-100" : item.severity === "ai" ? "bg-teal-ai-500/20" : "bg-amber-100"
              }`}>
                <item.icon className={`w-4 h-4 ${
                  item.severity === "critical" ? "text-red-600" : item.severity === "ai" ? "text-teal-ai-600" : "text-amber-600"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug mb-1 ${
                  item.severity === "critical" ? "text-red-800" : item.severity === "ai" ? "text-teal-ai-800" : "text-amber-800"
                }`}>
                  {item.text}
                </p>
                <span className={`text-xs flex items-center gap-1 group-hover:gap-2 transition-all ${
                  item.severity === "critical" ? "text-red-600" : item.severity === "ai" ? "text-teal-ai-600" : "text-amber-600"
                }`}>
                  {item.action} <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Valeur du stock" value={1842500} prefix="€" trend={MOCK_KPIS.stockValueTrend} trendLabel="vs mois précédent" icon={Package} />
        <KPICard label="Revenus du mois" value={387000} prefix="€" trend={MOCK_KPIS.revenueTrend} icon={TrendingUp} color="teal" />
        <KPICard label="Marge brute" value={38} suffix="%" trend={MOCK_KPIS.marginTrend} icon={Activity} />
        <KPICard label="Rotation du stock" value={38} suffix="×/10" trend={MOCK_KPIS.rotationTrend} icon={Activity} color="terra" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="xl:col-span-2 bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl text-navy-900">Revenus vs Coûts</h2>
              <p className="text-navy-500 text-sm">6 derniers mois</p>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-terra-500" /><span className="text-navy-500">Revenus</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-navy-300" /><span className="text-navy-500">Coûts</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={MOCK_REVENUE_TREND} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c4714a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#c4714a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a2b47" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#1a2b47" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3ebda" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#8c7a55" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8c7a55" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenus" stroke="#c4714a" strokeWidth={2} fill="url(#rev)" />
              <Area type="monotone" dataKey="cost" name="Coûts" stroke="#1a2b47" strokeWidth={2} fill="url(#cost)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stock Health Score */}
        <div className="bg-navy-900 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl text-ivory-50">Score de Santé</h2>
              <p className="text-navy-400 text-sm">Stock Health Score</p>
            </div>
            <button
              onClick={() => setHealthExpanded(!healthExpanded)}
              className="text-navy-400 hover:text-navy-200 text-xs border border-navy-700 hover:border-navy-600 px-3 py-1.5 rounded-lg transition-all"
            >
              {healthExpanded ? "Réduire" : "Détails"}
            </button>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <StockHealthRing score={MOCK_STOCK_HEALTH.overall} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-navy-300 text-sm">−5 vs mois dernier</span>
              </div>
              <div className="text-navy-400 text-xs">Score précédent: {MOCK_STOCK_HEALTH.previousScore}</div>
            </div>
          </div>

          <div className="space-y-3">
            {HEALTH_METRICS.map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-navy-400">{m.label}</span>
                  <span className="font-mono" style={{ color: m.color }}>{m.value}</span>
                </div>
                <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${m.value}%` }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Category breakdown */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <h2 className="font-display text-xl text-navy-900 mb-2">Répartition par catégorie</h2>
          <p className="text-navy-500 text-sm mb-6">% du stock total</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={MOCK_CATEGORY_STOCK} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {MOCK_CATEGORY_STOCK.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: "#0f1a2e", border: "1px solid #1a2b47", borderRadius: 12, color: "#f7f4ef" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-4">
            {MOCK_CATEGORY_STOCK.map((c) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-navy-600 text-sm">{c.name}</span>
                </div>
                <span className="font-mono text-sm text-navy-700">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl text-navy-900">Alertes récentes</h2>
            <Link to="/app/alerts" className="text-terra-600 hover:text-terra-700 text-sm flex items-center gap-1">
              Toutes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {MOCK_ALERTS.slice(0, 4).map((alert) => (
              <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${alert.isRead ? "bg-ivory-50 border-ivory-100" : "bg-white border-ivory-200"}`}>
                <span className={`status-dot mt-1.5 flex-shrink-0 ${
                  alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "ok"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-navy-800 text-sm font-medium leading-snug">{alert.title}</p>
                  <p className="text-navy-500 text-xs mt-0.5 leading-snug">{alert.message.substring(0, 60)}…</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Procurement recommendations */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-teal-ai-500" />
              <h2 className="font-display text-xl text-navy-900">IA Recommande</h2>
            </div>
            <Link to="/app/smart-procurement" className="text-terra-600 hover:text-terra-700 text-sm flex items-center gap-1">
              Toutes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {MOCK_PROCUREMENT.slice(0, 3).map((rec) => (
              <div key={rec.id} className="border border-ivory-200 rounded-xl p-4 hover:border-teal-ai-500/30 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-navy-800 text-sm font-medium leading-snug">{rec.productName}</p>
                  <span className={`flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded-full ${
                    rec.urgency === "critical" ? "bg-red-50 text-red-600" :
                    rec.urgency === "high" ? "bg-amber-50 text-amber-600" :
                    "bg-teal-ai-500/10 text-teal-ai-600"
                  }`}>
                    {rec.urgency === "critical" ? "Critique" : rec.urgency === "high" ? "Urgent" : "Moyen"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-navy-500">
                  <span>Recommandé: <strong className="text-navy-700">{rec.recommendedQuantity} {rec.productSku.includes("m²") ? "m²" : "u"}</strong></span>
                  <span className="text-teal-ai-600 font-mono">{Math.round(rec.confidence * 100)}% conf.</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {rec.status === "ordered" ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" />Commandé</span>
                  ) : rec.status === "approved" ? (
                    <span className="flex items-center gap-1 text-xs text-teal-ai-600"><CheckCircle2 className="w-3 h-3" />Approuvé</span>
                  ) : (
                    <button className="text-xs bg-teal-ai-500/10 hover:bg-teal-ai-500/20 text-teal-ai-700 px-3 py-1 rounded-lg transition-all">
                      Approuver
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
