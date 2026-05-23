UPDATE public.rate_card_papers AS p
SET sell_price = ROUND(GREATEST(0.05,
      (CASE p.finish
        WHEN 'bond' THEN 0.00275
        WHEN 'uncoated' THEN 0.00300
        WHEN 'recycled' THEN 0.00325
        WHEN 'pastel-blue' THEN 0.00400
        WHEN 'pastel-green' THEN 0.00400
        WHEN 'pastel-pink' THEN 0.00400
        WHEN 'pastel-yellow' THEN 0.00400
        WHEN 'silk' THEN 0.00600
        WHEN 'gloss' THEN 0.00600
        WHEN 'silk-card' THEN 0.00750
        WHEN 'gloss-card' THEN 0.00750
        WHEN 'photo-satin' THEN 0.01100
        WHEN 'kraft' THEN 0.00900
        WHEN 'cotton' THEN 0.01200
        WHEN 'triplex' THEN 0.00950
        WHEN 'silk-bc' THEN 0.00750
        ELSE 0.00500 END)
      * p.weight_gsm
      * (CASE p.size
        WHEN 'A6' THEN 0.25 WHEN 'DL' THEN 0.40 WHEN 'A5' THEN 0.55
        WHEN 'A4' THEN 1.00 WHEN 'A3' THEN 2.00 WHEN 'SRA3' THEN 2.30
        WHEN 'A2' THEN 4.00 WHEN 'A1' THEN 8.00 WHEN 'A0' THEN 16.00
        WHEN 'BC' THEN 0.05 ELSE 1.00 END)
    ) / 0.05) * 0.05,
  notes = 'derived: rate-per-gsm × ' || p.weight_gsm || 'gsm × size-mult ('
          || p.size || ', finish=' || p.finish
          || ') — Method B (area + finish family)',
  label = REPLACE(p.label, ' (TODO: price)', '')
WHERE p.scope_type = 'master'
  AND p.sell_price = 0;