UPDATE profiles
SET display_name = NULL
WHERE display_name IS NOT NULL
  AND display_name = split_part(email, '@', 1)
  AND first_name IS NULL
  AND last_name IS NULL;