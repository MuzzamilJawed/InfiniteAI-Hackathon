"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const DEMO_CREDENTIALS = [
  { email: "analyst@fraudentify.pk", password: "analyst123", role: "Analyst", tag: "Fraud ops dashboard" },
  { email: "customer1@fraudentify.pk", password: "customer123", role: "Customer 1", tag: "Karachi profiles" },
  { email: "customer2@fraudentify.pk", password: "customer123", role: "Customer 2", tag: "Lahore profiles" },
];

const inputCls =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--foreground)]/40 transition-shadow";

function NetworkBg() {
  const nodes = [
    { cx: 80, cy: 120, r: 4 }, { cx: 220, cy: 80, r: 3 }, { cx: 360, cy: 160, r: 5 },
    { cx: 140, cy: 280, r: 3 }, { cx: 300, cy: 320, r: 4 }, { cx: 440, cy: 240, r: 3 },
    { cx: 60, cy: 440, r: 4 }, { cx: 200, cy: 500, r: 5 }, { cx: 380, cy: 420, r: 3 },
    { cx: 480, cy: 100, r: 3 }, { cx: 520, cy: 380, r: 4 }, { cx: 160, cy: 600, r: 3 },
    { cx: 400, cy: 560, r: 4 }, { cx: 540, cy: 520, r: 3 }, { cx: 40, cy: 680, r: 5 },
    { cx: 280, cy: 700, r: 3 }, { cx: 500, cy: 660, r: 4 }, { cx: 100, cy: 800, r: 3 },
  ];
  const edges = [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 8], [5, 10],
    [6, 7], [7, 8], [8, 10], [7, 11], [8, 12], [10, 13], [11, 12], [12, 13],
    [11, 14], [12, 15], [13, 16], [14, 15], [15, 16], [14, 17], [15, 17],
  ];
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 580 860" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <filter id="blur1"><feGaussianBlur stdDeviation="40" /></filter>
      </defs>

      {/* Ambient glow blobs */}
      <circle cx="140" cy="200" r="180" fill="url(#glow)" filter="url(#blur1)" opacity="0.5">
        <animate attributeName="cx" values="140;200;140" dur="12s" repeatCount="indefinite" />
      </circle>
      <circle cx="420" cy="550" r="160" fill="url(#glow)" filter="url(#blur1)" opacity="0.4">
        <animate attributeName="cy" values="550;480;550" dur="15s" repeatCount="indefinite" />
      </circle>

      {/* Grid pattern */}
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.3" opacity="0.08" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Network edges */}
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy} stroke="white" strokeWidth="0.6" opacity="0.12">
          <animate attributeName="opacity" values="0.06;0.18;0.06" dur={`${4 + (i % 5)}s`} repeatCount="indefinite" />
        </line>
      ))}

      {/* Network nodes */}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r={n.r * 3} fill="#22d3ee" opacity="0.06">
            <animate attributeName="r" values={`${n.r * 2};${n.r * 4};${n.r * 2}`} dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={n.cx} cy={n.cy} r={n.r} fill="#22d3ee" opacity="0.5">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* Scanning line */}
      <line x1="0" y1="0" x2="580" y2="0" stroke="#22d3ee" strokeWidth="1" opacity="0.15">
        <animate attributeName="y1" values="0;860;0" dur="8s" repeatCount="indefinite" />
        <animate attributeName="y2" values="0;860;0" dur="8s" repeatCount="indefinite" />
      </line>

      {/* Shield watermark */}
      <g transform="translate(200, 320)" opacity="0.04">
        <path d="M90 0 L180 40 L180 120 C180 180 90 220 90 220 C90 220 0 180 0 120 L0 40 Z" fill="white" />
      </g>

      {/* Floating data particles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={`p${i}`} r="1.5" fill="#22d3ee" opacity="0.4">
          <animate attributeName="cx" values={`${50 + i * 110};${100 + i * 100};${50 + i * 110}`} dur={`${6 + i * 2}s`} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${100 + i * 150};${200 + i * 130};${100 + i * 150}`} dur={`${7 + i * 1.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

function FloatingCard({ delay, x, y, children }: { delay: number; x: string; y: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay }}
      className="absolute rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/10 px-3 py-2 text-[11px] text-white/70 shadow-lg"
      style={{ left: x, top: y }}
    >
      {children}
    </motion.div>
  );
}

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
      {/* Left brand panel with animated network background */}
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex flex-col justify-between w-[46%] p-12 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #0c1530 100%)" }}
      >
        <NetworkBg />

        {/* Floating info cards */}
        <FloatingCard delay={1.2} x="60%" y="22%">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">TX-3A82F scored <span className="text-emerald-400 font-semibold">LOW</span></span>
          </div>
        </FloatingCard>
        <FloatingCard delay={1.8} x="55%" y="48%">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-400 animate-pulse" />
            <span className="font-mono">TX-9E1D4 <span className="text-red-400 font-semibold">BLOCKED</span> · Score 92</span>
          </div>
        </FloatingCard>
        <FloatingCard delay={2.4} x="10%" y="68%">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono">Velocity burst detected · C00456</span>
          </div>
        </FloatingCard>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <Logo size={40} />
            <span className="text-xl font-semibold tracking-tight">fraudentify</span>
          </div>
          <h1 className="text-4xl font-bold leading-snug max-w-sm">
            Smart Transaction Anomaly Detector
          </h1>
          <p className="mt-4 text-white/75 leading-relaxed max-w-sm">
            Pakistan-compliant fraud detection powered by hybrid AI. Real-time
            scoring, SHAP-driven explanations, SBP-aligned audit trails.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          {[
            "Hybrid ML + rules engine",
            "SBP & AML/CFT compliance",
            "Customer-trust-first decisioning",
            "Live risk scoring per transaction",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2.5 text-sm text-white/85">
              <ShieldCheck className="size-4 shrink-0 text-cyan-400/70" />
              {f}
            </div>
          ))}
        </div>

        <p className="relative z-10 text-xs text-white/40">
          Hackathon demo — InfiniteAI 2026 · fraudentify
        </p>
      </motion.aside>

      {/* Right login form */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--background)] relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle size="sm" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="w-full max-w-md space-y-7"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden mb-2">
            <Logo size={32} />
            <span className="font-semibold">fraudentify</span>
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
                placeholder="you@fraudentify.pk"
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
