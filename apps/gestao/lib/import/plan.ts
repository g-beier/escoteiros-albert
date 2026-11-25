import {
  AUDIENCE_INITIAL_CHOICES, BRANCH_CHOICES, CONDITION_CHOICES, CONTROL_STATUS_CHOICES, DIRECTORATE_CHOICES, FILE_ORDER, FUNCTION_CHOICES, ITEM_KIND_CHOICES,
  KINSHIP_CHOICES, REGISTRATION_CHOICES, VALUE_KIND_CHOICES, type Choice, type FileKind,
} from "@/lib/import/contract";
import { countYear, type ReadFile, type ReadRow, type Values } from "@/lib/import/read";
import type { ImportState, StateCategory, StateFunction, StateItem, StateLink, StatePerson, StateStatus } from "@/lib/import/state";
import { nameKey, parseControlCell, type ControlCell } from "@/lib/import/values";

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

/** Item de controle conhecido durante o plano: do app ou criado por itens-controle.csv do mesmo envio. */
type ItemRef = Omit<StateItem, "id"> & { id?: string };

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
export type PersonRef = { id?: string; name: string; birth: string | null; branch: string; active: boolean; line?: number };

/** Responsável conhecido durante o plano: do app ou criado por uma linha anterior do envio. */
export type RelativeRef = { id?: string; name: string; associateId: string | null; notes: string | null; line?: number };

type SectionRef = { id?: string; branch: string; name: string; active: boolean };
type PatrolRef = { id?: string; section: SectionRef; name: string; active: boolean };

export class PlanContext {
  readonly people: PersonRef[];
  readonly sections: SectionRef[];
  readonly patrols: PatrolRef[];
  readonly byId: Map<string, StatePerson>;
  readonly functions: StateFunction[];
  readonly relatives: RelativeRef[];
  readonly links: StateLink[];
  readonly items: ItemRef[];
  readonly statuses: StateStatus[];
  /** Materiais do inventário vistos em inventario-lotes.csv (nome comparável → controle). */
  readonly inventoryMaterials = new Map<string, { name: string; tracking: "lot" | "unit"; line: number }>();

  constructor(readonly state: ImportState, readonly options: PlanOptions) {
    this.people = state.people.map((person) => ({ id: person.id, name: person.name, birth: person.birth, branch: person.branch, active: person.active }));
    this.functions = state.functions;
    this.relatives = state.relatives.map((relative) => ({ ...relative }));
    this.links = state.links;
    this.items = state.items.map((item) => ({ ...item, audiences: { ...item.audiences } }));
    this.statuses = state.statuses;
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

  /** Seção só pelo nome (função de escotista): o ramo vem da seção. */
  findSectionByName(name: string): { section?: SectionRef; error?: string } {
    const found = this.sections.filter((section) => section.branch !== "adulto" && nameKey(section.name) === nameKey(name));
    if (found.length === 1) return { section: found[0] };
    if (found.length > 1) return { error: `há ${found.length} seções "${name}" em ramos diferentes` };
    return { error: `seção "${name}" não cadastrada (cadastre em secoes.csv ou pessoas.csv)` };
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

type Planner = (file: ReadFile, ctx: PlanContext, batchErrors: string[]) => PlannedFile;

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
      const person: PersonRef = { name, birth: str(v, "birth") ?? null, branch, active: situation !== "desligado", line: row.line };
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

/** Pessoa citada em outro arquivo: precisa existir no app ou em pessoas.csv do mesmo envio. */
function citedPerson(ctx: PlanContext, v: Values, errors: string[]): PersonRef | undefined {
  const found = ctx.findPerson(v.personId, v.person, v.personBirth);
  if (found.error) errors.push(found.error);
  else if (!found.person) errors.push(`"${str(v, "person") ?? ""}" não encontrada (cadastre em pessoas.csv)`);
  return found.person;
}

/** Identificação da pessoa no payload: o id, se já existe; senão nome e nascimento (criada no mesmo envio). */
function personPayload(person: PersonRef): Record<string, unknown> {
  return person.id ? { personId: person.id } : { person: person.name, ...(person.birth ? { personBirth: person.birth } : {}) };
}

const yesNo = (value: boolean) => (value ? "sim" : "não");

function planFunctions(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const seen = new Map<string, number>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const person = citedPerson(ctx, v, errors);
    if (person && person.branch !== "adulto") errors.push("só adultos têm função");
    if (person && !person.active) errors.push("pessoa desligada: reingresse antes de importar a função");
    const kind = str(v, "kind");
    const sectionName = str(v, "section");
    if (kind === "escotista" && !sectionName) errors.push("escotista precisa da seção");
    if (kind && kind !== "escotista" && sectionName) errors.push("só a função de escotista tem seção");
    const section = sectionName && kind === "escotista" ? ctx.findSectionByName(sectionName) : undefined;
    if (section?.error) errors.push(section.error);
    if (v.elected === true && kind !== "dirigente") errors.push("só dirigente é eleito");
    const started = str(v, "started");
    const ended = str(v, "ended");
    if (started && started > ctx.options.today) errors.push("início no futuro");
    if (ended && ended > ctx.options.today) errors.push("fim no futuro");
    if (started && ended && ended < started) errors.push("fim antes do início");
    const kindLabel = showChoice(FUNCTION_CHOICES, kind);
    const label = `${person?.name ?? str(v, "person") ?? ""} · ${kindLabel}${section?.section ? ` (${section.section.name})` : ""}`;
    const key = person ? `${person.id ?? `#${person.line}`}|${kind}|${section?.section?.name ?? ""}|${started ?? ""}` : "";
    if (key && seen.has(key)) errors.push(`mesma função da linha ${seen.get(key)}`);
    if (errors.length || !person || !kind) { plan.rows.push(errorRow(row, label, errors)); continue; }
    seen.set(key, row.line);

    const sectionId = section?.section?.id ?? null;
    const candidates = person.id && (!section?.section || sectionId)
      ? ctx.functions.filter((f) => f.associateId === person.id && f.kind === kind && f.sectionId === sectionId)
      : [];
    // Com início: o mesmo início (ou a única sem início). Sem início: o mesmo fim (vazio = a vigente), ou a única.
    const only = <T,>(list: T[]) => (list.length === 1 ? list[0] : undefined);
    const match = started
      ? candidates.find((f) => f.started === started) ?? only(candidates.filter((f) => !f.started))
      : only(candidates.filter((f) => (ended ? f.ended === ended : !f.ended))) ?? only(candidates);
    const payload: Record<string, unknown> = { line: row.line, ...v, ...(section?.section ? { section: section.section.name } : {}) };
    delete payload.person; delete payload.personBirth; delete payload.personId;
    Object.assign(payload, personPayload(person));

    if (!match) {
      if (!ended && candidates.some((f) => !f.ended && (f.title ?? "") === (str(v, "title") ?? ""))) {
        plan.rows.push(errorRow(row, label, ["a pessoa já tem esta função vigente com outro início: informe o mesmo início ou encerre a atual"]));
        continue;
      }
      const changes: Change[] = [
        ...(str(v, "title") ? [{ field: "cargo", before: "", after: str(v, "title")! }] : []),
        ...(started ? [{ field: "início", before: "", after: showDate(started) }] : []),
        ...(ended ? [{ field: "fim", before: "", after: showDate(ended) }] : []),
        ...(v.elected === true ? [{ field: "eleito", before: "", after: "sim" }] : []),
      ];
      plan.rows.push({ line: row.line, action: "nova", label, changes, errors: [], warnings: [] });
      plan.payload.push(payload);
      continue;
    }
    payload.functionId = match.id;
    const changes: Change[] = [];
    if (str(v, "title") !== undefined && str(v, "title") !== (match.title ?? undefined)) changes.push({ field: "cargo", before: match.title ?? "", after: str(v, "title")! });
    if (started && started !== match.started) changes.push({ field: "início", before: showDate(match.started), after: showDate(started) });
    if (ended && ended !== match.ended) changes.push({ field: "fim", before: showDate(match.ended), after: showDate(ended) });
    if (typeof v.elected === "boolean" && v.elected !== match.elected) changes.push({ field: "eleito", before: yesNo(match.elected), after: yesNo(v.elected) });
    const action: RowAction = changes.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label, changes, errors: [], warnings: [] });
    if (action === "atualiza") plan.payload.push(payload);
  }
  return plan;
}

function planRelatives(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const seen = new Map<string, number>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const warnings: string[] = [];
    const youth = citedPerson(ctx, v, errors);
    if (youth && youth.branch === "adulto") errors.push("só jovens têm responsáveis");
    const name = str(v, "relative") ?? "";
    const kinship = str(v, "kinship");
    const note = str(v, "kinshipNote");

    let relativeAssociate: PersonRef | undefined;
    if (str(v, "relativeAssociate")) {
      const found = ctx.findPerson(undefined, str(v, "relativeAssociate"), undefined);
      if (found.error) errors.push(`associado do responsável: ${found.error}`);
      else if (!found.person) errors.push(`associado "${str(v, "relativeAssociate")}" não encontrado`);
      relativeAssociate = found.person;
      if (relativeAssociate && youth && relativeAssociate === youth) errors.push("o jovem não pode ser responsável por si mesmo");
    }

    const sameName = ctx.relatives.filter((relative) => nameKey(relative.name) === nameKey(name));
    if (sameName.length > 1) errors.push(`há ${sameName.length} responsáveis "${name}" no app`);
    let relative = sameName.length === 1 ? sameName[0] : undefined;
    if (!relative && relativeAssociate?.id) relative = ctx.relatives.find((r) => r.associateId === relativeAssociate!.id);

    const link = youth?.id && relative?.id ? ctx.links.find((l) => l.associateId === youth.id && l.relativeId === relative!.id) : undefined;
    if (kinship === "outro" && !note && !(link?.kinship === "outro" && link.kinshipNote)) errors.push("parentesco outro: informe a descrição (ex.: avó, tia)");
    const label = `${youth?.name ?? str(v, "person") ?? ""} › ${name}`;
    const key = youth ? `${youth.id ?? `#${youth.line}`}|${relative?.id ?? nameKey(name)}` : "";
    if (key && seen.has(key)) errors.push(`mesmo vínculo da linha ${seen.get(key)}`);
    if (errors.length || !youth || !kinship) { plan.rows.push(errorRow(row, label, errors)); continue; }
    seen.set(key, row.line);

    const payload: Record<string, unknown> = { line: row.line, ...v };
    delete payload.person; delete payload.personBirth; delete payload.personId;
    Object.assign(payload, personPayload(youth));
    if (relative?.id) payload.relativeId = relative.id;
    if (relativeAssociate?.id) payload.relativeAssociateId = relativeAssociate.id;

    const changes: Change[] = [];
    if (!relative) {
      relative = { name, associateId: relativeAssociate?.id ?? null, notes: str(v, "notes") ?? null, line: row.line };
      ctx.relatives.push(relative);
      changes.push({ field: "responsável", before: "", after: `novo${relativeAssociate ? ` (associado ${relativeAssociate.name})` : ""}` });
    } else {
      const others = relative.id ? new Set(ctx.links.filter((l) => l.relativeId === relative!.id && l.associateId !== youth.id).map((l) => l.associateId)).size : 0;
      if (!link && (others > 0 || relative.line)) warnings.push(`responsável já cadastrado com este nome${others ? ` (ligado a ${others} jovem${others > 1 ? "ns" : ""})` : ""}: o mesmo cadastro fica compartilhado`);
      if (str(v, "notes") !== undefined && str(v, "notes") !== (relative.notes ?? undefined)) changes.push({ field: "observação", before: relative.notes ?? "", after: str(v, "notes")! });
      if (relativeAssociate?.id && relativeAssociate.id !== relative.associateId) changes.push({ field: "associado", before: relative.associateId ? ctx.byId.get(relative.associateId)?.name ?? "" : "", after: relativeAssociate.name });
    }
    if (!link) {
      changes.push({ field: "parentesco", before: "", after: [showChoice(KINSHIP_CHOICES, kinship), note].filter(Boolean).join(": ") });
      if (v.legal === true) changes.push({ field: "legal", before: "", after: "sim" });
      if (v.financial === true) changes.push({ field: "financeiro", before: "", after: "sim" });
      plan.rows.push({ line: row.line, action: "nova", label, changes, errors: [], warnings });
      plan.payload.push(payload);
      continue;
    }
    payload.linkId = link.id;
    if (kinship !== link.kinship || (note !== undefined && note !== (link.kinshipNote ?? undefined))) {
      changes.push({ field: "parentesco", before: [showChoice(KINSHIP_CHOICES, link.kinship), link.kinshipNote].filter(Boolean).join(": "), after: [showChoice(KINSHIP_CHOICES, kinship), note ?? (kinship === link.kinship ? link.kinshipNote : null)].filter(Boolean).join(": ") });
    }
    if (typeof v.legal === "boolean" && v.legal !== link.legal) changes.push({ field: "legal", before: yesNo(link.legal), after: yesNo(v.legal) });
    if (typeof v.financial === "boolean" && v.financial !== link.financial) changes.push({ field: "financeiro", before: yesNo(link.financial), after: yesNo(v.financial) });
    const action: RowAction = changes.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label, changes, errors: [], warnings });
    if (action === "atualiza") plan.payload.push(payload);
  }
  return plan;
}

const AUDIENCES = ["jovem", "adulto", "responsavel"] as const;
const AUDIENCE_LABEL: Record<string, string> = { jovem: "jovem", adulto: "adulto", responsavel: "responsável" };
const initialLabel = (value: string | null | undefined) => (value === undefined ? "não" : value === null ? "sim" : showChoice(AUDIENCE_INITIAL_CHOICES, value));

function planItems(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const seen = new Map<string, number>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const name = str(v, "name") ?? "";
    const key = nameKey(name);
    if (seen.has(key)) errors.push(`mesmo item da linha ${seen.get(key)}`);
    const existing = ctx.items.find((item) => nameKey(item.name) === key);
    if (!existing && !str(v, "directorate")) errors.push("diretoria é obrigatória para criar");
    if (!existing && !str(v, "kind")) errors.push("tipo é obrigatório para criar");
    const audiences: Record<string, string | null> = { ...(existing?.audiences ?? {}) };
    for (const audience of AUDIENCES) {
      const value = str(v, audience);
      if (value === undefined) continue;
      if (value === "nao") delete audiences[audience]; else audiences[audience] = value === "sim" ? null : value;
    }
    if (!Object.keys(audiences).length) errors.push("o item precisa valer para jovem, adulto ou responsável");
    if (errors.length) { plan.rows.push(errorRow(row, name, errors)); continue; }
    seen.set(key, row.line);

    const payload: Record<string, unknown> = { line: row.line, ...v, audiences: AUDIENCES.filter((a) => a in audiences).map((a) => ({ audience: a, initial_status: audiences[a] })) };
    if (!existing) {
      const item: ItemRef = {
        name, kind: str(v, "kind")!, directorate: str(v, "directorate")!, valueKind: str(v, "valueKind") ?? "situacao",
        validityMonths: (v.validityMonths as number | undefined) ?? null, removeOnLeave: (v.removeOnLeave as boolean | undefined) ?? false, active: true, audiences,
      };
      ctx.items.push(item);
      const changes: Change[] = [
        { field: "diretoria", before: "", after: showChoice(DIRECTORATE_CHOICES, item.directorate) },
        { field: "tipo", before: "", after: `${showChoice(ITEM_KIND_CHOICES, item.kind)} (${showChoice(VALUE_KIND_CHOICES, item.valueKind)})` },
        { field: "público", before: "", after: Object.keys(audiences).map((a) => `${AUDIENCE_LABEL[a]}: ${initialLabel(audiences[a])}`).join(", ") },
      ];
      plan.rows.push({ line: row.line, action: "nova", label: name, changes, errors: [], warnings: [] });
      plan.payload.push(payload);
      continue;
    }
    if (existing.id) payload.itemId = existing.id;
    const changes: Change[] = [];
    const compare = (field: string, before: string, after: string | undefined) => { if (after !== undefined && after !== before) changes.push({ field, before, after }); };
    compare("diretoria", showChoice(DIRECTORATE_CHOICES, existing.directorate), str(v, "directorate") && showChoice(DIRECTORATE_CHOICES, str(v, "directorate")));
    compare("tipo", showChoice(ITEM_KIND_CHOICES, existing.kind), str(v, "kind") && showChoice(ITEM_KIND_CHOICES, str(v, "kind")));
    compare("valor", showChoice(VALUE_KIND_CHOICES, existing.valueKind), str(v, "valueKind") && showChoice(VALUE_KIND_CHOICES, str(v, "valueKind")));
    compare("validade meses", existing.validityMonths?.toString() ?? "", v.validityMonths?.toString());
    compare("remover no desligamento", yesNo(existing.removeOnLeave), typeof v.removeOnLeave === "boolean" ? yesNo(v.removeOnLeave) : undefined);
    for (const audience of AUDIENCES) compare(AUDIENCE_LABEL[audience]!, initialLabel(existing.audiences[audience]), str(v, audience) !== undefined ? initialLabel(audiences[audience]) : undefined);
    const warnings = existing.active ? [] : ["item desativado: continua desativado (reative em Configurações › Itens)"];
    existing.audiences = audiences;
    if (str(v, "valueKind")) existing.valueKind = str(v, "valueKind")!;
    const action: RowAction = changes.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label: existing.name, changes, errors: [], warnings });
    if (action === "atualiza") plan.payload.push(payload);
  }
  return plan;
}

function showCell(cell: ControlCell | StateStatus | undefined, valueKind: string) {
  if (!cell) return "";
  const parts = [
    valueKind === "ano" && cell.year ? String(cell.year) : "",
    valueKind === "data" && cell.validUntil ? showDate(cell.validUntil) : "",
    cell.status && !((valueKind === "ano" && cell.year) || (valueKind === "data" && cell.validUntil)) ? showChoice(CONTROL_STATUS_CHOICES, cell.status) : "",
    cell.statusDate ? `em ${showDate(cell.statusDate)}` : "",
  ].filter(Boolean);
  return parts.join(" ") + (cell.note ? ` - ${cell.note}` : "");
}

function planControls(file: ReadFile, ctx: PlanContext, batchErrors: string[]): PlannedFile {
  const plan = emptyPlan(file);
  const columns = new Map<string, ItemRef>();
  for (const header of file.dynamicColumns) {
    const item = ctx.items.find((candidate) => nameKey(candidate.name) === nameKey(header));
    if (item) columns.set(header, item);
    else batchErrors.push(`${file.name}: a coluna "${header}" não é item de controle (confira o nome em Configurações › Itens ou cadastre em itens-controle.csv).`);
  }
  for (const item of new Set(columns.values())) if (!item.active) plan.warnings.push(`O item "${item.name}" está desativado: as células dele dão erro.`);
  const seen = new Map<string, number>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const audience = str(v, "audience");
    let target: { associateId?: string; relativeId?: string; person?: PersonRef; relativeName?: string } | undefined;
    let label = str(v, "person") ?? "";
    if (audience === "responsavel") {
      const youthName = str(v, "youth");
      const name = str(v, "person") ?? "";
      let youth: PersonRef | undefined;
      if (youthName) {
        const found = ctx.findPerson(undefined, youthName, v.youthBirth);
        if (found.error) errors.push(`jovem: ${found.error}`); else if (!found.person) errors.push(`jovem "${youthName}" não encontrado`);
        youth = found.person;
      }
      const linked = youth?.id ? new Set(ctx.links.filter((l) => l.associateId === youth!.id).map((l) => l.relativeId)) : undefined;
      const candidates = ctx.relatives.filter((r) => nameKey(r.name) === nameKey(name) && (!linked || (r.id && linked.has(r.id)) || (!r.id && youth && !youth.id)));
      if (candidates.length > 1) errors.push(`há ${candidates.length} responsáveis "${name}": informe o jovem`);
      else if (!candidates.length) errors.push(`responsável "${name}" não encontrado${youthName ? ` entre os de ${youthName}` : ""} (cadastre em responsaveis.csv)`);
      const relative = candidates.length === 1 ? candidates[0] : undefined;
      target = relative ? { relativeId: relative.id, relativeName: relative.name } : undefined;
      label = `${name}${youthName ? ` (responsável de ${youthName})` : ""}`;
      if (relative && !relative.id) target = { relativeName: relative.name };
      if (target && youth && !youth.id) Object.assign(target, { person: youth });
    } else if (audience) {
      const person = citedPerson(ctx, v, errors);
      if (person && (person.branch === "adulto" ? "adulto" : "jovem") !== audience) errors.push(`público ${AUDIENCE_LABEL[audience]}, mas é ${person.branch === "adulto" ? "adulto" : "jovem"}`);
      target = person ? { associateId: person.id, person } : undefined;
      label = person?.name ?? label;
    }
    const key = target ? target.associateId ?? target.relativeId ?? `${target.relativeName}|${target.person?.name}` : "";
    if (key && seen.has(key)) errors.push(`mesma pessoa da linha ${seen.get(key)}`);

    const cells: Record<string, unknown>[] = [];
    const changes: Change[] = [];
    for (const [header, raw] of Object.entries(row.dynamic)) {
      const item = columns.get(header);
      if (!item) continue;
      if (audience && !(audience in item.audiences)) { errors.push(`${item.name}: não se aplica a ${AUDIENCE_LABEL[audience]}`); continue; }
      if (!item.active) { errors.push(`${item.name}: item desativado`); continue; }
      const parsed = parseControlCell(raw, item.valueKind, CONTROL_STATUS_CHOICES);
      if (parsed.error !== undefined) { errors.push(`${item.name}: ${parsed.error}`); continue; }
      const cell: ControlCell = parsed.value;
      if (cell.statusDate && cell.statusDate > ctx.options.today) { errors.push(`${item.name}: data no futuro`); continue; }
      const current = item.id && (target?.associateId || target?.relativeId)
        ? ctx.statuses.find((s) => s.itemId === item.id && (target!.associateId ? s.associateId === target!.associateId : s.relativeId === target!.relativeId))
        : undefined;
      const status = cell.status ?? "ok";
      const same = current && current.status === status
        && (cell.year === undefined || cell.year === current.year)
        && (cell.validUntil === undefined || cell.validUntil === current.validUntil)
        && (cell.statusDate === undefined || cell.statusDate === current.statusDate)
        && (cell.note === undefined || cell.note === current.note);
      if (same) continue;
      changes.push({ field: item.name, before: showCell(current, item.valueKind), after: showCell({ ...cell, status }, item.valueKind) });
      cells.push({ item: item.name, ...(item.id ? { itemId: item.id } : {}), ...cell });
    }
    if (errors.length || !target || !audience) { plan.rows.push(errorRow(row, label, errors)); continue; }
    seen.set(key, row.line);
    const action: RowAction = cells.length ? "atualiza" : "igual";
    plan.rows.push({ line: row.line, action, label, changes, errors: [], warnings: [] });
    if (!cells.length) continue;
    const payload: Record<string, unknown> = { line: row.line, audience, cells };
    if (audience === "responsavel") {
      if (target.relativeId) payload.relativeId = target.relativeId;
      else Object.assign(payload, { relative: target.relativeName, ...(target.person ? { youth: target.person.name, youthBirth: target.person.birth } : {}) });
    } else Object.assign(payload, personPayload(target.person!));
    plan.payload.push(payload);
  }
  return plan;
}

type LifeKind = "periodo" | "exclusao" | "evento" | "estrela" | "anotacao";
const LIFE_LABEL: Record<LifeKind, [string, string]> = {
  periodo: ["período", "períodos"], exclusao: ["exclusão", "exclusões"], evento: ["evento", "eventos"], estrela: ["estrela", "estrelas"], anotacao: ["anotação", "anotações"],
};
const LIFE_KEY: Record<LifeKind, string> = { periodo: "periods", exclusao: "exclusions", evento: "events", estrela: "stars", anotacao: "notes" };

/** Fatos de um tipo, comparáveis (ordem e grafia normalizadas). */
const sameFacts = (a: unknown[], b: unknown[]) => JSON.stringify(a) === JSON.stringify(b);

function planLife(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  type Entry = { person: PersonRef; rows: { row: ReadRow; kind: LifeKind; errors: string[]; label: string; fact: Record<string, unknown> }[] };
  const byPerson = new Map<PersonRef, Entry>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const person = citedPerson(ctx, v, errors);
    const kind = str(v, "kind") as LifeKind | undefined;
    const fact: Record<string, unknown> = {};
    let label = "";
    const start = str(v, "start");
    const end = str(v, "end");
    if (kind === "periodo") {
      const branch = str(v, "branch");
      if (!branch) errors.push("período sem ramo");
      if (!start) errors.push("período sem início");
      if (start && end && end <= start) errors.push("fim antes do início");
      if (start && start > ctx.options.today) errors.push("início no futuro");
      if (end && end > ctx.options.today) errors.push("fim no futuro (deixe vazio enquanto vigente)");
      Object.assign(fact, { branch, started_on: start, ended_on: end ?? null, place: str(v, "place") ?? null });
      label = `${showChoice(BRANCH_CHOICES, branch)} ${showDate(start)} – ${end ? showDate(end) : "vigente"}${str(v, "place") ? ` (${str(v, "place")})` : ""}`;
    } else if (kind === "exclusao") {
      const reason = str(v, "reason");
      if (!start || !end) errors.push("exclusão precisa de início e fim");
      if (!reason) errors.push("exclusão sem motivo");
      if (start && end && end <= start) errors.push("fim antes do início");
      if (reason === "outro" && !str(v, "description")) errors.push("motivo outro: descreva na descrição");
      if (reason === "licenca" && start && end && (Date.parse(end) - Date.parse(start)) / 86400000 <= 60) errors.push("licença só conta acima de 60 dias");
      Object.assign(fact, { started_on: start, ended_on: end, reason, note: str(v, "description") ?? null });
      label = `exclusão ${showDate(start)} – ${showDate(end)}`;
    } else if (kind === "evento") {
      if (!str(v, "date")) errors.push("evento sem data");
      if (!str(v, "title")) errors.push("evento sem título");
      if (str(v, "date") && str(v, "date")! > ctx.options.today) errors.push("data no futuro");
      Object.assign(fact, { date: str(v, "date"), title: str(v, "title"), description: str(v, "description") ?? null });
      label = `${showDate(str(v, "date"))} ${str(v, "title") ?? ""}`;
    } else if (kind === "estrela") {
      if (typeof v.star !== "number") errors.push("informe o número da estrela");
      if (!str(v, "branch") && !str(v, "delivered")) errors.push("estrela sem entrega nem ramo: nada a registrar");
      if (str(v, "delivered") && str(v, "delivered")! > ctx.options.today) errors.push("entrega no futuro");
      Object.assign(fact, { star: v.star, branch: str(v, "branch") ?? null, delivered: str(v, "delivered") ?? null });
      label = `estrela ${v.star ?? "?"}${str(v, "delivered") ? ` entregue em ${showDate(str(v, "delivered"))}` : ""}`;
    } else if (kind === "anotacao") {
      if (!str(v, "description")) errors.push("anotação sem texto (coluna descrição)");
      fact.text = str(v, "description");
      label = `anotação`;
    }
    if (!person || !kind) { plan.rows.push(errorRow(row, str(v, "person") ?? "", errors)); continue; }
    const entry = byPerson.get(person) ?? { person, rows: [] };
    byPerson.set(person, entry);
    entry.rows.push({ row, kind, errors, label: `${person.name} · ${label}`, fact });
  }

  for (const { person, rows } of byPerson.values()) {
    // Sobreposição e vigente único, entre os períodos do arquivo.
    const periods = rows.filter((r) => r.kind === "periodo" && !r.errors.length).sort((a, b) => String(a.fact.started_on).localeCompare(String(b.fact.started_on)));
    for (let i = 1; i < periods.length; i++) {
      const previous = periods[i - 1]!;
      if (!previous.fact.ended_on || String(previous.fact.ended_on) > String(periods[i]!.fact.started_on)) periods[i]!.errors.push(`sobrepõe o período da linha ${previous.row.line}`);
    }
    const exclusions = rows.filter((r) => r.kind === "exclusao" && !r.errors.length).sort((a, b) => String(a.fact.started_on).localeCompare(String(b.fact.started_on)));
    for (let i = 1; i < exclusions.length; i++) {
      if (String(exclusions[i - 1]!.fact.ended_on) > String(exclusions[i]!.fact.started_on)) exclusions[i]!.errors.push(`sobrepõe a exclusão da linha ${exclusions[i - 1]!.row.line}`);
    }
    const stars = new Map<number, number>();
    for (const r of rows.filter((x) => x.kind === "estrela")) {
      const star = r.fact.star as number;
      if (stars.has(star)) r.errors.push(`estrela ${star} repetida (linha ${stars.get(star)})`); else stars.set(star, r.row.line);
    }

    const failed = rows.find((r) => r.errors.length);
    if (failed) {
      for (const r of rows) plan.rows.push(errorRow(r.row, r.label, r.errors.length ? r.errors : [`${person.name} fica de fora: corrija a linha ${failed.row.line}`]));
      continue;
    }

    const current = {
      periodo: person.id ? ctx.state.life.periods.filter((p) => p.associateId === person.id).map((p) => ({ branch: p.branch, started_on: p.started, ended_on: p.ended, place: p.place })) : [],
      exclusao: person.id ? ctx.state.life.exclusions.filter((e) => e.associateId === person.id).map((e) => ({ started_on: e.started, ended_on: e.ended, reason: e.reason, note: e.note })) : [],
      evento: person.id ? ctx.state.life.events.filter((e) => e.associateId === person.id).map((e) => ({ date: e.date, title: e.title, description: e.description })) : [],
      estrela: person.id ? ctx.state.life.stars.filter((s) => s.associateId === person.id).map((s) => ({ star: s.star, branch: s.branch, delivered: s.delivered })) : [],
      anotacao: person.id && ctx.state.life.notes[person.id] ? [{ text: ctx.state.life.notes[person.id] }] : [],
    } satisfies Record<LifeKind, unknown[]>;
    const payload: Record<string, unknown> = { line: rows[0]!.row.line, ...personPayload(person) };
    for (const kind of Object.keys(LIFE_LABEL) as LifeKind[]) {
      const ofKind = rows.filter((r) => r.kind === kind);
      if (!ofKind.length) continue;
      const sortKey = (fact: Record<string, unknown>) => String(fact.started_on ?? fact.date ?? fact.star ?? "").padStart(3, "0");
      const facts = kind === "anotacao"
        ? [{ text: ofKind.map((r) => r.fact.text).join("\n") }]
        : ofKind.map((r) => r.fact).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      const before = [...current[kind]].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      const same = sameFacts(facts, before);
      const replaced = current[kind].length;
      const [one, many] = LIFE_LABEL[kind];
      ofKind.forEach((r, index) => {
        const warnings = !same && index === 0 && replaced > 0 ? [`substitui ${replaced} ${replaced === 1 ? one : many} de ${person.name} no app`] : [];
        plan.rows.push({ line: r.row.line, action: same ? "igual" : replaced ? "atualiza" : "nova", label: r.label, changes: [], errors: [], warnings });
      });
      if (!same) payload[LIFE_KEY[kind]] = kind === "anotacao" ? (facts[0] as { text: string }).text : facts;
    }
    if (Object.keys(payload).some((key) => Object.values(LIFE_KEY).includes(key))) plan.payload.push(payload);
  }
  plan.rows.sort((a, b) => a.line - b.line);
  return plan;
}

/** Caminho de divisão: partes separadas por `›` ou `>`, sem espaços sobrando. */
export function locationPath(text: string): string[] {
  return text.split(/\s*[›>]\s*/).map((part) => part.trim()).filter(Boolean);
}

const INVENTORY_REPLACE = (ctx: PlanContext) => {
  const inv = ctx.state.inventory;
  return inv.materials || inv.locations
    ? [`Substitui o inventário atual (${inv.locations} divisões, ${inv.materials} materiais, ${inv.lots} lotes, ${inv.units} peças): o que não estiver nos arquivos some.`]
    : [];
};

type MaterialAttrs = { name: string; familyCode?: string; family?: string; consumable?: boolean; minimum?: number; description?: string; line: number };

function planInventoryLots(file: ReadFile, ctx: PlanContext, batchErrors: string[]): PlannedFile {
  const plan = emptyPlan(file);
  if (ctx.state.inventory.appMovements) {
    batchErrors.push(`${file.name}: o inventário já tem ${ctx.state.inventory.appMovements} registros feitos no app; a carga por CSV só substitui um inventário vazio ou carregado por CSV.`);
  }
  plan.warnings.push(...INVENTORY_REPLACE(ctx));
  const years = file.dynamicColumns.map((header) => [header, countYear(header)] as const);
  for (const [header, year] of years) if (!year || year < 2000 || year > 2100) batchErrors.push(`${file.name}: coluna "${header}" com ano inválido.`);

  // Atributos do material: iguais em todas as linhas dele.
  const materials = new Map<string, MaterialAttrs>();
  const families = new Map<string, { code?: string; name: string; line: number }>();
  const conflicts = new Map<number, string[]>();
  const conflict = (line: number, message: string) => conflicts.set(line, [...(conflicts.get(line) ?? []), message]);
  for (const row of file.rows) {
    const v = row.values;
    const name = str(v, "material");
    if (!name) continue;
    const key = nameKey(name);
    const current = materials.get(key) ?? { name, line: row.line };
    materials.set(key, current);
    for (const field of ["familyCode", "family", "consumable", "minimum", "materialDescription"] as const) {
      const value = v[field];
      if (value === undefined) continue;
      const target = field === "materialDescription" ? "description" : field;
      const before = current[target as keyof MaterialAttrs];
      if (before === undefined) Object.assign(current, { [target]: value });
      else if (before !== value && !(typeof before === "string" && typeof value === "string" && nameKey(before) === nameKey(value))) {
        conflict(row.line, `${name}: ${field === "materialDescription" ? "descrição" : field === "familyCode" ? "código da família" : field === "family" ? "família" : field === "consumable" ? "consumível" : "mínimo"} diferente da linha ${current.line}`);
      }
    }
    const familyName = str(v, "family");
    const code = str(v, "familyCode");
    if (code && !/^\d{3}$/.test(code)) conflict(row.line, `código da família "${code}" deve ter 3 dígitos`);
    if (code && !familyName) conflict(row.line, "código da família sem o nome da família");
    if (familyName) {
      const fam = families.get(nameKey(familyName));
      if (!fam) families.set(nameKey(familyName), { code, name: familyName, line: row.line });
      else if (code && fam.code && fam.code !== code) conflict(row.line, `família ${familyName} com código diferente da linha ${fam.line}`);
      else if (code && !fam.code) fam.code = code;
      if (code) for (const other of families.values()) if (other !== fam && other.code === code && nameKey(other.name) !== nameKey(familyName)) conflict(row.line, `código ${code} já é da família ${other.name}`);
    }
  }

  const locations = new Set<string>();
  const counts = new Map<string, { line: number; counts: Record<string, number> }>();
  const lotKeys = new Map<string, number>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors, ...(conflicts.get(row.line) ?? [])];
    const warnings: string[] = [];
    const material = str(v, "material") ?? "";
    const attrs = materials.get(nameKey(material));
    const path = locationPath(str(v, "location") ?? "");
    if (!path.length) errors.push("divisão vazia");
    if (path.some((part) => part.length > 80)) errors.push("parte da divisão com mais de 80 caracteres");
    const rowCounts: Record<string, number> = {};
    for (const [header, raw] of Object.entries(row.dynamic)) {
      const year = countYear(header);
      if (!year) continue;
      const quantity = Number(raw.replace(/\./g, ""));
      if (!/^\d+$/.test(raw.replace(/\./g, "")) || quantity > 1_000_000) errors.push(`${header}: "${raw}" não é quantidade`);
      else rowCounts[year] = quantity;
    }
    let quantity = v.quantity as number | undefined;
    const latest = Object.keys(rowCounts).sort().at(-1);
    if (quantity === undefined && latest) quantity = rowCounts[latest];
    if (quantity === undefined) errors.push("informe a quantidade ou uma contagem");
    const label = `${material} · ${path.join(" › ")}`;
    if (errors.length || !attrs) { plan.rows.push(errorRow(row, label, errors)); continue; }

    const pathText = path.join(" › ");
    for (let i = 1; i <= path.length; i++) locations.add(path.slice(0, i).map(nameKey).join("›"));
    ctx.inventoryMaterials.set(nameKey(material), { name: attrs.name, tracking: "lot", line: attrs.line });
    const lotKey = [nameKey(material), path.map(nameKey).join("›"), str(v, "condition") ?? "", str(v, "expires") ?? "", nameKey(str(v, "variant") ?? "")].join("|");
    if (quantity && lotKeys.has(lotKey)) warnings.push(`mesmo lote da linha ${lotKeys.get(lotKey)}: as quantidades somam`);
    else if (quantity) lotKeys.set(lotKey, row.line);
    const countKey = `${nameKey(material)}|${path.map(nameKey).join("›")}`;
    const counted = counts.get(countKey);
    if (counted) for (const [year, value] of Object.entries(rowCounts)) counted.counts[year] = (counted.counts[year] ?? 0) + value;
    else counts.set(countKey, { line: row.line, counts: { ...rowCounts } });

    const changes: Change[] = [
      { field: "quantidade", before: "", after: String(quantity) + (str(v, "condition") ? ` (${showChoice(CONDITION_CHOICES, str(v, "condition"))})` : "") },
      ...(Object.keys(rowCounts).length ? [{ field: "contagens", before: "", after: Object.entries(rowCounts).map(([year, value]) => `${year}: ${value}`).join(", ") }] : []),
    ];
    if (!quantity) warnings.push("quantidade 0: não vira lote, só registra as contagens");
    plan.rows.push({ line: row.line, action: "nova", label, changes, errors: [], warnings });
    const familyCode = attrs.familyCode ?? (attrs.family ? families.get(nameKey(attrs.family))?.code : undefined);
    plan.payload.push({
      line: row.line, location: pathText, material: attrs.name, ...(attrs.family ? { family: attrs.family } : {}), ...(familyCode ? { familyCode } : {}),
      consumable: attrs.consumable ?? false, ...(attrs.minimum !== undefined ? { minimum: attrs.minimum } : {}), ...(attrs.description ? { materialDescription: attrs.description } : {}),
      quantity, ...(str(v, "condition") ? { condition: str(v, "condition") } : {}), ...(str(v, "expires") ? { expires: str(v, "expires") } : {}),
      ...(v.unitValue !== undefined ? { unitValue: v.unitValue } : {}), ...(str(v, "variant") ? { variant: str(v, "variant") } : {}), ...(str(v, "notes") ? { notes: str(v, "notes") } : {}),
    });
  }
  // As contagens vão somadas por material e divisão, na primeira linha de cada par.
  for (const { line, counts: byYear } of counts.values()) {
    const row = plan.payload.find((entry) => entry.line === line);
    if (row && Object.keys(byYear).length) row.counts = byYear;
  }
  if (plan.payload.length) plan.creations.push(`${locations.size} divisões, ${families.size} famílias e ${materials.size} materiais (a carga cria tudo de novo)`);
  return plan;
}

function planInventoryUnits(file: ReadFile, ctx: PlanContext, batchErrors: string[]): PlannedFile {
  const plan = emptyPlan(file);
  if (!ctx.inventoryMaterials.size && !ctx.state.inventory.appMovements) {
    batchErrors.push(`${file.name}: envie junto com inventario-lotes.csv (a carga substitui o inventário inteiro).`);
  }
  const tags = new Map<string, number>();
  const unitMaterials = new Map<string, { family?: string; line: number }>();
  for (const row of file.rows) {
    const v = row.values;
    const errors = [...row.errors];
    const tag = str(v, "tag");
    const material = str(v, "material") ?? "";
    const path = locationPath(str(v, "location") ?? "");
    if (tag && !/^GEAS-\d{3}-\d{4}$/.test(tag)) errors.push(`etiqueta "${tag}" fora do formato GEAS-000-0000`);
    if (tag && tags.has(tag)) errors.push(`etiqueta repetida (linha ${tags.get(tag)})`);
    if (tag && str(v, "familyCode") && tag.slice(5, 8) !== str(v, "familyCode")) errors.push(`a etiqueta ${tag} não é da família ${str(v, "familyCode")}`);
    const lots = ctx.inventoryMaterials.get(nameKey(material));
    if (lots?.tracking === "lot") errors.push(`${material} já é material por quantidade (inventario-lotes.csv, linha ${lots.line})`);
    const previous = unitMaterials.get(nameKey(material));
    if (previous && str(v, "family") && previous.family && nameKey(previous.family) !== nameKey(str(v, "family")!)) errors.push(`família diferente da linha ${previous.line}`);
    if (!path.length) errors.push("divisão vazia");
    const label = `${tag ?? str(v, "legacyCode") ?? "sem etiqueta"} · ${material}`;
    if (errors.length) { plan.rows.push(errorRow(row, label, errors)); continue; }
    if (tag) tags.set(tag, row.line);
    if (!previous) unitMaterials.set(nameKey(material), { family: str(v, "family"), line: row.line });
    plan.rows.push({ line: row.line, action: "nova", label, changes: [{ field: "divisão", before: "", after: path.join(" › ") }], errors: [], warnings: [] });
    plan.payload.push({ line: row.line, ...v, location: path.join(" › ") });
  }
  return plan;
}

// Financeiro: lançamentos -----------------------------------------------------------------------------------------

/** Rubrica pelo texto da planilha: código (`1.1`, `1.1.`, `1.1. Mensalidades`) ou nome único. */
export function findCategory(categories: StateCategory[], text: string): { category?: StateCategory; error?: string; warning?: string } {
  const match = text.trim().match(/^(\d+(?:\.\d+)*)\.?(?:\s+(.+))?$/);
  if (match) {
    const category = categories.find((c) => c.code === match[1]);
    if (!category) return { error: `rubrica ${match[1]} não existe no app` };
    const warning = match[2] && nameKey(match[2]) !== nameKey(category.name) ? `rubrica ${match[1]}: no app o nome é "${category.name}"` : undefined;
    return { category, ...(warning ? { warning } : {}) };
  }
  const found = categories.filter((c) => nameKey(c.name) === nameKey(text));
  if (found.length === 1) return { category: found[0] };
  if (found.length > 1) return { error: `há ${found.length} rubricas "${text}" (${found.map((c) => c.code).join(", ")}): use o código` };
  return { error: `rubrica "${text}" não existe no app` };
}

const entrySignature = (date: string, account: string, name: string, total: number) => [date, nameKey(account), nameKey(name), total].join("|");
const money = (cents: number) => `${cents < 0 ? "-" : ""}R$ ${(Math.abs(cents) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/**
 * lancamentos.csv: um rateio por linha; `lançamento` junta linhas num lançamento. Identifica pelo `id` ou pela
 * assinatura data + conta + histórico + total (iguais no mesmo dia contam um a um: o 2º PIX de R$ 30 igual só é
 * "igual" se o app já tiver dois). Contas e formas que faltam são criadas; nada existente muda.
 */
function planLedgerEntries(file: ReadFile, ctx: PlanContext): PlannedFile {
  const plan = emptyPlan(file);
  const finance = ctx.state.finance;
  const byId = new Map(finance.entries.map((entry) => [entry.id, entry]));
  const remaining = new Map<string, number>();
  for (const entry of finance.entries) {
    const key = entrySignature(entry.date, entry.account, entry.name, entry.total);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const accounts = new Map(finance.accounts.map((a) => [nameKey(a.name), a.name]));
  const methods = new Map(finance.paymentMethods.map((m) => [nameKey(m.name), m.name]));

  // Linhas do mesmo `lançamento` juntas, na ordem da primeira.
  const groups = new Map<string, ReadRow[]>();
  for (const row of file.rows) {
    const key = str(row.values, "group") ? `g:${nameKey(str(row.values, "group")!)}` : `l:${row.line}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  for (const rows of groups.values()) {
    const first = rows[0]!;
    const v = first.values;
    const errors = rows.flatMap((row) => row.errors.map((error) => (rows.length > 1 ? `linha ${row.line}: ${error}` : error)));
    const warnings: string[] = [];
    const date = str(v, "date") ?? "";
    const account = str(v, "account");
    const method = str(v, "paymentMethod");
    for (const row of rows.slice(1)) {
      for (const [key, label] of [["date", "data"], ["account", "conta"], ["paymentMethod", "forma de pagamento"]] as const) {
        const other = str(row.values, key);
        if (other && nameKey(other) !== nameKey(str(v, key) ?? "")) errors.push(`linha ${row.line}: ${label} diferente da linha ${first.line} (o lançamento é um só)`);
      }
    }
    if (date && date > ctx.options.today) errors.push("data no futuro");

    const notes: string[] = str(v, "notes") ? [str(v, "notes")!] : [];
    const splits: { category_id: string; amount_cents: number; description: string; associate?: string }[] = [];
    for (const row of rows) {
      const r = row.values;
      const text = str(r, "category");
      const amount = r.amount as number | undefined;
      if (!text || amount === undefined) continue;
      const found = findCategory(finance.categories, text);
      if (found.error || !found.category) { errors.push(rows.length > 1 ? `linha ${row.line}: ${found.error}` : found.error!); continue; }
      if (found.warning) warnings.push(found.warning);
      const category = found.category;
      if (!category.active) errors.push(`rubrica ${category.code} ${category.name} está inativa`);
      if (!category.kind) { errors.push(`rubrica ${category.code} ${category.name} não é de receita nem de despesa`); continue; }
      if (amount === 0) { errors.push("valor zero"); continue; }
      const signed = category.kind === "despesa" ? -amount : amount;
      const description = str(r, "description") ?? str(r, "name") ?? str(v, "name") ?? category.name;
      const associateName = str(r, "associate");
      let associate: string | undefined;
      if (associateName) {
        const person = ctx.findPerson(undefined, associateName, undefined);
        if (person.person) associate = person.person.name;
        else {
          warnings.push(`associado "${associateName}" ${person.error ? "ambíguo" : "não encontrado"}: o nome vai para a observação`);
          notes.push(`Associado na planilha: ${associateName}`);
        }
      }
      splits.push({ category_id: category.id, amount_cents: signed, description: description.slice(0, 200), ...(associate ? { associate } : {}) });
    }
    const name = (str(v, "name") ?? str(v, "description") ?? splits[0]?.description ?? "").slice(0, 200);
    const total = splits.reduce((sum, split) => sum + split.amount_cents, 0);
    const label = `${showDate(date)} · ${name || "sem histórico"} · ${money(total)}${rows.length > 1 ? ` (${rows.length} rateios)` : ""}`;
    if (!errors.length && splits.length && total === 0) errors.push("o total do lançamento é zero");

    const id = str(v, "id");
    if (id) {
      if (!byId.has(id)) errors.push(`id ${id} não encontrado no app`);
      if (errors.length) { plan.rows.push(errorRow(first, label, errors)); continue; }
      plan.rows.push({ line: first.line, action: "igual", label, changes: [], errors: [], warnings });
      continue;
    }
    if (!account) errors.push("conta é obrigatória para criar o lançamento");
    if (!method) errors.push("forma de pagamento é obrigatória para criar o lançamento");
    if (account && finance.accounts.some((a) => !a.active && nameKey(a.name) === nameKey(account))) errors.push(`a conta ${account} está inativa`);
    if (method && finance.paymentMethods.some((m) => !m.active && nameKey(m.name) === nameKey(method))) errors.push(`a forma de pagamento ${method} está inativa`);
    if (errors.length || !splits.length || !account || !method) { plan.rows.push(errorRow(first, label, errors)); continue; }

    const signature = entrySignature(date, accounts.get(nameKey(account)) ?? account, name, total);
    const left = remaining.get(signature) ?? 0;
    if (left > 0) {
      remaining.set(signature, left - 1);
      plan.rows.push({ line: first.line, action: "igual", label, changes: [], errors: [], warnings });
      continue;
    }
    if (!accounts.has(nameKey(account))) { accounts.set(nameKey(account), account); plan.creations.push(`Nova conta "${account}"`); }
    if (!methods.has(nameKey(method))) { methods.set(nameKey(method), method); plan.creations.push(`Nova forma de pagamento "${method}"`); }
    const changes: Change[] = splits.map((split) => {
      const category = finance.categories.find((c) => c.id === split.category_id)!;
      return { field: "rateio", before: "", after: `${category.code} ${category.name} · ${money(split.amount_cents)} · ${split.description}${split.associate ? ` · ${split.associate}` : ""}` };
    });
    plan.rows.push({ line: first.line, action: "nova", label, changes, errors: [], warnings });
    plan.payload.push({
      line: first.line, date, name, account: accounts.get(nameKey(account)), payment_method: methods.get(nameKey(method)),
      ...(str(v, "document") ? { document: str(v, "document") } : {}), filed: v.filed === true,
      ...(notes.length ? { notes: notes.join("\n").slice(0, 2000) } : {}), total_cents: total, splits,
    });
  }
  return plan;
}

const PLANNERS: Partial<Record<FileKind, Planner>> = {
  lancamentos: planLedgerEntries,
  "inventario-lotes": planInventoryLots,
  "inventario-pecas": planInventoryUnits,
  "vida-escoteira": planLife,
  "itens-controle": planItems,
  controle: planControls,
  secoes: planSections,
  pessoas: planPeople,
  funcoes: planFunctions,
  responsaveis: planRelatives,
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
    planned.push(planner(file, ctx, errors));
  }
  return { files: planned, errors };
}

export function planTotals(file: PlannedFile) {
  const totals: Record<RowAction, number> = { nova: 0, atualiza: 0, igual: 0, erro: 0 };
  for (const row of file.rows) totals[row.action] += 1;
  return totals;
}
