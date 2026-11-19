/** Cronograma da atividade: cadeia de horários (ex-Azmut). */

import type { ActivityScheduleItem } from "./model";
import { ACTIVITY_BASE_CATEGORIES, ACTIVITY_BASE_CATEGORY_LABELS, type ActivityBaseCategory } from "./vocabulary";

export const SCHEDULE_DURATIONS: { value: number | ""; label: string }[] = [
  { value: "", label: "Duração" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 25, label: "25 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1h" },
  { value: 75, label: "1h 15min" },
  { value: 85, label: "1h 25min" },
  { value: 90, label: "1h 30min" },
  { value: 105, label: "1h 45min" },
  { value: 120, label: "2h" },
  { value: 135, label: "2h 15min" },
  { value: 150, label: "2h 30min" },
  { value: 165, label: "2h 45min" },
  { value: 180, label: "3h" },
];

/** Responsáveis fixos do grupo (mesmo vocabulário do Azmut). */
export const SCHEDULE_RESPONSIBLES = [
  { value: "todos", label: "Todos" },
  { value: "bernardo", label: "Bernardo" },
  { value: "amanda", label: "Amanda" },
  { value: "naan", label: "Naan" },
  { value: "felipe", label: "Felipe" },
] as const;

export type ScheduleResponsible = (typeof SCHEDULE_RESPONSIBLES)[number]["value"];

export const SCHEDULE_CATEGORY_OPTIONS = ACTIVITY_BASE_CATEGORIES.map((value) => ({
  value,
  label: ACTIVITY_BASE_CATEGORY_LABELS[value],
}));

/** Adiciona minutos a data+hora (HH:MM). */
export function addMinutes(dateStr: string, timeStr: string, minutes: number) {
  if (!dateStr || !timeStr || !minutes) return { date: dateStr || "", time: timeStr || "" };
  const [h, mi] = timeStr.split(":").map(Number);
  const totalMin = h * 60 + mi + minutes;
  const novaHora = Math.floor(totalMin / 60) % 24;
  const novoMin = totalMin % 60;
  const diasExtra = Math.floor(totalMin / 1440);
  const time = `${String(novaHora).padStart(2, "0")}:${String(novoMin).padStart(2, "0")}`;
  let date = dateStr;
  if (diasExtra > 0) {
    const [ano, mes, dia] = dateStr.split("-").map(Number);
    const d = new Date(ano, mes - 1, dia + diasExtra);
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return { date, time };
}

export type ScheduleChainSlot = { date: string; start: string };

/** Início de cada item a partir da data/hora da atividade e das durações. */
export function scheduleChain(
  items: Pick<ActivityScheduleItem, "duration">[],
  startsOn: string,
  startTime: string,
): ScheduleChainSlot[] {
  const chain: ScheduleChainSlot[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i === 0) {
      chain.push({ date: startsOn, start: startTime || "" });
    } else {
      const prev = chain[i - 1]!;
      const next = addMinutes(prev.date, prev.start, items[i - 1]!.duration || 0);
      chain.push({ date: next.date, start: next.time });
    }
  }
  return chain;
}

/** Aplica date/start calculados nos itens (persistidos no save). */
export function withChainedTimes(
  items: ActivityScheduleItem[],
  startsOn: string,
  startTime: string,
): ActivityScheduleItem[] {
  const chain = scheduleChain(items, startsOn, startTime);
  return items.map((item, index) => ({
    ...item,
    date: chain[index]?.date || startsOn,
    start: chain[index]?.start || startTime || "00:00",
  }));
}

export function durationLabel(minutes: number | "" | null | undefined) {
  if (minutes === "" || minutes == null || minutes === 0) return "—";
  return SCHEDULE_DURATIONS.find((option) => option.value === minutes)?.label ?? `${minutes} min`;
}

export function newScheduleItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyScheduleItem(date: string, start = ""): ActivityScheduleItem {
  return {
    id: newScheduleItemId(),
    date,
    start,
    duration: 0,
    name: "",
    category: "",
    description: "",
    responsible: "todos",
    materials: [],
  };
}

/** Modelo padrão de reunião Normal (Azmut). */
export function defaultNormalSchedule(date: string, startTime = "13:30"): ActivityScheduleItem[] {
  const seed: { name: string; description: string; duration: number; category: ActivityBaseCategory }[] = [
    { name: "Chegada", description: "Recepção dos lobinhos, chamada e organização inicial.", duration: 30, category: "rotina" },
    { name: "Hasteamento da Bandeira", description: "Cerimônia de hasteamento da bandeira no início da reunião.", duration: 10, category: "cerimonia" },
    { name: "Aliviar Uniforme", description: "Momento para os lobinhos tirarem o uniforme com organização.", duration: 10, category: "rotina" },
    { name: "Quebra-gelo", description: "Jogo curto para animar a alcateia e integrar o grupo.", duration: 10, category: "jogo" },
    { name: "Lanche", description: "Intervalo para lanche e convivência.", duration: 20, category: "rotina" },
    { name: "Avaliação de Atividade", description: "Conversa com a alcateia sobre o que gostaram e o que melhorar.", duration: 15, category: "rotina" },
    { name: "Colocar Uniforme", description: "Momento para colocar o uniforme novamente com organização.", duration: 15, category: "rotina" },
    { name: "Arriamento da Bandeira", description: "Cerimônia de arriamento da bandeira ao final da reunião.", duration: 10, category: "cerimonia" },
  ];
  let time = startTime;
  return seed.map((item) => {
    const row: ActivityScheduleItem = {
      id: newScheduleItemId(),
      date,
      start: time,
      duration: item.duration,
      name: item.name,
      category: ACTIVITY_BASE_CATEGORY_LABELS[item.category],
      description: item.description,
      responsible: "todos",
      materials: [],
    };
    const next = addMinutes(date, time, item.duration);
    time = next.time;
    return row;
  });
}

export function moveScheduleItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function scheduleItemTitle(item: Pick<ActivityScheduleItem, "name" | "description">) {
  const name = item.name?.trim();
  if (name) return name;
  const desc = item.description?.trim();
  return desc?.split("\n")[0]?.trim() || "Sem nome";
}
