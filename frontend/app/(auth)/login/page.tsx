"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const DEMO_CREDENTIALS = [
  { email: "admin@safebank.pk", password: "admin123", role: "Admin", tag: "Full access" },
  { email: "analyst@safebank.pk", password: "analyst123", role: "Analyst", tag: "Fraud ops" },
  { email: "customer@safebank.pk", password: "customer123", role: "Customer", tag: "Payments" },
];

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--foreground)]/40 transition-shadow";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.error) {
        setError(res.error);
      } else {
        router.replace("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  function fillCredential(c: (typeof DEMO_CREDENTIALS)[0]) {
    setEmail(c.email);
    setPassword(c.password);
    setError(null);
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex flex-col justify-between w-[46%] brand-gradient p-12 text-white"
      >
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="size-10 rounded-xl bg-white/20 backdrop-blur grid place-items-center font-bold text-lg">
              S
            </div>
            <span className="text-xl font-semibold tracking-tight">SafeBank PK</span>
          </div>
          <h1 className="text-4xl font-bold leading-snug max-w-sm">
            Smart Transaction Anomaly Detector
          </h1>
          <p className="mt-4 text-white/80 leading-relaxed max-w-sm">
            Pakistan-compliant fraud detection powered by hybrid AI. Real-time
            scoring, SHAP-driven explanations, SBP-aligned audit trails.
          </p>
        </div>
        <div className="space-y-3">
          {[
            "Hybrid ML + rules engine",
            "SBP & AML/CFT compliance",
            "Customer-trust-first decisioning",
            "Live risk scoring per transaction",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2.5 text-sm text-white/90">
              <ShieldCheck className="size-4 shrink-0 text-white/70" />
              {f}
            </div>
          ))}
        </div>
        <p className="text-xs text-white/50">
          Hackathon demo — InfiniteAI 2026 · SafeBank PK
        </p>
      </motion.aside>

      {/* Right login form */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--background)]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="w-full max-w-md space-y-7"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden mb-2">
            <div className="size-8 rounded-lg brand-gradient grid place-items-center text-white font-bold">
              S
            </div>
            <span className="font-semibold">SafeBank PK</span>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-[var(--foreground)]/60 mt-1">
              Sign in to the fraud ops dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[var(--foreground)]/70 block mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@safebank.pk"
                required
                className={inputCls}
              />
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-[var(--foreground)]/70 block mb-1.5">
                Password
              </label>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 bottom-3 text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-500/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 brand-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2 card-shadow mt-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <div>
            <p className="text-xs text-[var(--foreground)]/60 mb-3 flex items-center gap-2">
              <span className="flex-1 h-px bg-[var(--border)]" />
              Demo credentials
              <span className="flex-1 h-px bg-[var(--border)]" />
            </p>
            <div className="grid gap-2">
              {DEMO_CREDENTIALS.map((c) => (
                <motion.button
                  key={c.email}
                  type="button"
                  whileHover={{ x: 2 }}
                  onClick={() => fillCredential(c)}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm hover:border-[var(--brand)] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg brand-gradient grid place-items-center text-white text-xs font-bold">
                      {c.role[0]}
                    </div>
                    <div className="text-left">
                      <div className="font-medium group-hover:text-[var(--brand)] transition-colors">
                        {c.role}
                      </div>
                      <div className="text-[11px] text-[var(--foreground)]/55">{c.email}</div>
                    </div>
                  </div>
                  <span className="text-[11px] rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                    {c.tag}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
