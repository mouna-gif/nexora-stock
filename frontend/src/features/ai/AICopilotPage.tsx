import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Send, Sparkles, BarChart2, Package, Zap, ChevronRight } from "lucide-react";
import type { AIMessage } from "@/lib/types";
import { MOCK_PRODUCTS, MOCK_PROCUREMENT } from "@/lib/mock-data";

const SUGGESTED = [
  "Quels produits risquent une rupture cette semaine ?",
  "Que dois-je commander aujourd'hui ?",
  "Analyse mon stock et donne-moi un résumé.",
  "Quels produits sont dormants depuis plus de 90 jours ?",
  "Quelles anomalies ont été détectées ce mois-ci ?",
  "Quel est le score de santé de mon stock ?",
];

// ### MOCK IMPLEMENTATION ###
// Replace with real call to /api/v1/ai/copilot
function generateMockResponse(query: string): AIMessage {
  const q = query.toLowerCase();
  const id = `msg-${Date.now()}`;

  if (q.includes("rupture") || q.includes("risque")) {
    return {
      id,
      role: "assistant",
      timestamp: new Date().toISOString(),
      content: "J'ai analysé l'ensemble de votre stock. Voici les **3 produits critiques** avec un risque de rupture élevé dans les 7 prochains jours :",
      components: [
        {
          type: "product_list",
          data: MOCK_PRODUCTS.filter((p) => p.aiRisk === "critical" || p.aiRisk === "high"),
        },
      ],
    };
  }

  if (q.includes("commander") || q.includes("commander")) {
    return {
      id,
      role: "assistant",
      timestamp: new Date().toISOString(),
      content: "Sur la base de vos niveaux de stock actuels, des prévisions de demande et des délais fournisseurs, je recommande **5 commandes prioritaires** pour cette semaine. Voici la plus urgente :",
      components: [
        { type: "recommendation", data: MOCK_PROCUREMENT[0] },
        {
          type: "kpi",
          data: { label: "Économies estimées en évitant les ruptures", value: "€42,000", unit: "€" },
        },
      ],
    };
  }

  if (q.includes("analyse") || q.includes("résumé") || q.includes("santé")) {
    return {
      id,
      role: "assistant",
      timestamp: new Date().toISOString(),
      content: "Voici une **analyse complète** de l'état de votre stock au 4 septembre 2026 :",
      components: [
        { type: "kpi", data: { label: "Score de santé du stock", value: 74, unit: "/100", trend: -5 } },
        { type: "kpi", data: { label: "Valeur totale", value: "1 842 500 €" } },
        { type: "kpi", data: { label: "Produits en rupture", value: 1 } },
        { type: "kpi", data: { label: "Produits à risque", value: 8 } },
      ],
    };
  }

  if (q.includes("dormant") || q.includes("mort")) {
    return {
      id,
      role: "assistant",
      timestamp: new Date().toISOString(),
      content: "J'ai identifié **€42,000 de stock dormant** (inactif depuis plus de 90 jours). Le produit le plus préoccupant est le **Pavé Décoratif Travertin** avec 892 m² en stock et aucun mouvement depuis 94 jours.",
      components: [
        { type: "chart", data: { title: "Stock mort par catégorie", points: [{ label: "Revêtements", value: 62 }, { label: "Carrelage", value: 23 }, { label: "Portes", value: 15 }] } },
      ],
    };
  }

  return {
    id,
    role: "assistant",
    timestamp: new Date().toISOString(),
    content: `J'ai analysé votre question : "**${query}**"\n\nJe dispose actuellement des données de vos 2 entrepôts, 8 produits référencés et 3 fournisseurs actifs. Pour des analyses plus spécifiques, essayez de me poser des questions sur les ruptures, les commandes à passer, ou le score de santé de votre stock.`,
  };
}

function KpiComponent({ data }: { data: any }) {
  return (
    <div className="flex items-center gap-3 bg-navy-900/60 border border-navy-600/50 rounded-xl px-4 py-3">
      <Zap className="w-4 h-4 text-teal-ai-400 flex-shrink-0" />
      <div>
        <div className="text-navy-400 text-xs">{data.label}</div>
        <div className="text-ivory-100 font-display text-xl">{data.value}{data.unit && data.unit !== "€" ? ` ${data.unit}` : ""}</div>
      </div>
      {data.trend !== undefined && (
        <span className={`ml-auto text-xs font-mono ${data.trend >= 0 ? "text-teal-ai-400" : "text-red-400"}`}>
          {data.trend >= 0 ? "+" : ""}{data.trend}
        </span>
      )}
    </div>
  );
}

function ProductListComponent({ data }: { data: any[] }) {
  return (
    <div className="space-y-2">
      {data.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between bg-navy-900/40 border border-navy-600/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${p.aiRisk === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
            <div>
              <div className="text-ivory-100 text-sm font-medium">{p.name}</div>
              <div className="text-navy-400 text-xs font-mono">{p.sku}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-red-400 text-xs font-mono">{p.aiRiskScore}% risque</div>
            <div className="text-navy-400 text-xs">{p.stock} {p.unit}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationComponent({ data }: { data: any }) {
  return (
    <div className="bg-teal-ai-500/10 border border-teal-ai-500/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-teal-ai-400" />
        <span className="text-teal-ai-400 text-xs font-mono">RECOMMANDATION IA</span>
        <span className="ml-auto text-xs text-teal-ai-400 font-mono">{Math.round(data.confidence * 100)}% confiance</span>
      </div>
      <div className="text-ivory-100 font-medium mb-1">{data.productName}</div>
      <div className="font-display text-2xl text-teal-ai-300 mb-3">Commander {data.recommendedQuantity} unités</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-navy-900/40 rounded-lg p-2.5 text-center">
          <div className="text-navy-400 text-xs">Stock actuel</div>
          <div className="text-ivory-100 font-mono text-sm">{data.currentStock}</div>
        </div>
        <div className="bg-navy-900/40 rounded-lg p-2.5 text-center">
          <div className="text-navy-400 text-xs">Demande prévue</div>
          <div className="text-ivory-100 font-mono text-sm">{data.forecastDemand}</div>
        </div>
        <div className="bg-navy-900/40 rounded-lg p-2.5 text-center">
          <div className="text-navy-400 text-xs">Délai fournisseur</div>
          <div className="text-ivory-100 font-mono text-sm">{data.leadTimeDays}j</div>
        </div>
        <div className="bg-navy-900/40 rounded-lg p-2.5 text-center">
          <div className="text-navy-400 text-xs">Coût estimé</div>
          <div className="text-ivory-100 font-mono text-sm">{data.estimatedCost.toLocaleString()} €</div>
        </div>
      </div>
      <div className="space-y-1">
        {data.reasons.map((r: string, i: number) => (
          <div key={i} className="flex items-start gap-2 text-xs text-navy-300">
            <span className="text-teal-ai-400 mt-0.5">→</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartComponent({ data }: { data: any }) {
  const max = Math.max(...data.points.map((p: any) => p.value));
  return (
    <div className="bg-navy-900/40 border border-navy-600/30 rounded-xl p-4">
      <div className="text-navy-400 text-xs font-mono mb-4">{data.title.toUpperCase()}</div>
      <div className="space-y-2">
        {data.points.map((p: any) => (
          <div key={p.label} className="flex items-center gap-3">
            <div className="text-navy-300 text-xs w-24 text-right">{p.label}</div>
            <div className="flex-1 h-4 bg-navy-800 rounded overflow-hidden">
              <div className="h-full bg-terra-500 rounded" style={{ width: `${(p.value / max) * 100}%` }} />
            </div>
            <div className="text-ivory-100 text-xs font-mono w-8">{p.value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: AIMessage }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-navy-700 text-navy-100 text-sm px-5 py-3 rounded-2xl rounded-tr-sm max-w-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  const parts = msg.content.split(/\*\*(.*?)\*\*/g);

  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 bg-teal-ai-500/20 border border-teal-ai-500/30 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
        <Brain className="w-4 h-4 text-teal-ai-400" />
      </div>
      <div className="flex-1 space-y-3 max-w-2xl">
        <div className="bg-navy-800/80 border border-navy-600/50 text-navy-100 text-sm px-5 py-4 rounded-2xl rounded-tl-sm">
          {parts.map((part, i) =>
            i % 2 === 1 ? <strong key={i} className="text-ivory-50">{part}</strong> : <span key={i}>{part}</span>
          )}
        </div>
        {msg.components?.map((comp, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
            {comp.type === "kpi" && <KpiComponent data={comp.data} />}
            {comp.type === "product_list" && <ProductListComponent data={comp.data} />}
            {comp.type === "recommendation" && <RecommendationComponent data={comp.data} />}
            {comp.type === "chart" && <ChartComponent data={comp.data} />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function AICopilotPage() {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "init",
      role: "assistant",
      timestamp: new Date().toISOString(),
      content: "Bonjour. Je suis votre **Nexora AI Copilot**, votre assistant intelligence d'affaires. Je peux analyser votre stock, identifier des risques, recommander des commandes et répondre à vos questions métier. Comment puis-je vous aider aujourd'hui ?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const send = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: AIMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI latency
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const response = generateMockResponse(text);
    setIsTyping(false);
    setMessages((m) => [...m, response]);
  };

  return (
    <div className="flex flex-col h-full bg-navy-950 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-ai-500/20 border border-teal-ai-500/30 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-teal-ai-400" />
          </div>
          <div>
            <h1 className="font-display text-xl text-ivory-50">Nexora AI Copilot</h1>
            <div className="flex items-center gap-2 text-teal-ai-400 text-xs font-mono">
              <span className="status-dot ai" />
              En ligne · Données actualisées il y a 3 min
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-navy-400 bg-navy-800/50 px-3 py-2 rounded-xl">
          <Sparkles className="w-3.5 h-3.5 text-gold-500" />
          <span>Propulsé par LLM + RAG sur vos données Nexora</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MessageBubble msg={msg} />
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-ai-500/20 border border-teal-ai-500/30 rounded-full flex items-center justify-center">
              <Brain className="w-4 h-4 text-teal-ai-400" />
            </div>
            <div className="bg-navy-800/80 border border-navy-600/50 px-5 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 bg-teal-ai-400 rounded-full"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
              <span className="text-navy-400 text-xs">Analyse en cours…</span>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div className="px-6 pb-3">
          <div className="text-navy-500 text-xs font-mono mb-3">QUESTIONS SUGGÉRÉES</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-xs border border-navy-700 hover:border-teal-ai-500/50 text-navy-300 hover:text-teal-ai-300 px-3 py-2 rounded-xl transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 pb-6 flex-shrink-0">
        <div className="flex items-center gap-3 bg-navy-800/80 border border-navy-600/50 rounded-2xl px-4 py-3 focus-within:border-teal-ai-500/50 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
            placeholder="Posez votre question à l'IA..."
            className="flex-1 bg-transparent text-navy-100 placeholder-navy-500 text-sm outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isTyping}
            className="w-9 h-9 bg-teal-ai-500 hover:bg-teal-ai-400 disabled:bg-navy-700 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-navy-600 text-xs mt-2 text-center">
          L'IA opère uniquement sur vos données Nexora · Toutes les actions sont auditées
        </p>
      </div>
    </div>
  );
}
