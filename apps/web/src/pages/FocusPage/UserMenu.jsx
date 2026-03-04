import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { createPortalSession } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import useLanguage from '../../hooks/useLanguage';
import useUsage from '../../hooks/useUsage';
import Avatar from '../../components/ui/Avatar';
import McpSettingsView from './McpSettingsView';
import styles from './UserMenu.module.css';

const USER_MENU_TEXT = {
  es: {
    account: 'Cuenta',
    billing: 'Facturación',
    patron: 'Patron',
    trial: 'Prueba',
    free: 'Gratis',
    planSuffix: 'plan',
    daysRemaining: (days) => `(${days} días restantes)`,
    cancelsOn: (date) => `(cancela ${date})`,
    messagesUsed: (used, limit) => `${used} / ${limit} mensajes usados`,
    patronThanks: 'Gracias por apoyar Diless. Tu patronazgo financia a quienes construyen esta herramienta.',
    manageSubscription: 'Gestionar suscripción',
    trialAfter: 'Después de tu prueba tendrás 10 mensajes/día en el plan Gratis.',
    becomePatron: 'Hazte Patron — $15/mes',
    featureMessages: '300 mensajes/mes',
    featureBeta: 'Acceso anticipado a funciones beta',
    featureSupport: 'Apoyas el desarrollo independiente',
    back: 'Volver',
    mcpServers: 'Servidores MCP',
    signOut: 'Cerrar sesión',
    continueWithGoogle: 'Continuar con Google',
    googleAuthFailed: 'No se pudo abrir Google. Intenta de nuevo.',
  },
  en: {
    account: 'Account',
    billing: 'Billing',
    patron: 'Patron',
    trial: 'Trial',
    free: 'Free',
    planSuffix: 'plan',
    daysRemaining: (days) => `(${days} days remaining)`,
    cancelsOn: (date) => `(cancels ${date})`,
    messagesUsed: (used, limit) => `${used} / ${limit} messages used`,
    patronThanks: 'Thank you for supporting Diless. Your patronage funds the contributors who build this tool.',
    manageSubscription: 'Manage subscription',
    trialAfter: "After your trial, you'll have 10 messages/day on the Free plan.",
    becomePatron: 'Become a Patron — $15/mo',
    featureMessages: '300 messages/month',
    featureBeta: 'Early access to beta features',
    featureSupport: 'Support independent development',
    back: 'Back',
    mcpServers: 'MCP Servers',
    signOut: 'Sign Out',
    continueWithGoogle: 'Continue with Google',
    googleAuthFailed: 'Could not open Google. Please try again.',
  },
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function UserMenu({ onDropdownOpen, onDropdownClose }) {
  const { session, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { usage } = useUsage(session);
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'billing' | 'mcp'
  const [error, setError] = useState('');
  const [openedAtMs, setOpenedAtMs] = useState(0);

  const isLoggedIn = !!session;
  const email = session?.user?.email;
  const ui = language === 'es' ? USER_MENU_TEXT.es : USER_MENU_TEXT.en;

  const openDropdown = useCallback(() => {
    setOpenedAtMs(Date.now());
    setOpen(true);
    onDropdownOpen?.();
  }, [onDropdownOpen]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setView('menu');
    setError('');
    onDropdownClose?.();
  }, [onDropdownClose]);

  const toggleDropdown = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (view === 'billing' || view === 'mcp') {
          setView('menu');
          setError('');
        } else {
          closeDropdown();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, view, closeDropdown]);

  const handleSignOut = async () => {
    closeDropdown();
    await signOut();
    navigate('/', { replace: true });
  };

  const handleGoogleAuth = async () => {
    setError('');
    try {
      await signInWithGoogle('menu');
    } catch {
      setError(ui.googleAuthFailed);
    }
  };

  const handleManageSubscription = async () => {
    if (!session?.access_token) return;
    try {
      const { url } = await createPortalSession(session.access_token);
      window.open(url, '_blank');
    } catch {
      // Silently fail
    }
  };

  const initial = email ? email[0].toUpperCase() : null;
  const avatarLabel = (isLoggedIn ? initial : ui.account[0] || 'A').slice(0, 2).toUpperCase();

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        className={styles.avatarBtn}
        onClick={toggleDropdown}
        title={email || ui.account}
        aria-label={email || ui.account}
      >
        <Avatar
          size="small"
          variant="text"
          label={avatarLabel}
          badge={false}
        />
      </button>

      {open && (
        <div className={styles.menu}>
          {isLoggedIn ? (
            view === 'mcp' ? (
              <McpSettingsView session={session} onBack={() => setView('menu')} />
            ) : view === 'billing' ? (
              <div className={styles.billingView}>
                <div className={styles.billingTitle}>{ui.billing}</div>
                <div className={styles.billingPlan}>
                  {usage?.plan === 'pro' ? ui.patron : usage?.isTrial ? ui.trial : ui.free} {ui.planSuffix}
                  {usage?.isTrial && usage?.trialExpiresAt && (
                    <span className={styles.billingCancelNote}>
                      {' '}{ui.daysRemaining(Math.max(0, Math.ceil((new Date(usage.trialExpiresAt) - openedAtMs) / (1000 * 60 * 60 * 24))))}
                    </span>
                  )}
                  {usage?.cancelAtPeriodEnd && usage?.currentPeriodEnd && (
                    <span className={styles.billingCancelNote}>
                      {' '}{ui.cancelsOn(new Date(usage.currentPeriodEnd).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US'))}
                    </span>
                  )}
                </div>
                {usage && (
                  <div className={styles.billingUsage}>
                    {ui.messagesUsed(usage.used, usage.limit)}
                  </div>
                )}
                {usage?.plan === 'pro' ? (
                  <>
                    <div className={styles.billingThankYou}>
                      {ui.patronThanks}
                    </div>
                    <button
                      className={styles.billingActionBtn}
                      onClick={handleManageSubscription}
                    >
                      {ui.manageSubscription}
                    </button>
                  </>
                ) : usage?.isTrial ? (
                  <>
                    <div className={styles.billingThankYou}>
                      {ui.trialAfter}
                    </div>
                    <Link
                      className={styles.billingActionBtn}
                      to="/upgrade"
                      onClick={() => { posthog.capture('upgrade_clicked', { source: 'billing_menu' }); closeDropdown(); }}
                    >
                      {ui.becomePatron}
                    </Link>
                  </>
                ) : (
                  <>
                    <ul className={styles.billingFeatures}>
                      <li>{ui.featureMessages}</li>
                      <li>{ui.featureBeta}</li>
                      <li>{ui.featureSupport}</li>
                    </ul>
                    <Link
                      className={styles.billingActionBtn}
                      to="/upgrade"
                      onClick={() => { posthog.capture('upgrade_clicked', { source: 'billing_menu' }); closeDropdown(); }}
                    >
                      {ui.becomePatron}
                    </Link>
                  </>
                )}
                <button
                  className={styles.billingBackBtn}
                  onClick={() => setView('menu')}
                >
                  {ui.back}
                </button>
              </div>
            ) : (
              <>
                <div className={styles.emailSection}>
                  <div className={styles.emailLabel}>{ui.account}</div>
                  <div className={styles.emailValue}>{email}</div>
                </div>
                <div className={styles.menuItems}>
                  <button
                    className={styles.menuItem}
                    onClick={() => setView('billing')}
                  >
                    {ui.billing}
                  </button>
                  {usage?.hasMcpAccess && (
                    <button
                      className={styles.menuItem}
                      onClick={() => setView('mcp')}
                    >
                      {ui.mcpServers} <span className={styles.betaBadge}>beta</span>
                    </button>
                  )}
                  <button
                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    onClick={handleSignOut}
                  >
                    {ui.signOut}
                  </button>
                </div>
              </>
            )
          ) : (
            <div className={styles.menuItems}>
              <button
                className={styles.googleBtn}
                onClick={handleGoogleAuth}
              >
                <GoogleIcon />
                {ui.continueWithGoogle}
              </button>
              {error ? <div className={styles.loginError}>{error}</div> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
