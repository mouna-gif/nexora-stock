import { useState } from "react";
import { User, Bell, Globe, Shield, Database } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { CompanySettingsSection } from "../commercial/CompanySettingsSection";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [lang, setLang] = useState("fr");
  const [notifications, setNotifications] = useState({ email: true, push: true, ai: true, weekly: false });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="font-display text-3xl text-navy-900 mb-8">Paramètres</h1>

      <div className="space-y-6">
        {/* Société & documents officiels */}
        <CompanySettingsSection />
        {/* Profile */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5 text-navy-600" />
            <h2 className="font-display text-xl text-navy-900">Profil utilisateur</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Prénom", value: user?.firstName },
              { label: "Nom", value: user?.lastName },
              { label: "Email", value: user?.email },
              { label: "Rôle", value: "PDG / Propriétaire" },
            ].map((field) => (
              <div key={field.label}>
                <label className="text-xs text-navy-500 block mb-1">{field.label}</label>
                <input
                  defaultValue={field.value || ""}
                  className="w-full bg-ivory-50 border border-ivory-200 rounded-xl px-4 py-2.5 text-navy-800 text-sm outline-none focus:border-terra-300 transition-all"
                />
              </div>
            ))}
          </div>
          <button className="mt-4 bg-navy-900 hover:bg-navy-800 text-white px-5 py-2.5 rounded-xl text-sm transition-all">
            Enregistrer
          </button>
        </div>

        {/* Language */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-5 h-5 text-navy-600" />
            <h2 className="font-display text-xl text-navy-900">Langue & Région</h2>
          </div>
          <div className="flex gap-3">
            {[["fr", "Français"], ["ar", "العربية"], ["en", "English"]].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${lang === code ? "bg-navy-900 text-white" : "border border-ivory-200 text-navy-600 hover:border-navy-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {lang === "ar" && <p className="text-amber-600 text-xs mt-3">Le mode RTL sera activé. Rechargement requis.</p>}
        </div>

        {/* Notifications */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-5 h-5 text-navy-600" />
            <h2 className="font-display text-xl text-navy-900">Notifications</h2>
          </div>
          <div className="space-y-4">
            {[
              { key: "email", label: "Alertes par email", desc: "Notifications critiques par email" },
              { key: "push", label: "Notifications push", desc: "Alertes en temps réel sur mobile" },
              { key: "ai", label: "Recommandations IA", desc: "Nouvelles recommandations d'achat IA" },
              { key: "weekly", label: "Rapport hebdomadaire", desc: "Résumé IA chaque lundi matin" },
            ].map((notif) => (
              <div key={notif.key} className="flex items-center justify-between">
                <div>
                  <div className="text-navy-800 text-sm font-medium">{notif.label}</div>
                  <div className="text-navy-400 text-xs">{notif.desc}</div>
                </div>
                <button
                  onClick={() => setNotifications((n) => ({ ...n, [notif.key]: !n[notif.key as keyof typeof n] }))}
                  className={`w-12 h-6 rounded-full transition-all relative ${notifications[notif.key as keyof typeof notifications] ? "bg-teal-ai-500" : "bg-ivory-300"}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${notifications[notif.key as keyof typeof notifications] ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Independent data platform */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-5 h-5 text-navy-600" />
            <h2 className="font-display text-xl text-navy-900">Plateforme de données autonome</h2>
          </div>
          <div className="bg-teal-ai-100 border border-teal-ai-200 rounded-xl p-4 mb-4">
            <div className="text-teal-ai-900 text-sm font-medium mb-1">Backend Nexora opérationnel</div>
            <div className="text-teal-ai-800 text-xs">Les produits, stocks, achats et analyses sont gérés directement par la plateforme, sans dépendance à un logiciel de gestion externe.</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-navy-500">
            <div className="flex justify-between bg-ivory-50 rounded-xl p-3">
              <span>Source de vérité</span>
              <span className="font-mono text-teal-ai-700">Nexora Backend</span>
            </div>
            <div className="flex justify-between bg-ivory-50 rounded-xl p-3">
              <span>Mode</span>
              <span className="font-mono text-navy-700">Temps réel</span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white border border-ivory-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-5 h-5 text-navy-600" />
            <h2 className="font-display text-xl text-navy-900">Sécurité</h2>
          </div>
          <div className="space-y-3">
            <button className="w-full text-left border border-ivory-200 hover:border-navy-300 rounded-xl px-4 py-3 text-navy-700 text-sm transition-all">
              Changer le mot de passe
            </button>
            <button className="w-full text-left border border-ivory-200 hover:border-navy-300 rounded-xl px-4 py-3 text-navy-700 text-sm transition-all">
              Authentification à deux facteurs
            </button>
            <button className="w-full text-left border border-ivory-200 hover:border-navy-300 rounded-xl px-4 py-3 text-navy-700 text-sm transition-all">
              Sessions actives
            </button>
            <button className="w-full text-left border border-red-200 hover:bg-red-50 rounded-xl px-4 py-3 text-red-600 text-sm transition-all">
              Déconnexion de tous les appareils
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
