# Fixing RLS (Row Level Security) Error

## The Problem

When the extension tries to upload assets, you get this error:
```
"new row violates row-level security policy"
```

This happens because:
1. The extension is not authenticated (no user session)
2. RLS policies require authentication
3. The API route was using the anon key which respects RLS

## The Solution

We've created an admin client that uses the **service role key** to bypass RLS for API routes.

## Steps to Fix

### 1. Get Your Service Role Key

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **API**
3. Find **"service_role"** key (NOT the anon key)
4. Copy this key - it's secret and should never be exposed to the client

### 2. Add to Environment Variables

Add this to your `.env.local` file:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Important:** 
- Never commit this to git
- Never expose this in client-side code
- Only use it in server-side API routes

### 3. Run the Migration (Optional)

The migration `006_fix_rls_policies.sql` is optional - it just ensures RLS policies are correctly set up. The main fix is using the service role key.

### 4. Restart Your Dev Server

After adding the environment variable:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

## How It Works

- **Before:** API route used `createClient()` → anon key → RLS blocks unauthenticated inserts
- **After:** API route uses `createAdminClient()` → service role key → bypasses RLS

The service role key has full access and bypasses all RLS policies, which is what we need for server-side API routes that accept uploads from unauthenticated sources (like the extension).

## Security Note

The service role key is only used in:
- `/api/assets/upload` - for extension uploads
- Other server-side API routes that need to bypass RLS

It's never exposed to the client, so it's safe to use in API routes.
