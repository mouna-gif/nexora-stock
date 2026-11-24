import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

function PasswordStrength({ password }: { password: string }) {
  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;
  const labels = ["", "Faible", "Moyen", "Bon", "Fort"];
  const colors = ["", "bg-red-400", "bg-gold-500", "bg-teal-ai-500", "bg-teal-ai-500"];
  return password.length > 0 ? (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? colors[strength] : "bg-ivory-300"}`} />
        ))}
      </div>
      <span className="text-xs text-navy-400">{labels[strength]}</span>
    </div>
  ) : null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", password: "", confirm: "", terms: false });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName) e.firstName = "Requis";
    if (!form.lastName) e.lastName = "Requis";
    if (!form.email) e.email = "Requis";
    if (!form.company) e.company = "Requis";
    if (form.password.length < 8) e.password = "Minimum 8 caractères";
    if (form.password !== form.confirm) e.confirm = "Les mots de passe ne correspondent pas";
    if (!form.terms) e.terms = "Vous devez accepter les conditions";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError("");
    setIsLoading(true);
    const { register } = useAuthStore.getState();
    const ok = await register({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || undefined,
      company: form.company,
      password: form.password,
    });
    setIsLoading(false);
    if (!ok) {
      setSubmitError("Impossible de créer le compte. Vérifiez que l'email n'est pas déjà utilisé et que le backend est démarré.");
      return;
    }
    navigate("/app/dashboard");
  };

  const F = ({ label, field, type = "text", placeholder }: { label: string; field: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-sm font-medium text-navy-700 mb-2">{label}</label>
      <input
        type={type}
        value={form[field as keyof typeof form] as string}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-white border rounded-xl px-4 py-3 text-navy-900 placeholder-navy-400 outline-none transition-all ${
          errors[field] ? "border-red-300 focus:border-red-400" : "border-ivory-300 focus:border-terra-400 focus:ring-2 focus:ring-terra-400/20"
        }`}
      />
      {errors[field] && <p className="text-red-500 text-xs mt-1">{errors[field]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-ivory-50 py-16 px-6">
      <div className="max-w-lg mx-auto">
        <Link to="/" className="flex items-center gap-3 mb-10">
          <img src="/nexora-logo.png" alt="Nexora" className="w-10 h-10 rounded-xl object-cover" />
          <span className="font-display text-2xl text-navy-900">Nexora</span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-4xl text-navy-900 mb-2">Créer un compte</h1>
          <p className="text-navy-500 mb-10">
            Déjà un compte ?{" "}
            <Link to="/login" className="text-terra-600 hover:text-terra-700 font-medium">Se connecter</Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {submitError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <F label="Prénom" field="firstName" placeholder="Aziz" />
              <F label="Nom" field="lastName" placeholder="Sakly" />
            </div>
            <F label="Email professionnel" field="email" type="email" placeholder="aziz@nexora.tn" />
            <F label="Téléphone" field="phone" type="tel" placeholder="+216 XX XXX XXX" />
            <F label="Entreprise" field="company" placeholder="Nexora" />

            <div>
              <label className="block text-sm font-medium text-navy-700 mb-2">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className={`w-full bg-white border rounded-xl px-4 py-3 text-navy-900 placeholder-navy-400 outline-none transition-all pr-12 ${
                    errors.password ? "border-red-300" : "border-ivory-300 focus:border-terra-400 focus:ring-2 focus:ring-terra-400/20"
                  }`}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy-400">
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <PasswordStrength password={form.password} />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-700 mb-2">Confirmer le mot de passe</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-white border rounded-xl px-4 py-3 text-navy-900 placeholder-navy-400 outline-none transition-all ${
                  errors.confirm ? "border-red-300" : "border-ivory-300 focus:border-terra-400 focus:ring-2 focus:ring-terra-400/20"
                }`}
              />
              {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm}</p>}
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => set("terms", !form.terms)}
                className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                  form.terms ? "bg-terra-500 border-terra-500" : "border-ivory-300"
                }`}
              >
                {form.terms && <CheckCircle2 className="w-3 h-3 text-white" />}
              </button>
              <span className="text-sm text-navy-600">
                J'accepte les{" "}
                <span className="text-terra-600 cursor-pointer hover:underline">conditions d'utilisation</span> et la{" "}
                <span className="text-terra-600 cursor-pointer hover:underline">politique de confidentialité</span>
              </span>
            </div>
            {errors.terms && <p className="text-red-500 text-xs">{errors.terms}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full group flex items-center justify-center gap-3 bg-navy-900 hover:bg-navy-800 disabled:bg-navy-400 text-white py-3.5 rounded-xl font-medium transition-all"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Créer mon compte <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
