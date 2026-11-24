// ============================================================
// Formulaire article professionnel — création & édition.
// Images : upload vers le backend (stockage persistant, media_id
// en base) — aucune URL blob n'est jamais enregistrée.
// Le stock initial passe par un VRAI mouvement de stock serveur.
// ============================================================
import { useEffect, useState } from "react";
import { ImagePlus, Star, Trash2, Loader2 } from "lucide-react";
import { mediaApi, productsApi } from "@/lib/api";
import { api } from "@/lib/api";
import type { Product, ProductImage, UnitConversion } from "@/lib/types";
import { Field, Modal, Notice, inputCls } from "../commercial/kit";

const UNITS = ["Pièce", "m²", "ml", "Carton", "Boîte", "Palette", "Kg", "Set"];

interface FormState {
  sku: string; name: string; barcode: string; category: string; subcategory: string;
  productType: string; brand: string; unit: string; customUnit: string;
  descriptionShort: string; description: string;
  costPrice: string; sellingPrice: string; wholesalePrice: string; taxRate: string;
  discountEligible: boolean;
  minStock: string; maxStock: string; reorderPoint: string;
  warehouseId: string; supplierId: string;
  initialQuantity: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  sku: "", name: "", barcode: "", category: "", subcategory: "", productType: "",
  brand: "", unit: "Pièce", customUnit: "", descriptionShort: "", description: "",
  costPrice: "", sellingPrice: "", wholesalePrice: "", taxRate: "19",
  discountEligible: true, minStock: "0", maxStock: "0", reorderPoint: "0",
  warehouseId: "", supplierId: "", initialQuantity: "", isActive: true,
};

interface WarehouseOpt { id: string; name: string }
interface SupplierOpt { id: string; name: string }

export default function ProductFormModal({ open, onClose, product, onSaved }: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSaved: (p: Product) => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setError(null); setNotice(null);
    if (product) {
      setForm({
        sku: product.sku, name: product.name, barcode: product.barcode ?? "",
        category: product.category, subcategory: product.subcategory ?? "",
        productType: product.productType ?? "", brand: product.brand,
        unit: UNITS.includes(product.unit) ? product.unit : "Autre",
        customUnit: UNITS.includes(product.unit) ? "" : product.unit,
        descriptionShort: product.descriptionShort ?? "", description: product.description ?? "",
        costPrice: String(product.costPrice), sellingPrice: String(product.sellingPrice),
        wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : "",
        taxRate: product.taxRate != null ? String(product.taxRate) : "19",
        discountEligible: product.discountEligible ?? true,
        minStock: String(product.minStock), maxStock: String(product.maxStock),
        reorderPoint: String(product.reorderPoint),
        warehouseId: product.warehouseId, supplierId: product.supplierId,
        initialQuantity: "", isActive: product.isActive ?? true,
      });
      setImages(product.images ?? []);
      setConversions(product.unitConversions ?? []);
    } else {
      setForm(EMPTY);
      setImages([]);
      setConversions([]);
    }
    api.get<{ items?: WarehouseOpt[] } | WarehouseOpt[]>("/warehouses")
      .then((d) => setWarehouses(Array.isArray(d) ? d : d.items ?? []))
      .catch(() => setWarehouses([]));
    api.get<{ items: SupplierOpt[] }>("/suppliers", { limit: 200 })
      .then((d) => setSuppliers(d.items ?? []))
      .catch(() => setSuppliers([]));
  }, [open, product]);

  const margin = (parseFloat(form.sellingPrice) || 0) - (parseFloat(form.costPrice) || 0);
  const marginPct = (parseFloat(form.sellingPrice) || 0) > 0
    ? Math.round((margin / (parseFloat(form.sellingPrice) || 1)) * 100) : 0;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const media = await mediaApi.upload(file);
        setImages((imgs) => [...imgs, {
          mediaId: media.id, url: media.url, filename: media.filename,
          isPrimary: imgs.length === 0,
        }]);
      }
      setNotice("Image(s) téléversée(s) — pensez à enregistrer.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du téléversement.");
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = async (mediaId: string) => {
    setImages((imgs) => imgs.map((i) => ({ ...i, isPrimary: i.mediaId === mediaId })));
    if (isEdit) {
      try { await productsApi.setPrimaryImage(product!.id, mediaId); } catch { /* re-synced au reload */ }
    }
  };

  const removeImage = async (mediaId: string) => {
    setImages((imgs) => {
      const rest = imgs.filter((i) => i.mediaId !== mediaId);
      if (rest.length > 0 && !rest.some((i) => i.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
      return rest;
    });
    if (isEdit) {
      try { await productsApi.removeImage(product!.id, mediaId); } catch { /* ignoré */ }
    }
    try { await mediaApi.remove(mediaId); } catch { /* média peut-être encore référencé */ }
  };

  const submit = async () => {
    setError(null);
    const required: [string, string][] = [
      [form.sku.trim(), "Référence article (SKU)"], [form.name.trim(), "Désignation"],
      [form.category.trim(), "Catégorie"], [form.brand.trim(), "Marque"],
      [(form.unit === "Autre" ? form.customUnit : form.unit).trim(), "Unité de mesure"],
      [form.sellingPrice, "Prix de vente"], [form.warehouseId, "Entrepôt"], [form.supplierId, "Fournisseur"],
    ];
    const missing = required.filter(([v]) => !v).map(([, label]) => label);
    if (missing.length) { setError(`Champs obligatoires manquants : ${missing.join(", ")}.`); return; }
    if (parseFloat(form.maxStock || "0") < parseInt(form.minStock || "0", 10)) {
      setError("Le stock maximum doit être supérieur ou égal au stock minimum."); return;
    }

    setBusy(true);
    try {
      const unit = form.unit === "Autre" ? form.customUnit.trim() : form.unit;
      const payload = {
        sku: form.sku.trim(), name: form.name.trim(), barcode: form.barcode.trim() || undefined,
        category: form.category.trim(), subcategory: form.subcategory.trim() || undefined,
        productType: form.productType.trim() || undefined, brand: form.brand.trim(),
        unit, descriptionShort: form.descriptionShort.trim() || undefined,
        description: form.description.trim() || undefined,
        costPrice: parseFloat(form.costPrice || "0"), sellingPrice: parseFloat(form.sellingPrice || "0"),
        wholesalePrice: form.wholesalePrice === "" ? undefined : parseFloat(form.wholesalePrice),
        taxRate: form.taxRate === "" ? undefined : parseFloat(form.taxRate),
        discountEligible: form.discountEligible,
        minStock: parseInt(form.minStock || "0", 10), maxStock: parseInt(form.maxStock || "0", 10),
        reorderPoint: parseInt(form.reorderPoint || "0", 10),
        warehouseId: form.warehouseId, supplierId: form.supplierId,
        leadTimeDays: 0, isActive: form.isActive,
        unitConversions: conversions.filter((c) => c.fromUnit && c.toUnit && c.factor > 0),
        ...( !isEdit && parseInt(form.initialQuantity || "0", 10) > 0
          ? { initialStock: { warehouseId: form.warehouseId, quantity: parseInt(form.initialQuantity, 10) } }
          : {}),
      };

      let saved: Product;
      if (isEdit) {
        const { initialStock: _drop, ...updatePayload } = payload;
        saved = await productsApi.update(product!.id, updatePayload);
      } else {
        saved = await productsApi.create(payload as Parameters<typeof productsApi.create>[0]);
      }

      // Association des images au produit (références persistées en base).
      for (const img of images) {
        if (!saved.images?.some((i) => i.mediaId === img.mediaId)) {
          saved = await productsApi.attachImage(saved.id, img.mediaId, img.isPrimary);
        } else if (img.isPrimary) {
          saved = await productsApi.setPrimaryImage(saved.id, img.mediaId);
        }
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title={isEdit ? `Modifier l'article — ${product?.sku}` : "Ajouter un nouvel article"}
      subtitle="Toutes les informations sont enregistrées dans MongoDB via l'API Nexora.">
      <div className="space-y-6">
        <Notice error={error} notice={notice} />

        {/* Informations générales */}
        <section>
          <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-3">Informations générales</h4>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Désignation *"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Carreaux grès 60×60…" /></Field>
            <Field label="Référence article (SKU) *" hint={isEdit ? undefined : "Identifiant interne unique"}><input value={form.sku} onChange={(e) => set({ sku: e.target.value })} className={inputCls} disabled={isEdit} /></Field>
            <Field label="Code-barres"><input value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} className={inputCls} placeholder="619…" /></Field>
            <Field label="Statut du produit">
              <select value={form.isActive ? "active" : "inactive"} onChange={(e) => set({ isActive: e.target.value === "active" })} className={inputCls}>
                <option value="active">Actif</option>
                <option value="inactive">Inactif / Archivé</option>
              </select>
            </Field>
            <Field label="Catégorie *"><input value={form.category} onChange={(e) => set({ category: e.target.value })} className={inputCls} list="categories-list" placeholder="Carrelage" /></Field>
            <Field label="Sous-catégorie"><input value={form.subcategory} onChange={(e) => set({ subcategory: e.target.value })} className={inputCls} placeholder="Grès cérame" /></Field>
            <Field label="Marque *"><input value={form.brand} onChange={(e) => set({ brand: e.target.value })} className={inputCls} /></Field>
            <Field label="Type de produit">
              <select value={form.productType} onChange={(e) => set({ productType: e.target.value })} className={inputCls}>
                <option value="">—</option>
                <option value="marchandise">Marchandise</option>
                <option value="service">Service</option>
                <option value="consommable">Consommable</option>
              </select>
            </Field>
            <Field label="Description courte"><input value={form.descriptionShort} onChange={(e) => set({ descriptionShort: e.target.value })} className={inputCls} /></Field>
            <Field label="Unité de mesure *">
              <select value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={inputCls}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                <option value="Autre">Autre…</option>
              </select>
            </Field>
            {form.unit === "Autre" && (
              <Field label="Unité personnalisée *"><input value={form.customUnit} onChange={(e) => set({ customUnit: e.target.value })} className={inputCls} /></Field>
            )}
          </div>
          <Field label="Description détaillée">
            <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={inputCls} />
          </Field>
        </section>

        {/* Informations commerciales */}
        <section>
          <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-3">Informations commerciales</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Prix d'achat"><input type="number" step="0.001" value={form.costPrice} onChange={(e) => set({ costPrice: e.target.value })} className={inputCls} /></Field>
            <Field label="Prix de vente *"><input type="number" step="0.001" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} className={inputCls} /></Field>
            <Field label="Prix de gros" hint="Optionnel"><input type="number" step="0.001" value={form.wholesalePrice} onChange={(e) => set({ wholesalePrice: e.target.value })} className={inputCls} /></Field>
            <Field label="Taux de TVA (%)"><input type="number" step="0.5" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" checked={form.discountEligible} onChange={(e) => set({ discountEligible: e.target.checked })} className="accent-terra-500" />
              Éligible aux remises commerciales
            </label>
            <div className={`text-sm font-medium ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              Marge : {margin.toFixed(2)} ({marginPct}%)
            </div>
          </div>
        </section>

        {/* Stock */}
        <section>
          <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-3">Informations de stock</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Stock minimum"><input type="number" min={0} value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} className={inputCls} /></Field>
            <Field label="Stock maximum"><input type="number" min={0} value={form.maxStock} onChange={(e) => set({ maxStock: e.target.value })} className={inputCls} /></Field>
            <Field label="Seuil de réapprovisionnement"><input type="number" min={0} value={form.reorderPoint} onChange={(e) => set({ reorderPoint: e.target.value })} className={inputCls} /></Field>
            {!isEdit && (
              <Field label="Quantité initiale" hint="Créée via un mouvement de stock tracé">
                <input type="number" min={0} value={form.initialQuantity} onChange={(e) => set({ initialQuantity: e.target.value })} className={inputCls} />
              </Field>
            )}
            <Field label="Entrepôt *">
              <select value={form.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Fournisseur principal *">
              <select value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })} className={inputCls}>
                <option value="">— Choisir —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* Conversions d'unités (par produit, configurables) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400">Conversions d'unités (par produit)</h4>
            <button onClick={() => setConversions([...conversions, { fromUnit: form.unit === "Autre" ? form.customUnit : form.unit, toUnit: "", factor: 1 }])}
              className="text-xs bg-ivory-100 hover:bg-ivory-200 text-navy-700 px-3 py-1.5 rounded-lg transition-colors">+ Conversion</button>
          </div>
          {conversions.length > 0 && (
            <div className="space-y-2">
              {conversions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={c.fromUnit} onChange={(e) => setConversions(conversions.map((x, j) => j === i ? { ...x, fromUnit: e.target.value } : x))} className={`${inputCls} py-2`} placeholder="Carton" />
                  <span className="text-navy-400 text-sm">=</span>
                  <input value={c.factor} type="number" step="0.001" min={0} onChange={(e) => setConversions(conversions.map((x, j) => j === i ? { ...x, factor: parseFloat(e.target.value || "0") } : x))} className={`${inputCls} py-2 w-24`} />
                  <input value={c.toUnit} onChange={(e) => setConversions(conversions.map((x, j) => j === i ? { ...x, toUnit: e.target.value } : x))} className={`${inputCls} py-2`} placeholder="m²" />
                  <button onClick={() => setConversions(conversions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <p className="text-[11px] text-navy-400">Exemple : 1 Carton = 2.88 m².</p>
            </div>
          )}
        </section>

        {/* Images */}
        <section>
          <h4 className="text-xs font-mono uppercase tracking-widest text-navy-400 mb-3">Images du produit</h4>
          <div className="flex flex-wrap gap-3 mb-3">
            {images.map((img) => (
              <div key={img.mediaId} className="relative w-24 h-24 rounded-xl overflow-hidden border border-ivory-200 group">
                <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                {img.isPrimary && (
                  <span className="absolute top-1 left-1 bg-terra-500 text-white text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5" /> Principale
                  </span>
                )}
                <div className="absolute inset-0 bg-navy-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  {!img.isPrimary && (
                    <button onClick={() => setPrimary(img.mediaId)} title="Définir comme principale" className="bg-white/90 rounded-lg p-1.5 hover:bg-white"><Star className="w-3.5 h-3.5 text-amber-500" /></button>
                  )}
                  <button onClick={() => removeImage(img.mediaId)} title="Retirer" className="bg-white/90 rounded-lg p-1.5 hover:bg-white"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              </div>
            ))}
            <label className="w-24 h-24 rounded-xl border-2 border-dashed border-ivory-300 hover:border-terra-300 flex flex-col items-center justify-center cursor-pointer text-navy-400 hover:text-terra-500 transition-colors">
              {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
              <span className="text-[10px] mt-1">{uploading ? "Envoi…" : "Ajouter"}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            </label>
          </div>
          <p className="text-[11px] text-navy-400">
            Les images sont stockées côté backend (référence définitive en base) et restent disponibles après réouverture.
          </p>
        </section>

        <div className="flex justify-end gap-3 pt-2 border-t border-ivory-200">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100 transition-colors">Annuler</button>
          <button onClick={submit} disabled={busy}
            className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? "Enregistrement…" : isEdit ? "Enregistrer les modifications" : "Créer l'article"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
