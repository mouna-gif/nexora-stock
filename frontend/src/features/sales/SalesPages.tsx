// ============================================================
// Module VENTES — Devis, Commandes clients, Bons de livraison,
// Factures clients, Règlements. 100 % branché sur /api/v1/sales.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, Loader2, PackageCheck, Send, XCircle, Printer, Truck } from "lucide-react";
import { api, salesApi } from "@/lib/api";
import type { Customer, CustomerInvoice, DeliveryNote, Payment, Product, SalesOrder, SalesQuotation } from "@/lib/types";
import { DocLinesEditor } from "../commercial/DocLinesEditor";
import type { EditorRow } from "../commercial/DocLinesEditor";
import {
  DataTable, Field, HistoryList, LifecycleLinks, LinesTable, ListFilters, Modal, Notice,
  PageHeader, PaymentModal, PrintButton, StatusBadge, TotalsBox, fmtDate, fmtMoney,
  inputCls, useClientFilter, useCompanySettings, usePayments,
} from "../commercial/kit";
import type { Column } from "../commercial/kit";

const STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "sent", label: "Envoyé" },
  { value: "accepted", label: "Accepté" }, { value: "rejected", label: "Refusé" },
  { value: "cancelled", label: "Annulé" },
];

function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    customersApi_list();
    async function customersApi_list() {
      try {
        const res = await api.get<{ items: Customer[] }>("/customers", { limit: 500 });
        setCustomers(res.items);
      } catch { setCustomers([]); }
    }
  }, []);
  return customers;
}

function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    salesApi.quotations.list({ limit: 1 }).catch(() => undefined);
    api.get<{ items: Product[] }>("/products", { limit: 500 })
      .then((res) => setProducts(res.items))
      .catch(() => setProducts([]));
  }, []);
  return products;
}

function useWarehouses() {
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>("/warehouses")
      .then((d) => setWarehouses(Array.isArray(d) ? d : d.items ?? []))
      .catch(() => setWarehouses([]));
  }, []);
  return warehouses;
}

function ActionButton({ onClick, icon: Icon, label, busy, variant = "primary", disabled }: {
  onClick: () => void; icon: React.ElementType; label: string; busy?: boolean;
  variant?: "primary" | "success" | "danger" | "ghost"; disabled?: boolean;
}) {
  const styles = {
    primary: "bg-navy-900 hover:bg-navy-800 text-white",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    danger: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200",
    ghost: "bg-ivory-100 hover:bg-ivory-200 text-navy-700",
  }[variant];
  return (
    <button onClick={onClick} disabled={busy || disabled}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${styles}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />} {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// DEVIS CLIENTS
// ══════════════════════════════════════════════════════════════
export function QuotationsPage() {
  const settings = useCompanySettings();
  const customers = useCustomers();
  const products = useProducts();
  const [rows, setRows] = useState<SalesQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SalesQuotation | null>(null);
  const [form, setForm] = useState({ customerId: "", validUntil: "", terms: "", notes: "" });
  const [editorRows, setEditorRows] = useState<EditorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    salesApi.quotations.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await salesApi.quotations.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const lines = editorRows.filter((r) => r.productId && r.quantity > 0)
        .map(({ productId, quantity, unitPrice, discountPct, taxRate }) => ({ productId, quantity, unitPrice, discountPct, taxRate }));
      if (!form.customerId) throw new Error("Sélectionnez un client.");
      if (lines.length === 0) throw new Error("Ajoutez au moins une ligne d'article.");
      const q = await salesApi.quotations.create({ ...form, lines, validUntil: form.validUntil || undefined });
      setCreateOpen(false); setEditorRows([]); setForm({ customerId: "", validUntil: "", terms: "", notes: "" });
      setNotice(`Devis ${q.number} créé en brouillon.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      await fn();
      setNotice(message);
      const fresh = detail ? await salesApi.quotations.get(detail.id) : null;
      setDetail(fresh);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const columns: Column<SalesQuotation>[] = [
    { key: "number", header: "N° Devis", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "customer", header: "Client", render: (r) => <span className="text-navy-700">{r.customerName}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-navy-500 text-sm">{fmtDate(r.createdAt)}</span> },
    { key: "validUntil", header: "Validité", render: (r) => <span className="text-navy-500 text-sm">{fmtDate(r.validUntil)}</span> },
    { key: "total", header: "Total TTC", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals.totalTtc, r.currency)}</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/quotation/${r.id}?autoprint=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg"><Printer className="w-4 h-4" /></a>
    )},
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Devis Clients" subtitle="DEVIS → COMMANDE → LIVRAISON → FACTURE → RÈGLEMENT"
        actions={
          <button onClick={() => { setEditorRows([{ key: crypto.randomUUID(), productId: "", quantity: 1, discountPct: 0 }]); setCreateOpen(true); }}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Nouveau devis
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      {/* Création */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Nouveau devis client"
        subtitle="Les totaux (remises, TVA) sont calculés et validés côté serveur.">
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Client *">
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Valable jusqu'au"><input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={inputCls} /></Field>
            <Field label="Conditions de paiement"><input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} className={inputCls} placeholder="Paiement 30 jours…" /></Field>
          </div>
          <DocLinesEditor rows={editorRows} setRows={setEditorRows} products={products} defaultTaxRate={settings.defaultTaxRate} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />} Créer le devis
            </button>
          </div>
        </div>
      </Modal>

      {/* Détail */}
      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Devis ${d.number}` : ""} subtitle={d?.customerName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                d.salesOrderNumber ? { label: "Commande", to: `/app/sales-orders?doc=${d.salesOrderId}`, number: d.salesOrderNumber } : null,
              ]} /></div>
              <PrintButton docType="quotation" docId={d.id} />
            </div>
            <LinesTable lines={d.lines} currency={d.currency} />
            <div className="flex justify-end">
              <TotalsBox totals={d.totals} currency={d.currency} />
            </div>
            {(d.terms || d.notes) && (
              <div className="bg-ivory-50 rounded-xl p-4 text-sm text-navy-600">
                {d.terms && <p><span className="text-navy-400">Conditions : </span>{d.terms}</p>}
                {d.notes && <p><span className="text-navy-400">Notes : </span>{d.notes}</p>}
              </div>
            )}
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <>
                  <ActionButton variant="ghost" icon={Send} label="Marquer envoyé" busy={busy}
                    onClick={() => act(() => salesApi.quotations.transition(d.id, "sent"), "Devis marqué comme envoyé.")} />
                  <ActionButton variant="success" icon={CheckCircle2} label="Accepter le devis" busy={busy}
                    onClick={() => act(() => salesApi.quotations.transition(d.id, "accepted"), "Devis accepté.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Refuser" busy={busy}
                    onClick={() => act(() => salesApi.quotations.transition(d.id, "rejected"), "Devis refusé.")} />
                </>
              )}
              {d.status === "accepted" && !d.salesOrderId && (
                <ActionButton icon={Truck} label="Convertir en commande client" busy={busy}
                  onClick={() => act(() => salesApi.quotations.convert(d.id), "Commande client créée depuis le devis (lignes préservées).")} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMMANDES CLIENTS
// ══════════════════════════════════════════════════════════════
const ORDER_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "confirmed", label: "Confirmée" },
  { value: "partial", label: "Partiellement livrée" }, { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
];

export function SalesOrdersPage() {
  const settings = useCompanySettings();
  const customers = useCustomers();
  const products = useProducts();
  const warehouses = useWarehouses();
  const [rows, setRows] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SalesOrder | null>(null);
  const [form, setForm] = useState({ customerId: "", deliveryAddress: "", deliveryCity: "", expectedDeliveryDate: "", paymentTermsDays: "30", notes: "" });
  const [editorRows, setEditorRows] = useState<EditorRow[]>([]);
  const [blOpen, setBlOpen] = useState(false);
  const [blQty, setBlQty] = useState<Record<string, string>>({});
  const [blWarehouse, setBlWarehouse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    salesApi.orders.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await salesApi.orders.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const lines = editorRows.filter((r) => r.productId && r.quantity > 0)
        .map(({ productId, quantity, unitPrice, discountPct, taxRate }) => ({ productId, quantity, unitPrice, discountPct, taxRate }));
      if (!form.customerId) throw new Error("Sélectionnez un client.");
      if (lines.length === 0) throw new Error("Ajoutez au moins une ligne d'article.");
      const o = await salesApi.orders.create({
        ...form, lines,
        paymentTermsDays: parseInt(form.paymentTermsDays || "30", 10),
        expectedDeliveryDate: form.expectedDeliveryDate || undefined,
      });
      setCreateOpen(false); setEditorRows([]); setForm({ customerId: "", deliveryAddress: "", deliveryCity: "", expectedDeliveryDate: "", paymentTermsDays: "30", notes: "" });
      setNotice(`Commande ${o.number} créée en brouillon.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      await fn();
      setNotice(message);
      if (detail) setDetail(await salesApi.orders.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const openBlForm = () => {
    const qty: Record<string, string> = {};
    detail?.lines.forEach((l) => {
      const remaining = l.quantity - l.deliveredQuantity;
      if (remaining > 0) qty[l.id] = String(remaining);
    });
    setBlQty(qty);
    setBlWarehouse(warehouses[0]?.id ?? "");
    setBlOpen(true);
  };

  const createDeliveryNote = async () => {
    if (!detail) return;
    setBusy(true); setError(null);
    try {
      if (!blWarehouse) throw new Error("Sélectionnez un entrepôt de livraison.");
      const lines = Object.entries(blQty)
        .filter(([, q]) => parseInt(q, 10) > 0)
        .map(([lineId, q]) => ({ lineId, quantity: parseInt(q, 10) }));
      if (lines.length === 0) throw new Error("Indiquez au moins une quantité à livrer.");
      const dn = await salesApi.deliveryNotes.create({
        salesOrderId: detail.id, warehouseId: blWarehouse, lines,
        deliveryAddress: detail.deliveryAddress, deliveryCity: detail.deliveryCity,
      });
      setBlOpen(false);
      setNotice(`Bon de livraison ${dn.number} créé en brouillon — validez-le pour sortir le stock.`);
      setDetail(await salesApi.orders.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const columns: Column<SalesOrder>[] = [
    { key: "number", header: "N° Commande", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "customer", header: "Client", render: (r) => <span className="text-navy-700">{r.customerName}</span> },
    { key: "quote", header: "Devis d'origine", render: (r) => r.quotationNumber
      ? <span className="font-mono text-xs text-navy-500">{r.quotationNumber}</span>
      : <span className="text-navy-300 text-xs">Directe</span> },
    { key: "progress", header: "Livraison", render: (r) => {
      const ordered = r.lines.reduce((s, l) => s + l.quantity, 0);
      const delivered = r.lines.reduce((s, l) => s + (l.deliveredQuantity ?? 0), 0);
      return <span className="text-sm text-navy-600">{delivered} / {ordered}</span>;
    }},
    { key: "total", header: "Total TTC", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals.totalTtc, r.currency)}</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Commandes Clients" subtitle="Confirmées puis livrées via bons de livraison (sortie de stock contrôlée)"
        actions={
          <button onClick={() => { setEditorRows([{ key: crypto.randomUUID(), productId: "", quantity: 1, discountPct: 0 }]); setCreateOpen(true); }}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Commande directe
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={ORDER_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Nouvelle commande client directe">
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Client *">
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </Field>
            <Field label="Livraison prévue"><input type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })} className={inputCls} /></Field>
            <Field label="Délai de paiement (jours)"><input type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} className={inputCls} /></Field>
            <Field label="Adresse de livraison"><input value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} className={inputCls} /></Field>
            <Field label="Ville de livraison"><input value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} className={inputCls} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></Field>
          </div>
          <DocLinesEditor rows={editorRows} setRows={setEditorRows} products={products} defaultTaxRate={settings.defaultTaxRate} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />} Créer la commande
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={blOpen} onClose={() => setBlOpen(false)} wide
        title="Préparer un bon de livraison" subtitle="Aucun stock n'est impacté avant validation du bon.">
        <div className="space-y-4">
          <Notice error={error} />
          <Field label="Entrepôt expéditeur *">
            <select value={blWarehouse} onChange={(e) => setBlWarehouse(e.target.value)} className={inputCls}>
              <option value="">— Choisir —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <div className="border border-ivory-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-ivory-50 text-xs font-mono text-navy-500 uppercase">
                <th className="text-left px-3 py-2">Article</th>
                <th className="text-right px-3 py-2">Commandé</th>
                <th className="text-right px-3 py-2">Déjà livré</th>
                <th className="text-right px-3 py-2 w-28">À livrer</th>
              </tr></thead>
              <tbody>
                {d?.lines.map((l) => {
                  const remaining = l.quantity - l.deliveredQuantity;
                  return (
                    <tr key={l.id} className="border-t border-ivory-100">
                      <td className="px-3 py-2">{l.name} <span className="text-navy-400 text-xs font-mono">{l.sku}</span></td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{l.deliveredQuantity}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} max={remaining} value={blQty[l.id] ?? "0"} disabled={remaining <= 0}
                          onChange={(e) => setBlQty({ ...blQty, [l.id]: e.target.value })}
                          className={`${inputCls} py-2 text-right`} placeholder={remaining <= 0 ? "—" : `≤ ${remaining}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setBlOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={createDeliveryNote} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Créer le bon (brouillon)
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Commande ${d.number}` : ""} subtitle={d?.customerName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                d.quotationNumber ? { label: "Devis", to: `/app/quotations?doc=${d.quotationId}`, number: d.quotationNumber } : null,
              ]} /></div>
              <PrintButton docType="sales_order" docId={d.id} />
            </div>
            <LinesTable lines={d.lines} currency={d.currency} showProgress />
            <div className="flex justify-end"><TotalsBox totals={d.totals} currency={d.currency} extra={[
              { label: "Délai de paiement", value: `${d.paymentTermsDays} jours` },
            ]} /></div>
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <>
                  <ActionButton variant="success" icon={CheckCircle2} label="Confirmer la commande" busy={busy}
                    onClick={() => act(() => salesApi.orders.transition(d.id, "confirmed"), "Commande confirmée — préparez les livraisons.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Annuler" busy={busy}
                    onClick={() => act(() => salesApi.orders.transition(d.id, "cancelled"), "Commande annulée.")} />
                </>
              )}
              {(d.status === "confirmed" || d.status === "partial") && (
                <ActionButton icon={Truck} label="Préparer un bon de livraison" busy={busy} onClick={openBlForm} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BONS DE LIVRAISON
// ══════════════════════════════════════════════════════════════
const DN_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "validated", label: "Validé" },
  { value: "delivered", label: "Livré" }, { value: "cancelled", label: "Annulé" },
];

export function DeliveryNotesPage() {
  const [rows, setRows] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<DeliveryNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    salesApi.deliveryNotes.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await salesApi.deliveryNotes.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      await fn();
      setNotice(message);
      if (detail) setDetail(await salesApi.deliveryNotes.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur — le stock n'a pas été modifié.");
    } finally { setBusy(false); }
  };

  const columns: Column<DeliveryNote>[] = [
    { key: "number", header: "N° BL", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "order", header: "Commande", render: (r) => <span className="font-mono text-xs text-navy-500">{r.salesOrderNumber}</span> },
    { key: "customer", header: "Client", render: (r) => <span className="text-navy-700">{r.customerName}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-navy-500 text-sm">{fmtDate(r.createdAt)}</span> },
    { key: "qty", header: "Articles", render: (r) => <span className="text-navy-600 text-sm">{r.lines.reduce((s, l) => s + l.quantity, 0)}</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/delivery_note/${r.id}?autoprint=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg"><Printer className="w-4 h-4" /></a>
    )},
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Bons de Livraison" subtitle="La validation déclenche la SORTIE RÉELLE du stock (mouvements atomiques)" />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={DN_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Bon de livraison ${d.number}` : ""} subtitle={d ? `${d.customerName} — commande ${d.salesOrderNumber}` : ""}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                { label: "Commande", to: `/app/sales-orders?doc=${d.salesOrderId}`, number: d.salesOrderNumber },
              ]} /></div>
              <PrintButton docType="delivery_note" docId={d.id} />
            </div>
            <div className="border border-ivory-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-ivory-50 text-xs font-mono text-navy-500 uppercase">
                  <th className="text-left px-3 py-2">Article</th>
                  <th className="text-right px-3 py-2">Livré (ce BL)</th>
                  <th className="text-right px-3 py-2">Commandé</th>
                  <th className="text-right px-3 py-2">Déjà livré avant</th>
                  <th className="text-left px-3 py-2">Entrepôt</th>
                </tr></thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t border-ivory-100">
                      <td className="px-3 py-2">{l.name} <span className="text-navy-400 text-xs font-mono">{l.sku}</span></td>
                      <td className="px-3 py-2 text-right font-medium text-navy-900">{l.quantity} {l.unit}</td>
                      <td className="px-3 py-2 text-right text-navy-600">{l.orderedQuantity}</td>
                      <td className="px-3 py-2 text-right text-navy-600">{l.deliveredOnOrder}</td>
                      <td className="px-3 py-2 text-navy-600 text-sm">{l.warehouseName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.movementIds.length > 0 && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                {d.movementIds.length} mouvement(s) de stock enregistré(s) lors de la validation.
              </p>
            )}
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <>
                  <ActionButton variant="success" icon={PackageCheck} label="Valider (sortie de stock)" busy={busy}
                    onClick={() => act(() => salesApi.deliveryNotes.validate(d.id),
                      "Bon validé — stock mis à jour, commande actualisée.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Annuler le brouillon" busy={busy}
                    onClick={() => act(() => salesApi.deliveryNotes.transition(d.id, "cancelled"), "Bon annulé.")} />
                </>
              )}
              {d.status === "validated" && (
                <ActionButton icon={Truck} label="Marquer livré" busy={busy}
                  onClick={() => act(() => salesApi.deliveryNotes.transition(d.id, "delivered"), "Bon marqué livré.")} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FACTURES CLIENTS
// ══════════════════════════════════════════════════════════════
const INV_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "validated", label: "Validée (impayée)" },
  { value: "partial", label: "Partiellement payée" }, { value: "paid", label: "Payée" },
  { value: "cancelled", label: "Annulée" },
];

export function CustomerInvoicesPage() {
  const [rows, setRows] = useState<CustomerInvoice[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<CustomerInvoice | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genOrderId, setGenOrderId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      salesApi.invoices.list({ limit: 500 }),
      salesApi.orders.list({ limit: 500 }),
    ])
      .then(([inv, ord]) => { setRows(inv.items); setOrders(ord.items); })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const payments = usePayments(detail?.id, "customer");

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await salesApi.invoices.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      await fn();
      setNotice(message);
      if (detail) setDetail(await salesApi.invoices.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      if (!genOrderId) throw new Error("Sélectionnez une commande livrée.");
      const inv = await salesApi.invoices.generate(genOrderId);
      setGenOpen(false); setGenOrderId("");
      setNotice(`Facture ${inv.number} générée (brouillon) — validez-la pour la verrouiller.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const invoiceableOrders = orders.filter((o) => ["confirmed", "partial", "delivered"].includes(o.status));

  const columns: Column<CustomerInvoice>[] = [
    { key: "number", header: "N° Facture", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "customer", header: "Client", render: (r) => <span className="text-navy-700">{r.customerName}</span> },
    { key: "order", header: "Commande", render: (r) => <span className="font-mono text-xs text-navy-500">{r.salesOrderNumber ?? "—"}</span> },
    { key: "due", header: "Échéance", render: (r) => (
      <span className={`text-sm ${r.overdue ? "text-red-600 font-medium" : "text-navy-500"}`}>{fmtDate(r.dueDate)}{r.overdue ? " (retard)" : ""}</span>
    )},
    { key: "total", header: "Total TTC", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals.totalTtc, r.currency)}</span> },
    { key: "balance", header: "Solde dû", className: "text-right", render: (r) => (
      <span className={r.balanceDue > 0 ? "text-amber-700 font-medium" : "text-emerald-700"}>{fmtMoney(r.balanceDue, r.currency)}</span>
    )},
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/customer_invoice/${r.id}?autoprint=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg"><Printer className="w-4 h-4" /></a>
    )},
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Factures Clients" subtitle="Facturation bornée par les quantités livrées — aucun doublon possible"
        actions={
          <button onClick={() => setGenOpen(true)}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Générer une facture
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={INV_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Générer une facture client"
        subtitle="Toutes les quantités livrées non facturées de la commande seront facturées.">
        <div className="space-y-4">
          <Notice error={error} />
          <Field label="Commande livrée *">
            <select value={genOrderId} onChange={(e) => setGenOrderId(e.target.value)} className={inputCls}>
              <option value="">— Choisir une commande —</option>
              {invoiceableOrders.map((o) => <option key={o.id} value={o.id}>{o.number} — {o.customerName}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3">
            <button onClick={() => setGenOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={generate} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">
              Générer la facture
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Facture ${d.number}` : ""} subtitle={d?.customerName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} />
                {d.overdue && <span className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-medium">En retard</span>}
                <LifecycleLinks links={[
                  d.quotationNumber ? { label: "Devis", number: d.quotationNumber } : null,
                  d.salesOrderNumber ? { label: "Commande", to: `/app/sales-orders?doc=${d.salesOrderId}`, number: d.salesOrderNumber } : null,
                  ...d.deliveryNoteNumbers.map((n, i) => ({ label: "BL", to: `/app/delivery-notes?doc=${d.deliveryNoteIds[i]}`, number: n })),
                ]} />
              </div>
              <PrintButton docType="customer_invoice" docId={d.id} />
            </div>
            <LinesTable lines={d.lines} currency={d.currency} />
            <div className="flex justify-end"><TotalsBox totals={d.totals} currency={d.currency} extra={[
              { label: "Déjà réglé", value: fmtMoney(d.amountPaid, d.currency) },
              { label: "Reste à payer", value: fmtMoney(d.balanceDue, d.currency), highlight: true },
              { label: "Échéance", value: fmtDate(d.dueDate) },
            ]} /></div>
            {payments.length > 0 && (
              <div>
                <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-2">Historique des règlements</h4>
                <div className="space-y-1.5">
                  {payments.map((p: Payment) => (
                    <div key={p.id} className="flex items-center gap-3 text-sm bg-ivory-50 rounded-xl px-4 py-2.5">
                      <span className="font-mono text-xs text-navy-500">{p.number}</span>
                      <span className="font-medium text-navy-900">{fmtMoney(p.amount, p.currency)}</span>
                      <span className="text-navy-500 text-xs">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <span className="ml-auto text-navy-400 text-xs">{fmtDate(p.paidAt)}</span>
                      <a href={`/app/print/payment_receipt/${p.id}?autoprint=1`} target="_blank" rel="noreferrer"
                        className="p-1.5 text-navy-400 hover:text-navy-800 rounded-lg" title="Imprimer le reçu"><Printer className="w-3.5 h-3.5" /></a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <>
                  <ActionButton variant="success" icon={CheckCircle2} label="Valider la facture" busy={busy}
                    onClick={() => act(() => salesApi.invoices.validate(d.id), "Facture validée — échéance fixée.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Annuler le brouillon" busy={busy}
                    onClick={() => act(() => salesApi.invoices.cancel(d.id), "Brouillon annulé — quantités libérées.")} />
                </>
              )}
              {(d.status === "validated" || d.status === "partial") && (
                <ActionButton icon={CheckCircle2} label="Enregistrer un règlement" busy={busy} onClick={() => setPayOpen(true)} />
              )}
            </div>
          </div>
        )}
      </Modal>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} direction="customer"
        invoice={d ? { id: d.id, number: d.number, balanceDue: d.balanceDue, currency: d.currency } : null}
        onDone={() => { if (detail) openDetail(detail.id); load(); }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RÈGLEMENTS CLIENTS
// ══════════════════════════════════════════════════════════════
export function CustomerPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    salesApi.payments.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q),
    () => "");

  const columns: Column<Payment>[] = [
    { key: "number", header: "N° Reçu", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "party", header: "Client", render: (r) => <span className="text-navy-700">{r.partyName}</span> },
    { key: "invoice", header: "Facture", render: (r) => <span className="font-mono text-xs text-navy-500">{r.invoiceNumber}</span> },
    { key: "amount", header: "Montant", className: "text-right", render: (r) => <span className="font-medium text-emerald-700">{fmtMoney(r.amount, r.currency)}</span> },
    { key: "method", header: "Mode", render: (r) => <span className="text-navy-600 text-sm">{r.method}{r.reference ? ` · ${r.reference}` : ""}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-navy-500 text-sm">{fmtDate(r.paidAt)}</span> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/payment_receipt/${r.id}?autoprint=1`} target="_blank" rel="noreferrer"
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg" title="Imprimer le reçu"><Printer className="w-4 h-4" /></a>
    )},
  ];

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Règlements Clients" subtitle="Historique complet et immuable des encaissements" />
      <Notice error={error} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={[]} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
