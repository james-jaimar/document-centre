UPDATE public.tenant_settings
SET setting_value = jsonb_set(setting_value, '{soft_launch}', jsonb_build_object('enabled', true, 'message', 'We''re in soft launch. Browse the 2027 range, see trade pricing and design yours — online ordering opens soon. Contact us to reserve an early print run.')),
    updated_at = now()
WHERE tenant_id = '238a6748-a1a3-42f4-b88c-6ac44b316780' AND category = 'storefront' AND setting_key = 'config';