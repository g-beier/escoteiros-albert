-- Anexos de comprovantes (PDF, JPG, PNG, HEIC) por lançamento, num bucket privado do Storage.
-- Complementa `document_filed` (pasta física: Pendente/Arquivado), sem mudar seu sentido.
--
-- Caminho do arquivo: <group_id>/<entry_id>/<uuid>.<ext>. As políticas do Storage usam o
-- primeiro segmento (grupo) e o segundo (lançamento). O app envia o arquivo direto ao Storage
-- com uma URL de envio assinada e depois registra os metadados em `add_entry_attachment`, que
-- confere o objeto em `storage.objects` (tamanho e tipo vêm do Storage, não do navegador).
-- Remover o objeto do Storage é tarefa do app (a API do Storage; o banco não apaga
-- `storage.objects` diretamente): ao excluir o anexo ou o lançamento, o app chama `remove`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.entry_attachments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index entry_attachments_entry_idx on public.entry_attachments(entry_id);
create index entry_attachments_group_idx on public.entry_attachments(group_id);

alter table public.entry_attachments enable row level security;
create policy "members read entry attachments" on public.entry_attachments for select using (public.is_group_member(group_id));
-- Sem políticas de escrita: só as funções abaixo gravam.

-- Grupo e lançamento de um caminho do bucket (null se o formato não bater).
create or replace function public.attachment_path_entry(p_name text, out group_id uuid, out entry_id uuid)
language sql immutable set search_path = '' as $$
  select (m)[1]::uuid, (m)[2]::uuid
  from (select regexp_match(p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f-]{36}\.(pdf|jpg|png|heic|heif)$') as m) x;
$$;

-- Ler: membros do grupo. Enviar: tesouraria/administração, e só para um lançamento do grupo.
create or replace function public.can_read_attachment_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_group_member((public.attachment_path_entry(p_name)).group_id), false);
$$;

create or replace function public.can_write_attachment_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ledger_entries e
    where e.id = (public.attachment_path_entry(p_name)).entry_id
      and e.group_id = (public.attachment_path_entry(p_name)).group_id
      and public.can_edit_group(e.group_id));
$$;

-- Apagar: tesouraria/administração do grupo do caminho (o lançamento pode já ter sido excluído).
create or replace function public.can_delete_attachment_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.can_edit_group((public.attachment_path_entry(p_name)).group_id), false);
$$;

revoke all on function public.can_read_attachment_object(text) from public;
revoke all on function public.can_write_attachment_object(text) from public;
revoke all on function public.can_delete_attachment_object(text) from public;
grant execute on function public.can_read_attachment_object(text) to authenticated;
grant execute on function public.can_write_attachment_object(text) to authenticated;
grant execute on function public.can_delete_attachment_object(text) to authenticated;

create policy "comprovantes: membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.can_read_attachment_object(name));
create policy "comprovantes: tesouraria envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.can_write_attachment_object(name));
create policy "comprovantes: tesouraria apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and public.can_delete_attachment_object(name));
-- Sem política de update: um comprovante não é sobrescrito, é excluído e enviado de novo.

-- Registra um arquivo já enviado ao bucket. Tamanho e tipo vêm de storage.objects.
create or replace function public.add_entry_attachment(p_entry_id uuid, p_storage_path text, p_file_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  entry_group uuid;
  path_parts record;
  object_meta jsonb;
  object_type text;
  object_size bigint;
  clean_name text := btrim(coalesce(p_file_name, ''));
  new_id uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  select * into path_parts from public.attachment_path_entry(p_storage_path);
  if path_parts.group_id is distinct from entry_group or path_parts.entry_id is distinct from p_entry_id then
    raise exception 'Caminho do anexo inválido';
  end if;
  if clean_name = '' then raise exception 'Informe o nome do arquivo'; end if;
  clean_name := left(clean_name, 200);

  select metadata into object_meta from storage.objects where bucket_id = 'comprovantes' and name = p_storage_path;
  if not found then raise exception 'Arquivo não encontrado no armazenamento'; end if;
  object_type := lower(coalesce(object_meta->>'mimetype', ''));
  object_size := coalesce((object_meta->>'size')::bigint, (object_meta->>'contentLength')::bigint, 0);
  if object_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    raise exception 'Tipo de arquivo não aceito: envie PDF, JPG, PNG ou HEIC';
  end if;
  if object_size < 1 or object_size > 10485760 then raise exception 'O arquivo deve ter até 10 MB'; end if;

  insert into public.entry_attachments(group_id, entry_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
  values (entry_group, p_entry_id, p_storage_path, clean_name, object_type, object_size, auth.uid())
  returning id into new_id;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.attachment_added', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('attachment_id', new_id, 'file_name', clean_name, 'content_type', object_type,
      'size_bytes', object_size, 'storage_path', p_storage_path));
  return new_id;
end;
$$;

-- Remove o registro e devolve o caminho, para o app apagar o objeto no Storage.
create or replace function public.delete_entry_attachment(p_attachment_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare attachment public.entry_attachments;
begin
  select * into attachment from public.entry_attachments where id = p_attachment_id for update;
  if attachment.id is null or not public.can_edit_group(attachment.group_id) then raise exception 'Anexo não encontrado ou sem permissão'; end if;
  delete from public.entry_attachments where id = p_attachment_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (attachment.group_id, auth.uid(), 'ledger_entry.attachment_removed', 'ledger_entry', attachment.entry_id::text,
    jsonb_build_object('attachment_id', attachment.id, 'file_name', attachment.file_name, 'content_type', attachment.content_type,
      'size_bytes', attachment.size_bytes, 'storage_path', attachment.storage_path));
  return attachment.storage_path;
end;
$$;

revoke all on function public.add_entry_attachment(uuid, text, text) from public;
revoke all on function public.delete_entry_attachment(uuid) from public;
grant execute on function public.add_entry_attachment(uuid, text, text) to authenticated;
grant execute on function public.delete_entry_attachment(uuid) to authenticated;
