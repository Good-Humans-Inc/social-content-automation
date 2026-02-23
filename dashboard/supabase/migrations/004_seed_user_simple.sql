-- SIMPLER APPROACH: Use Supabase's built-in auth.admin_create_user function
-- This is the recommended way to create users programmatically

-- Create a test admin user using Supabase's admin function
-- This requires the auth schema and proper permissions

-- Option 1: Use Supabase Dashboard (RECOMMENDED)
-- Go to Authentication > Users > Add user > Create new user
-- Email: admin@geelark.local
-- Password: admin123
-- Auto Confirm User: Yes

-- Option 2: Use this SQL (requires service_role permissions)
-- Note: This uses Supabase's internal functions which may vary by version

-- For Supabase, the easiest way is to use the Dashboard or REST API
-- But here's a workaround using direct insert with proper password hashing:

-- First, enable the pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a helper function to hash passwords like Supabase does
-- Note: Supabase uses a specific hashing method, this is an approximation
CREATE OR REPLACE FUNCTION create_user_with_password(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT DEFAULT 'Admin User'
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
BEGIN
  -- Generate a UUID for the user
  v_user_id := gen_random_uuid();
  
  -- Hash password using bcrypt (Supabase uses a similar method)
  -- Note: This is a simplified version. Supabase's actual hashing is more complex
  v_encrypted_password := crypt(p_password, gen_salt('bf', 10));
  
  -- Insert into auth.users
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
    recovery_token,
    is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_password,
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name),
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- The trigger will create the profile automatically
  -- But we can also ensure it exists
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (v_user_id, p_email, p_full_name, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the test user
-- Email: admin@geelark.local
-- Password: admin123
SELECT create_user_with_password(
  'admin@geelark.local',
  'admin123',
  'Admin User'
);

-- IMPORTANT NOTES:
-- 1. This approach may not work perfectly because Supabase uses a specific password hashing method
-- 2. The RECOMMENDED way is to use the Supabase Dashboard:
--    - Go to Authentication > Users
--    - Click "Add user" > "Create new user"
--    - Enter email: admin@geelark.local
--    - Enter password: admin123
--    - Check "Auto Confirm User"
--    - Click "Create user"
--
-- 3. Alternatively, use the Supabase REST API or client library to create users
-- 4. Or use the signup endpoint from your application
