-- CSI Mobility & Executive Transport
-- Cole este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- Projeto: mgapgvrufgasezfmmzet

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists company text;
alter table public.profiles add column if not exists document_type text;
alter table public.profiles add column if not exists document_id text;
alter table public.profiles add column if not exists document_name text;
alter table public.profiles add column if not exists document_photo text;
alter table public.profiles add column if not exists kyc_status text default 'pending';
alter table public.profiles add column if not exists face_verified boolean default false;
alter table public.profiles add column if not exists face_photo text;
alter table public.profiles add column if not exists approval_status text default 'pending';
alter table public.profiles add column if not exists status_aprovacao text default 'pendente';
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists pin_set boolean default false;
alter table public.profiles add column if not exists duress_pin text default '0000';
alter table public.profiles add column if not exists panic_pin text default '9110';
alter table public.profiles add column if not exists vehicle_type text;
alter table public.profiles add column if not exists vehicle_plate text;
alter table public.profiles add column if not exists work_password_hint text;
alter table public.profiles add column if not exists base_state text;
alter table public.profiles add column if not exists base_city text;

alter table public.driver_status add column if not exists vehicle_type text;
alter table public.driver_status add column if not exists vehicle_plate text;
alter table public.driver_status add column if not exists panic_active boolean default false;
alter table public.driver_status add column if not exists duress_mode boolean default false;
alter table public.driver_status add column if not exists last_seen_at timestamptz default now();
alter table public.driver_status add column if not exists last_checkin_at timestamptz;

create unique index if not exists driver_status_driver_id_key on public.driver_status (driver_id);

alter table public.service_requests add column if not exists dropoff_location text;
alter table public.service_requests add column if not exists vehicle_type text;
alter table public.service_requests add column if not exists requester_name text;
alter table public.service_requests add column if not exists phone text;
alter table public.service_requests add column if not exists email text;
alter table public.service_requests add column if not exists company text;
alter table public.service_requests add column if not exists scheduled_at timestamptz;
alter table public.service_requests add column if not exists passengers integer default 1;
alter table public.service_requests add column if not exists notes text;
alter table public.service_requests add column if not exists distance_km numeric;
alter table public.service_requests add column if not exists duration_hours numeric;
alter table public.service_requests add column if not exists is_first_request boolean default false;
alter table public.service_requests add column if not exists attire text;
alter table public.service_requests add column if not exists security_profile text;
alter table public.service_requests add column if not exists origin_state text;
alter table public.service_requests add column if not exists origin_city text;
alter table public.service_requests add column if not exists dest_state text;
alter table public.service_requests add column if not exists dest_city text;
alter table public.service_requests add column if not exists client_own_vehicle boolean default false;
alter table public.service_requests add column if not exists preferred_driver_id uuid;
alter table public.service_requests add column if not exists preferred_driver_name text;
alter table public.service_requests add column if not exists driver_id uuid;
alter table public.service_requests add column if not exists assigned_driver_name text;
alter table public.service_requests add column if not exists assigned_driver_cpf text;
alter table public.service_requests add column if not exists assigned_driver_vehicle text;
alter table public.service_requests add column if not exists assigned_driver_plate text;
alter table public.service_requests add column if not exists assigned_driver_praca text;
alter table public.service_requests add column if not exists rating integer;
alter table public.service_requests add column if not exists rating_feedback text;
alter table public.service_requests add column if not exists contract_text text;
alter table public.service_requests add column if not exists deposit_amount numeric;
alter table public.service_requests add column if not exists pix_payload text;
alter table public.service_requests add column if not exists pix_receipt text;
alter table public.service_requests add column if not exists pix_receipt_name text;
alter table public.service_requests add column if not exists signed_contract text;
alter table public.service_requests add column if not exists signed_contract_name text;

do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and (
        c.conrelid = 'public.driver_status'::regclass
        or (
          c.conrelid = 'public.service_requests'::regclass
          and a.attname in ('client_id', 'driver_id', 'preferred_driver_id')
        )
      )
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

do $$
begin
  alter table public.driver_status drop constraint if exists driver_status_driver_id_fkey;
  begin
    alter table public.driver_status
      add constraint driver_status_driver_id_fkey
      foreign key (driver_id) references public.profiles(id) on delete cascade;
  exception when others then null;
  end;

  alter table public.service_requests drop constraint if exists service_requests_client_id_fkey;
  begin
    alter table public.service_requests
      add constraint service_requests_client_id_fkey
      foreign key (client_id) references public.profiles(id) on delete cascade;
  exception when others then null;
  end;

  alter table public.service_requests drop constraint if exists service_requests_driver_id_fkey;
  begin
    alter table public.service_requests
      add constraint service_requests_driver_id_fkey
      foreign key (driver_id) references public.profiles(id) on delete set null;
  exception when others then null;
  end;

  alter table public.service_requests drop constraint if exists service_requests_preferred_driver_id_fkey;
  begin
    alter table public.service_requests
      add constraint service_requests_preferred_driver_id_fkey
      foreign key (preferred_driver_id) references public.profiles(id) on delete set null;
  exception when others then null;
  end;
end $$;

create index if not exists service_requests_client_id_idx on public.service_requests (client_id);
create index if not exists service_requests_email_idx on public.service_requests (email);
create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_role_idx on public.profiles (role);

create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

insert into public.system_settings (key, value) values
  ('hourly_unarmed', '180'),
  ('hourly_armed', '350'),
  ('pix_key', '00.000.000/0001-00'),
  ('pix_name', 'CSI MOBILITY'),
  ('pix_city', 'GOIANIA')
on conflict (key) do nothing;

do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.profiles'::regclass,
        'public.driver_status'::regclass,
        'public.service_requests'::regclass
      )
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.driver_status enable row level security;
alter table public.service_requests enable row level security;
alter table public.system_settings enable row level security;

-- Isolamento: cliente autenticado só lê/grava as próprias missões (auth.uid / e-mail do JWT).
-- Motorista autenticado lê missões atribuídas a ele.
-- O painel admin autentica por PIN local e opera com a chave anon.
drop policy if exists csi_profiles_all on public.profiles;
drop policy if exists csi_profiles_anon on public.profiles;
drop policy if exists csi_profiles_select_auth on public.profiles;
drop policy if exists csi_profiles_write_own on public.profiles;
create policy csi_profiles_anon on public.profiles for all to anon using (true) with check (true);
create policy csi_profiles_select_auth on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (role = 'driver' and coalesce(approval_status, '') in ('approved', 'aprovado'))
  );
create policy csi_profiles_write_own on public.profiles
  for all to authenticated
  using (
    id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists csi_drivers_all on public.driver_status;
drop policy if exists csi_drivers_anon on public.driver_status;
drop policy if exists csi_drivers_select_auth on public.driver_status;
drop policy if exists csi_drivers_write_own on public.driver_status;
create policy csi_drivers_anon on public.driver_status for all to anon using (true) with check (true);
create policy csi_drivers_select_auth on public.driver_status for select to authenticated using (true);
create policy csi_drivers_write_own on public.driver_status
  for all to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists csi_requests_all on public.service_requests;
drop policy if exists csi_requests_anon on public.service_requests;
drop policy if exists csi_requests_select_auth on public.service_requests;
drop policy if exists csi_requests_insert_auth on public.service_requests;
drop policy if exists csi_requests_update_auth on public.service_requests;
create policy csi_requests_anon on public.service_requests for all to anon using (true) with check (true);
create policy csi_requests_select_auth on public.service_requests
  for select to authenticated
  using (
    client_id = auth.uid()
    or driver_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy csi_requests_insert_auth on public.service_requests
  for insert to authenticated
  with check (
    client_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy csi_requests_update_auth on public.service_requests
  for update to authenticated
  using (
    client_id = auth.uid()
    or driver_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists csi_settings_all on public.system_settings;
drop policy if exists csi_settings_read on public.system_settings;
drop policy if exists csi_settings_write on public.system_settings;
create policy csi_settings_read on public.system_settings for select to anon, authenticated using (true);
create policy csi_settings_write on public.system_settings for all to anon using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.driver_status;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.service_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.system_settings;
  exception when duplicate_object then null;
  end;
end $$;

update public.service_requests
set pix_receipt = null
where pix_receipt is not null and pix_receipt like 'data:%';

update public.service_requests
set signed_contract = null
where signed_contract is not null and signed_contract like 'data:%';

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', true)
on conflict (id) do update set public = true;

drop policy if exists csi_contracts_select on storage.objects;
create policy csi_contracts_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'contracts');

drop policy if exists csi_contracts_insert on storage.objects;
create policy csi_contracts_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'contracts');

drop policy if exists csi_contracts_update on storage.objects;
create policy csi_contracts_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'contracts')
  with check (bucket_id = 'contracts');

notify pgrst, 'reload schema';
