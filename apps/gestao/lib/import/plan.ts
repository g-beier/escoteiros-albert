import { BRANCH_CHOICES, FILE_ORDER, REGISTRATION_CHOICES, type Choice, type FileKind } from "@/lib/import/contract";
import type { ReadFile, ReadRow, Values } from "@/lib/import/read";
import type { ImportState, StatePerson } from "@/lib/import/state";
import { nameKey } from "@/lib/import/values";

/**
 * Plano da importação: compara cada linha lida com o que está no app (e com as linhas anteriores do mesmo envio) e
 * diz o que vai acontecer. As linhas válidas viram o `payload` enviado a `import_batch`, que aplica as mesmas regras
 * no banco (a pré-visualização não é confiável: o banco confere tudo de novo).
 */

export type RowAction = "nova" | "atualiza" | "igual" | "erro";
export type Change = { field: string; before: string; after: string };

export type PlannedRow = {
  line: number;
  action: RowAction;
  /** Quem ou o quê (ex.: nome da pessoa). */
  label: string;
  changes: Change[];
  errors: string[];
  warnings: string[];
};

export type PlannedFile = {
  kind: FileKind;
  name: string;
  rows: PlannedRow[];
  warnings: string[];
  /** Configurações que serão criadas (ex.: "Nova seção Tropa Tupã (escoteiro)"). */
  creations: string[];
  /** Linhas que vão para o banco (nova e atualiza). */
  payload: Record<string, unknown>[];
};

export type BatchPlan = { files: PlannedFile[]; errors: string[] };

export type PlanOptions = { filhotes: boolean; today: string };

// Formatação para a pré-visualização ----------------------------------------------------------------------------------

export function showDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function showChoice(choices: readonly Choice[], value: string | null | undefined) {
  if (!value) return "";
  return choices.find((choice) => choice.value === value)?.label ?? value;
}

const branchLabel = (value: string | null | undefined) => showChoice(BRANCH_CHOICES, value);

// Contexto do envio ---------------------------------------------------------------------------------------------------

/** Pessoa conhecida durante o plano: do app ou criada por uma linha anterior do envio. */
export type PersonRef = { id?: string; name: string; birth: string | null; branch: string; line?: number };

type SectionRef = { id?: string; branch: string; name: string; active: boolean };
type PatrolRef = { id?: string; section: SectionRef; name: string; active: boolean };

export class PlanContext {
  readonly people: PersonRef[];
  readonly sections: SectionRef[];
  readonly patrols: PatrolRef[];
  readonly byId: Map<string, StatePerson>;

  constructor(readonly state: ImportState, readonly options: PlanOptions) {
    this.people = state.people.map((person) => ({ id: person.id, name: person.name, birth: person.birth, branch: person.branch }));
    this.sections = state.sections.map((section) => ({ ...section }));
    const sectionById = new Map(this.sections.map((section) => [section.id!, section]));
    this.patrols = state.patrols.flatMap((patrol) => {
      const section = sectionById.get(patrol.sectionId);
      return section ? [{ id: patrol.id, section, name: patrol.name, active: patrol.active }] : [];
    });
    this.byId = new Map(state.people.map((person) => [person.id, person]));
  }

  /**
   * Procura uma pessoa: pelo id; senão nome + nascimento; senão nome sem nascimento, se só houver um candidato.
   * Sem resultado: `{}`. Mais de um: `{ error }`.
   */
  findPerson(id: unknown, name: unknown, birth: unknown): { person?: PersonRef; error?: string } {
    if (typeof id === "string") {
      const person = this.people.find((candidate) => candidate.id === id);
      return person ? { person } : { error: `id ${id} não encontrado no app` };
    }
    if (typeof name !== "string") return {};
    const key = nameKey(name);
    const candidates = this.people.filter((candidate) => nameKey(candidate.name) === key);
    if (typeof birth === "string") {
      const exact = candidates.filter((candidate) => candidate.birth === birth);
      if (exact.length === 1) return { person: exact[0] };
      if (exact.length > 1) return { error: `há ${exact.length} pessoas "${name}" com o mesmo nascimento` };
      const undated = candidates.filter((candidate) => !candidate.birth);
      if (undated.length === 1 && candidates.length === 1) return { person: undated[0] };
      if (undated.length > 1) return { error: `há ${undated.length} pessoas "${name}" sem nascimento no app: informe o id` };
      return {};
    }
    if (candidates.length === 1) return { person: candidates[0] };
    if (candidates.length > 1) return { error: `há ${candidates.length} pessoas "${name}": informe o nascimento ou o id` };
    return {};
  }

  findSection(branch: string, name: string) {
    return this.sections.find((section) => section.branch === branch && nameKey(section.name) === nameKey(name));
  }

  findPatrol(section: SectionRef, name: string) {
    return this.patrols.find((patrol) => patrol.section === section && nameKey(patrol.name) === nameKey(name));
  }

  /** Seção do ramo, criada no plano (e anotada em `creations`) se ainda não existir. */
  ensureSection(branch: string, name: string, creations: string[]): SectionRef {
    const found = this.findSection(branch, name);
    if (found) return found;
    const created = { branch, name, active: true };
    this.sections.push(created);
    creations.push(`Nova seção "${name}" (${branchLabel(branch)})`);
    return created;
  }

  ensurePatrol(section: SectionRef, name: string, creations: string[]): PatrolRef {
    const found = this.findPatrol(section, name);
    if (found) return found;
    const created = { section, name, active: true };
    this.patrols.push(created);
    creations.push(`Nova patrulha "${name}" em ${section.name}`);
    return created;
  }

  sectionName(id: string | null) {
    return id ? this.sections.find((section) => section.id === id)?.name ?? "" : "";
  }

  patrolName(id: string | null) {
    return id ? this.patrols.find((patrol) => patrol.id === id)?.name ?? "" : "";
  }
}

// Planos por arquivo --------------------------------------------------------------------------------------------------

type Planner = (file: ReadFile, ctx: PlanContext) => PlannedFile;

function emptyPlan(file: ReadFile): PlannedFile {
  return { kind: file.kind, name: file.name, rows: [], warnings: [...file.warnings], creations: [], payload: [] };
}

function errorRow(row: ReadRow, label: string, errors: string[]): PlannedRow {
  return { line: row.line, action: "erro", label, changes: [], errors, warnings: [] };
}

const str = (values: Values, key: string) => (typeof values[key] === "string" ? (values[key] as string) : undefined);

function planSections(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const seen = new Map<string, number>();
  for (const row of file.rows) {
    const branch = str(row.values, "branch");
    const sectionName = str(row.values, "section");
    const patrolName = str(row.values, "patrol");
    const label = [sectionName, patrolName].filter(Boolean).join(" › ") || `linha ${row.line}`;
    const errors = [...row.errors];
    if (branch === "adulto") errors.push("adultos não têm seção");
    if (branch === "filhote" && !ctx.options.filhotes) errors.push("o ramo Filhote não está ligado");
    const key = `${branch}|${nameKey(sectionName ?? "")}|${nameKey(patrolName ?? "")}`;
    if (seen.has(key)) errors.push(`repetida no arquivo (linha ${seen.get(key)})`);
    if (errors.length || !branch || !sectionName) { plan.rows.push(errorRow(row, label, errors)); continue; }
    seen.set(key, row.line);

    const active = row.values.active as boolean | undefined;
    const creations: string[] = [];
    const section = ctx.ensureSection(branch, sectionName, creations);
    const target = patrolName ? ctx.ensurePatrol(section, patrolName, creations) : section;
    plan.creations.push(...creations);
    const changes: Change[] = [];
    if (active !== undefined && target.active !== active) {
      changes.push({ field: "ativa", before: target.active ? "sim" : "não", after: active ? "sim" : "não" });
      target.active = active;
    }
    const action: RowAction = creations.length ? "nova" : changes.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label, changes, errors: [], warnings: [] });
    if (action !== "igual") plan.payload.push({ line: row.line, branch, section: sectionName, ...(patrolName ? { patrol: patrolName } : {}), ...(active !== undefined ? { active } : {}) });
  }
  return plan;
}

const PERSON_FIELDS: { key: string; label: string; show: (value: string | null | undefined) => string }[] = [
  { key: "name", label: "nome", show: (value) => value ?? "" },
  { key: "nickname", label: "apelido", show: (value) => value ?? "" },
  { key: "birth", label: "nascimento", show: showDate },
  { key: "registration", label: "registro", show: (value) => showChoice(REGISTRATION_CHOICES, value) },
  { key: "joined", label: "entrada", show: showDate },
  { key: "promise", label: "promessa", show: showDate },
  { key: "notes", label: "observação", show: (value) => value ?? "" },
];

function planPeople(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const seen = new Map<PersonRef, number>();
  for (const row of file.rows) {
    const v = row.values;
    const name = str(v, "name") ?? "";
    const errors = [...row.errors];
    const warnings: string[] = [];
    const found = ctx.findPerson(v.id, name, v.birth);
    if (found.error) errors.push(found.error);
    const existing = found.person?.id ? ctx.byId.get(found.person.id) : undefined;
    if (found.person && seen.has(found.person)) errors.push(`mesma pessoa da linha ${seen.get(found.person)}`);

    const branch = str(v, "branch") ?? existing?.branch;
    if (!existing && !found.person && !str(v, "branch") && !row.errors.some((error) => error.startsWith("ramo"))) errors.push("ramo é obrigatório para cadastrar");
    if (branch === "filhote" && !ctx.options.filhotes) errors.push("o ramo Filhote não está ligado");
    const birth = str(v, "birth") ?? existing?.birth ?? null;
    for (const [key, label] of [["birth", "nascimento"], ["joined", "entrada"], ["promise", "promessa"], ["left", "desligamento"]] as const) {
      const date = str(v, key);
      if (date && date > ctx.options.today) errors.push(`${label} no futuro`);
    }
    const joined = str(v, "joined") ?? existing?.joined ?? null;
    const promise = str(v, "promise") ?? existing?.promise ?? null;
    if (birth && promise && promise < birth) errors.push("promessa antes do nascimento");
    if (birth && joined && joined < birth) errors.push("entrada antes do nascimento");

    // Seção e patrulha: do arquivo, ou as atuais se o ramo não mudou.
    const branchChanged = !!existing && branch !== existing.branch;
    let sectionName = str(v, "section") ?? (branchChanged ? undefined : ctx.sectionName(existing?.sectionId ?? null) || undefined);
    const sectionChanged = str(v, "section") !== undefined && nameKey(str(v, "section")!) !== nameKey(ctx.sectionName(existing?.sectionId ?? null));
    let patrolName = str(v, "patrol") ?? (branchChanged || sectionChanged ? undefined : ctx.patrolName(existing?.patrolId ?? null) || undefined);
    if (branch === "adulto" && str(v, "section")) errors.push("adultos não têm seção");
    if (branch === "adulto") { sectionName = undefined; patrolName = undefined; }
    if (patrolName && !sectionName) errors.push("patrulha sem seção");

    // Situação: desligar precisa de data; reingresso só pela ficha.
    const situation = str(v, "situation");
    const wasActive = existing?.active ?? !!found.person;
    if (situation === "desligado" && (wasActive || !found.person) && !str(v, "left")) errors.push("informe a data do desligamento (desligado em)");
    if (situation === "desligado" && !found.person && !str(v, "joined")) errors.push("informe a entrada de quem já está desligado");
    if (situation === "ativo" && existing && !existing.active) errors.push("reingresso só pela ficha do associado (Reingressar)");
    if (str(v, "left") && situation !== "desligado" && (!existing || existing.active)) warnings.push("desligado em sem situação desligado: ignorado");
    const left = str(v, "left");
    if (left && joined && left < joined && situation === "desligado") errors.push("desligamento antes da entrada");
    if (situation === "desligado" && existing && !existing.active && left && left !== existing.left) warnings.push(`já está desligado (em ${showDate(existing.left)}): a data não muda`);

    const label = name || `linha ${row.line}`;
    if (errors.length || !branch) { plan.rows.push(errorRow(row, label, errors)); continue; }

    const creations: string[] = [];
    const section = sectionName ? ctx.ensureSection(branch, sectionName, creations) : undefined;
    if (section && patrolName) ctx.ensurePatrol(section, patrolName, creations);
    plan.creations.push(...creations);

    const payload: Record<string, unknown> = { line: row.line, ...v, branch };
    delete payload.id;
    if (section) payload.section = section.name; else delete payload.section;
    if (patrolName) payload.patrol = patrolName; else delete payload.patrol;
    if (branch === "adulto" || !section) { payload.section = null; payload.patrol = null; }
    else if (!patrolName) payload.patrol = null;

    if (!found.person) {
      const person: PersonRef = { name, birth: str(v, "birth") ?? null, branch, line: row.line };
      ctx.people.push(person);
      seen.set(person, row.line);
      const changes = [
        { field: "ramo", before: "", after: branchLabel(branch) },
        ...(section ? [{ field: "seção", before: "", after: [section.name, patrolName].filter(Boolean).join(" › ") }] : []),
        ...(situation === "desligado" ? [{ field: "situação", before: "", after: `desligado em ${showDate(left)}` }] : []),
      ];
      plan.rows.push({ line: row.line, action: "nova", label, changes, errors: [], warnings });
      plan.payload.push(payload);
      continue;
    }

    seen.set(found.person, row.line);
    if (!existing) {
      // Pessoa criada por uma linha anterior deste mesmo arquivo: já tratada acima como repetida.
      plan.rows.push(errorRow(row, label, [`mesma pessoa da linha ${found.person.line}`]));
      continue;
    }
    payload.id = existing.id;
    // Achada pelo nome, a grafia do app fica (só o id renomeia).
    if (typeof v.id !== "string") payload.name = existing.name;
    const changes: Change[] = [];
    for (const field of PERSON_FIELDS) {
      if (field.key === "name" && typeof v.id !== "string") continue;
      const after = str(v, field.key);
      const before = existing[field.key as keyof StatePerson] as string | null;
      if (after !== undefined && after !== before) changes.push({ field: field.label, before: field.show(before), after: field.show(after) });
    }
    if (branch !== existing.branch) changes.push({ field: "ramo", before: branchLabel(existing.branch), after: branchLabel(branch) });
    const placeBefore = [ctx.sectionName(existing.sectionId), ctx.patrolName(existing.patrolId)].filter(Boolean).join(" › ");
    const placeAfter = [section?.name, patrolName].filter(Boolean).join(" › ");
    if (nameKey(placeBefore) !== nameKey(placeAfter)) changes.push({ field: "seção", before: placeBefore, after: placeAfter });
    if (situation === "desligado" && existing.active) changes.push({ field: "situação", before: "ativo", after: `desligado em ${showDate(left)}` });
    if (branchChanged) warnings.push("mudança de ramo sem passagem: corrige o cadastro, sem histórico");
    const action: RowAction = changes.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label, changes, errors: [], warnings });
    if (action === "atualiza") plan.payload.push(payload);
  }
  return plan;
}

const PLANNERS: Partial<Record<FileKind, Planner>> = {
  secoes: planSections,
  pessoas: planPeople,
};

/** Tipos que a importação já aceita (os outros aparecem como "ainda não disponível"). */
export const SUPPORTED_KINDS = FILE_ORDER.filter((kind) => PLANNERS[kind]);

/** Plano do envio inteiro, na ordem de gravação; dois arquivos do mesmo tipo são erro. */
export function planBatch(files: ReadFile[], state: ImportState, options: PlanOptions): BatchPlan {
  const errors: string[] = [];
  const ctx = new PlanContext(state, options);
  const byKind = new Map<FileKind, ReadFile>();
  for (const file of files) {
    const other = byKind.get(file.kind);
    if (other) errors.push(`${file.name} e ${other.name} são do mesmo tipo (${file.kind}.csv): envie um só.`);
    else byKind.set(file.kind, file);
  }
  const planned: PlannedFile[] = [];
  for (const kind of FILE_ORDER) {
    const file = byKind.get(kind);
    if (!file) continue;
    const planner = PLANNERS[kind];
    if (!planner) { errors.push(`${file.name}: a importação de ${kind}.csv ainda não está disponível.`); continue; }
    planned.push(planner(file, ctx));
  }
  return { files: planned, errors };
}

export function planTotals(file: PlannedFile) {
  const totals: Record<RowAction, number> = { nova: 0, atualiza: 0, igual: 0, erro: 0 };
  for (const row of file.rows) totals[row.action] += 1;
  return totals;
}
