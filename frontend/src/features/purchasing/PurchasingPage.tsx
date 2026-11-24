import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, Brain, CheckCircle2, Clock, XCircle, AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { MOCK_PURCHASE_ORDERS, MOCK_SUPPLIERS } from "@/lib/mock-data";
import type { OrderStatus } from "@/lib/types";

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Brouillon", color: "bg-navy-100 text-navy-600", icon: Clock },
  pending: { label: "En attente", color: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approuvé", color: "bg-teal-ai-500/10 text-teal-ai-700", icon: CheckCircle2 },
  ordered: { label: "Commandé", color: "bg-blue-50 text-blue-700", icon: CheckCircle2 },
  partial: { label: "Partiel", color: "bg-gold-100 text-gold-800", icon: AlertTriangle },
  received: { label: "Reçu", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Annulé", color: "bg-red-50 text-red-600", icon: XCircle },
};

export default function PurchasingPage() {
  const [tab, setTab] = useState<"orders" | "suppliers">("orders");

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Achats & Approvisionnement</h1>
          <p className="text-navy-500 mt-1">{MOCK_PURCHASE_ORDERS.length} commandes actives · {MOCK_SUPPLIERS.length} fournisseurs</p>
        </div>
        <button className="bg-navy-900 hover:bg-navy-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Nouvelle commande
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[["orders", "Commandes"], ["suppliers", "Fournisseurs"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as "orders" | "suppliers")}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === key ? "bg-navy-900 text-white" : "bg-white border border-ivory-200 text-navy-600 hover:border-navy-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="space-y-4">
          {MOCK_PURCHASE_ORDERS.map((order, i) => {
            const cfg = STATUS_CONFIG[order.status];
            const StatusIcon = cfg.icon;
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-white border border-ivory-200 rounded-2xl p-6 hover:shadow-md hover:border-ivory-300 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-navy-50 rounded-xl flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-navy-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-medium text-navy-900">{order.reference}</h3>
                        {order.aiRecommended && (
                          <div className="flex items-center gap-1 bg-teal-ai-500/10 text-teal-ai-700 text-xs px-2 py-0.5 rounded-full">
                            <Brain className="w-3 h-3" /> IA recommandé
                          </div>
                        )}
                      </div>
                      <p className="text-navy-500 text-sm">{order.supplierName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${cfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                    <button className="text-navy-400 hover:text-navy-700 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="border border-ivory-100 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-ivory-50 text-xs text-navy-500 uppercase font-mono">
                        <th className="text-left px-4 py-2">Produit</th>
                        <th className="text-right px-4 py-2">Qté</th>
                        <th className="text-right px-4 py-2">Reçu</th>
                        <th className="text-right px-4 py-2">P.U.</th>
                        <th className="text-right px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => (
                        <tr key={line.id} className="border-t border-ivory-100">
                          <td className="px-4 py-3">
                            <div className="text-navy-800 font-medium">{line.productName}</div>
                            <div className="text-navy-500 text-xs font-mono">{line.productSku}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-navy-700">{line.quantity}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono ${line.receivedQuantity === line.quantity ? "text-emerald-600" : line.receivedQuantity > 0 ? "text-amber-600" : "text-navy-400"}`}>
                              {line.receivedQuantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-navy-600">{line.unitPrice.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-navy-900">{line.totalPrice.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 text-sm text-navy-500">
                    <span>Livraison prévue: <strong className="text-navy-700">{order.expectedDelivery}</strong></span>
                    <span>Créé le: {order.createdAt}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-navy-500 text-xs">Total commande</div>
                    <div className="font-display text-2xl text-navy-900">{order.totalAmount.toLocaleString("fr-FR")} €</div>
                  </div>
                </div>

                {order.notes && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-800 text-sm">
                    {order.notes}
                  </div>
                )}

                {order.status === "pending" && (
                  <div className="mt-4 flex gap-3">
                    <button className="flex-1 bg-teal-ai-500 hover:bg-teal-ai-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                      Approuver
                    </button>
                    <button className="flex-1 border border-ivory-300 hover:border-red-300 text-navy-600 hover:text-red-600 py-2.5 rounded-xl text-sm font-medium transition-all">
                      Refuser
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {tab === "suppliers" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MOCK_SUPPLIERS.map((sup, i) => (
            <motion.div
              key={sup.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white border border-ivory-200 rounded-2xl p-6 hover:shadow-md hover:border-ivory-300 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-medium text-navy-900">{sup.name}</h3>
                  <p className="text-navy-500 text-xs font-mono mt-0.5">{sup.code}</p>
                  <p className="text-navy-400 text-xs mt-1">{sup.city}, {sup.country}</p>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl text-navy-900">{sup.performanceScore}</div>
                  <div className="text-navy-500 text-xs">/100</div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {[
                  { label: "Performance", value: sup.performanceScore, color: "#2dd4bf" },
                  { label: "Fiabilité", value: sup.reliabilityScore, color: "#c4714a" },
                  { label: "Livraison à temps", value: sup.onTimeDeliveryRate, color: "#c9a96e" },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-navy-500">{m.label}</span>
                      <span className="font-mono text-navy-700">{m.value}%</span>
                    </div>
                    <div className="h-1.5 bg-ivory-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.value}%`, backgroundColor: m.color }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-ivory-100 text-xs text-navy-500">
                <span>Délai moyen: <strong className="text-navy-700">{sup.avgLeadTimeDays}j</strong></span>
                <span>{sup.totalOrders} commandes</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {sup.categories.map((c) => (
                  <span key={c} className="bg-ivory-100 text-navy-600 text-xs px-2.5 py-0.5 rounded-full">{c}</span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
