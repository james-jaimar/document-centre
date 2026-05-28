// Ingest South African postcodes from GeoNames and map them to platform
// delivery zones (Major Centre vs Regional). Idempotent: clears existing
// ZA postcode_prefix rows in those two zones, then re-inserts.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { unzipSync } from 'npm:fflate@0.8.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Lowercased substrings. If a place name contains any of these, classify as
// Major Centre. Includes the 13 PostNet major cities + well-known metro
// suburbs so that, e.g., "Sandton" routes the same as "Johannesburg".
const MAJOR_PATTERNS: string[] = [
  // Johannesburg metro
  'johannesburg', 'sandton', 'randburg', 'roodepoort', 'soweto', 'alexandra',
  'midrand', 'bedfordview', 'edenvale', 'kempton park', 'boksburg', 'benoni',
  'germiston', 'alberton', 'springs', 'brakpan', 'krugersdorp', 'lenasia',
  'fourways', 'rosebank', 'parktown', 'melville', 'bryanston', 'rivonia',
  // Tshwane / Pretoria
  'pretoria', 'centurion', 'atteridgeville', 'mamelodi', 'akasia', 'hatfield',
  'menlyn', 'arcadia',
  // Cape Town metro
  'cape town', 'kaapstad', 'bellville', 'goodwood', 'parow', 'pinelands',
  'rondebosch', 'claremont', 'wynberg', 'athlone', 'mitchells plain',
  'khayelitsha', 'milnerton', 'table view', 'camps bay', 'sea point',
  'constantia', 'hout bay', 'kuils river', 'brackenfell', 'durbanville',
  'somerset west', 'strand', 'fish hoek', 'kraaifontein', 'observatory',
  'woodstock', 'gardens', 'green point', 'plumstead', 'tokai', 'bergvliet',
  // eThekwini / Durban
  'durban', 'pinetown', 'westville', 'umhlanga', 'phoenix', 'chatsworth',
  'amanzimtoti', 'hillcrest', 'kloof', 'morningside', 'glenwood',
  'queensburgh', 'mount edgecombe', 'verulam', 'tongaat', 'umlazi', 'kwamashu',
  'berea',
  // Gqeberha / Port Elizabeth
  'port elizabeth', 'gqeberha', 'walmer', 'newton park', 'bethelsdorp',
  // East London / Buffalo City
  'east london', 'mdantsane', 'gonubie', 'beacon bay',
  // Mangaung / Bloemfontein
  'bloemfontein', 'bloemspruit', 'mangaung',
  // KZN secondary
  'pietermaritzburg',
  // Limpopo
  'polokwane', 'pietersburg',
  // Mpumalanga
  'nelspruit', 'mbombela',
  // Northern Cape
  'kimberley', 'beaconsfield',
  // Western Cape Garden Route
  'george',
  // North West
  'rustenburg',
];

function classify(place: string): 'major' | 'regional' {
  const lower = place.toLowerCase();
  for (const p of MAJOR_PATTERNS) {
    if (lower.includes(p)) return 'major';
  }
  return 'regional';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');

    const admin = createClient(supabaseUrl, serviceKey);

    // Allow when:
    //   (a) caller presents the service-role token, OR
    //   (b) caller is a platform_admin, OR
    //   (c) bootstrap: there are currently zero ZA postcode_prefix rows
    //       in the platform zones (one-time first seed).
    let allowed = Boolean(token && token === serviceKey);

    if (!allowed) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      const user = userRes?.user;
      if (user) {
        const { data: roles } = await userClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        allowed = Boolean(roles?.some((r: { role: string }) => r.role === 'platform_admin'));
      }
    }

    if (!allowed) {
      const { count } = await admin
        .from('delivery_zone_locations')
        .select('*', { count: 'exact', head: true })
        .eq('match_type', 'postcode_prefix')
        .eq('country', 'ZA');
      if ((count ?? 0) === 0) {
        allowed = true; // bootstrap-mode
      }
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: zones, error: zErr } = await admin
      .from('delivery_zones')
      .select('id, code')
      .eq('scope_type', 'platform');
    if (zErr) throw zErr;
    const majorZone = zones?.find((z: { code: string }) => z.code === 'major_centre')?.id;
    const regionalZone = zones?.find((z: { code: string }) => z.code === 'regional')?.id;
    if (!majorZone || !regionalZone) {
      return new Response(
        JSON.stringify({ error: 'Platform zones (major_centre, regional) not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Download GeoNames postcode bundle for ZA.
    const zipRes = await fetch('https://download.geonames.org/export/zip/ZA.zip');
    if (!zipRes.ok) throw new Error(`Download failed: ${zipRes.status}`);
    const buf = new Uint8Array(await zipRes.arrayBuffer());
    const files = unzipSync(buf);
    const file = files['ZA.txt'];
    if (!file) throw new Error('ZA.txt missing from GeoNames archive');
    const txt = new TextDecoder().decode(file);

    type Row = {
      zone_id: string;
      match_type: 'postcode_prefix';
      value: string;
      country: 'ZA';
      notes: string;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      const postcode = (cols[1] ?? '').trim();
      const place = (cols[2] ?? '').trim();
      if (!/^\d{4}$/.test(postcode)) continue;
      if (seen.has(postcode)) continue;
      seen.add(postcode);
      const cls = classify(place);
      rows.push({
        zone_id: cls === 'major' ? majorZone : regionalZone,
        match_type: 'postcode_prefix',
        value: postcode,
        country: 'ZA',
        notes: `geonames:${place}`,
      });
    }

    const majorCount = rows.filter((r) => r.zone_id === majorZone).length;
    const regionalCount = rows.length - majorCount;

    // Idempotent: wipe prior geonames-sourced ZA postcode rows in these zones.
    const { error: delErr } = await admin
      .from('delivery_zone_locations')
      .delete()
      .eq('match_type', 'postcode_prefix')
      .eq('country', 'ZA')
      .in('zone_id', [majorZone, regionalZone]);
    if (delErr) throw delErr;

    const chunk = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await admin.from('delivery_zone_locations').insert(slice);
      if (error) throw error;
      inserted += slice.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: rows.length,
        inserted,
        majorCount,
        regionalCount,
        source: 'geonames ZA.zip',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
