-- 1. Create the table
create table if not exists api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  key text unique not null,
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Turn on Row Level Security
alter table api_keys enable row level security;

-- 3. Allow users to select only their own keys
drop policy if exists "Users can view their own API keys" on api_keys;
create policy "Users can view their own API keys"
  on api_keys for select
  using ( auth.uid() = user_id );

-- 4. Allow users to insert their own keys (via the dashboard)
drop policy if exists "Users can insert their own API keys" on api_keys;
create policy "Users can insert their own API keys"
  on api_keys for insert
  with check ( auth.uid() = user_id );

-- 5. Allow users to delete their own keys
drop policy if exists "Users can delete their own API keys" on api_keys;
create policy "Users can delete their own API keys"
  on api_keys for delete
  using ( auth.uid() = user_id );

-- 6. Allow the Service Role (our API routes) to select ANY key for backend validation
drop policy if exists "Service Role can view all keys for validation" on api_keys;
create policy "Service Role can view all keys for validation"
  on api_keys for select
  using ( true );
