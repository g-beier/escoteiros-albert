export const SCOUT_BRANCHES = ["lobinho", "escoteiro", "senior", "pioneiro", "adulto"] as const;
export type ScoutBranch = (typeof SCOUT_BRANCHES)[number];

export const branchLabels: Record<ScoutBranch, string> = {
  lobinho: "Lobinho",
  escoteiro: "Escoteiro",
  senior: "Sênior",
  pioneiro: "Pioneiro",
  adulto: "Adulto",
};

export function isScoutBranch(value: string): value is ScoutBranch {
  return (SCOUT_BRANCHES as readonly string[]).includes(value);
}
