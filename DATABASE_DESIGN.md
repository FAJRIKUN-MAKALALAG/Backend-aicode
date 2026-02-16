# Database Schema & Security Specification

This document outlines the database structure and security measures for the AI Code Assistant backend (using Supabase/PostgreSQL).

## Overview

We use **Supabase (PostgreSQL)** for authentication and data storage.

- **Authentication**: Managed by Supabase Auth (`auth.users` table).
- **User Data**: Stored in `public` schema tables, linked to `auth.users` via `id`.
- **Encryption**: Sensitive data (API Keys) is encrypted at rest using AES-256-GCM.

---

## 1. Authentication & Users

**Table: `auth.users`** (Managed by Supabase)

- `id`: UUID (Primary Key)
- `email`: User email
- `encrypted_password`: Hashed password (managed by Supabase)
- `created_at`: Timestamp

**Table: `public.profiles`**

- `id`: UUID (Foreign Key -> `auth.users.id`)
- `username`: String (Display name)
- `avatar_url`: String (Optional)
- `updated_at`: Timestamp

---

## 2. Sensitive Data (Encrypted)

**Table: `public.user_secrets`**

- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `auth.users.id`)
- `key_name`: String (e.g., "GEMINI_API_KEY", "OPENAI_API_KEY")
- `encrypted_value`: Text (The encrypted API key)
- `iv`: Text (Initialization Vector for encryption)
- `created_at`: Timestamp

### Encryption Strategy

- **Algorithm**: AES-256-GCM (Authenticated Encryption)
- **Master Key**: A server-side environment variable (`ENCRYPTION_KEY`) used to encrypt/decrypt user keys.
- **Process**:
  1.  User submits API Key.
  2.  Backend generates a random IV (Initialization Vector).
  3.  Backend encrypts the API Key using `ENCRYPTION_KEY` + IV.
  4.  Store `encrypted_value` and `iv` in the database.
  5.  **NEVER** store the plain text API key.

---

## 3. Chat History

**Table: `public.conversations`**

- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `auth.users.id`)
- `title`: Text (e.g., "Python Helper", "Debug Login")
- `created_at`: Timestamp
- `updated_at`: Timestamp

**Table: `public.messages`**

- `id`: UUID (Primary Key)
- `conversation_id`: UUID (Foreign Key -> `public.conversations.id`)
- `role`: Text ("user", "assistant", "system")
- `content`: Text (The message text)
- `created_at`: Timestamp

---

## 4. Code History

**Table: `public.code_snippets`**

- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `auth.users.id`)
- `conversation_id`: UUID (Foreign Key -> `public.conversations.id`, Optional)
- `title`: Text (Optional, e.g., "snapshot_v1.py")
- `code_content`: Text (The actual code)
- `language`: Text (e.g., "python", "javascript")
- `created_at`: Timestamp

---

## Security Policies (RLS)

- Enable **Row Level Security (RLS)** on all public tables.
- **Policy**: Users can only `SELECT`, `INSERT`, `UPDATE`, `DELETE` their own data (`auth.uid() = user_id`).
