"use client";

import { PERSONAS } from "@/lib/personas";
import { usePersona } from "@/components/PersonaPicker";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

const RISK_DOT: Record<string, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-red-500",
};

export function PersonaBar() {
  const [active, setActive] = usePersona();
  const { user } = useAuth();

  const visible = PERSONAS.filter((p) => !p.owner || p.owner === user?.email);

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-xs text-[var(--foreground)]/55 mr-1">Persona:</span>
      {visible.map((p) => (
        <motion.button
          key={p.id}
          type="button"
          whileHover={{ y: -1 }}
          onClick={() => setActive(p.id)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors ${
            p.id === active.id
              ? "brand-gradient text-white border-transparent"
              : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--brand)]"
          }`}
        >
          <span
            className={`size-2 rounded-full shrink-0 ${
              p.id === active.id ? "bg-white/70" : RISK_DOT[p.riskHint]
            }`}
          />
          {p.label}
        </motion.button>
      ))}
    </div>
  );
}
