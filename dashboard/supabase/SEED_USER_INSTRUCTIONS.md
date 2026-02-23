# How to Create a Test User for Login

## Method 1: Using Supabase Dashboard (RECOMMENDED - Easiest)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** → **"Create new user"**
4. Fill in:
   - **Email**: `admin@geelark.local`
   - **Password**: `admin123` (or any password you prefer)
   - **Auto Confirm User**: ✅ Check this box (important!)
5. Click **"Create user"**

You can now log in with these credentials!

## Method 2: Using SQL (Advanced)

If you want to create users via SQL, you have a few options:

### Option A: Use Supabase's Admin API (Recommended for SQL)

Run this in the Supabase SQL Editor (requires service_role):

```sql
-- This uses Supabase's internal admin function
-- Note: Password hashing is handled by Supabase
SELECT auth.uid() FROM auth.users WHERE email = 'admin@geelark.local';

-- If user doesn't exist, create via Dashboard or use the REST API
```

### Option B: Direct Insert (Not Recommended - Password Hashing Issues)

The SQL migrations include functions to create users, but Supabase's password hashing is complex and may not work perfectly with direct SQL inserts.

## Method 3: Using the Signup API

You can also create users programmatically via the Supabase client:

```typescript
// In your Next.js app or a script
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase.auth.admin.createUser({
  email: 'admin@geelark.local',
  password: 'admin123',
  email_confirm: true
})
```

## Quick Test Credentials

After creating a user via Method 1, use:
- **Email**: `admin@geelark.local`
- **Password**: `admin123`

## Troubleshooting

- **"Invalid login credentials"**: Make sure you checked "Auto Confirm User" when creating the user
- **User not found**: Verify the user exists in Authentication → Users
- **Can't create user**: Make sure you have the correct permissions (use service_role key for API method)
