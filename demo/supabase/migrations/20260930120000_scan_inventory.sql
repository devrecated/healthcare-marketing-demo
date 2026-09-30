-- Scan inventory: shared supplies + usage_log for cross-device demo.
-- Apply in Supabase SQL editor or via supabase db push.

create table if not exists public.supplies (
  id text primary key,
  name text not null,
  category text not null,
  sku text not null unique,
  quantity integer not null check (quantity >= 0),
  unit text not null,
  reorder_level integer not null default 0,
  unit_cost numeric not null default 0,
  controlled boolean not null default false,
  lot_expiry date,
  last_reconciled_at date,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_log (
  id text primary key,
  form_id text,
  procedure_date date,
  center_hint text,
  supply_id text not null references public.supplies (id),
  sku text not null,
  device text not null,
  qty integer not null check (qty > 0),
  approved_by text not null,
  raw_sticker_text text not null default '',
  recorded_at timestamptz not null default now()
);

create index if not exists usage_log_recorded_at_idx on public.usage_log (recorded_at desc);

alter table public.supplies enable row level security;
alter table public.usage_log enable row level security;

-- Anon clients may read; writes go through the service-role Next.js API.
drop policy if exists supplies_anon_read on public.supplies;
create policy supplies_anon_read on public.supplies
  for select to anon, authenticated
  using (true);

drop policy if exists usage_log_anon_read on public.usage_log;
create policy usage_log_anon_read on public.usage_log
  for select to anon, authenticated
  using (true);

-- Realtime for laptop Supplies page (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.supplies;
exception
  when duplicate_object then null;
  when others then
    if sqlerrm not like '%already member%' then
      raise;
    end if;
end $$;

-- Atomic confirm: match rows already resolved by the API as JSONB array of
-- { id, supply_id, sku, device, qty, raw_sticker_text, form_id, procedure_date, center_hint, approved_by }
create or replace function public.confirm_scan_deduction(entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  entry_id text;
  sid text;
  qty int;
  deducted jsonb := '[]'::jsonb;
  current_qty int;
  next_qty int;
begin
  if entries is null or jsonb_typeof(entries) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  for item in select * from jsonb_array_elements(entries)
  loop
    entry_id := item->>'id';
    sid := item->>'supply_id';
    qty := greatest(1, coalesce((item->>'qty')::int, 1));

    select quantity into current_qty from public.supplies where id = sid for update;
    if current_qty is null then
      continue;
    end if;

    next_qty := greatest(0, current_qty - qty);
    update public.supplies
      set quantity = next_qty, updated_at = now()
      where id = sid;

    insert into public.usage_log (
      id, form_id, procedure_date, center_hint, supply_id, sku, device, qty,
      approved_by, raw_sticker_text, recorded_at
    ) values (
      entry_id,
      nullif(item->>'form_id', ''),
      nullif(item->>'procedure_date', '')::date,
      nullif(item->>'center_hint', ''),
      sid,
      item->>'sku',
      item->>'device',
      qty,
      coalesce(nullif(item->>'approved_by', ''), 'Demo user'),
      coalesce(item->>'raw_sticker_text', ''),
      now()
    );

    deducted := deducted || jsonb_build_array(
      jsonb_build_object(
        'id', entry_id,
        'supply_id', sid,
        'sku', item->>'sku',
        'device', item->>'device',
        'qty', qty,
        'quantity_after', next_qty
      )
    );
  end loop;

  return jsonb_build_object('deducted', deducted);
end;
$$;

revoke all on function public.confirm_scan_deduction(jsonb) from public;
grant execute on function public.confirm_scan_deduction(jsonb) to service_role;

-- Seed (same ids/SKUs as demo/src/lib/seed.ts)
insert into public.supplies (
  id, name, category, sku, quantity, unit, reorder_level, unit_cost,
  controlled, lot_expiry, last_reconciled_at
) values
  ('sup-knee', 'Total knee implant set', 'Implant', 'IMP-KNEE-01', 6, 'set', 2, 4200, false, null, '2026-09-28'),
  ('sup-cement', 'Bone cement', 'Consumable', 'CON-CEM-04', 14, 'pack', 4, 186, false, null, '2026-09-01'),
  ('sup-drape', 'Orthopedic drape pack', 'Consumable', 'CON-DRP-12', 22, 'pack', 8, 34, false, null, null),
  ('sup-clip', 'Laparoscopic clip applier', 'Consumable', 'CON-CLIP-2', 11, 'each', 4, 128, false, null, null),
  ('sup-iol', 'Intraocular lens', 'Implant', 'IMP-IOL-21', 9, 'each', 3, 310, false, null, null),
  ('sup-suture', 'Vicryl suture 3-0', 'Suture', 'SUT-VIC-30', 40, 'box', 10, 18, false, null, null),
  ('sup-glove', 'Sterile gloves, size 7', 'PPE', 'PPE-GLV-7', 8, 'box', 24, 12, false, '2026-10-20', null),
  ('sup-prop', 'Propofol 20ml', 'Medication', 'MED-PRO-20', 2, 'vial', 6, 9.5, true, '2026-10-12', '2026-09-28'),
  ('sup-gauze', 'Gauze sponges', 'Consumable', 'CON-GAU-4', 30, 'pack', 12, 6.25, false, '2026-09-01', '2026-09-20'),
  ('sup-mesh', 'Hernia mesh 15cm', 'Implant', 'IMP-MSH-15', 4, 'each', 2, 640, false, null, null)
on conflict (id) do nothing;
