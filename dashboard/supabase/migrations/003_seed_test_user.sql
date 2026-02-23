-- Seed script to create a test user
-- This uses Supabase's admin functions to create a user with a hashed password

-- IMPORTANT: Run this in Supabase SQL Editor with service_role key
-- Or use the Supabase Dashboard to create users manually

-- Function to create a test user (requires service_role)
CREATE OR REPLACE FUNCTION create_test_user(
  user_email TEXT,
  user_password TEXT,
  user_full_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Create user in auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', COALESCE(user_full_name, 'Test User')),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO user_id;

  -- Create profile (trigger will handle this, but we can also do it explicitly)
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (user_id, user_email, COALESCE(user_full_name, 'Test User'), 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_full_name;

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a test admin user
-- Email: admin@geelark.local
-- Password: admin123
SELECT create_test_user(
  'admin@geelark.local',
  'admin123',
  'Admin User'
);

-- Note: The password hashing above uses bcrypt, but Supabase uses a different method
-- For production, use Supabase Dashboard or the Auth API to create users
-- This is a simplified version for testing
