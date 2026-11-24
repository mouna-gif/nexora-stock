// ============================================================
// Module ACHATS — Devis fournisseurs, Commandes (approbation),
// Réceptions (entrée de stock à la validation), Factures et
// Règlements fournisseurs. 100 % branché sur /api/v1.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, Loader2, PackageCheck, Printer, Send, XCircle } from "lucide-react";
import { api, purchasingApi } from "@/lib/api";
import type { GoodsReceipt, Payment, Product, PurchaseOrder, SupplierInvoice, SupplierQuotation } from "@/lib/types";
import { DocLinesEditor } from "../commercial/DocLinesEditor";
import type { EditorRow } from "../commercial/DocLinesEditor";
import {
  DataTable, Field, HistoryList, LifecycleLinks, LinesTable, ListFilters, Modal, Notice,
  PageHeader, PaymentModal, PrintButton, StatusBadge, TotalsBox, fmtDate, fmtMoney,
  inputCls, useClientFilter, useCompanySettings,
} from "../commercial/kit";
import type { Column } from "../commercial/kit";

function useSuppliers() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get<{ items: { id: string; name: string }[] }>("/suppliers", { limit: 500 })
      .then((res) => setSuppliers(res.items))
      .catch(() => setSuppliers([]));
  }, []);
  return suppliers;
}

function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
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
// DEVIS FOURNISSEURS
// ══════════════════════════════════════════════════════════════
const SQ_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "received", label: "Reçue" },
  { value: "accepted", label: "Acceptée" }, { value: "rejected", label: "Refusée" },
  { value: "cancelled", label: "Annulée" },
];

export function SupplierQuotationsPage() {
  const settings = useCompanySettings();
  const suppliers = useSuppliers();
  const products = useProducts();
  const [rows, setRows] = useState<SupplierQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SupplierQuotation | null>(null);
  const [form, setForm] = useState({ supplierId: "", deliveryCost: "0", leadTimeDays: "7", validUntil: "", notes: "" });
  const [editorRows, setEditorRows] = useState<EditorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    purchasingApi.supplierQuotations.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await purchasingApi.supplierQuotations.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const lines = editorRows.filter((r) => r.productId && r.quantity > 0)
        .map(({ productId, quantity, unitPrice, discountPct, taxRate }) => ({ productId, quantity, unitPrice, discountPct, taxRate }));
      if (!form.supplierId) throw new Error("Sélectionnez un fournisseur.");
      if (lines.length === 0) throw new Error("Ajoutez au moins une ligne d'article.");
      const sq = await purchasingApi.supplierQuotations.create({
        ...form,
        deliveryCost: parseFloat(form.deliveryCost || "0"),
        leadTimeDays: parseInt(form.leadTimeDays || "0", 10),
        validUntil: form.validUntil || undefined,
        lines,
      });
      setCreateOpen(false); setEditorRows([]);
      setNotice(`Devis fournisseur ${sq.number} enregistré.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fn();
      setNotice(message);
      if (detail) setDetail(await purchasingApi.supplierQuotations.get(detail.id));
      load();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const columns: Column<SupplierQuotation>[] = [
    { key: "number", header: "N° Devis", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "supplier", header: "Fournisseur", render: (r) => <span className="text-navy-700">{r.supplierName}</span> },
    { key: "lead", header: "Délai", render: (r) => <span className="text-navy-500 text-sm">{r.leadTimeDays} j</span> },
    { key: "total", header: "Total TTC", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals.totalTtc + r.deliveryCost, r.currency)}</span> },
    { key: "po", header: "Commande", render: (r) => r.purchaseOrderNumber
      ? <span className="font-mono text-xs text-emerald-700">{r.purchaseOrderNumber}</span>
      : <span className="text-navy-300 text-xs">—</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Devis Fournisseurs" subtitle="Enregistrez, comparez et convertissez les offres fournisseurs"
        actions={
          <button onClick={() => { setEditorRows([{ key: crypto.randomUUID(), productId: "", quantity: 1, discountPct: 0 }]); setCreateOpen(true); }}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Enregistrer un devis
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={SQ_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Enregistrer un devis fournisseur">
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-4 gap-4">
            <Field label="Fournisseur *">
              <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Frais de livraison"><input type="number" step="0.001" value={form.deliveryCost} onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })} className={inputCls} /></Field>
            <Field label="Délai (jours)"><input type="number" min={0} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} className={inputCls} /></Field>
            <Field label="Valable jusqu'au"><input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={inputCls} /></Field>
          </div>
          <DocLinesEditor rows={editorRows} setRows={setEditorRows} products={products} defaultTaxRate={settings.defaultTaxRate} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Devis fournisseur ${d.number}` : ""} subtitle={d?.supplierName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                d.purchaseOrderNumber ? { label: "Commande", to: `/app/purchase-orders?doc=${d.purchaseOrderId}`, number: d.purchaseOrderNumber } : null,
              ]} /></div>
              <PrintButton docType="supplier_quotation" docId={d.id} />
            </div>
            <LinesTable lines={d.lines} currency={d.currency} />
            <div className="flex justify-end"><TotalsBox totals={d.totals} currency={d.currency} extra={[
              { label: "Frais de livraison", value: fmtMoney(d.deliveryCost, d.currency) },
              { label: "Total avec livraison", value: fmtMoney(d.totals.totalTtc + d.deliveryCost, d.currency), highlight: true },
              { label: "Délai annoncé", value: `${d.leadTimeDays} jours` },
            ]} /></div>
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <ActionButton variant="ghost" icon={Send} label="Marquer reçue" busy={busy}
                  onClick={() => act(() => purchasingApi.supplierQuotations.transition(d.id, "received"), "Devis marqué reçu.")} />
              )}
              {d.status === "received" && (
                <>
                  <ActionButton variant="success" icon={CheckCircle2} label="Accepter" busy={busy}
                    onClick={() => act(() => purchasingApi.supplierQuotations.transition(d.id, "accepted"), "Devis accepté.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Refuser" busy={busy}
                    onClick={() => act(() => purchasingApi.supplierQuotations.transition(d.id, "rejected"), "Devis refusé.")} />
                </>
              )}
              {d.status === "accepted" && !d.purchaseOrderId && (
                <ActionButton icon={PackageCheck} label="Convertir en commande d'achat" busy={busy}
                  onClick={() => act(() => purchasingApi.supplierQuotations.convert(d.id), "Commande d'achat créée (conditions préservées).")} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMMANDES FOURNISSEURS (workflow d'approbation)
// ══════════════════════════════════════════════════════════════
const PO_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "pending", label: "En approbation" },
  { value: "approved", label: "Approuvée" }, { value: "ordered", label: "Commandée" },
  { value: "partial", label: "Partiellement reçue" }, { value: "received", label: "Réceptionnée" },
  { value: "cancelled", label: "Annulée" },
];

export function PurchaseOrdersPage() {
  const suppliers = useSuppliers();
  const products = useProducts();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({ supplierId: "", expectedDelivery: "", notes: "" });
  const [editorRows, setEditorRows] = useState<EditorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    purchasingApi.purchaseOrders.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.reference.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await purchasingApi.purchaseOrders.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const lines = editorRows.filter((r) => r.productId && r.quantity > 0)
        .map(({ productId, quantity, unitPrice, discountPct, taxRate }) => ({ productId, quantity, unitPrice, discountPct, taxRate }));
      if (!form.supplierId) throw new Error("Sélectionnez un fournisseur.");
      if (lines.length === 0) throw new Error("Ajoutez au moins une ligne.");
      const po = await purchasingApi.purchaseOrders.create({
        ...form, lines, expectedDelivery: form.expectedDelivery || undefined,
      });
      setCreateOpen(false); setEditorRows([]);
      setNotice(`Commande ${po.reference} créée en brouillon.`);
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
      if (detail) setDetail(await purchasingApi.purchaseOrders.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: "ref", header: "N° Commande", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.reference}</span> },
    { key: "supplier", header: "Fournisseur", render: (r) => <span className="text-navy-700">{r.supplierName}</span> },
    { key: "sq", header: "Devis fourn.", render: (r) => r.supplierQuotationNumber
      ? <span className="font-mono text-xs text-navy-500">{r.supplierQuotationNumber}</span>
      : <span className="text-navy-300 text-xs">—</span> },
    { key: "progress", header: "Réception", render: (r) => {
      const ordered = r.lines.reduce((s, l) => s + l.quantity, 0);
      const received = r.lines.reduce((s, l) => s + (l.receivedQuantity ?? 0), 0);
      return <span className="text-sm text-navy-600">{received} / {ordered}</span>;
    }},
    { key: "total", header: "Total HT", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals?.totalHt ?? r.totalAmount, "TND")}</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Commandes Fournisseurs" subtitle="Workflow : brouillon → approbation → commande → réception"
        actions={
          <button onClick={() => { setEditorRows([{ key: crypto.randomUUID(), productId: "", quantity: 1, discountPct: 0 }]); setCreateOpen(true); }}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Nouvelle commande
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={PO_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Nouvelle commande d'achat">
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Fournisseur *">
              <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Livraison prévue"><input type="date" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })} className={inputCls} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></Field>
          </div>
          <DocLinesEditor rows={editorRows} setRows={setEditorRows} products={products} defaultTaxRate={19} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">Créer</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Commande d'achat ${d.reference}` : ""} subtitle={d?.supplierName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                d.supplierQuotationNumber ? { label: "Devis fourn.", to: `/app/supplier-quotations?doc=${d.supplierQuotationId}`, number: d.supplierQuotationNumber } : null,
              ]} /></div>
              <PrintButton docType="purchase_order" docId={d.id} />
            </div>
            <LinesTable lines={d.lines.map((l) => ({
              id: l.id, productId: l.productId, sku: l.productSku, name: l.productName,
              unit: l.unit ?? "", quantity: l.quantity, unitPrice: l.unitPrice,
              discountPct: l.discountPct ?? 0, taxRate: l.taxRate ?? 0,
              grossAmount: l.grossAmount ?? 0, discountAmount: l.discountAmount ?? 0,
              netAmount: l.netAmount ?? l.totalPrice, taxAmount: l.taxAmount ?? 0,
              totalTtc: l.totalTtc ?? 0,
              deliveredQuantity: l.receivedQuantity, invoicedQuantity: l.invoicedQuantity ?? 0,
            }))} currency="TND" showProgress />
            <div className="flex justify-end"><TotalsBox totals={d.totals ?? { totalHt: d.totalAmount, totalTax: 0, totalTtc: d.totalAmount, taxBreakdown: {} }} currency="TND" /></div>
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <ActionButton variant="ghost" icon={Send} label="Soumettre à approbation" busy={busy}
                  onClick={() => act(() => purchasingApi.purchaseOrders.transition(d.id, "pending"), "Commande soumise à approbation.")} />
              )}
              {d.status === "pending" && (
                <>
                  <ActionButton variant="success" icon={CheckCircle2} label="Approuver" busy={busy}
                    onClick={() => act(() => purchasingApi.purchaseOrders.transition(d.id, "approved"), "Commande approuvée.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Refuser / Annuler" busy={busy}
                    onClick={() => act(() => purchasingApi.purchaseOrders.transition(d.id, "cancelled"), "Commande annulée.")} />
                </>
              )}
              {d.status === "approved" && (
                <ActionButton icon={Send} label="Marquer commandée" busy={busy}
                  onClick={() => act(() => purchasingApi.purchaseOrders.transition(d.id, "ordered"), "Commande transmise au fournisseur.")} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RÉCEPTIONS (BONS DE RÉCEPTION)
// ══════════════════════════════════════════════════════════════
const GR_STATUSES = [{ value: "draft", label: "Brouillon" }, { value: "validated", label: "Validé" }];

export function GoodsReceiptsPage() {
  const warehouses = useWarehouses();
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<GoodsReceipt | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [poLines, setPoLines] = useState<PurchaseOrder["lines"]>([]);
  const [qty, setQty] = useState<Record<string, { q: string; damaged: string; missing: string }>>({});
  const [warehouse, setWarehouse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([purchasingApi.goodsReceipts.list({ limit: 500 }), purchasingApi.purchaseOrders.list({ limit: 500 })])
      .then(([gr, po]) => { setRows(gr.items); setOrders(po.items); })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.poReference.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await purchasingApi.goodsReceipts.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const onPoSelect = async (id: string) => {
    setPoId(id);
    setQty({});
    if (!id) { setPoLines([]); return; }
    try {
      const po = await purchasingApi.purchaseOrders.get(id);
      setPoLines(po.lines);
    } catch { setPoLines([]); }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      if (!poId) throw new Error("Sélectionnez une commande d'achat.");
      if (!warehouse) throw new Error("Sélectionnez un entrepôt de réception.");
      const lines = poLines
        .filter((l) => parseInt(qty[l.id]?.q ?? "0", 10) > 0)
        .map((l) => ({
          lineId: l.id,
          quantity: parseInt(qty[l.id].q, 10),
          quantityDamaged: parseInt(qty[l.id]?.damaged ?? "0", 10),
          quantityMissing: parseInt(qty[l.id]?.missing ?? "0", 10),
        }));
      if (lines.length === 0) throw new Error("Indiquez au moins une quantité reçue.");
      const gr = await purchasingApi.goodsReceipts.create({ poId, warehouseId: warehouse, lines });
      setCreateOpen(false); setPoId(""); setPoLines([]); setQty({});
      setNotice(`Bon de réception ${gr.number} créé en brouillon — validez-le pour entrer le stock.`);
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
      if (detail) setDetail(await purchasingApi.goodsReceipts.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur — le stock n'a pas été modifié.");
    } finally { setBusy(false); }
  };

  const receivableOrders = orders.filter((o) => ["approved", "ordered", "partial"].includes(o.status));

  const columns: Column<GoodsReceipt>[] = [
    { key: "number", header: "N° BR", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "po", header: "Commande", render: (r) => <span className="font-mono text-xs text-navy-500">{r.poReference}</span> },
    { key: "supplier", header: "Fournisseur", render: (r) => <span className="text-navy-700">{r.supplierName}</span> },
    { key: "warehouse", header: "Entrepôt", render: (r) => <span className="text-navy-600 text-sm">{r.warehouseName}</span> },
    { key: "qty", header: "Reçu / Endommagé / Manquant", render: (r) => {
      const q = r.lines.reduce((s, l) => s + l.quantity, 0);
      const dmg = r.lines.reduce((s, l) => s + l.quantityDamaged, 0);
      const miss = r.lines.reduce((s, l) => s + l.quantityMissing, 0);
      return <span className="text-sm text-navy-600">{q} {dmg > 0 && <span className="text-amber-600">/ {dmg}</span>} {miss > 0 && <span className="text-red-500">/ {miss}</span>}</span>;
    }},
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/goods_receipt/${r.id}?autoprint=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg"><Printer className="w-4 h-4" /></a>
    )},
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Réceptions Fournisseurs" subtitle="La validation déclenche l'ENTRÉE RÉELLE en stock (anti-doublon, anti sur-réception)"
        actions={
          <button onClick={() => setCreateOpen(true)}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <PackageCheck className="w-4 h-4" /> Réceptionner une commande
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={GR_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} wide title="Nouveau bon de réception"
        subtitle="Brouillon : aucun stock n'est impacté avant validation.">
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Commande d'achat *">
              <select value={poId} onChange={(e) => onPoSelect(e.target.value)} className={inputCls}>
                <option value="">— Choisir —</option>
                {receivableOrders.map((o) => <option key={o.id} value={o.id}>{o.reference} — {o.supplierName}</option>)}
              </select>
            </Field>
            <Field label="Entrepôt de réception *">
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={inputCls}>
                <option value="">— Choisir —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          {poLines.length > 0 && (
            <div className="border border-ivory-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-ivory-50 text-xs font-mono text-navy-500 uppercase">
                  <th className="text-left px-3 py-2">Article</th>
                  <th className="text-right px-2 py-2">Reste</th>
                  <th className="text-right px-2 py-2 w-20">Reçu</th>
                  <th className="text-right px-2 py-2 w-20">Endommagé</th>
                  <th className="text-right px-2 py-2 w-20">Manquant</th>
                </tr></thead>
                <tbody>
                  {poLines.map((l) => {
                    const remaining = l.quantity - (l.receivedQuantity ?? 0);
                    return (
                      <tr key={l.id} className="border-t border-ivory-100">
                        <td className="px-3 py-2">{l.productName} <span className="text-navy-400 text-xs font-mono">{l.productSku}</span></td>
                        <td className="px-2 py-2 text-right text-navy-600">{remaining}</td>
                        <td className="px-2 py-2"><input type="number" min={0} max={remaining} disabled={remaining <= 0}
                          value={qty[l.id]?.q ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: { q: e.target.value, damaged: qty[l.id]?.damaged ?? "", missing: qty[l.id]?.missing ?? "" } })}
                          className={`${inputCls} py-2 text-right`} /></td>
                        <td className="px-2 py-2"><input type="number" min={0}
                          value={qty[l.id]?.damaged ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: { q: qty[l.id]?.q ?? "", damaged: e.target.value, missing: qty[l.id]?.missing ?? "" } })}
                          className={`${inputCls} py-2 text-right`} /></td>
                        <td className="px-2 py-2"><input type="number" min={0}
                          value={qty[l.id]?.missing ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: { q: qty[l.id]?.q ?? "", damaged: qty[l.id]?.damaged ?? "", missing: e.target.value } })}
                          className={`${inputCls} py-2 text-right`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">Créer le bon (brouillon)</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Bon de réception ${d.number}` : ""} subtitle={d ? `${d.supplierName} — commande ${d.poReference}` : ""}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                { label: "Commande", to: `/app/purchase-orders?doc=${d.poId}`, number: d.poReference },
              ]} /></div>
              <PrintButton docType="goods_receipt" docId={d.id} />
            </div>
            <div className="border border-ivory-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-ivory-50 text-xs font-mono text-navy-500 uppercase">
                  <th className="text-left px-3 py-2">Article</th>
                  <th className="text-right px-3 py-2">Reçu</th>
                  <th className="text-right px-3 py-2">Endommagé</th>
                  <th className="text-right px-3 py-2">Manquant</th>
                </tr></thead>
                <tbody>
                  {d.lines.map((l, i) => (
                    <tr key={i} className="border-t border-ivory-100">
                      <td className="px-3 py-2">{l.name} <span className="text-navy-400 text-xs font-mono">{l.sku}</span></td>
                      <td className="px-3 py-2 text-right font-medium text-navy-900">{l.quantity}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{l.quantityDamaged || "—"}</td>
                      <td className="px-3 py-2 text-right text-red-500">{l.quantityMissing || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.movementIds.length > 0 && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                {d.movementIds.length} mouvement(s) d'entrée en stock enregistré(s).
              </p>
            )}
            <HistoryList history={d.history} />
            <div className="flex justify-end pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <ActionButton variant="success" icon={PackageCheck} label="Valider (entrée de stock)" busy={busy}
                  onClick={() => act(() => purchasingApi.goodsReceipts.validate(d.id),
                    "Bon validé — stock mis à jour, commande actualisée.")} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FACTURES FOURNISSEURS
// ══════════════════════════════════════════════════════════════
const SI_STATUSES = [
  { value: "draft", label: "Brouillon" }, { value: "validated", label: "Validée" },
  { value: "partial", label: "Partiellement payée" }, { value: "paid", label: "Payée" },
];

export function SupplierInvoicesPage() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<SupplierInvoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([purchasingApi.supplierInvoices.list({ limit: 500 }), purchasingApi.purchaseOrders.list({ limit: 500 })])
      .then(([inv, po]) => { setRows(inv.items); setOrders(po.items); })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const payments = useSupplierPayments(detail?.id);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q),
    (r) => r.status);

  const openDetail = async (id: string) => {
    try { setDetail(await purchasingApi.supplierInvoices.get(id)); } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try {
      await fn();
      setNotice(message);
      if (detail) setDetail(await purchasingApi.supplierInvoices.get(detail.id));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      if (!poId) throw new Error("Sélectionnez une commande reçue.");
      const inv = await purchasingApi.supplierInvoices.create({ purchaseOrderId: poId });
      setCreateOpen(false); setPoId("");
      setNotice(`Facture fournisseur ${inv.number} générée (brouillon, bornée par le reçu).`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const invoiceableOrders = orders.filter((o) => ["ordered", "partial", "received"].includes(o.status));

  const columns: Column<SupplierInvoice>[] = [
    { key: "number", header: "N° Facture", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "supplier", header: "Fournisseur", render: (r) => <span className="text-navy-700">{r.supplierName}</span> },
    { key: "po", header: "Commande", render: (r) => <span className="font-mono text-xs text-navy-500">{r.purchaseOrderNumber ?? "—"}</span> },
    { key: "total", header: "Total TTC", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.totals.totalTtc, r.currency)}</span> },
    { key: "balance", header: "Solde dû", className: "text-right", render: (r) => (
      <span className={r.balanceDue > 0 ? "text-amber-700 font-medium" : "text-emerald-700"}>{fmtMoney(r.balanceDue, r.currency)}</span>
    )},
    { key: "discrepancies", header: "Écarts", render: (r) => r.discrepancies.length > 0
      ? <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{r.discrepancies.length}</span>
      : <span className="text-navy-300 text-xs">—</span> },
    { key: "status", header: "Statut", render: (r) => <StatusBadge status={r.status} /> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/supplier_invoice/${r.id}?autoprint=1`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg"><Printer className="w-4 h-4" /></a>
    )},
  ];

  const d = detail;
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Factures Fournisseurs" subtitle="Facturation bornée par les quantités reçues — écarts détectés automatiquement"
        actions={
          <button onClick={() => setCreateOpen(true)}
            className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Enregistrer une facture
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={SI_STATUSES} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => openDetail(r.id)} />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Facture fournisseur depuis une commande"
        subtitle="Toutes les quantités reçues non facturées seront facturées.">
        <div className="space-y-4">
          <Notice error={error} />
          <Field label="Commande d'achat *">
            <select value={poId} onChange={(e) => setPoId(e.target.value)} className={inputCls}>
              <option value="">— Choisir —</option>
              {invoiceableOrders.map((o) => <option key={o.id} value={o.id}>{o.reference} — {o.supplierName}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={create} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">Générer</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!d} onClose={() => setDetail(null)} wide title={d ? `Facture fournisseur ${d.number}` : ""} subtitle={d?.supplierName}>
        {d && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3"><StatusBadge status={d.status} /><LifecycleLinks links={[
                d.purchaseOrderNumber ? { label: "Commande", to: `/app/purchase-orders?doc=${d.purchaseOrderId}`, number: d.purchaseOrderNumber } : null,
                ...d.goodsReceiptNumbers.map((n, i) => ({ label: "BR", to: `/app/receipts?doc=${d.goodsReceiptIds[i]}`, number: n })),
              ]} /></div>
              <PrintButton docType="supplier_invoice" docId={d.id} />
            </div>
            {d.discrepancies.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
                <span className="font-medium">Écarts commandé / reçu / facturé :</span>{" "}
                {d.discrepancies.map((x) => `${x.sku} (commandé ${x.ordered}, reçu ${x.received}, facturé ${x.invoiced})`).join(" · ")}
              </div>
            )}
            <LinesTable lines={d.lines} currency={d.currency} />
            <div className="flex justify-end"><TotalsBox totals={d.totals} currency={d.currency} extra={[
              { label: "Déjà réglé", value: fmtMoney(d.amountPaid, d.currency) },
              { label: "Reste à payer", value: fmtMoney(d.balanceDue, d.currency), highlight: true },
            ]} /></div>
            {payments.length > 0 && (
              <div className="space-y-1.5">
                {payments.map((p: Payment) => (
                  <div key={p.id} className="flex items-center gap-3 text-sm bg-ivory-50 rounded-xl px-4 py-2.5">
                    <span className="font-mono text-xs text-navy-500">{p.number}</span>
                    <span className="font-medium text-navy-900">{fmtMoney(p.amount, p.currency)}</span>
                    <span className="text-navy-500 text-xs">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="ml-auto text-navy-400 text-xs">{fmtDate(p.paidAt)}</span>
                    <a href={`/app/print/payment_receipt/${p.id}?direction=supplier&autoprint=1`} target="_blank" rel="noreferrer"
                      className="p-1.5 text-navy-400 hover:text-navy-800 rounded-lg" title="Imprimer le reçu"><Printer className="w-3.5 h-3.5" /></a>
                  </div>
                ))}
              </div>
            )}
            <HistoryList history={d.history} />
            <div className="flex justify-end gap-3 flex-wrap pt-3 border-t border-ivory-200">
              {d.status === "draft" && (
                <>
                  <ActionButton variant="success" icon={CheckCircle2} label="Valider la facture" busy={busy}
                    onClick={() => act(() => purchasingApi.supplierInvoices.validate(d.id), "Facture validée — écarts consignés.")} />
                  <ActionButton variant="danger" icon={XCircle} label="Annuler" busy={busy}
                    onClick={() => act(() => purchasingApi.supplierInvoices.cancel(d.id), "Brouillon annulé — quantités libérées.")} />
                </>
              )}
              {(d.status === "validated" || d.status === "partial") && (
                <ActionButton icon={CheckCircle2} label="Enregistrer un règlement" busy={busy} onClick={() => setPayOpen(true)} />
              )}
            </div>
          </div>
        )}
      </Modal>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} direction="supplier"
        invoice={d ? { id: d.id, number: d.number, balanceDue: d.balanceDue, currency: d.currency } : null}
        onDone={() => { if (detail) openDetail(detail.id); load(); }} />
    </div>
  );
}

function useSupplierPayments(invoiceId?: string) {
  const [payments, setPayments] = useState<Payment[]>([]);
  useEffect(() => {
    if (!invoiceId) return;
    purchasingApi.payments.list({ invoiceId, limit: 100 })
      .then((res) => setPayments(res.items))
      .catch(() => setPayments([]));
  }, [invoiceId]);
  return payments;
}

// ══════════════════════════════════════════════════════════════
// RÈGLEMENTS FOURNISSEURS
// ══════════════════════════════════════════════════════════════
export function SupplierPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    purchasingApi.payments.list({ limit: 500 })
      .then((res) => setRows(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useClientFilter(rows, search, status,
    (r, q) => r.number.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q),
    () => "");

  const columns: Column<Payment>[] = [
    { key: "number", header: "N° Règlement", render: (r) => <span className="font-mono text-xs font-medium text-navy-800">{r.number}</span> },
    { key: "party", header: "Fournisseur", render: (r) => <span className="text-navy-700">{r.partyName}</span> },
    { key: "invoice", header: "Facture", render: (r) => <span className="font-mono text-xs text-navy-500">{r.invoiceNumber}</span> },
    { key: "amount", header: "Montant", className: "text-right", render: (r) => <span className="font-medium text-navy-900">{fmtMoney(r.amount, r.currency)}</span> },
    { key: "method", header: "Mode", render: (r) => <span className="text-navy-600 text-sm">{r.method}{r.reference ? ` · ${r.reference}` : ""}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-navy-500 text-sm">{fmtDate(r.paidAt)}</span> },
    { key: "print", header: "", className: "text-right", render: (r) => (
      <a href={`/app/print/payment_receipt/${r.id}?direction=supplier&autoprint=1`} target="_blank" rel="noreferrer"
        className="inline-block p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg" title="Imprimer le reçu"><Printer className="w-4 h-4" /></a>
    )},
  ];

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Règlements Fournisseurs" subtitle="Historique complet et immuable des décaissements" />
      <Notice error={error} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={[]} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
