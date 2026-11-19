import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { AppHeader } from "@/components/activities/app-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ACTIVITY_BASE_CATEGORY_LABELS } from "@/lib/activities/vocabulary";
import * as base from "@/lib/server/activities/base";
import { pageSession } from "@/lib/server/session";

const HEAD = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const CELL = "px-3 py-2";

export default async function BasePage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const rows = await base.list(member.db, member.groupId);

  return <div className="shell">
    <AppHeader current="/atividades/base" email={user.email} role={member.activities.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Base"
        description="Biblioteca de jogos, cerimônias e rotinas para montar o cronograma. Cadastro completo na próxima fase." />
      <SectionCard>
        <SectionHeader title="Itens da base">
          <SectionCount>{rows.length} {rows.length === 1 ? "item" : "itens"}</SectionCount>
        </SectionHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">Base de atividades</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Nome</TableHead>
                <TableHead className={HEAD}>Categoria</TableHead>
                <TableHead className={HEAD}>Duração</TableHead>
                <TableHead className={HEAD}>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0
                ? <TableRow><TableCell className={CELL} colSpan={4}>
                  <span className="text-sm text-muted-foreground">Nenhum item na base ainda.</span>
                </TableCell></TableRow>
                : rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className={CELL}><span className="font-medium">{row.name}</span></TableCell>
                    <TableCell className={CELL}>{row.category ? ACTIVITY_BASE_CATEGORY_LABELS[row.category] : ""}</TableCell>
                    <TableCell className={CELL}>{row.duration_minutes != null ? `${row.duration_minutes} min` : ""}</TableCell>
                    <TableCell className={CELL}>
                      <span className="line-clamp-2 text-sm text-muted-foreground">{row.description ?? ""}</span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </PageBody>
  </div>;
}
