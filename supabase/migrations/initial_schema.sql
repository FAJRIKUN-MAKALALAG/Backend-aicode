-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 
-- 1. Profiles (Public User Data)
-- 
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  avatar_url text,
  updated_at timestamp with time zone,
  
  constraint username_length check (char_length(username) >= 3)
);

-- RLS for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on public.profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.profiles for update
  using ( auth.uid() = id );

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

--
-- 2. Sensitive Data (Encrypted API Keys)
--
create table public.user_secrets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  key_name text not null, -- e.g. "OPENAI_API_KEY"
  encrypted_value text not null,
  iv text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  unique(user_id, key_name)
);

-- RLS for user_secrets
alter table public.user_secrets enable row level security;

create policy "Users can only access their own secrets."
  on public.user_secrets for all
  using ( auth.uid() = user_id );

--
-- 3. Chat History
--
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  title text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for conversations
alter table public.conversations enable row level security;

create policy "Users can only access their own conversations."
  on public.conversations for all
  using ( auth.uid() = user_id );

--
-- 4. Messages
--
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for messages
-- We check if the user owns the conversation this message belongs to
alter table public.messages enable row level security;

create policy "Users can access messages in their own conversations."
  on public.messages for all
  using ( 
    exists (
      select 1 from public.conversations 
      where id = public.messages.conversation_id 
      and user_id = auth.uid()
    )
  );

--
-- 5. Code History (Snippets)
--
create table public.code_snippets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  conversation_id uuid references public.conversations on delete set null,
  title text,
  code_content text not null,
  language text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for code_snippets
alter table public.code_snippets enable row level security;

create policy "Users can only access their own code snippets."
  on public.code_snippets for all
  using ( auth.uid() = user_id );

--
-- Verification / Helper
--
comment on table public.profiles is 'Public user profile data.';
comment on table public.user_secrets is 'Encrypted user secrets like API keys.';
comment on table public.conversations is 'Chat conversation threads.';
comment on table public.messages is 'Individual messages within a conversation.';
comment on table public.code_snippets is 'Saved code snippets.';
