import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import {
  BarChart3, Brain, Building2, Package, ScanLine, Smartphone,
  Shield, Zap, TrendingUp, AlertTriangle, CheckCircle2, ArrowRight,
  ChevronDown, Star, Layers, Globe, LayoutDashboard,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function useCounter(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

function StatCard({ value, suffix, label, start }: { value: number; suffix: string; label: string; start: boolean }) {
  const count = useCounter(value, 1800, start);
  return (
    <div className="text-center">
      <div className="text-5xl font-display text-ivory-50 mb-2">
        {count.toLocaleString("fr-FR")}{suffix}
      </div>
      <div className="text-navy-300 text-sm tracking-wide uppercase">{label}</div>
    </div>
  );
}

const NAV_LINKS = [
  { label: "Plateforme", href: "#platform" },
  { label: "IA", href: "#ai" },
  { label: "Mobile", href: "#mobile" },
  { label: "Intégration", href: "#integration" },
];

const AI_FEATURES = [
  {
    icon: TrendingUp,
    title: "Prévision de la demande",
    desc: "Prophet + XGBoost prédisent votre demande avec une précision de 94%. Anticipez les ruptures avant qu'elles ne surviennent.",
    color: "teal",
  },
  {
    icon: AlertTriangle,
    title: "Détection d'anomalies",
    desc: "L'IA identifie les mouvements inhabituels, les écarts d'inventaire et les comportements suspects en temps réel.",
    color: "terra",
  },
  {
    icon: Brain,
    title: "Recommandations intelligentes",
    desc: "Chaque recommandation d'achat est expliquée : stock actuel, prévision, délai fournisseur, stock de sécurité.",
    color: "gold",
  },
  {
    icon: Zap,
    title: "Copilot IA métier",
    desc: "Posez des questions en langage naturel. L'IA répond avec des données, des graphiques et des actions concrètes.",
    color: "teal",
  },
];

const WEB_FEATURES = [
  { icon: LayoutDashboard, title: "Tableau de bord exécutif", desc: "Score de santé du stock, alertes prioritaires, KPIs stratégiques" },
  { icon: Package, title: "Catalogue produits", desc: "Vue visuelle, données et compact — carrelage, faïence, sanitaire, meubles" },
  { icon: Building2, title: "Jumeau numérique", desc: "Représentation architecturale interactive de vos entrepôts" },
  { icon: BarChart3, title: "Analytique avancée", desc: "Rotation, marges, tendances, segmentation ABC" },
  { icon: ScanLine, title: "Achats intelligents", desc: "Recommandations IA, approbation rapide, suivi fournisseurs" },
  { icon: AlertTriangle, title: "Centre d'alertes", desc: "Alertes critiques, IA, inventaire, système — en temps réel" },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true });
  const { scrollYProgress } = useScroll({ target: heroRef });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-ivory-50 text-navy-900 overflow-x-hidden">
      {/* ── Nav ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-navy-900/95 backdrop-blur-md shadow-lg" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/nexora-logo.png" alt="Nexora" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display text-xl text-white">Nexora</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden md:block text-navy-200 hover:text-white text-sm transition-colors px-4 py-2"
            >
              Se connecter
            </Link>
            <Link
              to="/app/dashboard"
              className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Découvrir
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center mesh-bg overflow-hidden">
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-teal-ai-500/10 border border-teal-ai-500/30 text-teal-ai-400 text-xs font-mono px-3 py-1.5 rounded-full mb-8">
              <span className="status-dot ai" />
              Powered by AI — Prophet · XGBoost · LLM
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-display text-6xl md:text-8xl text-ivory-50 leading-[0.95] mb-8"
            >
              Votre stock mérite plus
              <br />
              <span className="text-terra-400 italic">qu'un simple tableau.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-navy-300 text-xl md:text-2xl max-w-2xl leading-relaxed mb-12">
              Nexora Smart Stock AI unifie la gestion de stock, l'intelligence artificielle et les opérations terrain pour{" "}
              <span className="text-ivory-200">Nexora</span>.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/app/dashboard"
                className="group flex items-center gap-3 bg-terra-500 hover:bg-terra-600 text-white px-8 py-4 rounded-xl font-medium text-lg transition-all duration-200 hover:shadow-lg hover:shadow-terra-500/25"
              >
                Découvrir la plateforme
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="flex items-center gap-3 border border-navy-600 hover:border-navy-400 text-navy-200 hover:text-white px-8 py-4 rounded-xl font-medium text-lg transition-all duration-200"
              >
                Se connecter
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Hero visual */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none hidden lg:block">
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-navy-900/80 z-10" />
          <img
            src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=900&h=900&fit=crop&auto=format"
            alt="Entrepôt moderne Nexora"
            className="w-full h-full object-cover opacity-30"
          />
          {/* Floating UI cards */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="absolute top-1/3 right-16 z-20 bg-navy-800/90 backdrop-blur-md border border-navy-600/50 rounded-2xl p-4 w-64"
          >
            <div className="text-xs text-navy-400 mb-2 font-mono">STOCK HEALTH SCORE</div>
            <div className="flex items-end gap-2">
              <span className="font-display text-5xl text-ivory-100">74</span>
              <span className="text-navy-400 mb-2">/100</span>
            </div>
            <div className="flex gap-1 mt-3">
              {[81, 68, 72, 78, 61, 83].map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-navy-700 rounded-sm overflow-hidden"
                  style={{ height: 24 }}
                >
                  <div
                    className="bg-teal-ai-500 rounded-sm transition-all"
                    style={{ height: `${v}%`, marginTop: `${100 - v}%` }}
                  />
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="absolute bottom-1/3 right-8 z-20 bg-terra-500/90 backdrop-blur-md rounded-2xl p-4 w-56"
          >
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-white" />
              <span className="text-xs text-terra-100 font-mono">IA RECOMMANDE</span>
            </div>
            <p className="text-white text-sm font-medium">Commander 300 m² de Faïence Marbre</p>
            <p className="text-terra-200 text-xs mt-1">Confiance 87% · Urgent</p>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <ChevronDown className="w-6 h-6 text-navy-400" />
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <section ref={statsRef} className="bg-navy-900 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <StatCard value={8} suffix="+" label="Entrepôts gérés" start={statsInView} />
            <StatCard value={2400} suffix="+" label="Références produits" start={statsInView} />
            <StatCard value={98} suffix="%" label="Précision IA" start={statsInView} />
            <StatCard value={42} suffix="K€" label="Stock mort évité" start={statsInView} />
          </div>
        </div>
      </section>

      {/* ── Platform Features ── */}
      <section id="platform" className="py-32 bg-ivory-50">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="mb-20"
          >
            <motion.div variants={fadeUp} className="text-terra-600 text-sm font-mono uppercase tracking-widest mb-4">
              Gestion intelligente du stock
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-display text-5xl md:text-6xl text-navy-900 mb-6">
              Une plateforme unifiée<br />pour toutes vos opérations.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-navy-600 text-xl max-w-2xl">
              Du tableau de bord exécutif aux opérations terrain, Nexora Smart Stock AI couvre l'intégralité de votre chaîne de valeur.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {WEB_FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group bg-white border border-ivory-200 hover:border-terra-200 rounded-2xl p-8 transition-all duration-300 hover:shadow-lg hover:shadow-terra-100"
              >
                <div className="w-12 h-12 bg-navy-900 rounded-xl flex items-center justify-center mb-6 group-hover:bg-terra-500 transition-colors">
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-display text-xl text-navy-900 mb-3">{f.title}</h3>
                <p className="text-navy-500 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Section ── */}
      <section id="ai" className="py-32 mesh-bg">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-20"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-teal-ai-500/10 border border-teal-ai-500/30 text-teal-ai-400 text-xs font-mono px-3 py-1.5 rounded-full mb-6">
              <span className="status-dot ai" />
              Intelligence Artificielle
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-display text-5xl md:text-6xl text-ivory-50 mb-6">
              L'IA qui comprend<br />votre métier.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-navy-300 text-xl max-w-2xl mx-auto">
              Pas une IA générique. Une IA formée sur les patterns de distribution sanitaire et de revêtement.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {AI_FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="relative bg-navy-800/60 backdrop-blur-sm border border-navy-600/50 rounded-2xl p-8 overflow-hidden group hover:border-teal-ai-500/30 transition-all duration-300"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-teal-ai-500/5 to-transparent rounded-2xl" />
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    f.color === "teal" ? "bg-teal-ai-500/20" : f.color === "terra" ? "bg-terra-500/20" : "bg-gold-600/20"
                  }`}
                >
                  <f.icon className={`w-6 h-6 ${
                    f.color === "teal" ? "text-teal-ai-400" : f.color === "terra" ? "text-terra-400" : "text-gold-500"
                  }`} />
                </div>
                <h3 className="font-display text-xl text-ivory-100 mb-3">{f.title}</h3>
                <p className="text-navy-300 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* AI Copilot preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mt-12 bg-navy-800/40 backdrop-blur-sm border border-navy-600/50 rounded-3xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-teal-ai-500/20 rounded-xl flex items-center justify-center">
                <Brain className="w-5 h-5 text-teal-ai-400" />
              </div>
              <div>
                <div className="text-ivory-100 font-medium">Nexora AI Copilot</div>
                <div className="text-teal-ai-400 text-xs font-mono">En ligne · Données temps réel</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="bg-navy-700 text-navy-100 text-sm px-5 py-3 rounded-2xl rounded-tr-sm max-w-xs">
                  Quels produits risquent une rupture cette semaine ?
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-teal-ai-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-teal-ai-400" />
                </div>
                <div className="bg-navy-900/60 border border-navy-600/50 text-navy-100 text-sm px-5 py-4 rounded-2xl rounded-tl-sm max-w-md">
                  <p className="mb-3">J'ai identifié <strong className="text-terra-400">3 produits critiques</strong> avec un risque de rupture élevé dans les 7 prochains jours :</p>
                  <div className="space-y-2">
                    {[
                      { name: "Faïence Marbre 20×20 Gris", risk: "87%", days: "12j" },
                      { name: "Revêtement Piscine Anthracite", risk: "100%", days: "Rupture" },
                      { name: "Meuble SDB 120cm Noyer", risk: "74%", days: "8j" },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center justify-between bg-navy-800/50 rounded-lg px-3 py-2">
                        <span className="text-xs">{p.name}</span>
                        <div className="flex gap-2">
                          <span className="text-terra-400 text-xs font-mono">{p.risk}</span>
                          <span className="text-navy-400 text-xs font-mono">{p.days}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Analytics ── */}
      <section id="analytics" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} className="text-terra-600 text-sm font-mono uppercase tracking-widest mb-4">
                Analytique & Reporting
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-display text-5xl text-navy-900 mb-6">
                Décisions basées<br />sur les données.
              </motion.h2>
              <motion.p variants={fadeUp} className="text-navy-500 text-lg mb-8">
                Score de santé du stock, rotation, marges, prévisions — tout ce dont un directeur a besoin pour piloter l'activité.
              </motion.p>
              <motion.ul variants={stagger} className="space-y-4">
                {[
                  "Score de santé du stock 0–100 avec décomposition",
                  "Segmentation ABC automatique",
                  "Prévisions sur 90 jours avec intervalles de confiance",
                  "Tableaux de bord exécutifs personnalisables",
                ].map((item) => (
                  <motion.li key={item} variants={fadeUp} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-teal-ai-500 mt-0.5 flex-shrink-0" />
                    <span className="text-navy-600">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="bg-navy-900 rounded-3xl p-8"
            >
              <div className="text-xs text-navy-400 font-mono mb-6">SCORE DE SANTÉ DU STOCK — SEPTEMBRE 2026</div>
              <div className="flex items-center gap-6 mb-8">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#1a2b47" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke="#2dd4bf" strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 40 * 0.74} ${2 * Math.PI * 40}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-3xl text-ivory-50">74</span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {[
                    { label: "Disponibilité", v: 81, color: "#2dd4bf" },
                    { label: "Rotation", v: 68, color: "#c4714a" },
                    { label: "Surstock", v: 72, color: "#c9a96e" },
                    { label: "Risque", v: 61, color: "#dc2626" },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-navy-400">{m.label}</span>
                        <span className="text-navy-200 font-mono">{m.v}</span>
                      </div>
                      <div className="h-1.5 bg-navy-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${m.v}%`, backgroundColor: m.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Digital Warehouse ── */}
      <section className="py-32 bg-ivory-100">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-20"
          >
            <motion.div variants={fadeUp} className="text-terra-600 text-sm font-mono uppercase tracking-widest mb-4">
              Digital Warehouse Twin
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-display text-5xl text-navy-900 mb-6">
              Votre entrepôt<br />en temps réel.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-navy-500 text-xl max-w-2xl mx-auto">
              Une représentation architecturale interactive de vos entrepôts, zones, rayons et emplacements.
            </motion.p>
          </motion.div>

          <div className="relative rounded-3xl overflow-hidden bg-navy-900 border border-navy-700 p-8">
            {/* Warehouse grid visualization */}
            <div className="grid grid-cols-12 gap-1.5">
              {Array.from({ length: 96 }).map((_, i) => {
                const occ = Math.random();
                const color = occ < 0.1 ? "bg-red-500/80" : occ < 0.3 ? "bg-gold-500/60" : occ < 0.7 ? "bg-teal-ai-500/60" : "bg-navy-700";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.008 }}
                    className={`h-8 rounded ${color} cursor-pointer hover:brightness-125 transition-all`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-teal-ai-500/60" /><span className="text-navy-400 text-xs">Disponible</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-gold-500/60" /><span className="text-navy-400 text-xs">Faible stock</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/80" /><span className="text-navy-400 text-xs">Rupture</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-navy-700" /><span className="text-navy-400 text-xs">Vide</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mobile ── */}
      <section id="mobile" className="py-32 bg-ivory-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex justify-center"
            >
              <div className="relative w-72">
                <div className="bg-navy-900 rounded-[2.5rem] p-4 border-4 border-navy-700 shadow-2xl">
                  <div className="bg-navy-800 rounded-[2rem] overflow-hidden" style={{ height: 560 }}>
                    <div className="bg-navy-700 h-8 flex items-center justify-center">
                      <div className="w-16 h-1 bg-navy-500 rounded-full" />
                    </div>
                    <div className="p-4">
                      <div className="text-navy-400 text-xs font-mono mb-3">SCANNER ENTREPÔT</div>
                      <div className="bg-navy-900 rounded-2xl h-40 flex items-center justify-center mb-4 border border-navy-600 relative overflow-hidden">
                        <div className="absolute inset-4 border-2 border-teal-ai-500/60 rounded-xl" />
                        <div className="absolute left-4 right-4 h-0.5 bg-teal-ai-500/80 top-1/2 animate-pulse" />
                        <ScanLine className="w-8 h-8 text-teal-ai-500/40" />
                      </div>
                      <div className="bg-navy-900 rounded-2xl p-4 mb-3">
                        <div className="text-xs text-teal-ai-400 font-mono mb-1">PRODUIT SCANNÉ</div>
                        <div className="text-ivory-100 text-sm font-medium">Faïence Marbre 20×20 Gris</div>
                        <div className="text-navy-400 text-xs mt-1">FAI-MAR-20X20-GR</div>
                        <div className="flex gap-4 mt-3">
                          <div><div className="text-xs text-navy-400">Stock</div><div className="text-ivory-100 font-mono">48 m²</div></div>
                          <div><div className="text-xs text-navy-400">Zone</div><div className="text-ivory-100 font-mono">Z-CAR/A3</div></div>
                          <div><div className="text-xs text-red-400">Alerte</div><div className="text-red-400 font-mono text-xs">Critique</div></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button className="bg-teal-ai-500/20 border border-teal-ai-500/40 text-teal-ai-400 text-xs py-2 rounded-xl">+ Entrée</button>
                        <button className="bg-terra-500/20 border border-terra-500/40 text-terra-400 text-xs py-2 rounded-xl">− Sortie</button>
                      </div>
                    </div>
                    {/* Bottom nav */}
                    <div className="absolute bottom-0 left-0 right-0 bg-navy-900 border-t border-navy-700 flex justify-around py-3 px-4">
                      {[
                        { icon: LayoutDashboard, label: "Accueil" },
                        { icon: Package, label: "Stock" },
                        { icon: ScanLine, label: "Scanner", active: true },
                        { icon: AlertTriangle, label: "Alertes" },
                      ].map((item) => (
                        <div key={item.label} className="flex flex-col items-center gap-1">
                          <item.icon className={`w-5 h-5 ${item.active ? "text-teal-ai-400" : "text-navy-500"}`} />
                          <span className={`text-[10px] ${item.active ? "text-teal-ai-400" : "text-navy-500"}`}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} className="text-terra-600 text-sm font-mono uppercase tracking-widest mb-4">
                Application Mobile
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-display text-5xl text-navy-900 mb-6">
                Le terrain,<br />connecté à la stratégie.
              </motion.h2>
              <motion.p variants={fadeUp} className="text-navy-500 text-lg mb-8">
                Vos agents en entrepôt ont accès aux mêmes données que le CEO, en temps réel.
              </motion.p>
              <motion.ul variants={stagger} className="space-y-4">
                {[
                  "Scanner code-barres et QR natif",
                  "Mode hors-ligne — opérations continues sans réseau",
                  "Réception, inventaire, transfert, expédition",
                  "Synchronisation automatique au retour en ligne",
                  "Notifications push en temps réel",
                ].map((item) => (
                  <motion.li key={item} variants={fadeUp} className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-teal-ai-500 mt-0.5 flex-shrink-0" />
                    <span className="text-navy-600">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Independent platform ── */}
      <section id="integration" className="py-32 bg-navy-900">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="text-gold-500 text-sm font-mono uppercase tracking-widest mb-4">
              Plateforme 100% autonome
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-display text-5xl text-ivory-50 mb-6">
              Vos opérations,<br />dans un système unifié.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-navy-300 text-xl max-w-2xl mx-auto mb-16">
              Produits, achats, fournisseurs, entrepôts et analyses partagent une source de vérité sécurisée, sans dépendance à un logiciel externe.
            </motion.p>

            <div className="flex items-center justify-center gap-8 flex-wrap">
              {[
                { label: "Opérations terrain", color: "bg-navy-700 border border-navy-500" },
                { label: "→", color: "" },
                { label: "Nexora Smart Stock AI", color: "bg-terra-500" },
              ].map((item, i) =>
                item.label === "→" ? (
                  <div key={i} className="text-navy-400 text-2xl font-mono">{item.label}</div>
                ) : (
                  <motion.div
                    key={item.label}
                    variants={fadeUp}
                    className={`${item.color} rounded-2xl px-8 py-4 text-white font-medium`}
                  >
                    {item.label}
                  </motion.div>
                )
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16">
              {[
                { label: "Produits", icon: Package },
                { label: "Commandes", icon: BarChart3 },
                { label: "Fournisseurs", icon: Building2 },
                { label: "Stocks", icon: Layers },
              ].map((item) => (
                <motion.div
                  key={item.label}
                  variants={fadeUp}
                  className="bg-navy-800/50 border border-navy-700 rounded-2xl p-6 flex flex-col items-center gap-3"
                >
                  <item.icon className="w-8 h-8 text-gold-500" />
                  <span className="text-navy-200 text-sm">{item.label}</span>
                  <div className="w-2 h-2 rounded-full bg-teal-ai-500 animate-pulse" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── À propos de Nexora ── */}
      <section className="py-32 bg-ivory-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="rounded-3xl overflow-hidden aspect-video bg-navy-100"
            >
              <img
                src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&h=500&fit=crop&auto=format"
                alt="Nexora — Showroom"
                className="w-full h-full object-cover"
              />
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} className="text-terra-600 text-sm font-mono uppercase tracking-widest mb-4">
                À propos de Nexora
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-display text-5xl text-navy-900 mb-6">
                Nexora
              </motion.h2>
              <motion.p variants={fadeUp} className="text-navy-500 text-lg leading-relaxed mb-6">
                Leader tunisien de la distribution de carrelage, faïence, sanitaires, meubles de salle de bain et cuisine, avec des entrepôts à Tunis, Sfax et dans les régions.
              </motion.p>
              <motion.div variants={fadeUp} className="flex gap-8">
                <div><div className="font-display text-3xl text-navy-900">25+</div><div className="text-navy-500 text-sm">Années d'expertise</div></div>
                <div><div className="font-display text-3xl text-navy-900">2400+</div><div className="text-navy-500 text-sm">Références</div></div>
                <div><div className="font-display text-3xl text-navy-900">3</div><div className="text-navy-500 text-sm">Entrepôts</div></div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 mesh-bg">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="font-display text-6xl text-ivory-50 mb-6">
              Prêt à transformer<br />votre stock ?
            </motion.h2>
            <motion.p variants={fadeUp} className="text-navy-300 text-xl mb-12">
              Découvrez la plateforme et voyez comment l'IA peut révolutionner votre gestion de stock.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/app/dashboard"
                className="group flex items-center justify-center gap-3 bg-terra-500 hover:bg-terra-600 text-white px-10 py-4 rounded-xl font-medium text-lg transition-all"
              >
                Accéder à la plateforme
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="flex items-center justify-center gap-3 border border-navy-500 hover:border-navy-400 text-navy-200 hover:text-white px-10 py-4 rounded-xl font-medium text-lg transition-all"
              >
                Se connecter
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-navy-950 border-t border-navy-800 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/nexora-logo.png" alt="Nexora" className="w-8 h-8 rounded-lg object-cover" />
                <span className="font-display text-xl text-white">Nexora</span>
              </div>
              <p className="text-navy-400 text-sm">Plateforme d'intelligence artificielle pour la gestion de stock — Nexora.</p>
            </div>
            {[
              {
                title: "Plateforme",
                links: ["Tableau de bord", "Produits", "Entrepôts", "Achats", "Analytique"],
              },
              {
                title: "Intelligence IA",
                links: ["Copilot IA", "Prévisions", "Anomalies", "Stock mort", "Approvisionnement"],
              },
              {
                title: "Entreprise",
                links: ["À propos", "Sécurité", "Plateforme autonome", "Support", "Contact"],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-medium mb-4">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="text-navy-400 hover:text-navy-200 text-sm cursor-pointer transition-colors">{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-navy-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-navy-500 text-sm">© 2026 Nexora. Tous droits réservés.</p>
            <div className="flex items-center gap-2 text-navy-500 text-sm">
              <Globe className="w-4 h-4" />
              <span>Français</span>
              <span className="text-navy-700">·</span>
              <span>العربية</span>
              <span className="text-navy-700">·</span>
              <span>English</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
