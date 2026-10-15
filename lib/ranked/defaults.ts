import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { rankedRulesFrom, type RankedRules } from "./rules";

/** Règles du classé avec les valeurs par défaut (tests, aperçus). */
export const DEFAULT_RANKED_RULES: RankedRules = rankedRulesFrom((key) => SETTING_DEFAULTS[key]);
