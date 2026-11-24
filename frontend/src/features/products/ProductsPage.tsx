import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search, LayoutGrid, List, Brain, Package, Plus, Pencil, Eye, Archive,
  ArchiveRestore, Loader2,
} from "lucide-react";
import { useProducts } from "@/hooks/useApi";
import { productsApi } from "@/lib/api";
import type { Product } from "@/lib/types";
import ProductFormModal from "./ProductFormModal";
import { fmtMoney, Modal, Notice, StatusBadge, useCompanySettings } from "../commercial/kit";

const CATEGORIES = ["Tous", "Carrelage", "Faïence", "Sanitaire", "Meuble SDB", "Meuble Cuisine", "Portes", "Revêtements"];

const STATUS_CONFIG = {
  in_stock: { label: "En stock", color: "text-emerald-700 bg-emerald-50" },
  low_stock: { label: "Stock bas", color: "text-amber-700 bg-amber-50" },
  out_of_stock: { label: "Rupture", color: "text-red-700 bg-red-50" },
  discontinued: { label: "Discontinué", color: "text-navy-500 bg-navy-50" },
} as const;

function StockBar({ stock, min, max }: { stock: number; min: number; max: number }) {
  const pct = Math.min((stock / (max || 1)) * 100, 100);
  const color = stock === 0 ? "bg-red-500" : stock < min ? "bg-amber-500" : "bg-teal-ai-500";
  return (
    <div className="h-1.5 bg-ivory-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProductCard({ product, currency, onClick }: { product: Product; currency: string; onClick: () => void }) {
  const status = STATUS_CONFIG[product.status];
  const primary = product.images?.find((i) => i.isPrimary)?.url ?? product.image;
  return (
    <motion.div layout initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} onClick={onClick}
      className="bg-white border border-ivory-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-ivory-300 transition-all group cursor-pointer">
      <div className="aspect-[4/3] bg-ivory-100 relative overflow-hidden">
        {primary ? (
          <img src={primary} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-ivory-400" /></div>
        )}
        <div className="absolute top-3 right-3">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
        </div>
        {!product.isActive && (
          <div className="absolute top-3 left-3 bg-navy-900/80 text-white text-xs px-2 py-1 rounded-full">Archivé</div>
        )}
        {product.aiRisk !== "none" && product.isActive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1">
            <Brain className="w-3 h-3 text-teal-ai-500" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-navy-400 text-xs font-mono mb-1">{product.sku}</div>
        <h3 className="text-navy-900 font-medium text-sm leading-snug mb-1 line-clamp-2">{product.name}</h3>
        <div className="text-navy-500 text-xs mb-3">{product.brand} · {product.category}</div>
        <StockBar stock={product.stock} min={product.minStock} max={product.maxStock} />
        <div className="flex items-center justify-between mt-2">
          <span className="text-navy-600 text-xs">{product.stock.toLocaleString()} {product.unit}</span>
          <span className="text-navy-800 text-sm font-medium">{fmtMoney(product.sellingPrice, currency)}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProductsPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const { data: products, refresh, loading } = useProducts();
  const settings = useCompanySettings();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").includes(q);
    const matchCat = category === "Tous" || p.category === category;
    return matchSearch && matchCat;
  });

  const toggleArchive = async (p: Product) => {
    setBusyId(p.id); setError(null);
    try {
      await productsApi.update(p.id, { isActive: !p.isActive });
      setNotice(p.isActive ? `Article ${p.sku} archivé.` : `Article ${p.sku} réactivé.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusyId(null); }
  };

  const rowActions = (p: Product) => (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setDetail(p)} title="Voir la fiche" className="p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
      <button onClick={() => { setEditing(p); setFormOpen(true); }} title="Modifier" className="p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
      <button onClick={() => toggleArchive(p)} disabled={busyId === p.id} title={p.isActive ? "Archiver" : "Réactiver"}
        className="p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg transition-colors">
        {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : p.isActive ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Gestion des Articles</h1>
          <p className="text-navy-500 mt-1">{products.length} références · catalogue enregistré dans MongoDB</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Ajouter un nouvel article
        </button>
      </div>

      <Notice notice={notice} error={error} />

      <div className="flex flex-col lg:flex-row gap-4 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, SKU, code-barres…"
            className="w-full bg-white border border-ivory-200 focus:border-terra-300 focus:ring-2 focus:ring-terra-300/20 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all" />
        </div>
        <div className="flex bg-white border border-ivory-200 rounded-xl overflow-hidden self-start">
          {([["grid", LayoutGrid], ["list", List]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-2.5 transition-all ${view === v ? "bg-navy-900 text-white" : "text-navy-500 hover:text-navy-700"}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm transition-all ${
              category === c ? "bg-navy-900 text-white" : "bg-white border border-ivory-200 text-navy-600 hover:border-navy-300"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-10 text-navy-400 text-sm">Chargement du catalogue…</div>}

      {view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((p) => <ProductCard key={p.id} product={p} currency={settings.currency} onClick={() => setDetail(p)} />)}
        </div>
      ) : (
        <div className="bg-white border border-ivory-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-4 p-4 border-b border-ivory-100 bg-ivory-50 text-xs font-mono text-navy-500 uppercase tracking-wide">
            <div className="w-10 flex-shrink-0" />
            <div className="flex-1">Article</div>
            <div className="hidden md:block w-24">Catégorie</div>
            <div className="hidden lg:block w-24">Marque</div>
            <div className="w-24">Stock</div>
            <div className="hidden md:block w-20">Statut</div>
            <div className="w-28 text-right">Prix</div>
            <div className="w-32 text-right">Actions</div>
          </div>
          {filtered.map((p) => {
            const status = STATUS_CONFIG[p.status];
            const primary = p.images?.find((i) => i.isPrimary)?.url ?? p.image;
            return (
              <div key={p.id} onClick={() => setDetail(p)}
                className="flex items-center gap-4 p-4 border-b border-ivory-100 hover:bg-ivory-50 transition-all cursor-pointer">
                <div className="w-10 h-10 bg-ivory-100 rounded-xl overflow-hidden flex-shrink-0">
                  {primary ? <img src={primary} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-ivory-400" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-navy-900 text-sm font-medium truncate">{p.name}</div>
                  <div className="text-navy-500 text-xs font-mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</div>
                </div>
                <div className="hidden md:block text-navy-500 text-sm w-24">{p.category}</div>
                <div className="hidden lg:block text-navy-500 text-sm w-24">{p.brand}</div>
                <div className="w-24">
                  <StockBar stock={p.stock} min={p.minStock} max={p.maxStock} />
                  <div className="text-navy-600 text-xs mt-1">{p.stock} {p.unit}</div>
                </div>
                <span className={`hidden md:block text-xs px-2.5 py-1 rounded-full font-medium w-20 text-center ${status.color}`}>{status.label}</span>
                <div className="text-navy-800 text-sm font-medium w-28 text-right">{fmtMoney(p.sellingPrice, settings.currency)}</div>
                {rowActions(p)}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-ivory-400 mx-auto mb-4" />
          <p className="text-navy-500">Aucun article trouvé.</p>
        </div>
      )}

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing}
        onSaved={() => { setNotice("Article enregistré avec succès."); refresh(); }} />

      {/* Fiche détaillée */}
      <Modal open={!!detail} onClose={() => setDetail(null)} wide
        title={detail ? `${detail.name}` : ""} subtitle={detail ? `${detail.sku}${detail.barcode ? ` · Code-barres ${detail.barcode}` : ""}` : ""}>
        {detail && (() => {
          const images = detail.images ?? [];
          const conversions = detail.unitConversions ?? [];
          return (
            <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {images.length > 0 ? images.map((img) => (
                <div key={img.mediaId} className="relative w-28 h-28 rounded-xl overflow-hidden border border-ivory-200">
                  <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                  {img.isPrimary && <span className="absolute top-1 left-1 bg-terra-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">Principale</span>}
                </div>
              )) : (
                <div className="w-28 h-28 rounded-xl bg-ivory-100 flex items-center justify-center"><Package className="w-8 h-8 text-ivory-400" /></div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ["Catégorie", detail.category + (detail.subcategory ? ` / ${detail.subcategory}` : "")],
                ["Marque", detail.brand],
                ["Unité", detail.unit],
                ["Prix d'achat", fmtMoney(detail.costPrice, settings.currency)],
                ["Prix de vente", fmtMoney(detail.sellingPrice, settings.currency)],
                ["Prix de gros", detail.wholesalePrice != null ? fmtMoney(detail.wholesalePrice, settings.currency) : "—"],
                ["TVA", detail.taxRate != null ? `${detail.taxRate}%` : "19%"],
                ["Stock actuel", `${detail.stock} ${detail.unit}`],
                ["Min / Max / Réappro", `${detail.minStock} / ${detail.maxStock} / ${detail.reorderPoint}`],
                ["Remises", detail.discountEligible ? "Éligible" : "Non éligible"],
                ["Statut", <StatusBadge key="s" status={detail.status} />],
                ["Activité", detail.isActive ? "Actif" : "Archivé"],
              ].map(([label, value], i) => (
                <div key={i} className="bg-ivory-50 rounded-xl px-4 py-3">
                  <div className="text-[11px] text-navy-400">{label}</div>
                  <div className="text-navy-800 font-medium mt-0.5">{value as React.ReactNode}</div>
                </div>
              ))}
            </div>
            {conversions.length > 0 && (
              <div>
                <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-2">Conversions d'unités</h4>
                <div className="flex flex-wrap gap-2">
                  {conversions.map((c, i) => (
                    <span key={i} className="bg-ivory-100 text-navy-700 text-xs px-3 py-1.5 rounded-lg">1 {c.fromUnit} = {c.factor} {c.toUnit}</span>
                  ))}
                </div>
              </div>
            )}
            {detail.description && <p className="text-sm text-navy-600 whitespace-pre-line">{detail.description}</p>}
            <div className="flex justify-end gap-3 pt-2 border-t border-ivory-200">
              <button onClick={() => { setEditing(detail); setDetail(null); setFormOpen(true); }}
                className="bg-navy-900 hover:bg-navy-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Modifier l'article
              </button>
            </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
