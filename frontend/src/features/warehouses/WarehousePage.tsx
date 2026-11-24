import { useState } from "react";
import { motion } from "framer-motion";
import { Warehouse, MapPin, Users, ChevronRight, ZoomIn } from "lucide-react";
import { MOCK_WAREHOUSES } from "@/lib/mock-data";

function OccupancyBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = Math.round((used / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-navy-500">Occupation</span>
        <span className="font-mono text-navy-700">{pct}%</span>
      </div>
      <div className="h-2 bg-ivory-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const ZONE_COLORS: Record<string, string> = {
  storage: "#2dd4bf",
  receiving: "#c9a96e",
  dispatch: "#c4714a",
  quarantine: "#dc2626",
};
const ZONE_LABELS: Record<string, string> = {
  storage: "Stockage",
  receiving: "Réception",
  dispatch: "Expédition",
  quarantine: "Quarantaine",
};

function WarehouseTwin({ warehouseId }: { warehouseId: string }) {
  const wh = MOCK_WAREHOUSES.find((w) => w.id === warehouseId);
  if (!wh) return null;

  // Generate grid cells for visual representation
  const totalCells = 120;
  const usedPct = wh.usedCapacity / wh.capacity;

  return (
    <div className="bg-navy-900 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display text-xl text-ivory-50">{wh.name}</h3>
          <p className="text-navy-400 text-sm">{wh.code} · Jumeau Numérique</p>
        </div>
        <button className="flex items-center gap-2 border border-navy-600 hover:border-navy-500 text-navy-300 hover:text-white text-xs px-3 py-2 rounded-xl transition-all">
          <ZoomIn className="w-3.5 h-3.5" /> Agrandir
        </button>
      </div>

      {/* Warehouse grid */}
      <div className="relative mb-4">
        {/* Zone labels */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          {wh.zones.map((zone) => (
            <div key={zone.id} className="text-center">
              <div className="text-xs font-mono mb-1" style={{ color: ZONE_COLORS[zone.type] }}>{zone.code}</div>
              <div className="text-navy-400 text-xs">{ZONE_LABELS[zone.type]}</div>
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(20, 1fr)" }}>
          {Array.from({ length: totalCells }).map((_, i) => {
            const r = Math.random();
            const pct = i / totalCells;
            let color;
            if (pct < 0.1) color = "bg-red-500/80";
            else if (pct < 0.3) color = "bg-amber-400/70";
            else if (pct < usedPct) color = "bg-teal-ai-500/60";
            else color = "bg-navy-800";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.004 }}
                className={`rounded-sm cursor-pointer hover:brightness-150 transition-all ${color}`}
                style={{ height: 14 }}
              />
            );
          })}
        </div>
      </div>

      {/* Zone breakdown */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {wh.zones.map((zone) => {
          const zonePct = Math.round((zone.usedCapacity / zone.capacity) * 100);
          return (
            <div key={zone.id} className="bg-navy-800/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[zone.type] }} />
                <span className="text-navy-300 text-xs font-mono">{zone.name}</span>
              </div>
              <div className="font-display text-2xl text-ivory-50 mb-1">{zonePct}%</div>
              <div className="h-1 bg-navy-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${zonePct}%`, backgroundColor: ZONE_COLORS[zone.type] }} />
              </div>
              <div className="text-navy-500 text-xs mt-1">{zone.usedCapacity} / {zone.capacity} m²</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WarehousePage() {
  const [selected, setSelected] = useState(MOCK_WAREHOUSES[0].id);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Entrepôts & Jumeau Numérique</h1>
          <p className="text-navy-500 mt-1">{MOCK_WAREHOUSES.length} entrepôts actifs · Visualisation architecturale en temps réel</p>
        </div>
        <button className="bg-navy-900 hover:bg-navy-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Ajouter entrepôt
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Warehouse list */}
        <div className="space-y-4">
          {MOCK_WAREHOUSES.map((wh) => {
            const pct = Math.round((wh.usedCapacity / wh.capacity) * 100);
            const isSelected = selected === wh.id;
            return (
              <button
                key={wh.id}
                onClick={() => setSelected(wh.id)}
                className={`w-full text-left bg-white border rounded-2xl p-5 transition-all hover:shadow-md ${
                  isSelected ? "border-terra-300 shadow-md" : "border-ivory-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? "bg-terra-500" : "bg-navy-50"}`}>
                      <Warehouse className={`w-5 h-5 ${isSelected ? "text-white" : "text-navy-600"}`} />
                    </div>
                    <div>
                      <h3 className="text-navy-900 font-medium text-sm">{wh.name}</h3>
                      <div className="text-navy-500 text-xs font-mono">{wh.code}</div>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? "text-terra-500 rotate-90" : "text-navy-400"}`} />
                </div>

                <OccupancyBar
                  used={wh.usedCapacity}
                  total={wh.capacity}
                  color={pct > 85 ? "#c4714a" : pct > 65 ? "#c9a96e" : "#2dd4bf"}
                />

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center">
                    <div className="font-display text-lg text-navy-900">{wh.zones.length}</div>
                    <div className="text-navy-500 text-xs">Zones</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-lg text-navy-900">{wh.capacity.toLocaleString()}</div>
                    <div className="text-navy-500 text-xs">m² total</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-lg text-navy-900">{pct}%</div>
                    <div className="text-navy-500 text-xs">Occupation</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ivory-100">
                  <MapPin className="w-3.5 h-3.5 text-navy-400" />
                  <span className="text-navy-500 text-xs">{wh.address}, {wh.city}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Users className="w-3.5 h-3.5 text-navy-400" />
                  <span className="text-navy-500 text-xs">Responsable: {wh.manager}</span>
                </div>
              </button>
            );
          })}

          {/* Legend */}
          <div className="bg-ivory-100 rounded-2xl p-4">
            <div className="text-navy-600 text-xs font-mono uppercase tracking-wide mb-3">Légende</div>
            <div className="space-y-2">
              {[
                { color: "bg-teal-ai-500/60", label: "Stock disponible" },
                { color: "bg-amber-400/70", label: "Stock faible" },
                { color: "bg-red-500/80", label: "Rupture" },
                { color: "bg-navy-800", label: "Emplacement vide" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className={`w-4 h-3 rounded-sm ${l.color}`} />
                  <span className="text-navy-500 text-xs">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Twin visualization */}
        <div className="lg:col-span-2">
          <WarehouseTwin warehouseId={selected} />

          {/* Zone details table */}
          <div className="mt-6 bg-white border border-ivory-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-ivory-100">
              <h3 className="font-display text-lg text-navy-900">Détail des zones</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-ivory-50 text-xs font-mono text-navy-500 uppercase">
                  <th className="text-left px-6 py-3">Zone</th>
                  <th className="text-left px-6 py-3">Type</th>
                  <th className="text-left px-6 py-3">Capacité</th>
                  <th className="text-left px-6 py-3">Utilisé</th>
                  <th className="text-left px-6 py-3">Occupation</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_WAREHOUSES.find((w) => w.id === selected)?.zones.map((zone) => {
                  const pct = Math.round((zone.usedCapacity / zone.capacity) * 100);
                  return (
                    <tr key={zone.id} className="border-t border-ivory-100 hover:bg-ivory-50 transition-all">
                      <td className="px-6 py-4">
                        <div className="font-medium text-navy-800 text-sm">{zone.name}</div>
                        <div className="text-navy-500 text-xs font-mono">{zone.code}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: `${ZONE_COLORS[zone.type]}20`, color: ZONE_COLORS[zone.type] }}>
                          {ZONE_LABELS[zone.type]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-navy-600 text-sm font-mono">{zone.capacity} m²</td>
                      <td className="px-6 py-4 text-navy-600 text-sm font-mono">{zone.usedCapacity} m²</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-ivory-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[zone.type] }} />
                          </div>
                          <span className="text-xs font-mono text-navy-600 w-8">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
