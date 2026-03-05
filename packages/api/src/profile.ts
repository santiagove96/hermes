import { getSupabase } from './supabase';

export interface MyProfile {
  id: string;
  fullName: string;
  username: string;
  onboardingCompletedAt: string | null;
}

type UsernameAvailabilityReason = 'available' | 'empty' | 'length' | 'format' | 'reserved' | 'taken';

export interface UsernameAvailability {
  available: boolean;
  reason: UsernameAvailabilityReason;
  normalized: string;
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) return null;

  const { data, error } = await getSupabase()
    .from('user_profiles')
    .select('id, full_name, username, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    fullName: data.full_name || '',
    username: data.username || '',
    onboardingCompletedAt: data.onboarding_completed_at ?? null,
  };
}

export async function checkUsernameAvailability(username: string): Promise<UsernameAvailability> {
  const normalizedInput = String(username || '').trim().toLowerCase();
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
}

export async function saveMyIdentity(input: { fullName: string; username: string; markCompleted?: boolean }): Promise<MyProfile> {
  const { data, error } = await getSupabase().rpc('upsert_my_identity', {
    p_full_name: String(input.fullName || '').trim(),
    p_username: String(input.username || '').trim().toLowerCase(),
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
}
