import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import styles from './App.module.css';
import useAuth from './hooks/useAuth';
import EnvironmentBanner from './components/EnvironmentBanner/EnvironmentBanner';

const FocusPage = lazy(() => import('./pages/FocusPage/FocusPage'));
const ReadPage = lazy(() => import('./pages/ReadPage/ReadPage'));
const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const ButtonPreviewPage = lazy(() => import('./pages/ButtonPreviewPage/ButtonPreviewPage'));
const AvatarPreviewPage = lazy(() => import('./pages/AvatarPreviewPage/AvatarPreviewPage'));
const NavbarPreviewPage = lazy(() => import('./pages/NavbarPreviewPage/NavbarPreviewPage'));
const AuthConfirmPage = lazy(() => import('./pages/AuthConfirmPage/AuthConfirmPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage/ResetPasswordPage'));
const SignupPage = lazy(() => import('./pages/SignupPage/SignupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const UpgradePage = lazy(() => import('./pages/UpgradePage/UpgradePage'));

function NotFound() {
  return (
    <main style={{ padding: 'var(--content-padding)', textAlign: 'center', marginTop: '80px' }}>
      <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: '8px' }}>Page not found</h1>
      <p style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)' }}>The page you&apos;re looking for doesn&apos;t exist.</p>
    </main>
  );
}

function RedirectToLatestProject() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [showHome, setShowHome] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!session?.user?.id) {
      // Not logged in — show read-only public home article
      setShowHome(true);
      return;
    }

    setShowHome(false);
    let cancelled = false;

    (async () => {
      try {
        const { fetchWritingProjects, createWritingProject } = await import('@hermes/api');
        const projects = await fetchWritingProjects();
        if (cancelled) return;

        if (projects.length > 0) {
          navigate(`/projects/${projects[0].id}`, { replace: true });
        } else {
          // First login — create a blank project and land on it.
          const starterProject = await createWritingProject(
            '',
            session.user.id,
          );
          if (cancelled) return;
          navigate(`/projects/${starterProject.id}`, { replace: true });
        }
      } catch {
        if (!cancelled) setShowHome(true);
      }
    })();

    return () => { cancelled = true; };
  }, [session, loading, navigate]);

  if (showHome) return <HomePage />;
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '120px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: '40%', height: 24, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
        <div style={{ width: '80%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
        <div style={{ width: '60%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
      </div>
    </main>
  );
}

function ProjectRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '120px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ width: '40%', height: 24, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
          <div style={{ width: '80%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
          <div style={{ width: '60%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
        </div>
      </main>
    );
  }

  if (!session) return <Navigate to="/" replace />;
  return <FocusPage />;
}

export default function App() {
  return (
    <div className={styles.app}>
      <EnvironmentBanner />
      <Suspense fallback={
        <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', padding: '120px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: '40%', height: 24, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
            <div style={{ width: '80%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
            <div style={{ width: '60%', height: 14, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} />
          </div>
        </main>
      }>
        <Routes>
          <Route path="/" element={<RedirectToLatestProject />} />
          <Route path="/preview/button" element={<ButtonPreviewPage />} />
          <Route path="/preview/avatar" element={<AvatarPreviewPage />} />
          <Route path="/preview/navbar" element={<NavbarPreviewPage />} />
          <Route path="/projects/:projectId" element={<ProjectRoute />} />
          <Route path="/read/:shortId/:slug" element={<ReadPage />} />
          <Route path="/read/:shortId" element={<ReadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<Navigate to="/" replace />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/auth/confirm" element={<AuthConfirmPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-overlay)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-sm)',
          },
        }}
      />
    </div>
  );
}
