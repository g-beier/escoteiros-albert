/** Vocabulário do módulo Atividades (ex-Azmut). */

export const ACTIVITY_KINDS = ["normal", "bivaque", "acampamento", "museu", "cacador"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  normal: "Normal",
  bivaque: "Bivaque",
  acampamento: "Acampamento",
  museu: "Museu",
  cacador: "Caçador",
};

/** Seções (ramos) da atividade — cores oficiais do grupo. */
export const ACTIVITY_SECTIONS = ["lobinho", "escoteiro", "senior", "pioneiro"] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

export const ACTIVITY_SECTION_LABELS: Record<ActivitySection, string> = {
  lobinho: "Lobinho",
  escoteiro: "Escoteiro",
  senior: "Sênior",
  pioneiro: "Pioneiro",
};

/** Laranja do tipo de atividade (Normal, Acampamento, …), dia atual e barra da lista. */
export const ACTIVITY_KIND_COLOR = "#ef6334";
export const ACTIVITY_KIND_FILL = "bg-[#ef6334] text-white";
export const ACTIVITY_KIND_BORDER = "border-[#ef6334]";
export const ACTIVITY_KIND_RING = "ring-[#ef6334]";

/** Fundo + texto das pills (fonte branca em todas as seções). */
export const ACTIVITY_SECTION_FILL: Record<ActivitySection, string> = {
  lobinho: "bg-[#eab308] text-white",
  escoteiro: "bg-[#14532d] text-white",
  senior: "bg-[#7a1f3d] text-white",
  pioneiro: "bg-[#dc2626] text-white",
};

/**
 * Pill no padrão do inventário: altura 20px (h-5), text-xs, rounded-full.
 * Largura livre (formulário / resumo).
 */
export const ACTIVITY_PILL =
  "inline-flex h-5 shrink-0 items-center justify-center rounded-full border-0 px-2 text-xs font-semibold leading-none";

/** Largura fixa = maior label ("Acampamento") — lista do calendário. */
export const ACTIVITY_TAG_WIDTH_REM = 5.75;

/** Tag no formulário/resumo: largura conforme o texto. */
export const ACTIVITY_TAG = ACTIVITY_PILL;

/** Tag na lista de atividades: todas com a mesma largura. */
export const ACTIVITY_LIST_TAG = `${ACTIVITY_PILL} w-[5.75rem]`;





/** Bolinhas do calendário (só a cor de fundo). */
export const ACTIVITY_SECTION_DOT: Record<ActivitySection, string> = {
  lobinho: "bg-[#eab308]",
  escoteiro: "bg-[#14532d]",
  senior: "bg-[#7a1f3d]",
  pioneiro: "bg-[#dc2626]",
};

/** Borda lateral na lista. */
export const ACTIVITY_SECTION_BORDER: Record<ActivitySection, string> = {
  lobinho: "border-[#eab308]",
  escoteiro: "border-[#14532d]",
  senior: "border-[#7a1f3d]",
  pioneiro: "border-[#dc2626]",
};

export function isActivitySection(value: string): value is ActivitySection {
  return (ACTIVITY_SECTIONS as readonly string[]).includes(value);
}

/** Primeira seção na ordem oficial (lobinho → … → pioneiro), para agrupar a lista. */
export function primarySection(branches: ActivitySection[]): ActivitySection | null {
  return ACTIVITY_SECTIONS.find((section) => branches.includes(section)) ?? null;
}

/** Lista: dia, depois seção (mesma seção junta), depois horário. */
export function compareActivitiesByDaySection<T extends {
  starts_on: string; start_time: string; branches: ActivitySection[];
}>(a: T, b: T) {
  const byDay = a.starts_on.localeCompare(b.starts_on);
  if (byDay !== 0) return byDay;
  const ai = primarySection(a.branches);
  const bi = primarySection(b.branches);
  const ao = ai ? ACTIVITY_SECTIONS.indexOf(ai) : ACTIVITY_SECTIONS.length;
  const bo = bi ? ACTIVITY_SECTIONS.indexOf(bi) : ACTIVITY_SECTIONS.length;
  if (ao !== bo) return ao - bo;
  return a.start_time.localeCompare(b.start_time);
}

export const ACTIVITY_BASE_CATEGORIES = ["cerimonia", "cancao", "jogo", "atividade", "rotina"] as const;
export type ActivityBaseCategory = (typeof ACTIVITY_BASE_CATEGORIES)[number];

export const ACTIVITY_BASE_CATEGORY_LABELS: Record<ActivityBaseCategory, string> = {
  cerimonia: "Cerimônia",
  cancao: "Canção",
  jogo: "Jogo",
  atividade: "Atividade",
  rotina: "Rotina",
};

export type ActivitiesRole = "manager" | "chief" | "viewer";
export const ACTIVITIES_ROLE_LABELS: Record<ActivitiesRole, string> = {
  manager: "Gestor",
  chief: "Chefe",
  viewer: "Consulta",
};

export function activityTitle(kind: ActivityKind, title: string | null | undefined) {
  const custom = title?.trim();
  return custom || ACTIVITY_KIND_LABELS[kind];
}
