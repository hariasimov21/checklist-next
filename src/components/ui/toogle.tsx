// components/ui/mode-toggle.tsx
"use client";
import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Mientras no monta, muestra algo neutro para evitar parpadeo
  if (!mounted) {
    return (
      <button
        className="inline-flex items-center rounded-md border px-2 py-1 bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 text-stone-900 dark:text-neutral-100"
        aria-label="Toggle theme (loading)"
        disabled
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 rounded-md border px-2 py-1 bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 text-stone-900 dark:text-neutral-100 hover:bg-stone-50 dark:hover:bg-neutral-700/60"
      aria-label="Alternar tema"
      title={isDark ? "Cambiar a Light" : "Cambiar a Dark"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="text-xs">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
