import { getSupabase } from './supabase';

export interface MyProfile {
  id: string;
  fullName: string;
  username: string;
  onboardingCompletedAt: string | null;
}

type UsernameAvailabilityReason = 'available' | 'empty' | 'length' | 'format' | 'reserved' | 'taken' | 'server';

export interface UsernameAvailability {
  available: boolean;
  reason: UsernameAvailabilityReason;
  normalized: string;
}

const RESERVED_USERNAMES = new Set([
  'api',
  'auth',
  'login',
  'signup',
  'projects',
  'project',
  'upgrade',
  'read',
  'reset-password',
  'forgot-password',
  'preview',
  'onboarding',
  'assets',
  'health',
]);

function normalizeUsername(input: string): string {
  return String(input || '').trim().toLowerCase();
}

function isSchemaMismatchError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || '');
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return code === '42703' || code === 'PGRST202' || code === 'PGRST204' || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache');
}

async function fetchMyProfileFromProfilesTable(userId: string): Promise<MyProfile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('user_id, full_name, username, onboarding_completed_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.user_id,
    fullName: data.full_name || '',
    username: data.username || '',
    onboardingCompletedAt: data.onboarding_completed_at ?? null,
  };
}

async function fetchMyProfileFromUserProfilesTable(userId: string): Promise<MyProfile | null> {
  const { data, error } = await getSupabase()
    .from('user_profiles')
    .select('id, full_name, username, onboarding_completed_at')
    .eq('id', userId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    fullName: data.full_name || '',
    username: data.username || '',
    onboardingCompletedAt: data.onboarding_completed_at ?? null,
  };
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) return null;

  try {
    return await fetchMyProfileFromUserProfilesTable(user.id);
  } catch (error) {
    if (!isSchemaMismatchError(error)) throw error;
    return fetchMyProfileFromProfilesTable(user.id);
  }
}

export async function checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
  const normalizedInput = normalizeUsername(username);
  if (!normalizedInput) return { available: false, reason: 'empty', normalized: normalizedInput };
  if (normalizedInput.length < 3 || normalizedInput.length > 30) {
    return { available: false, reason: 'length', normalized: normalizedInput };
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalizedInput)) {
    return { available: false, reason: 'format', normalized: normalizedInput };
  }
  if (RESERVED_USERNAMES.has(normalizedInput)) {
    return { available: false, reason: 'reserved', normalized: normalizedInput };
  }

  try {
    const { data, error } = await getSupabase().rpc('check_username_availability', {
      p_username: normalizedInput,
    });

    if (error) throw error;

    const row = (data?.[0] || {}) as Partial<UsernameAvailability>;
    return {
      available: !!row.available,
      reason: (row.reason as UsernameAvailabilityReason) || 'taken',
      normalized: String(row.normalized || normalizedInput),
    };
  } catch {
    // Fallback path when RPC isn't available yet (e.g., migration pending).
    try {
      const { data: { user } } = await getSupabase().auth.getUser();
      const currentUserId = user?.id || null;
      let lookupSucceeded = false;

      const { data: reservedRows, error: reservedError } = await getSupabase()
        .from('reserved_usernames')
        .select('username')
        .eq('username', normalizedInput)
        .limit(1);
      if (!reservedError) {
        lookupSucceeded = true;
        if (reservedRows?.length) {
          return { available: false, reason: 'reserved', normalized: normalizedInput };
        }
      } else if (!isSchemaMismatchError(reservedError)) {
        throw reservedError;
      }

      const { data: profileRows, error: profileError } = await getSupabase()
        .from('profiles')
        .select('user_id')
        .eq('username', normalizedInput)
        .limit(1);
      if (!profileError) {
        lookupSucceeded = true;
        if (profileRows?.length && profileRows[0].user_id !== currentUserId) {
          return { available: false, reason: 'taken', normalized: normalizedInput };
        }
      } else if (!isSchemaMismatchError(profileError)) {
        throw profileError;
      }

      const { data: billingProfileRows, error: billingProfileError } = await getSupabase()
        .from('user_profiles')
        .select('id')
        .eq('username', normalizedInput)
        .limit(1);
      if (!billingProfileError) {
        lookupSucceeded = true;
        if (billingProfileRows?.length && billingProfileRows[0].id !== currentUserId) {
          return { available: false, reason: 'taken', normalized: normalizedInput };
        }
      } else if (!isSchemaMismatchError(billingProfileError)) {
        throw billingProfileError;
      }

      const { data: aliasRows, error: aliasError } = await getSupabase()
        .from('user_profile_username_aliases')
        .select('user_id')
        .eq('username', normalizedInput)
        .limit(1);
      if (!aliasError) {
        lookupSucceeded = true;
        if (aliasRows?.length && aliasRows[0].user_id !== currentUserId) {
          return { available: false, reason: 'taken', normalized: normalizedInput };
        }
      } else if (!isSchemaMismatchError(aliasError)) {
        throw aliasError;
      }

      if (!lookupSucceeded) {
        return { available: false, reason: 'server', normalized: normalizedInput };
      }
      return { available: true, reason: 'available', normalized: normalizedInput };
    } catch {
      return { available: false, reason: 'server', normalized: normalizedInput };
    }
  }
}

export async function saveMyIdentity(input: { fullName: string; username: string; markCompleted?: boolean }): Promise<MyProfile> {
  const normalizedUsername = normalizeUsername(input.username);
  const normalizedFullName = String(input.fullName || '').trim();

  try {
    const { data, error } = await getSupabase().rpc('upsert_my_identity', {
      p_full_name: normalizedFullName,
      p_username: normalizedUsername,
      p_mark_completed: !!input.markCompleted,
    });

    if (error) throw error;

    const row = data?.[0] as {
      full_name?: string;
      username?: string;
      onboarding_completed_at?: string | null;
    } | undefined;

    const { data: { user } } = await getSupabase().auth.getUser();
    if (!user) throw new Error('Not authenticated');

    return {
      id: user.id,
      fullName: row?.full_name || '',
      username: row?.username || '',
      onboardingCompletedAt: row?.onboarding_completed_at ?? null,
    };
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw new Error((error as { message?: string } | null)?.message || 'No se pudo guardar tu identidad.');
    }
  }

  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const currentProfile = await fetchMyProfile();
  const currentUsername = String(currentProfile?.username || '').trim().toLowerCase();
  const availability = await checkUsernameAvailability(normalizedUsername);
  if (!availability.available && currentUsername !== normalizedUsername) {
    throw new Error('Username unavailable.');
  }

  const profilePayload: Record<string, unknown> = {
    user_id: user.id,
    full_name: normalizedFullName,
    username: normalizedUsername,
    updated_at: new Date().toISOString(),
  };

  if (input.markCompleted) {
    profilePayload.onboarding_completed = true;
    profilePayload.onboarding_completed_at = currentProfile?.onboardingCompletedAt || new Date().toISOString();
  }

  const { error: profilesError } = await getSupabase()
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'user_id' });

  if (profilesError) {
    throw new Error(profilesError.message || 'No se pudo guardar tu identidad.');
  }

  // Best-effort sync for newer schema
  await getSupabase()
    .from('user_profiles')
    .update({
      full_name: normalizedFullName,
      username: normalizedUsername,
      onboarding_completed_at: input.markCompleted
        ? currentProfile?.onboardingCompletedAt || new Date().toISOString()
        : currentProfile?.onboardingCompletedAt || null,
    })
    .eq('id', user.id);

  const projectPayloads: Array<Record<string, unknown>> = [
    {
      author_name: normalizedFullName,
      author_username: normalizedUsername,
      owner_username: normalizedUsername,
      owner_full_name: normalizedFullName,
    },
    {
      author_name: normalizedFullName,
      author_username: normalizedUsername,
    },
    {
      author_name: normalizedFullName,
      owner_username: normalizedUsername,
      owner_full_name: normalizedFullName,
    },
    {
      author_name: normalizedFullName,
    },
  ];

  for (const payload of projectPayloads) {
    const { error: projectError } = await getSupabase()
      .from('projects')
      .update(payload)
      .eq('user_id', user.id)
      .eq('published', true);
    if (!projectError) break;
    if (!isSchemaMismatchError(projectError)) {
      throw new Error(projectError.message || 'No se pudo actualizar tus proyectos publicados.');
    }
  }

  const updated = await fetchMyProfile();
  if (!updated) {
    return {
      id: user.id,
      fullName: normalizedFullName,
      username: normalizedUsername,
      onboardingCompletedAt: input.markCompleted ? new Date().toISOString() : null,
    };
  }
  return updated;
}
