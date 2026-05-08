import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://lcvdhtaqoumyokjqaqfw.supabase.co';
const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supa = createClient(SB_URL, SB_KEY);

const TENANT_ID = 'c0000000-0000-0000-0000-000000000002';

// Pull all existing branches for tenant
const { data: existing, error } = await supa
  .from('branches')
  .select('slug,external_ref,name')
  .eq('tenant_id', TENANT_ID);
if (error) { console.error(error); process.exit(1); }

const existingSlugs = new Set(existing.map(b => b.slug));
const existingIds = new Set();
for (const b of existing) {
  if (!b.external_ref) continue;
  const m = b.external_ref.match(/([a-f0-9]{24})/i);
  if (m) existingIds.add(m[1]);
}
console.error(`Existing: ${existing.length}, with mongo-id: ${existingIds.size}, slugs: ${existingSlugs.size}`);

// Parse CSV
const raw = fs.readFileSync('/tmp/postnet.csv', 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = parseLine(lines[0]);

function parseLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const PROV_MAP = {
  'GAUTENG': 'Gauteng',
  'EASTERN CAPE': 'Eastern Cape',
  'WESTERN CAPE': 'Western Cape',
  'KWAZULU-NATAL': 'KwaZulu-Natal',
  'NORTHERN CAPE': 'Northern Cape',
  'NORTH WEST': 'North West',
  'NORTH-WEST': 'North West',
  'FREE STATE': 'Free State',
  'MPUMALANGA': 'Mpumalanga',
  'LIMPOPO': 'Limpopo',
};

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sqlStr(v) {
  if (v == null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) {
  return String(v).toLowerCase() === 'true' ? 'true' : 'false';
}

const rows = [];
const used = new Set(existingSlugs);
let skipped = 0, skippedReasons = {byId:0, bySlug:0};
const inserts = [];

for (let i = 1; i < lines.length; i++) {
  const cols = parseLine(lines[i]);
  const r = Object.fromEntries(header.map((h, idx) => [h.trim(), (cols[idx]||'').trim()]));
  const code = r.code;
  const tag = r.tag_name;
  if (!code) continue;

  if (existingIds.has(code)) { skipped++; skippedReasons.byId++; continue; }
  let slug = slugify(tag || r.store_name);
  if (existingSlugs.has(slug)) { skipped++; skippedReasons.bySlug++; continue; }

  // dedupe within this batch
  let final = slug, n = 2;
  while (used.has(final)) final = `${slug}-${n++}`;
  used.add(final);

  const province = PROV_MAP[r.region.toUpperCase()] || titleCase(r.region);
  const name = `PostNet ${titleCase(r.store_name)}`;
  const codeUpper = (final.toUpperCase().replace(/-/g,'_')).slice(0, 30);
  const settings = {
    latitude: r.latitude ? parseFloat(r.latitude) : null,
    longitude: r.longitude ? parseFloat(r.longitude) : null,
    criminal_record_check_enabled: r.criminal_record_check_enabled === 'True',
    delivery_to_door: r.delivery_to_door === 'True',
    online_shop_enabled: r.online_shop_enabled === 'True',
    online_account_number: r.online_account_number || null,
    source: 'postnet_csv_2026_05',
  };

  inserts.push(`(${[
    `'${TENANT_ID}'`,
    sqlStr(final),
    sqlStr(codeUpper),
    sqlStr(code),
    sqlStr(name),
    sqlStr(r.email || null),
    sqlStr(r.telephone || null),
    sqlStr(r.physical_address || null),
    sqlStr(r.town || null),
    sqlStr(province),
    sqlStr(r.postal_code || null),
    `'ZA'`,
    'true',
    `'${JSON.stringify(settings).replace(/'/g, "''")}'::jsonb`,
  ].join(', ')})`);
}

console.error(`To insert: ${inserts.length}, skipped: ${skipped} (byId=${skippedReasons.byId}, bySlug=${skippedReasons.bySlug})`);

const sql = `-- Bulk import PostNet stores (auto-generated from postnet_all_stores.flattened.csv)
-- Skips rows already present (matched by mongo id in external_ref or by slug).
INSERT INTO public.branches
  (tenant_id, slug, code, external_ref, name, email, phone, address, city, province, postal_code, country, is_active, settings)
VALUES
${inserts.join(',\n')}
ON CONFLICT DO NOTHING;
`;
fs.writeFileSync('/tmp/postnet_import/insert.sql', sql);
console.error(`Wrote /tmp/postnet_import/insert.sql (${sql.length} bytes)`);
