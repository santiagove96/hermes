import { createContext, useState, useEffect, useCallback } from 'react';
import { activateTrial, fetchMyProfile } from '@hermes/api';
import { identify, reset } from '../lib/analytics';
import { supabase, initOfflineAdapter } from '../lib/supabase';
import { IS_TAURI } from '../lib/platform';

export const AuthContext = createContext(null);

function getWebAuthRedirectPath(pathname) {
  const configuredBase = import.meta.env.VITE_AUTH_REDIRECT_URL;
  const baseUrl = configuredBase && configuredBase.trim().length > 0
    ? configuredBase.trim().replace(/\/+$/, '')
    : window.location.origin;
  return `${baseUrl}${pathname}`;
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadProfile = useCallback(async () => {
    try {
      const nextProfile = await fetchMyProfile();
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for OAuth error in URL hash (e.g. signup rejected)
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const desc = params.get('error_description');
      if (desc) {
        setAuthError(desc.includes('Signups not allowed')
          ? 'This site is invite-only. Contact the admin for access.'
          : desc);
        // Clean the hash so the error doesn't persist on refresh
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        identify(session.user.id, {
          email: session.user.email,
          auth_provider: session.user.app_metadata?.provider || 'email',
        });
        // Initialize offline adapter for Tauri
        initOfflineAdapter(session.user.id);
        loadProfile();
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        identify(session.user.id, {
          email: session.user.email,
          auth_provider: session.user.app_metadata?.provider || 'email',
        });
        // Initialize offline adapter for Tauri on auth change
        initOfflineAdapter(session.user.id);
        setProfileLoading(true);
        loadProfile();
      } else {
        setProfile(null);
        setProfileLoading(false);
        reset();
      }
    });

    // Listen for deep link OAuth callback in Tauri
    if (IS_TAURI) {
      import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
        onOpenUrl((urls) => {
          for (const url of urls) {
            if (url.startsWith('hermes://auth/callback')) {
              const hashParams = new URL(url.replace('hermes://', 'https://placeholder/')).hash;
              if (hashParams) {
                // Extract tokens from the deep link and set session
                const params = new URLSearchParams(hashParams.replace('#', ''));
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                if (accessToken && refreshToken) {
                  supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                }
              }
            }
          }
        });
      }).catch(() => {
        // Deep link plugin not available
      });
    }

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // Activate pending trial after Google OAuth redirect
  useEffect(() => {
    if (!session?.access_token) return;
    const pending = sessionStorage.getItem('pendingTrialToken');
    if (!pending) return;
    sessionStorage.removeItem('pendingTrialToken');
    activateTrial(pending, session.access_token).catch(() => {
      // Non-fatal — trial activation is best-effort
    });
  }, [session?.access_token]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signInWithGoogle = async (_intent = 'login') => {
    if (IS_TAURI) {
      // In Tauri, open OAuth in system browser and handle callback via deep link
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'hermes://auth/callback',
        },
      });
      if (error) throw error;
      if (data?.url) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(data.url);
      }
      return { data, error };
    }
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getWebAuthRedirectPath('/') },
    });
  };

  const signOut = () => supabase.auth.signOut();

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }).then(({ error }) => { if (error) throw error; });

  const requiresOnboarding = !!session?.user && (!profile?.fullName || !profile?.username || !profile?.onboardingCompletedAt);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      profile,
      profileLoading,
      requiresOnboarding,
      refreshProfile: loadProfile,
      authError,
      clearAuthError: () => setAuthError(null),
      signIn,
      signInWithGoogle,
      signOut,
      updatePassword,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}
