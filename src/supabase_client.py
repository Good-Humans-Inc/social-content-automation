import os
from pathlib import Path
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


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
