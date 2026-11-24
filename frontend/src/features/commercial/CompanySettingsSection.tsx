// ============================================================
// Paramètres société — informations légales officielles et
// numérotation des documents (réservé au super administrateur).
// AUCUNE donnée n'est inventée : l'administrateur saisit les
// valeurs officielles qui alimentent les documents imprimables.
// ============================================================
import { useEffect, useState } from "react";
import { Loader2, Save, Building2, Hash } from "lucide-react";
import { settingsApi } from "@/lib/api";
import type { CompanySettings } from "@/lib/types";
import { Field, Notice, inputCls } from "./kit";

const DOC_TYPES: { key: string; label: string }[] = [
  { key: "sales_quotation", label: "Devis client (DEV)" },
  { key: "sales_order", label: "Commande client (CMD)" },
  { key: "delivery_note", label: "Bon de livraison (BL)" },
  { key: "customer_invoice", label: "Facture client (FAC)" },
  { key: "customer_payment", label: "Reçu de règlement (REC)" },
  { key: "supplier_quotation", label: "Devis fournisseur (DF)" },
  { key: "purchase_order", label: "Commande d'achat (PO)" },
  { key: "goods_receipt", label: "Bon de réception (BR)" },
  { key: "supplier_invoice", label: "Facture fournisseur (FF)" },
  { key: "supplier_payment", label: "Règlement fournisseur (REG)" },
];

export function CompanySettingsSection() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getCompany()
      .then((s) => {
        setSettings(s);
        const p: Record<string, string> = {};
        for (const { key } of DOC_TYPES) p[key] = s.numbering?.[key]?.prefix ?? "";
        setPrefixes(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."));
  }, []);

  const set = (patch: Partial<CompanySettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const numbering: Record<string, { prefix?: string }> = {};
      for (const { key } of DOC_TYPES) {
        if (prefixes[key]?.trim()) numbering[key] = { prefix: prefixes[key].trim().toUpperCase() };
      }
      const updated = await settingsApi.updateCompany({ ...settings, numbering });
      setSettings(updated);
      setNotice("Paramètres société enregistrés — les documents imprimables utilisent ces informations.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'enregistrement.");
    } finally { setBusy(false); }
  };

  if (!settings) {
    return <div className="flex items-center gap-2 text-navy-400 text-sm py-6"><Loader2 className="w-4 h-4 animate-spin" /> Chargement des paramètres société…</div>;
  }

  return (
    <div className="bg-white border border-ivory-200 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-5 h-5 text-navy-600" />
        <h2 className="font-display text-xl text-navy-900">Société & documents officiels</h2>
      </div>
      <Notice error={error} notice={notice} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Raison sociale"><input value={settings.companyName} onChange={(e) => set({ companyName: e.target.value })} className={inputCls} placeholder="Nexora" /></Field>
        <Field label="Forme juridique"><input value={settings.legalForm} onChange={(e) => set({ legalForm: e.target.value })} className={inputCls} placeholder="SA, SARL…" /></Field>
        <Field label="Matricule fiscal (MF)"><input value={settings.taxId} onChange={(e) => set({ taxId: e.target.value })} className={inputCls} /></Field>
        <Field label="Code en douane"><input value={settings.customsCode} onChange={(e) => set({ customsCode: e.target.value })} className={inputCls} /></Field>
        <Field label="Adresse"><input value={settings.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></Field>
        <Field label="Ville"><input value={settings.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} /></Field>
        <Field label="Téléphone"><input value={settings.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} /></Field>
        <Field label="Email"><input value={settings.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} /></Field>
        <Field label="Devise"><input value={settings.currency} onChange={(e) => set({ currency: e.target.value })} className={inputCls} placeholder="TND" /></Field>
        <Field label="TVA par défaut (%)"><input type="number" step="0.5" value={settings.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: parseFloat(e.target.value || "0") })} className={inputCls} /></Field>
        <Field label="Délai de paiement (jours)"><input type="number" value={settings.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: parseInt(e.target.value || "30", 10) })} className={inputCls} /></Field>
        <Field label="Banque"><input value={settings.bankName} onChange={(e) => set({ bankName: e.target.value })} className={inputCls} /></Field>
        <Field label="RIB"><input value={settings.bankRib} onChange={(e) => set({ bankRib: e.target.value })} className={inputCls} /></Field>
        <Field label="IBAN"><input value={settings.bankIban} onChange={(e) => set({ bankIban: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="Mentions légales du pied de page">
        <textarea rows={2} value={settings.footerLegal} onChange={(e) => set({ footerLegal: e.target.value })} className={inputCls} />
      </Field>

      <div className="flex items-center gap-3 mt-6 mb-3">
        <Hash className="w-4 h-4 text-navy-500" />
        <h3 className="text-sm font-medium text-navy-800">Numérotation des documents</h3>
      </div>
      <p className="text-[11px] text-navy-400 mb-3">
        Format : PRÉFIXE-ANNÉE-0001 (compteur atomique — aucun doublon, aucun numéro réutilisé).
        Laissez vide pour conserver le préfixe par défaut indiqué entre parenthèses.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {DOC_TYPES.map(({ key, label }) => (
          <div key={key}>
            <label className="text-[11px] text-navy-500 block mb-1">{label}</label>
            <input value={prefixes[key] ?? ""} onChange={(e) => setPrefixes({ ...prefixes, [key]: e.target.value.toUpperCase() })}
              className={`${inputCls} py-2 font-mono uppercase`} placeholder="—" maxLength={8} />
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={save} disabled={busy}
          className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer les paramètres
        </button>
      </div>
    </div>
  );
}
