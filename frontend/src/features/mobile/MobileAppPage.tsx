import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Package, ScanLine, Bell, User, Brain, AlertTriangle,
  Wifi, WifiOff, CheckCircle2, Clock, ArrowRight, Zap, BarChart2,
} from "lucide-react";
import { MOCK_ALERTS, MOCK_PRODUCTS } from "@/lib/mock-data";

type Screen = "home" | "stock" | "scanner" | "alerts" | "profile";

function OfflineBanner({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return (
    <motion.div
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      exit={{ y: -40 }}
      className="bg-amber-500 text-white text-xs font-medium py-1.5 text-center flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5" />
      Mode hors ligne · 3 opérations en attente de synchronisation
    </motion.div>
  );
}

function HomeScreen() {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-navy-400 text-xs">Bonjour,</div>
          <div className="text-ivory-100 font-display text-xl">Aziz Sakly</div>
        </div>
        <div className="flex items-center gap-1.5 bg-teal-ai-500/20 text-teal-ai-400 text-xs px-2.5 py-1 rounded-full">
          <span className="status-dot ai" />IA Active
        </div>
      </div>

      {/* Score */}
      <div className="bg-navy-800 rounded-2xl p-4">
        <div className="text-navy-400 text-xs font-mono mb-2">STOCK HEALTH SCORE</div>
        <div className="flex items-center gap-4">
          <div className="font-display text-5xl text-ivory-50">74</div>
          <div className="flex-1 space-y-1.5">
            {[
              { label: "Disponibilité", v: 81, color: "#2dd4bf" },
              { label: "Rotation", v: 68, color: "#c4714a" },
              { label: "Risque", v: 61, color: "#dc2626" },
            ].map((m) => (
              <div key={m.label} className="flex items-center gap-2">
                <div className="text-navy-400 text-xs w-20">{m.label}</div>
                <div className="flex-1 h-1 bg-navy-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.v}%`, backgroundColor: m.color }} />
                </div>
                <div className="text-xs font-mono" style={{ color: m.color }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Alert */}
      <div className="bg-red-900/30 border border-red-700/50 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-red-300 text-xs font-mono">ALERTE CRITIQUE</span>
        </div>
        <p className="text-ivory-100 text-sm">Rupture de stock — Revêtement Piscine Anthracite</p>
        <button className="mt-2 text-xs text-red-300 flex items-center gap-1">Voir les détails <ArrowRight className="w-3 h-3" /></button>
      </div>

      {/* Quick actions */}
      <div>
        <div className="text-navy-400 text-xs font-mono mb-3">ACTIONS RAPIDES</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: ScanLine, label: "Scanner", color: "bg-teal-ai-500/20 text-teal-ai-400" },
            { icon: Package, label: "Réception", color: "bg-terra-500/20 text-terra-400" },
            { icon: BarChart2, label: "Inventaire", color: "bg-gold-600/20 text-gold-500" },
            { icon: Zap, label: "Transfert", color: "bg-navy-700 text-navy-300" },
          ].map((action) => (
            <button key={action.label} className={`${action.color} border border-navy-700 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all active:scale-95`}>
              <action.icon className="w-6 h-6" />
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScannerScreen() {
  const [scanned, setScanned] = useState(false);
  const product = MOCK_PRODUCTS[1];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="text-ivory-100 font-display text-xl mb-4">Scanner</div>
      <div
        className="bg-navy-900 rounded-2xl h-48 flex items-center justify-center relative overflow-hidden border border-navy-700 cursor-pointer"
        onClick={() => setScanned(!scanned)}
      >
        <div className="absolute inset-6 border-2 border-teal-ai-500/60 rounded-xl" />
        <motion.div
          animate={{ y: scanned ? 60 : -60 }}
          transition={{ duration: 1.5, repeat: scanned ? 0 : Infinity, repeatType: "reverse" }}
          className="absolute left-6 right-6 h-0.5 bg-teal-ai-500"
        />
        <div className="text-center z-10">
          <ScanLine className="w-10 h-10 text-teal-ai-500/40 mx-auto mb-2" />
          <p className="text-navy-400 text-xs">{scanned ? "Produit scanné ✓" : "Appuyer pour scanner"}</p>
        </div>
      </div>

      <AnimatePresence>
        {scanned && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="bg-navy-800 rounded-2xl p-4">
              <div className="text-teal-ai-400 text-xs font-mono mb-1">PRODUIT IDENTIFIÉ</div>
              <div className="flex gap-3">
                <img src={product.image} alt={product.name} className="w-16 h-16 rounded-xl object-cover" />
                <div>
                  <div className="text-ivory-100 font-medium text-sm">{product.name}</div>
                  <div className="text-navy-400 text-xs font-mono mt-0.5">{product.sku}</div>
                  <div className="flex gap-4 mt-2">
                    <div><div className="text-navy-400 text-xs">Stock</div><div className={`font-mono text-sm ${product.stock < product.minStock ? "text-amber-400" : "text-ivory-100"}`}>{product.stock} m²</div></div>
                    <div><div className="text-navy-400 text-xs">Zone</div><div className="font-mono text-sm text-ivory-100">Z-CAR/A3</div></div>
                    <div><div className="text-navy-400 text-xs">Alerte IA</div><div className="text-red-400 text-xs font-mono">Critique</div></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "+ Entrée", color: "bg-teal-ai-500/20 border-teal-ai-500/40 text-teal-ai-300" },
                { label: "− Sortie", color: "bg-terra-500/20 border-terra-500/40 text-terra-300" },
                { label: "Transfert", color: "bg-navy-700 border-navy-600 text-navy-200" },
                { label: "Inventaire", color: "bg-gold-600/20 border-gold-600/40 text-gold-400" },
              ].map((btn) => (
                <button key={btn.label} className={`border py-3 rounded-xl text-sm font-medium transition-all active:scale-95 ${btn.color}`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StockScreen() {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="text-ivory-100 font-display text-xl mb-4">Stock</div>
      {MOCK_PRODUCTS.slice(0, 5).map((p) => (
        <div key={p.id} className="bg-navy-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-navy-700 flex-shrink-0">
            {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-ivory-100 text-sm font-medium truncate">{p.name}</div>
            <div className="text-navy-400 text-xs font-mono">{p.sku}</div>
            <div className="h-1 bg-navy-700 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${p.stock === 0 ? "bg-red-500" : p.stock < p.minStock ? "bg-amber-400" : "bg-teal-ai-500"}`}
                style={{ width: `${Math.min((p.stock / p.maxStock) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`font-mono text-sm ${p.stock === 0 ? "text-red-400" : p.stock < p.minStock ? "text-amber-400" : "text-ivory-100"}`}>{p.stock}</div>
            <div className="text-navy-400 text-xs">{p.unit}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertsScreen() {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="text-ivory-100 font-display text-xl mb-4">Alertes</div>
      {MOCK_ALERTS.slice(0, 4).map((a) => (
        <div key={a.id} className={`rounded-2xl p-4 border ${a.severity === "critical" ? "bg-red-900/20 border-red-800/50" : "bg-navy-800 border-navy-700"}`}>
          <div className="flex items-start gap-3">
            <span className={`status-dot mt-1.5 ${a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "ok"}`} />
            <div>
              <div className="text-ivory-100 text-sm font-medium">{a.title}</div>
              <div className="text-navy-400 text-xs mt-0.5 leading-relaxed">{a.message.substring(0, 70)}…</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileScreen() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="text-ivory-100 font-display text-xl mb-6">Profil</div>
      <div className="bg-navy-800 rounded-2xl p-6 text-center mb-4">
        <div className="w-16 h-16 bg-terra-500 rounded-2xl flex items-center justify-center text-white font-display text-2xl mx-auto mb-3">AS</div>
        <div className="text-ivory-100 font-medium">Aziz Sakly</div>
        <div className="text-navy-400 text-xs">PDG · Nexora</div>
        <div className="text-teal-ai-400 text-xs font-mono mt-1">aziz.sakly@nexora.tn</div>
      </div>
      <div className="space-y-2">
        {["Mon rôle: PDG / Propriétaire", "Entrepôts: 2 actifs", "Langue: Français", "Mode: Clair"].map((item) => (
          <div key={item} className="bg-navy-800 rounded-xl px-4 py-3 text-navy-200 text-sm flex items-center justify-between">
            <span>{item}</span>
            <ArrowRight className="w-4 h-4 text-navy-500" />
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV_ITEMS: { screen: Screen; icon: React.ElementType; label: string }[] = [
  { screen: "home", icon: LayoutDashboard, label: "Accueil" },
  { screen: "stock", icon: Package, label: "Stock" },
  { screen: "scanner", icon: ScanLine, label: "Scanner" },
  { screen: "alerts", icon: Bell, label: "Alertes" },
  { screen: "profile", icon: User, label: "Profil" },
];

export default function MobileAppPage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [offline, setOffline] = useState(false);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-navy-900">Application Mobile</h1>
        <p className="text-navy-500 mt-1">Preview de l'application mobile React Native pour les opérations terrain</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 items-start">
        {/* Phone frame */}
        <div className="mx-auto lg:mx-0">
          <div className="relative" style={{ width: 320 }}>
            {/* Offline toggle */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setOffline(!offline)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${offline ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
              >
                {offline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                {offline ? "Mode hors ligne" : "En ligne"}
              </button>
              <span className="text-navy-400 text-xs">Simuler</span>
            </div>

            {/* Phone */}
            <div className="bg-navy-900 rounded-[3rem] p-4 border-4 border-navy-700 shadow-2xl shadow-navy-900/30">
              <div className="bg-navy-800 rounded-[2.5rem] overflow-hidden flex flex-col" style={{ height: 680 }}>
                {/* Status bar */}
                <div className="bg-navy-900 flex items-center justify-between px-6 py-2 flex-shrink-0">
                  <span className="text-ivory-200 text-xs font-mono">09:47</span>
                  <div className="w-16 h-1.5 bg-navy-700 rounded-full" />
                  <div className="flex items-center gap-1">
                    {offline ? <WifiOff className="w-3 h-3 text-amber-400" /> : <Wifi className="w-3 h-3 text-ivory-200" />}
                    <div className="text-ivory-200 text-xs">●●●</div>
                  </div>
                </div>

                {/* Offline banner */}
                <AnimatePresence>
                  <OfflineBanner offline={offline} />
                </AnimatePresence>

                {/* Screen content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={screen}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="flex-1 overflow-hidden flex flex-col"
                    >
                      {screen === "home" && <HomeScreen />}
                      {screen === "scanner" && <ScannerScreen />}
                      {screen === "stock" && <StockScreen />}
                      {screen === "alerts" && <AlertsScreen />}
                      {screen === "profile" && <ProfileScreen />}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Bottom nav */}
                <div className="bg-navy-900 border-t border-navy-700 flex justify-around py-3 px-2 flex-shrink-0">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.screen}
                      onClick={() => setScreen(item.screen)}
                      className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-all active:scale-90 ${screen === item.screen ? "text-teal-ai-400" : "text-navy-500"}`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="text-[10px]">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features description */}
        <div className="flex-1 space-y-6">
          <div>
            <h2 className="font-display text-2xl text-navy-900 mb-4">Fonctionnalités mobiles</h2>
            <div className="space-y-4">
              {[
                { icon: ScanLine, title: "Scanner code-barres & QR", desc: "Scanner natif via caméra. Affichage immédiat du produit, stock, zone et alertes." },
                { icon: Package, title: "Réception, Inventaire, Transfert", desc: "Opérations terrain complètes avec validation et suivi en temps réel." },
                { icon: WifiOff, title: "Mode hors-ligne", desc: "Toutes les opérations continuent sans réseau. Synchronisation automatique au retour en ligne.", special: true },
                { icon: Bell, title: "Notifications push", desc: "Alertes critiques de stock, nouvelles commandes et résultats IA en temps réel." },
                { icon: Brain, title: "Insights IA rapides", desc: "Score de santé, recommandations et alertes prioritaires accessibles en un geste." },
              ].map((feat) => (
                <div key={feat.title} className={`flex items-start gap-4 p-4 rounded-2xl border ${feat.special ? "bg-amber-50 border-amber-200" : "bg-white border-ivory-200"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${feat.special ? "bg-amber-100" : "bg-navy-50"}`}>
                    <feat.icon className={`w-5 h-5 ${feat.special ? "text-amber-600" : "text-navy-600"}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-navy-900 text-sm">{feat.title}</h3>
                    <p className="text-navy-500 text-sm mt-0.5">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-navy-900 rounded-2xl p-6">
            <h3 className="font-display text-xl text-ivory-50 mb-4">Architecture Mobile</h3>
            <div className="space-y-2 text-sm text-navy-300">
              <div>React Native + Expo + TypeScript</div>
              <div>React Navigation (Stack + Bottom Tabs)</div>
              <div>Expo Camera / BarCodeScanner</div>
              <div>AsyncStorage → SQLite (offline)</div>
              <div>Sync Queue avec Retry & Conflict Resolution</div>
              <div className="text-teal-ai-400 font-mono text-xs pt-2">### ARCHITECTURE PRÊTE — IMPLÉMENTATION REACT NATIVE SÉPARÉE ###</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
