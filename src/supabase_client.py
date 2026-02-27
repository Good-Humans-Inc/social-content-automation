import os
from pathlib import Path
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env: try project root first, then dashboard (so worker can use same credentials as Next.js)
_root = Path(__file__).parent.parent
_env_paths = [
    _root / ".env",
    _root / ".env.local",
    _root / "dashboard" / ".env",
    _root / "dashboard" / ".env.local",
]
for _p in _env_paths:
    if _p.exists():
        load_dotenv(_p)
        break

# If dashboard env was loaded, map Next.js-style vars to worker-style (worker expects SUPABASE_URL, not NEXT_PUBLIC_*)
if not os.getenv("SUPABASE_URL") and os.getenv("NEXT_PUBLIC_SUPABASE_URL"):
    os.environ["SUPABASE_URL"] = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
if not os.getenv("SUPABASE_SERVICE_ROLE_KEY") and not os.getenv("SUPABASE_ANON_KEY"):
    if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        pass  # already set
    elif os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        os.environ["SUPABASE_ANON_KEY"] = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]


def get_supabase_client() -> Optional[Client]:
    """Initialize and return Supabase client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        return None

    return create_client(url, key)


def ensure_supabase_client() -> Client:
    """Initialize Supabase client, raising error if not configured."""
    client = get_supabase_client()
    if client is None:
        raise ValueError(
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) environment variables."
        )
    return client
