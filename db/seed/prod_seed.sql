-- Reference data only (no demo users/admins)
INSERT INTO country_region_codes (country_code, region_code, name_ko, name_en)
VALUES
  ('025', '001', '양곤', 'Yangon'),
  ('025', '002', '만달레이', 'Mandalay'),
  ('025', '003', '네피도', 'Naypyidaw'),
  ('025', '004', '몽유와', 'Monywa')
ON CONFLICT (country_code, region_code) DO NOTHING;
