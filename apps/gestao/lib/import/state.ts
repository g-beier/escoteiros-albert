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

export type ImportState = {
  sections: StateSection[];
  patrols: StatePatrol[];
  people: StatePerson[];
  functions: StateFunction[];
  relatives: StateRelative[];
  links: StateLink[];
};

export const EMPTY_STATE: ImportState = { sections: [], patrols: [], people: [], functions: [], relatives: [], links: [] };
