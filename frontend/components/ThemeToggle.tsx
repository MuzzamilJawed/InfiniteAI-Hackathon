"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const dim = size === "sm" ? "size-8" : "size-9";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`${dim} rounded-xl relative grid place-items-center hover:bg-[var(--surface-muted)] transition-colors`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
      >
        {isDark ? (
          <Moon className="size-4 text-[var(--accent)]" />
        ) : (
          <Sun className="size-4 text-amber-500" />
        )}
      </motion.div>
    </button>
  );
}
