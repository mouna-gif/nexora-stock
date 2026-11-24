import { motion } from "framer-motion";
import { Archive, TrendingDown, Brain } from "lucide-react";
import { MOCK_PRODUCTS } from "@/lib/mock-data";

const DEAD_STOCK = [
  { ...MOCK_PRODUCTS[7], daysInactive: 94, deadValue: 49060 },
  { ...MOCK_PRODUCTS[0], daysInactive: 45, deadValue: 12500 },
];

export default function DeadStockPage() {
  const totalValue = DEAD_STOCK.reduce((s, p) => s + p.deadValue, 0);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-teal-ai-500" />
            <span className="text-teal-ai-600 text-sm font-mono">INTELLIGENCE IA</span>
          </div>
          <h1 className="font-display text-3xl text-navy-900">Stock Mort & Dormant</h1>
          <p className="text-navy-500 mt-1">Produits sans mouvement depuis +45 jours · Valeur totale immobilisée: <strong>{totalValue.toLocaleString("fr-FR")} €</strong></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEAD_STOCK.map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white border border-ivory-200 rounded-2xl p-6 hover:shadow-md transition-all"
          >
            <div className="flex gap-4 mb-4">
              {product.image && (
                <img src={product.image} alt={product.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-ivory-100" />
              )}
              <div>
                <h3 className="font-medium text-navy-900">{product.name}</h3>
                <div className="text-navy-500 text-xs font-mono mt-0.5">{product.sku}</div>
                <div className="flex items-center gap-2 mt-2">
                  <Archive className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-700 text-xs">{product.daysInactive} jours sans mouvement</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-ivory-50 rounded-xl p-3 text-center">
                <div className="text-navy-400 text-xs mb-1">Stock</div>
                <div className="font-display text-xl text-navy-900">{product.stock}</div>
                <div className="text-navy-500 text-xs">{product.unit}</div>
              </div>
              <div className="bg-ivory-50 rounded-xl p-3 text-center">
                <div className="text-navy-400 text-xs mb-1">Valeur</div>
                <div className="font-display text-xl text-amber-700">{product.deadValue.toLocaleString()}</div>
                <div className="text-navy-500 text-xs">€</div>
              </div>
              <div className="bg-ivory-50 rounded-xl p-3 text-center">
                <div className="text-navy-400 text-xs mb-1">Jours dormant</div>
                <div className="font-display text-xl text-red-600">{product.daysInactive}</div>
                <div className="text-navy-500 text-xs">jours</div>
              </div>
            </div>

            <div className="bg-teal-ai-500/5 border border-teal-ai-500/20 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain className="w-3.5 h-3.5 text-teal-ai-500" />
                <span className="text-teal-ai-700 text-xs font-mono">RECOMMANDATION IA</span>
              </div>
              <p className="text-navy-700 text-xs">
                {product.daysInactive > 90
                  ? "Envisager une promotion de déstockage ou un transfert vers un entrepôt à plus forte rotation."
                  : "Surveiller l'évolution. Si aucun mouvement dans 30 jours, initier une action commerciale."}
              </p>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 bg-terra-500/10 hover:bg-terra-500/20 text-terra-700 text-xs py-2.5 rounded-xl transition-all">
                Créer promotion
              </button>
              <button className="flex-1 border border-ivory-300 hover:border-navy-300 text-navy-600 text-xs py-2.5 rounded-xl transition-all">
                Transférer
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
