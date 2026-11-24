import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    const ok = await login(email, password);
    if (ok) {
      navigate("/app/dashboard");
    } else {
      setError("Email ou mot de passe incorrect.");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 mesh-bg flex-col justify-between p-16">
        <Link to="/" className="flex items-center gap-3">
          <img src="/nexora-logo.png" alt="Nexora" className="w-10 h-10 rounded-xl object-cover" />
          <span className="font-display text-2xl text-white">Nexora</span>
        </Link>

        <div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-display text-5xl text-ivory-50 leading-tight mb-6"
          >
            L'intelligence au service<br />
            <span className="text-terra-400 italic">de votre stock.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-navy-300 text-lg"
          >
            Prévisions IA · Entrepôt numérique · Alertes temps réel · Copilot intelligent
          </motion.p>
        </div>

        <div className="bg-navy-800/60 backdrop-blur-sm border border-navy-600/50 rounded-2xl p-6">
          <div className="text-xs text-navy-400 font-mono mb-4">ALERTES ACTIVES</div>
          {[
            { text: "Rupture stock — Revêtement Piscine", level: "critical" },
            { text: "IA recommande 6 commandes d'achat", level: "ai" },
            { text: "3 anomalies détectées ce matin", level: "warning" },
          ].map((a) => (
            <div key={a.text} className="flex items-center gap-3 mb-3 last:mb-0">
              <span className={`status-dot ${a.level}`} />
              <span className="text-navy-200 text-sm">{a.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-8 py-16 bg-ivory-50">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <Link to="/" className="flex items-center gap-3 mb-10 lg:hidden">
            <img src="/nexora-logo.png" alt="Nexora" className="w-10 h-10 rounded-xl object-cover" />
            <span className="font-display text-2xl text-navy-900">Nexora</span>
          </Link>

          <h1 className="font-display text-4xl text-navy-900 mb-2">Connexion</h1>
          <p className="text-navy-500 mb-10">
            Pas encore de compte ?{" "}
            <Link to="/register" className="text-terra-600 hover:text-terra-700 font-medium">
              Créer un compte
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-medium text-navy-700 mb-2">Adresse email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aziz.sakly@nexora.tn"
                className="w-full bg-white border border-ivory-300 focus:border-terra-400 focus:ring-2 focus:ring-terra-400/20 rounded-xl px-4 py-3 text-navy-900 placeholder-navy-400 outline-none transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-navy-700">Mot de passe</label>
                <Link to="/forgot-password" className="text-sm text-terra-600 hover:text-terra-700">
                  Oublié ?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-ivory-300 focus:border-terra-400 focus:ring-2 focus:ring-terra-400/20 rounded-xl px-4 py-3 text-navy-900 placeholder-navy-400 outline-none transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRemember(!remember)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  remember ? "bg-terra-500 border-terra-500" : "border-ivory-300"
                }`}
              >
                {remember && <span className="text-white text-xs">✓</span>}
              </button>
              <span className="text-sm text-navy-600">Se souvenir de moi</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full group flex items-center justify-center gap-3 bg-navy-900 hover:bg-navy-800 disabled:bg-navy-400 text-white py-3.5 rounded-xl font-medium transition-all"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 pt-8 border-t border-ivory-200 text-xs text-navy-400 text-center">
            Utilisez les identifiants de votre compte Nexora Smart Stock AI.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
