// ============================================================
// Kit UI commun de la gestion commerciale Nexora
// (badges de statut, modales, totaux, tables, historique,
//  règlements, paramètres société)
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, X, Printer, FileText } from "lucide-react";
import { settingsApi, salesApi, purchasingApi } from "@/lib/api";
import type { CompanySettings, DocLine, DocTotals, HistoryEntry, Payment } from "@/lib/types";

// ── Formatage ────────────────────────────────────────────────
export function fmtMoney(amount: number | undefined | null, currency = "TND"): string {
  const n = typeof amount === "number" && isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function fmtDate(value: string | undefined | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Statuts ──────────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", rejected: "Refusé",
  cancelled: "Annulé", confirmed: "Confirmée", partial: "Partiel", delivered: "Livrée",
  validated: "Validé", paid: "Payée", pending: "En approbation", approved: "Approuvée",
  ordered: "Commandée", received: "Réceptionnée",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-ivory-100 text-navy-500",
  sent: "bg-sky-50 text-sky-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-red-50 text-red-700",
  confirmed: "bg-sky-50 text-sky-700",
  partial: "bg-amber-50 text-amber-700",
  delivered: "bg-emerald-50 text-emerald-700",
  validated: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-teal-50 text-teal-700",
  ordered: "bg-sky-50 text-sky-700",
  received: "bg-emerald-50 text-emerald-700",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? "bg-ivory-100 text-navy-500";
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${color}`}>{label}</span>;
}

// ── Notifications ────────────────────────────────────────────
export function Notice({ notice, error }: { notice?: string | null; error?: string | null }) {
  if (!notice && !error) return null;
  const isError = !!error;
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4 ${
      isError ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
    }`}>
      {isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      <span>{error || notice}</span>
    </div>
  );
}

// ── Modale ───────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, wide }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string;
  children: React.ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-4xl" : "max-w-xl"} max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between p-6 border-b border-ivory-200">
          <div>
            <h3 className="font-display text-xl text-navy-900">{title}</h3>
            {subtitle && <p className="text-navy-500 text-sm mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-700 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── Champs de formulaire ─────────────────────────────────────
export const inputCls =
  "w-full bg-ivory-50 border border-ivory-200 rounded-xl px-3.5 py-2.5 text-sm text-navy-800 outline-none focus:border-terra-300 focus:ring-2 focus:ring-terra-300/20 transition-all";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-navy-500 block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-navy-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── En-tête de page ──────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-8 gap-4">
      <div>
        <h1 className="font-display text-3xl text-navy-900">{title}</h1>
        {subtitle && <p className="text-navy-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}

// ── Table générique ──────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyLabel }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="bg-white border border-ivory-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ivory-50 border-b border-ivory-100 text-xs font-mono text-navy-500 uppercase tracking-wide">
              {columns.map((c) => (
                <th key={c.key} className={`text-left px-4 py-3 font-medium whitespace-nowrap ${c.className ?? ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-ivory-100 last:border-0 transition-colors ${onRowClick ? "cursor-pointer hover:bg-ivory-50" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="text-center py-14">
          <FileText className="w-10 h-10 text-ivory-400 mx-auto mb-3" />
          <p className="text-navy-500 text-sm">{emptyLabel ?? "Aucun document."}</p>
        </div>
      )}
    </div>
  );
}

// ── Lignes de document (lecture seule) ───────────────────────
export function LinesTable({ lines, currency, showProgress }: {
  lines: (DocLine & { deliveredQuantity?: number; invoicedQuantity?: number; orderedQuantity?: number })[];
  currency: string;
  showProgress?: boolean;
}) {
  return (
    <div className="border border-ivory-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ivory-50 border-b border-ivory-100 text-xs font-mono text-navy-500 uppercase">
            <th className="text-left px-3 py-2.5">Réf.</th>
            <th className="text-left px-3 py-2.5">Désignation</th>
            <th className="text-right px-3 py-2.5">Qté</th>
            {showProgress && <th className="text-right px-3 py-2.5">Livré</th>}
            {showProgress && <th className="text-right px-3 py-2.5">Facturé</th>}
            <th className="text-right px-3 py-2.5">P.U.</th>
            <th className="text-right px-3 py-2.5">Remise</th>
            <th className="text-right px-3 py-2.5">TVA</th>
            <th className="text-right px-3 py-2.5">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-ivory-100 last:border-0">
              <td className="px-3 py-2.5 font-mono text-xs text-navy-500">{l.sku}</td>
              <td className="px-3 py-2.5 text-navy-800">{l.name}</td>
              <td className="px-3 py-2.5 text-right text-navy-700">{l.quantity} <span className="text-navy-400 text-xs">{l.unit}</span></td>
              {showProgress && <td className="px-3 py-2.5 text-right text-emerald-700">{l.deliveredQuantity ?? 0}</td>}
              {showProgress && <td className="px-3 py-2.5 text-right text-navy-600">{l.invoicedQuantity ?? 0}</td>}
              <td className="px-3 py-2.5 text-right text-navy-700">{l.unitPrice.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right text-navy-600">{l.discountPct ? `${l.discountPct}%` : "—"}</td>
              <td className="px-3 py-2.5 text-right text-navy-600">{l.taxRate}%</td>
              <td className="px-3 py-2.5 text-right font-medium text-navy-900">{fmtMoney(l.netAmount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Totaux ───────────────────────────────────────────────────
export function TotalsBox({ totals, currency, extra }: {
  totals: DocTotals; currency: string;
  extra?: { label: string; value: string; highlight?: boolean }[];
}) {
  return (
    <div className="bg-ivory-50 border border-ivory-200 rounded-2xl p-5 min-w-[280px]">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-navy-600">
          <span>Total HT</span><span className="font-medium text-navy-900">{fmtMoney(totals.totalHt, currency)}</span>
        </div>
        {Object.entries(totals.taxBreakdown ?? {}).map(([rate, amount]) => (
          <div key={rate} className="flex justify-between text-navy-500 text-xs">
            <span>TVA {rate}</span><span>{fmtMoney(amount, currency)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-ivory-200 text-navy-900">
          <span className="font-medium">Total TTC</span>
          <span className="font-display text-lg font-semibold">{fmtMoney(totals.totalTtc, currency)}</span>
        </div>
        {(extra ?? []).map((e) => (
          <div key={e.label} className={`flex justify-between ${e.highlight ? "text-navy-900 font-semibold" : "text-navy-600"}`}>
            <span>{e.label}</span><span>{e.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cycle de vie : documents liés ────────────────────────────
export function LifecycleLinks({ links }: { links: ({ label: string; to?: string; number?: string } | null)[] }) {
  const items = links.filter(Boolean) as { label: string; to?: string; number?: string }[];
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {items.map((l, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-navy-300">→</span>}
          {l.to && l.number ? (
            <Link to={l.to} className="bg-ivory-100 hover:bg-ivory-200 text-navy-700 px-2.5 py-1 rounded-lg font-mono transition-colors">
              {l.label} {l.number}
            </Link>
          ) : (
            <span className="text-navy-400">{l.label} {l.number ?? "—"}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function PrintButton({ docType, docId }: { docType: string; docId: string }) {
  return (
    <a
      href={`/app/print/${docType}/${docId}?autoprint=1`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
    >
      <Printer className="w-4 h-4" /> Imprimer / PDF
    </a>
  );
}

// ── Historique ───────────────────────────────────────────────
export function HistoryList({ history }: { history?: HistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="space-y-2">
      {[...history].reverse().map((h, i) => (
        <div key={i} className="flex items-center gap-3 text-xs text-navy-500">
          <span className="w-32 flex-shrink-0">{h.at ? new Date(h.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
          <span className="font-medium text-navy-700 whitespace-nowrap">{STATUS_LABELS[h.action.replace("status:", "")] ?? h.action}</span>
          <span className="truncate">{h.details}</span>
          {h.user_name && <span className="ml-auto text-navy-400 whitespace-nowrap">{h.user_name}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Paramètres société (hook partagé) ────────────────────────
const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "", legalForm: "", address: "", city: "", country: "Tunisie",
  phone: "", email: "", website: "", taxId: "", customsCode: "",
  currency: "TND", defaultTaxRate: 19, paymentTermsDays: 30,
  bankName: "", bankRib: "", bankIban: "", footerLegal: "", numbering: {},
};

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    let mounted = true;
    settingsApi.getCompany()
      .then((s) => mounted && setSettings(s))
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  return settings;
}

// ── Modale de règlement (client / fournisseur) ───────────────
export function PaymentModal({ open, onClose, invoice, direction, onDone }: {
  open: boolean;
  onClose: () => void;
  invoice: { id: string; number: string; balanceDue: number; currency: string } | null;
  direction: "customer" | "supplier";
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setAmount(invoice.balanceDue.toFixed(2));
      setMethod("bank_transfer");
      setReference("");
      setError(null);
    }
  }, [open, invoice]);

  if (!open || !invoice) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { invoiceId: invoice.id, amount: parseFloat(amount), method, reference };
      if (direction === "customer") await salesApi.payments.register(payload);
      else await purchasingApi.payments.register(payload);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du règlement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enregistrer un règlement" subtitle={`Facture ${invoice.number}`}>
      <div className="space-y-4">
        <Notice error={error} />
        <div className="flex justify-between text-sm bg-ivory-50 rounded-xl px-4 py-3">
          <span className="text-navy-500">Solde restant dû</span>
          <span className="font-semibold text-navy-900">{fmtMoney(invoice.balanceDue, invoice.currency)}</span>
        </div>
        <Field label="Montant">
          <input type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mode de paiement">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
              <option value="bank_transfer">Virement bancaire</option>
              <option value="card">Carte bancaire</option>
              <option value="other">Autre</option>
            </select>
          </Field>
          <Field label="Référence / N° transaction">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="CH-123, VIR-456…" />
          </Field>
        </div>
        <button
          onClick={submit}
          disabled={busy || !(parseFloat(amount) > 0)}
          className="w-full bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium transition-colors"
        >
          {busy ? "Enregistrement…" : "Enregistrer le règlement"}
        </button>
      </div>
    </Modal>
  );
}

export function usePayments(invoiceId?: string, direction: "customer" | "supplier" = "customer") {
  const [payments, setPayments] = useState<Payment[]>([]);
  useEffect(() => {
    if (!invoiceId) return;
    let mounted = true;
    const fetcher = direction === "customer" ? salesApi.payments : purchasingApi.payments;
    fetcher.list({ invoiceId, limit: 100 })
      .then((res) => mounted && setPayments(res.items))
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [invoiceId, direction]);
  return payments;
}

// ── Filtres de liste (recherche + statut) ────────────────────
export function ListFilters({ search, setSearch, status, setStatus, statuses }: {
  search: string; setSearch: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  statuses: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-5">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par numéro, nom…"
        className={`${inputCls} flex-1 bg-white`}
      />
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} sm:w-56 bg-white`}>
        <option value="">Tous les statuts</option>
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}

export function useClientFilter<T>(rows: T[], search: string, status: string, matcher: (row: T, search: string) => boolean, statusOf: (row: T) => string) {
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const okSearch = !q || matcher(r, q);
      const okStatus = !status || statusOf(r) === status;
      return okSearch && okStatus;
    });
  }, [rows, search, status, matcher, statusOf]);
}
