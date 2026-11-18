import type { ActivityBaseCategory, ActivityKind, ActivitySection } from "./vocabulary";

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  title: string | null;
  starts_on: string;
  ends_on: string | null;
  start_time: string;
  end_time: string | null;
  /** Seções (ramos) da atividade. */
  branches: ActivitySection[];
  /** Nome do local na autorização, se houver. */
  venue_name: string | null;
};

export type ActivityDetail = ActivityRow & {
  schedule: ActivityScheduleItem[];
  authorization: unknown;
  attendance: string[];
  plan_actions: string[];
};

export type ActivityScheduleItem = {
  id: string;
  date: string;
  start: string;
  duration: number;
  name?: string;
  category?: string;
  description: string;
  responsible?: string;
  materials?: { id: string; qtd: number }[];
};

export type VenueRow = {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
};

export type YouthRow = {
  id: string;
  name: string;
  pack: string;
  birth_date: string | null;
  guardian: string | null;
  active: boolean;
};

export type BaseRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  category: ActivityBaseCategory | null;
  active: boolean;
};
