import { useEffect, useState } from "react";
import type { ModelJSON } from "./model";

/* Shapes of the JSON written by site/scripts/export_data.py (all numbers come from results/*). */
export interface Metric { n: number; mae: number; rmse: number; bias: number }
export interface CI { point: number; lo: number; hi: number }
export type Boot = Record<"mae_model" | "mae_baseline" | "mae_diff" | "rmse_model" | "rmse_baseline" | "rmse_diff", CI>;
export interface QuoteReport { n: number; coverage: number; mean_overquote: number; mean_cushion: number; mean_shortfall_when_under: number }
export interface SliceRow { n: number; mae: number; rmse: number; bias: number; coverage: number; [k: string]: number | string }
export interface AggRow { n: number; mae: number; bias: number; coverage: number; mean_fare: number; [k: string]: number }
export interface LogRow { step: string; removed: number; pct_of_input: number; remaining: number; why: string }

export interface Results {
  gate2: {
    feature_set: string; model: string; params: Record<string, string | number>;
    june_selection_table: Record<string, Omit<Metric, "n">>;
    june_bootstrap: Record<string, Record<"mae_diff" | "rmse_diff", CI>>;
  };
  gate3: {
    quote_rule: { kind: string; q: number; b: Record<string, number>; default: number };
    june_ladder: Record<string, Omit<Metric, "n">>;
    june_quote: QuoteReport;
    june_rule_comparison: Record<string, QuoteReport & { worst_gap: number; [k: string]: number }>;
    june_distance_noise: { noise_sd: number; mae: number; rmse: number; bias: number; coverage: number }[];
  };
  july: {
    scored_at: string;
    july_metrics: Record<string, Metric>;
    july_vs_median_bootstrap: Boot;
    july_vs_rate_rule_bootstrap: Boot;
    july_quote: QuoteReport;
    july_slices: Record<string, SliceRow[]>;
  };
  july_analytics: {
    n: number;
    by_pickup_zone: AggRow[]; by_dropoff_zone: AggRow[]; by_hour_weekend: AggRow[];
    residual_hist: { edges: number[]; counts: number[] };
    pred_vs_actual: { edges: number[]; counts: number[][] };
    calibration_deciles: { n: number; mean_pred: number; mean_actual: number; median_actual: number }[];
  };
  ablation: { feature_set: string; model: string; n_features: number; mae: number; rmse: number; bias: number }[];
  tree_grid: { depth: number; leaf: number; mae: number; rmse: number; bias: number }[];
  hgb_grid: { loss: string; learning_rate: number; max_leaf_nodes: number; max_iter: number; min_samples_leaf: number; mae: number; rmse: number; bias: number }[];
  cleaning: { logs: Record<"train" | "val" | "test", LogRow[]>; n_raw: Record<string, number>; params: { dist_cap: number; fare_cap: number }; n_out_of_range: number; n_clean: Record<"train" | "val" | "test", number> };
}
export interface Zone { id: number; borough: string; zone: string; service: string; path: string }
export interface Zones { viewBox: [number, number, number, number]; zones: Zone[] }
export interface Eda {
  n: number;
  fare_vs_distance: { dist_edges: number[]; fare_edges: number[]; counts: number[][] };
  fpm_by_band_hour: { dist_band: string; hour: number; median: number; size: number }[];
}

const cache = new Map<string, Promise<unknown>>();
export function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(name, fetch(`${import.meta.env.BASE_URL}data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(name) as Promise<T>;
}

export function useData<T>(name: string): { data?: T; error?: string } {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    load<T>(name).then((data) => live && setState({ data }), (e: Error) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [name]);
  return state;
}

export const useResults = () => useData<Results>("results.json");
export const useZones = () => useData<Zones>("zones.json");
export const useModel = () => useData<ModelJSON>("model.json");
export const useEda = () => useData<Eda>("eda.json");

/* Labels used across pages: keys exactly as written by NB04. */
export const FINAL = "FINAL: hgb f7_time_x";
export const MEDIAN = "1 median (May)";
export const TLC = "2a rate rule (TLC $3 + $3.50/mi)";
export const RULE = "2b rate rule (fit on May)";
export const TREE2 = "3 tree depth 2";
export const SKELETON = "skeleton: linear f4_shape";
export const LADDER_LABELS: Record<string, string> = {
  [MEDIAN]: "May median fare",
  [TLC]: "Official meter rule, distance only",
  [RULE]: "Rate rule fitted on May",
  [TREE2]: "Depth-2 decision tree",
  [SKELETON]: "Linear model, early feature set",
  [FINAL]: "Fairfare (gradient boosting)",
};
