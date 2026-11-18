import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { AppHeader } from "@/components/activities/app-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as venues from "@/lib/server/activities/venues";
import { pageSession } from "@/lib/server/session";

const HEAD = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const CELL = "px-3 py-2";

export default async function VenuesPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const rows = await venues.list(member.db, member.groupId);

  return <div className="shell">
    <AppHeader current="/atividades/locais" email={user.email} role={member.activities.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Locais"
        description="Locais usados nas autorizações. Cadastro e edição chegam na próxima entrega." />
      <SectionCard>
        <SectionHeader title="Locais cadastrados">
          <SectionCount>{rows.length} {rows.length === 1 ? "local" : "locais"}</SectionCount>
        </SectionHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">Locais de atividades</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Nome</TableHead>
                <TableHead className={HEAD}>Responsável</TableHead>
                <TableHead className={HEAD}>Telefone</TableHead>
                <TableHead className={HEAD}>Endereço</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0
                ? <TableRow><TableCell className={CELL} colSpan={4}>
                  <span className="text-sm text-muted-foreground">Nenhum local cadastrado ainda.</span>
                </TableCell></TableRow>
                : rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className={CELL}><span className="font-medium">{row.name}</span></TableCell>
                    <TableCell className={CELL}>{row.owner_name ?? ""}</TableCell>
                    <TableCell className={CELL}>{row.phone ?? ""}</TableCell>
                    <TableCell className={CELL}>{row.address ?? ""}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </PageBody>
  </div>;
}
