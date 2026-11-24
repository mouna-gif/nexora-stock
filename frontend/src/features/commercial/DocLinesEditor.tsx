// ============================================================
// Éditeur de lignes de document commercial
// (sélection produit, quantités, prix, remise, TVA — totaux
//  recalculés côté serveur à l'enregistrement)
// ============================================================
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { DocLinePayload } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Field, inputCls, fmtMoney } from "./kit";

export interface EditorRow extends DocLinePayload {
  key: string;
}

export function DocLinesEditor({ rows, setRows, products, defaultTaxRate }: {
  rows: EditorRow[];
  setRows: (rows: EditorRow[]) => void;
  products: Product[];
  defaultTaxRate: number;
}) {
  const preview = useMemo(() => {
    let ht = 0;
    let tax = 0;
    for (const r of rows) {
      const gross = (r.quantity || 0) * (r.unitPrice || 0);
      const net = gross - gross * ((r.discountPct || 0) / 100);
      ht += net;
      tax += net * ((r.taxRate ?? defaultTaxRate) / 100);
    }
    return { ht, tax, ttc: ht + tax };
  }, [rows, defaultTaxRate]);

  const addRow = () =>
    setRows([...rows, { key: crypto.randomUUID(), productId: "", quantity: 1, unitPrice: undefined, discountPct: 0, taxRate: undefined }]);

  const update = (key: string, patch: Partial<EditorRow>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const remove = (key: string) => setRows(rows.filter((r) => r.key !== key));

  const onProductChange = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    update(key, {
      productId,
      unitPrice: product ? product.sellingPrice : undefined,
      taxRate: product?.taxRate ?? undefined,
    });
  };

  return (
    <div className="space-y-3">
      <div className="border border-ivory-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ivory-50 border-b border-ivory-100 text-xs font-mono text-navy-500 uppercase">
              <th className="text-left px-3 py-2.5 w-1/3">Article</th>
              <th className="text-right px-2 py-2.5 w-20">Qté</th>
              <th className="text-right px-2 py-2.5 w-24">P.U.</th>
              <th className="text-right px-2 py-2.5 w-20">Remise %</th>
              <th className="text-right px-2 py-2.5 w-20">TVA %</th>
              <th className="text-right px-2 py-2.5">Total HT</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const product = products.find((p) => p.id === r.productId);
              const gross = (r.quantity || 0) * (r.unitPrice || 0);
              const net = gross - gross * ((r.discountPct || 0) / 100);
              return (
                <tr key={r.key} className="border-b border-ivory-100 last:border-0">
                  <td className="px-3 py-2">
                    <select value={r.productId} onChange={(e) => onProductChange(r.key, e.target.value)} className={`${inputCls} py-2`}>
                      <option value="">— Choisir un article —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                      ))}
                    </select>
                    {product && <span className="text-[11px] text-navy-400 ml-1">Stock : {product.stock} {product.unit}</span>}
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min={1} value={r.quantity} onChange={(e) => update(r.key, { quantity: parseInt(e.target.value || "0", 10) })} className={`${inputCls} py-2 text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" step="0.001" min={0} value={r.unitPrice ?? ""} onChange={(e) => update(r.key, { unitPrice: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className={`${inputCls} py-2 text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min={0} max={100} value={r.discountPct ?? 0} onChange={(e) => update(r.key, { discountPct: parseFloat(e.target.value || "0") })} className={`${inputCls} py-2 text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min={0} step="0.5" value={r.taxRate ?? ""} placeholder={String(defaultTaxRate)} onChange={(e) => update(r.key, { taxRate: e.target.value === "" ? undefined : parseFloat(e.target.value) })} className={`${inputCls} py-2 text-right`} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-navy-900 whitespace-nowrap">{fmtMoney(net)}</td>
                  <td className="px-2">
                    <button onClick={() => remove(r.key)} className="text-red-400 hover:text-red-600 p-1" title="Supprimer la ligne">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-navy-400 text-sm">Aucune ligne — cliquez sur « Ajouter une ligne ».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-end justify-between gap-4">
        <button onClick={addRow} className="flex items-center gap-2 bg-ivory-100 hover:bg-ivory-200 text-navy-700 px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Ajouter une ligne
        </button>
        <div className="text-right text-sm space-y-0.5">
          <div className="text-navy-500">Total HT : <span className="font-medium text-navy-900">{fmtMoney(preview.ht)}</span></div>
          <div className="text-navy-500">TVA : <span className="font-medium text-navy-900">{fmtMoney(preview.tax)}</span></div>
          <div className="text-navy-900 font-semibold">Total TTC : <span className="font-display text-lg">{fmtMoney(preview.ttc)}</span></div>
        </div>
      </div>
      <p className="text-[11px] text-navy-400">
        Les montants définitifs sont recalculés et validés côté serveur à l'enregistrement.
      </p>
      <Field label=" ">{null}</Field>
    </div>
  );
}
