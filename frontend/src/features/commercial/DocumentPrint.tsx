// ============================================================
// Document imprimable A4 professionnel — 9 types de documents.
// Les données affichées proviennent TOUJOURS du backend
// (document enregistré) — aucune valeur de démonstration.
// Impression : ?autoprint=1 déclenche la boîte d'impression
// (choisir « Enregistrer au format PDF » pour l'export PDF).
// ============================================================
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { salesApi, purchasingApi } from "@/lib/api";
import type {
  CompanySettings, CustomerInvoice, DeliveryNote, DocLine, GoodsReceipt,
  Payment, PurchaseOrder, SalesOrder, SalesQuotation, SupplierInvoice, SupplierQuotation,
} from "@/lib/types";
import { useCompanySettings, fmtDate } from "./kit";

type Section = { label: string; value: string };

interface PrintLine {
  id?: string;
  productId?: string;
  productSku?: string;
  productName?: string;
  sku?: string;
  name?: string;
  unit?: string;
  quantity: number;
  unitPrice?: number;
  discountPct?: number;
  taxRate?: number;
  netAmount?: number;
}

interface PrintDoc {
  title: string;
  number: string;
  date?: string;
  referenceLabel?: string;
  referenceValue?: string;
  partyTitle: string;
  partyName: string;
  partyLines: Section[];
  metaLines: Section[];
  lines: PrintLine[];
  totals?: { totalHt: number; totalTax: number; totalTtc: number; taxBreakdown?: Record<string, number> };
  currency: string;
  paid?: number;
  balance?: number;
  footerNotes?: string;
  signatureLabel?: string;
  extraBlocks?: { title: string; rows: Section[] }[];
}

const CURRENCY = "TND";
const money = (n: number | undefined, currency = CURRENCY) =>
  `${(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;

function DocHeader({ settings, title, number, date, referenceLabel, referenceValue }: {
  settings: CompanySettings; title: string; number: string; date?: string;
  referenceLabel?: string; referenceValue?: string;
}) {
  return (
    <div className="flex justify-between items-start border-b-2 border-navy-900 pb-5 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-navy-900 flex items-center justify-center flex-shrink-0">
          {settings.logoMediaId
            ? <img src={`/api/v1/media/${settings.logoMediaId}/file`} alt="Logo société" className="w-full h-full object-cover" />
            : <img src="/nexora-logo.png" alt="Nexora" className="w-full h-full object-cover" />}
        </div>
        <div>
          <div className="text-xl font-bold text-navy-900">{settings.companyName || "Nexora"}</div>
          {settings.legalForm && <div className="text-xs text-slate-500">{settings.legalForm}</div>}
          <div className="text-xs text-slate-500 mt-1 leading-relaxed">
            {settings.address && <div>{settings.address}{settings.city ? `, ${settings.city}` : ""}{settings.country ? ` — ${settings.country}` : ""}</div>}
            {settings.phone && <div>Tél : {settings.phone}</div>}
            {settings.email && <div>{settings.email}{settings.website ? ` — ${settings.website}` : ""}</div>}
            {settings.taxId && <div>MF : {settings.taxId}{settings.customsCode ? ` — Code en douane : ${settings.customsCode}` : ""}</div>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="inline-block bg-navy-900 text-white px-5 py-2 rounded-lg font-bold tracking-wide text-sm uppercase">{title}</div>
        <div className="mt-2 text-2xl font-bold text-navy-900 font-mono">{number}</div>
        {date && <div className="text-xs text-slate-500 mt-1">Date : {fmtDate(date)}</div>}
        {referenceValue && (
          <div className="text-xs text-slate-500 mt-0.5">{referenceLabel} : <span className="font-mono">{referenceValue}</span></div>
        )}
      </div>
    </div>
  );
}

function PartyBlock({ title, name, lines }: { title: string; name: string; lines: Section[] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-5">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{title}</div>
      <div className="font-semibold text-navy-900">{name || "—"}</div>
      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
        {lines.filter((l) => l.value).map((l) => <div key={l.label}>{l.label && <span className="text-slate-400">{l.label} : </span>}{l.value}</div>)}
      </div>
    </div>
  );
}

function MetaRow({ items }: { items: Section[] }) {
  const visible = items.filter((i) => i.value);
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {visible.map((i) => (
        <div key={i.label} className="bg-slate-50 rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{i.label}</div>
          <div className="text-xs font-medium text-navy-900 mt-0.5">{i.value}</div>
        </div>
      ))}
    </div>
  );
}

function LinesBlock({ doc }: { doc: PrintDoc }) {
  const showDiscount = doc.lines.some((l) => (l.discountPct ?? 0) > 0);
  return (
    <table className="w-full text-[11px] border-collapse mb-4">
      <thead>
        <tr className="bg-navy-900 text-white text-left">
          <th className="px-2 py-2 font-medium">Réf.</th>
          <th className="px-2 py-2 font-medium">Désignation</th>
          <th className="px-2 py-2 text-right font-medium">Qté</th>
          <th className="px-2 py-2 text-right font-medium">Unité</th>
          <th className="px-2 py-2 text-right font-medium">P.U. HT</th>
          {showDiscount && <th className="px-2 py-2 text-right font-medium">Remise</th>}
          <th className="px-2 py-2 text-right font-medium">TVA</th>
          <th className="px-2 py-2 text-right font-medium">Total HT</th>
        </tr>
      </thead>
      <tbody>
        {doc.lines.map((l, i) => (
          <tr key={l.id ?? i} className={i % 2 ? "bg-slate-50" : ""}>
            <td className="px-2 py-1.5 font-mono text-slate-600">{l.productSku ?? l.sku}</td>
            <td className="px-2 py-1.5">{l.productName ?? l.name}</td>
            <td className="px-2 py-1.5 text-right">{l.quantity}</td>
            <td className="px-2 py-1.5 text-right text-slate-500">{l.unit}</td>
            <td className="px-2 py-1.5 text-right">{(l.unitPrice ?? 0).toFixed(3)}</td>
            {showDiscount && <td className="px-2 py-1.5 text-right">{l.discountPct ? `${l.discountPct}%` : "—"}</td>}
            <td className="px-2 py-1.5 text-right">{l.taxRate ?? 0}%</td>
            <td className="px-2 py-1.5 text-right font-medium">{(l.netAmount ?? 0).toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({ doc }: { doc: PrintDoc }) {
  const t = doc.totals;
  if (!t) return null;
  return (
    <div className="flex justify-end mb-4">
      <table className="text-xs w-72">
        <tbody>
          <tr><td className="py-1 text-slate-500">Total HT</td><td className="py-1 text-right font-medium">{money(t.totalHt, doc.currency)}</td></tr>
          {Object.entries(t.taxBreakdown ?? {}).map(([rate, amount]) => (
            <tr key={rate}><td className="py-0.5 text-slate-500">TVA {rate}</td><td className="py-0.5 text-right">{money(amount, doc.currency)}</td></tr>
          ))}
          <tr className="border-t border-navy-900"><td className="py-1.5 font-bold text-navy-900">Total TTC</td><td className="py-1.5 text-right font-bold text-navy-900">{money(t.totalTtc, doc.currency)}</td></tr>
          {doc.paid !== undefined && (
            <>
              <tr><td className="py-0.5 text-slate-500">Déjà réglé</td><td className="py-0.5 text-right">{money(doc.paid, doc.currency)}</td></tr>
              <tr className="border-t border-slate-300"><td className="py-1.5 font-bold">Reste à payer</td><td className="py-1.5 text-right font-bold">{money(doc.balance, doc.currency)}</td></tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div className="flex justify-between mt-10 mb-6 text-xs">
      <div className="w-1/3">
        <div className="text-slate-400 uppercase tracking-wider text-[10px] mb-8">Signature & cachet — Nexora</div>
        <div className="border-t border-slate-300" />
      </div>
      <div className="w-1/3">
        <div className="text-slate-400 uppercase tracking-wider text-[10px] mb-8">{label}</div>
        <div className="border-t border-slate-300" />
      </div>
    </div>
  );
}

function PrintLayout({ doc, settings, footerNotes }: { doc: PrintDoc; settings: CompanySettings; footerNotes?: string }) {
  return (
    <div className="print-doc">
      <DocHeader settings={settings} title={doc.title} number={doc.number} date={doc.date}
        referenceLabel={doc.referenceLabel} referenceValue={doc.referenceValue} />
      <PartyBlock title={doc.partyTitle} name={doc.partyName} lines={doc.partyLines} />
      <MetaRow items={doc.metaLines} />
      {doc.extraBlocks?.map((b) => (
        <div key={b.title} className="mb-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{b.title}</div>
          <div className={`text-xs text-slate-600 space-y-0.5 ${b.title === "Montant réglé" ? "!text-base font-semibold text-navy-900" : ""}`}>
            {b.rows.map((r) => <div key={r.label}>{r.label && <span className="text-slate-400">{r.label} : </span>}{r.value}</div>)}
          </div>
        </div>
      ))}
      {doc.lines.length > 0 && <LinesBlock doc={doc} />}
      {doc.totals && <TotalsBlock doc={doc} />}
      {footerNotes && <p className="text-[11px] text-slate-500 whitespace-pre-line mb-4">{footerNotes}</p>}
      <SignatureBlock label={doc.signatureLabel ?? "Signature du client"} />
      <div className="border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400 leading-relaxed">
        {settings.footerLegal ||
          `${settings.companyName || "Nexora"}${settings.taxId ? ` — MF ${settings.taxId}` : ""}${settings.bankName ? ` — Banque : ${settings.bankName}` : ""}${settings.bankRib ? ` — RIB : ${settings.bankRib}` : ""}`}
        {" — "}Document généré par Nexora Smart Stock AI.
      </div>
    </div>
  );
}

export default function DocumentPrintPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [params] = useSearchParams();
  const settings = useCompanySettings();
  const [doc, setDoc] = useState<PrintDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        let built: PrintDoc | null = null;
        if (type === "quotation") {
          const d = await salesApi.quotations.get(id!);
          built = {
            title: "Devis", number: d.number, date: d.date,
            partyTitle: "Client", partyName: d.customerName,
            partyLines: [
              { label: "Adresse", value: [d.customerSnapshot?.address, d.customerSnapshot?.city].filter(Boolean).join(", ") },
              { label: "MF", value: d.customerSnapshot?.taxId ?? "" },
              { label: "Tél", value: d.customerSnapshot?.phone ?? "" },
            ],
            metaLines: [{ label: "Valable jusqu'au", value: fmtDate(d.validUntil) }, { label: "Devise", value: d.currency }],
            lines: d.lines, totals: d.totals, currency: d.currency,
            footerNotes: [d.terms && `Conditions : ${d.terms}`, d.notes].filter(Boolean).join("\n") || undefined,
            signatureLabel: "Bon pour accord — Client",
          };
        } else if (type === "sales_order") {
          const d = await salesApi.orders.get(id!);
          built = {
            title: "Commande client", number: d.number, date: d.createdAt,
            referenceLabel: "Devis", referenceValue: d.quotationNumber ?? undefined,
            partyTitle: "Client", partyName: d.customerName,
            partyLines: [
              { label: "Adresse", value: [d.customerSnapshot?.address, d.customerSnapshot?.city].filter(Boolean).join(", ") },
              { label: "MF", value: d.customerSnapshot?.taxId ?? "" },
            ],
            metaLines: [
              { label: "Livraison prévue", value: fmtDate(d.expectedDeliveryDate) },
              { label: "Adresse de livraison", value: [d.deliveryAddress, d.deliveryCity].filter(Boolean).join(", ") },
              { label: "Délai de paiement", value: `${d.paymentTermsDays} jours` },
            ],
            lines: d.lines, totals: d.totals, currency: d.currency,
            footerNotes: d.notes || undefined,
          };
        } else if (type === "delivery_note") {
          const d: DeliveryNote = await salesApi.deliveryNotes.get(id!);
          built = {
            title: "Bon de livraison", number: d.number, date: d.deliveryDate ?? d.createdAt,
            referenceLabel: "Commande", referenceValue: d.salesOrderNumber,
            partyTitle: "Client", partyName: d.customerName,
            partyLines: [
              { label: "Adresse de livraison", value: [d.deliveryAddress, d.deliveryCity].filter(Boolean).join(", ") },
              { label: "Tél", value: d.customerSnapshot?.phone ?? "" },
            ],
            metaLines: [{ label: "Chauffeur", value: d.driver }, { label: "Entrepôt", value: d.lines[0]?.warehouseName ?? "" }],
            lines: d.lines.map((l) => ({
              ...l, unitPrice: 0, netAmount: 0, taxRate: 0,
            })),
            currency: d.currency ?? CURRENCY,
            signatureLabel: "Réception — Signature du client",
            extraBlocks: [{
              title: "Quantités livrées",
              rows: d.lines.map((l) => ({
                label: l.sku,
                value: `${l.quantity} ${l.unit} livré(s) — commandé ${l.orderedQuantity}, déjà livré ${l.deliveredOnOrder}`,
              })),
            }],
          };
        } else if (type === "customer_invoice") {
          const d: CustomerInvoice = await salesApi.invoices.get(id!);
          built = {
            title: "Facture", number: d.number, date: d.createdAt,
            referenceLabel: "Commande", referenceValue: d.salesOrderNumber ?? undefined,
            partyTitle: "Client", partyName: d.customerName,
            partyLines: [
              { label: "Adresse", value: [d.customerSnapshot?.address, d.customerSnapshot?.city].filter(Boolean).join(", ") },
              { label: "MF", value: d.customerSnapshot?.taxId ?? "" },
            ],
            metaLines: [
              { label: "Échéance", value: fmtDate(d.dueDate) },
              { label: "BL", value: d.deliveryNoteNumbers.join(", ") },
              { label: "Devis", value: d.quotationNumber ?? "" },
            ],
            lines: d.lines, totals: d.totals, currency: d.currency,
            paid: d.amountPaid, balance: d.balanceDue,
            footerNotes: [d.notes, `Règlement par chèque ou virement${settings.bankName ? ` — ${settings.bankName}` : ""}${settings.bankRib ? ` — RIB : ${settings.bankRib}` : ""}.`].filter(Boolean).join("\n"),
          };
        } else if (type === "payment_receipt") {
          const fetcher = params.get("direction") === "supplier" ? purchasingApi.payments : salesApi.payments;
          const d = await fetcher.get(id!);
          built = {
            title: "Reçu de règlement", number: d.number, date: d.paidAt ?? d.createdAt,
            referenceLabel: "Facture", referenceValue: d.invoiceNumber,
            partyTitle: d.direction === "customer" ? "Client" : "Fournisseur",
            partyName: d.partyName,
            partyLines: [],
            metaLines: [
              { label: "Mode de paiement", value: ({ cash: "Espèces", cheque: "Chèque", bank_transfer: "Virement bancaire", card: "Carte bancaire", other: "Autre" } as Record<string, string>)[d.method] ?? d.method },
              { label: "Référence", value: d.reference },
            ],
            lines: [],
            currency: d.currency,
            footerNotes: d.notes || undefined,
            signatureLabel: "Cachet & signature — Nexora",
            extraBlocks: [{
              title: "Montant réglé",
              rows: [{ label: "Montant", value: money(d.amount, d.currency) }],
            }],
          };
        } else if (type === "supplier_quotation") {
          const d: SupplierQuotation = await purchasingApi.supplierQuotations.get(id!);
          built = {
            title: "Devis fournisseur", number: d.number, date: d.createdAt,
            partyTitle: "Fournisseur", partyName: d.supplierName,
            partyLines: [],
            metaLines: [
              { label: "Délai de livraison", value: `${d.leadTimeDays} jours` },
              { label: "Frais de livraison", value: money(d.deliveryCost) },
              { label: "Valable jusqu'au", value: fmtDate(d.validUntil) },
            ],
            lines: d.lines, totals: d.totals, currency: d.currency,
            footerNotes: d.notes || undefined,
            signatureLabel: "Visa achats",
          };
        } else if (type === "purchase_order") {
          const d: PurchaseOrder = await purchasingApi.purchaseOrders.get(id!);
          built = {
            title: "Bon de commande", number: d.reference, date: d.createdAt,
            referenceLabel: "Devis fournisseur", referenceValue: d.supplierQuotationNumber ?? undefined,
            partyTitle: "Fournisseur", partyName: d.supplierName,
            partyLines: [],
            metaLines: [{ label: "Livraison prévue", value: fmtDate(d.expectedDelivery) }],
            lines: d.lines.map((l) => ({ ...l, sku: l.productSku, name: l.productName })),
            totals: d.totals, currency: CURRENCY,
            footerNotes: d.notes || undefined,
            signatureLabel: "Visa direction",
          };
        } else if (type === "goods_receipt") {
          const d: GoodsReceipt = await purchasingApi.goodsReceipts.get(id!);
          built = {
            title: "Bon de réception", number: d.number, date: d.validatedAt ?? d.createdAt,
            referenceLabel: "Commande", referenceValue: d.poReference,
            partyTitle: "Fournisseur", partyName: d.supplierName,
            partyLines: [],
            metaLines: [{ label: "Entrepôt", value: d.warehouseName }],
            lines: d.lines.map((l) => ({ ...l, id: l.lineId, unitPrice: 0, netAmount: 0, taxRate: 0 })),
            currency: CURRENCY,
            signatureLabel: "Magasinier",
            extraBlocks: [{
              title: "Contrôle quantitatif et qualité",
              rows: d.lines.map((l) => ({
                label: l.sku,
                value: `Reçu ${l.quantity} — endommagé ${l.quantityDamaged} — manquant ${l.quantityMissing}${l.notes ? ` — ${l.notes}` : ""}`,
              })),
            }],
          };
        } else if (type === "supplier_invoice") {
          const d: SupplierInvoice = await purchasingApi.supplierInvoices.get(id!);
          built = {
            title: "Facture fournisseur", number: d.number, date: d.createdAt,
            referenceLabel: "Commande", referenceValue: d.purchaseOrderNumber ?? undefined,
            partyTitle: "Fournisseur", partyName: d.supplierName,
            partyLines: [],
            metaLines: [
              { label: "Échéance", value: fmtDate(d.dueDate) },
              { label: "Réceptions", value: d.goodsReceiptNumbers.join(", ") },
            ],
            lines: d.lines, totals: d.totals, currency: d.currency,
            paid: d.amountPaid, balance: d.balanceDue,
            footerNotes: d.discrepancies.length
              ? `Écarts constatés : ${d.discrepancies.map((x) => `${x.sku} (reçu ${x.received} / facturé ${x.invoiced})`).join("; ")}.`
              : undefined,
            signatureLabel: "Visa comptabilité",
          };
        }
        if (!built) throw new Error("Type de document inconnu.");
        if (mounted) setDoc(built);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Document introuvable.");
      }
    })();
    return () => { mounted = false; };
  }, [type, id, settings]);

  useEffect(() => {
    if (doc && params.get("autoprint") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [doc, params]);

  const docTypesWithPaid = ["customer_invoice", "supplier_invoice"];

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <style>{`
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .print-doc { box-shadow: none !important; margin: 0 !important; width: auto !important; max-width: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          @page { size: A4; margin: 12mm 12mm 14mm; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-navy-900 text-white flex items-center justify-between px-6 py-3">
        <Link to="/app/dashboard" className="flex items-center gap-2 text-sm text-navy-200 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Printer className="w-4 h-4" /> Imprimer / Enregistrer en PDF (A4)
        </button>
      </div>

      <div className="py-8 px-4 flex justify-center">
        {error && (
          <div className="bg-white rounded-2xl p-10 text-center text-red-600 text-sm">{error}</div>
        )}
        {doc && (
          <div className="print-doc bg-white shadow-xl rounded-lg w-full max-w-[210mm] min-h-[297mm] p-10 text-navy-900">
            <PrintLayout doc={doc} settings={settings} footerNotes={doc.footerNotes} />
            {docTypesWithPaid.includes(type ?? "") && doc.paid === 0 && (
              <p className="text-center text-[10px] text-slate-400 mt-4">Facture non réglée à ce jour.</p>
            )}
          </div>
        )}
        {!doc && !error && (
          <div className="bg-white rounded-2xl p-10 text-navy-400 text-sm">Chargement du document…</div>
        )}
      </div>
    </div>
  );
}
