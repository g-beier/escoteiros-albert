/**
 * O que já está no app, lido pelo servidor (`lib/server/import.ts`) para a pré-visualização da importação.
 * Só o necessário para identificar e comparar; nada de dado pessoal além de nome e datas.
 */

export type StateSection = { id: string; branch: string; name: string; active: boolean };
export type StatePatrol = { id: string; sectionId: string; name: string; active: boolean };

export type StatePerson = {
  id: string;
  name: string;
  nickname: string | null;
  birth: string | null;
  branch: string;
  sectionId: string | null;
  patrolId: string | null;
  registration: string;
  joined: string | null;
  promise: string | null;
  active: boolean;
  /** Data do último desligamento (só de quem está desligado). */
  left: string | null;
  notes: string | null;
};

export type StateFunction = {
  id: string;
  associateId: string;
  kind: string;
  title: string | null;
  sectionId: string | null;
  started: string | null;
  ended: string | null;
  elected: boolean;
};

export type StateRelative = { id: string; name: string; associateId: string | null; notes: string | null };

export type StateLink = {
  id: string;
  associateId: string;
  relativeId: string;
  kinship: string;
  kinshipNote: string | null;
  legal: boolean;
  financial: boolean;
};

export type StateItem = {
  id: string;
  name: string;
  kind: string;
  directorate: string;
  valueKind: string;
  validityMonths: number | null;
  removeOnLeave: boolean;
  active: boolean;
  /** Público → valor inicial (null = aplica sem valor inicial); público ausente = não se aplica. */
  audiences: Record<string, string | null>;
};

/** Situação gravada de um associado ou de um responsável. */
export type StateStatus = {
  associateId: string | null;
  relativeId: string | null;
  itemId: string;
  status: string;
  statusDate: string | null;
  validUntil: string | null;
  year: number | null;
  note: string | null;
};

/** Vida escoteira de cada pessoa (004, 005). */
export type StateLifePeriod = { associateId: string; branch: string; started: string; ended: string | null; place: string | null };
export type StateLifeExclusion = { associateId: string; started: string; ended: string; reason: string; note: string | null };
export type StateLifeEvent = { associateId: string; date: string; title: string; description: string | null };
export type StateStar = { associateId: string; star: number; branch: string | null; delivered: string | null };
export type StateLife = {
  periods: StateLifePeriod[];
  exclusions: StateLifeExclusion[];
  events: StateLifeEvent[];
  stars: StateStar[];
  /** Anotações de histórico por pessoa (só quem tem). */
  notes: Record<string, string>;
};

/** Inventário atual: só o tamanho (a carga por CSV substitui tudo) e se já houve uso pelo app. */
export type StateInventory = { locations: number; materials: number; lots: number; units: number; appMovements: number };

export type ImportState = {
  sections: StateSection[];
  patrols: StatePatrol[];
  people: StatePerson[];
  functions: StateFunction[];
  relatives: StateRelative[];
  links: StateLink[];
  items: StateItem[];
  statuses: StateStatus[];
  life: StateLife;
  inventory: StateInventory;
};

export const EMPTY_LIFE: StateLife = { periods: [], exclusions: [], events: [], stars: [], notes: {} };
export const EMPTY_INVENTORY: StateInventory = { locations: 0, materials: 0, lots: 0, units: 0, appMovements: 0 };
export const EMPTY_STATE: ImportState = {
  sections: [], patrols: [], people: [], functions: [], relatives: [], links: [], items: [], statuses: [], life: EMPTY_LIFE, inventory: EMPTY_INVENTORY,
};
