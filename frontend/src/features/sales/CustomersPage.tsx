import { useEffect, useState } from "react";
import { Plus, Pencil, Users } from "lucide-react";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { DataTable, Field, ListFilters, Modal, Notice, PageHeader, inputCls, useClientFilter } from "../commercial/kit";
import type { Column } from "../commercial/kit";

const EMPTY = { name: "", contactName: "", email: "", phone: "", address: "", city: "", taxId: "", paymentTermsDays: "30", notes: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    customersApi.list({ includeInactive: true, limit: 500 })
      .then((res) => setCustomers(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useClientFilter(
    customers, search, status,
    (c, q) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    (c) => (c.isActive ? "active" : "inactive"),
  );

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(null); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name, contactName: c.contactName ?? "", email: c.email ?? "", phone: c.phone ?? "",
      address: c.address ?? "", city: c.city ?? "", taxId: c.taxId ?? "",
      paymentTermsDays: String(c.paymentTermsDays), notes: c.notes ?? "",
    });
    setError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(), contactName: form.contactName, email: form.email, phone: form.phone,
        address: form.address, city: form.city, taxId: form.taxId,
        paymentTermsDays: parseInt(form.paymentTermsDays || "30", 10), notes: form.notes,
      };
      if (!payload.name) throw new Error("Le nom du client est obligatoire.");
      if (editing) await customersApi.update(editing.id, payload);
      else await customersApi.create(payload);
      setNotice(editing ? "Client mis à jour." : `Client créé (code attribué automatiquement).`);
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally { setBusy(false); }
  };

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-mono text-xs text-navy-500">{c.code}</span> },
    { key: "name", header: "Client", render: (c) => (
      <div><div className="text-navy-900 font-medium">{c.name}</div>
      <div className="text-navy-400 text-xs">{c.city || "—"}{c.taxId ? ` · MF ${c.taxId}` : ""}</div></div>
    )},
    { key: "contact", header: "Contact", render: (c) => (
      <div className="text-xs text-navy-600">{c.contactName || "—"}<div className="text-navy-400">{c.phone || c.email || ""}</div></div>
    )},
    { key: "terms", header: "Délai paiement", render: (c) => <span className="text-navy-600 text-sm">{c.paymentTermsDays} j</span> },
    { key: "status", header: "Statut", render: (c) => (
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.isActive ? "bg-emerald-50 text-emerald-700" : "bg-ivory-100 text-navy-500"}`}>
        {c.isActive ? "Actif" : "Inactif"}
      </span>
    )},
    { key: "actions", header: "", className: "text-right", render: (c) => (
      <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-2 text-navy-400 hover:text-navy-800 hover:bg-ivory-100 rounded-lg transition-colors">
        <Pencil className="w-4 h-4" />
      </button>
    )},
  ];

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <PageHeader title="Clients" subtitle={`${customers.length} clients enregistrés`}
        actions={
          <button onClick={openCreate} className="bg-terra-500 hover:bg-terra-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouveau client
          </button>
        } />
      <Notice error={error} notice={notice} />
      <ListFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus}
        statuses={[{ value: "active", label: "Actifs" }, { value: "inactive", label: "Inactifs" }]} />
      {loading ? <p className="text-navy-400 text-sm">Chargement…</p> : (
        <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id}
          onRowClick={openEdit} emptyLabel="Aucun client — créez votre premier client." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Modifier — ${editing.name}` : "Nouveau client"} subtitle={editing ? editing.code : "Le code client est attribué automatiquement."}>
        <div className="space-y-4">
          <Notice error={error} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom / Raison sociale *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
            <Field label="Personne à contacter"><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={inputCls} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
            <Field label="Téléphone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="Matricule fiscal (MF)"><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className={inputCls} placeholder="1234567/A/M/000" /></Field>
            <Field label="Délai de paiement (jours)"><input type="number" min={0} value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} className={inputCls} /></Field>
            <Field label="Adresse"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} /></Field>
            <Field label="Ville"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></Field>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm text-navy-600 hover:bg-ivory-100">Annuler</button>
            <button onClick={submit} disabled={busy} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
              {busy ? "Enregistrement…" : <><Users className="w-4 h-4" />{editing ? "Enregistrer" : "Créer le client"}</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
