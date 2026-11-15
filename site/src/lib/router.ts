import { useEffect, useState } from "react";

/**
 * Hash routing (#/results). GitHub Pages serves static files only and has no rewrite rules, so a
 * path-based route like /Fairfare/results would 404 on reload; hash routes always load index.html.
 */
export const ROUTES = [
  { path: "/", label: "Home" },
  { path: "/predict", label: "Fare predictor" },
  { path: "/methodology", label: "Methodology" },
  { path: "/data", label: "Data" },
  { path: "/model", label: "Model" },
  { path: "/results", label: "Results" },
  { path: "/analytics", label: "Analytics" },
  { path: "/about", label: "About" },
] as const;
export type RoutePath = (typeof ROUTES)[number]["path"];

const current = (): string => {
  const h = window.location.hash.replace(/^#/, "") || "/";
  return ROUTES.some((r) => r.path === h) ? h : "/";
};

export function useRoute(): string {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => { setPath(current()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

export const href = (p: RoutePath) => `#${p}`;
