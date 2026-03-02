import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { createPortalSession } from '@hermes/api';
import { supabase } from '../../lib/supabase';
import useAuth from '../../hooks/useAuth';
import useLanguage from '../../hooks/useLanguage';
import useUsage from '../../hooks/useUsage';
import Avatar from '../../components/ui/Avatar';
import McpSettingsView from './McpSettingsView';
import styles from './UserMenu.module.css';

const USER_MENU_TEXT = {
  es: {
    account: 'Cuenta',
    changePassword: 'Cambiar contraseña',
    newPassword: 'Nueva contraseña',
    confirmNewPassword: 'Confirmar nueva contraseña',
    passwordUpdated: 'Contraseña actualizada',
    cancel: 'Cancelar',
    updating: 'Actualizando...',
    update: 'Actualizar',
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
    signIn: 'Iniciar sesión',
    signUp: 'Registrarse',
    email: 'Email',
    password: 'Contraseña',
    forgotPasswordQ: '¿Olvidaste tu contraseña?',
    signingIn: 'Ingresando...',
    logIn: 'Entrar',
    noAccount: '¿No tienes cuenta?',
    alreadyHaveAccount: '¿Ya tienes cuenta?',
    creatingAccount: 'Creando cuenta...',
    checkYourEmail: 'Revisa tu email',
    signupDoneText: (email) => `Enviamos un link de confirmación a ${email}. Haz click para activar tu cuenta.`,
    goToLogin: 'Ir al login',
    resetPassword: 'Restablecer contraseña',
    sending: 'Enviando...',
    sendResetLink: 'Enviar link de recuperación',
    rememberPassword: '¿Recordaste tu contraseña?',
    forgotDoneText: (email) => `Enviamos un link para restablecer tu contraseña a ${email}. Haz click para definir una nueva.`,
    backToSignIn: 'Volver a iniciar sesión',
    passwordMin: 'La contraseña debe tener al menos 6 caracteres',
    passwordsNoMatch: 'Las contraseñas no coinciden',
    failedUpdatePassword: 'No se pudo actualizar la contraseña',
    failedSignIn: 'No se pudo iniciar sesión',
    failedCreateAccount: 'No se pudo crear la cuenta',
    failedSendResetLink: 'No se pudo enviar el link de recuperación',
  },
  en: {
    account: 'Account',
    changePassword: 'Change Password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    passwordUpdated: 'Password updated',
    cancel: 'Cancel',
    updating: 'Updating...',
    update: 'Update',
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
    signIn: 'Sign In',
    signUp: 'Sign Up',
    email: 'Email',
    password: 'Password',
    forgotPasswordQ: 'Forgot password?',
    signingIn: 'Signing in...',
    logIn: 'Log in',
    noAccount: 'No account?',
    alreadyHaveAccount: 'Already have an account?',
    creatingAccount: 'Creating account...',
    checkYourEmail: 'Check your email',
    signupDoneText: (email) => `A confirmation link was sent to ${email}. Click it to activate your account.`,
    goToLogin: 'Go to login',
    resetPassword: 'Reset password',
    sending: 'Sending...',
    sendResetLink: 'Send reset link',
    rememberPassword: 'Remember your password?',
    forgotDoneText: (email) => `A password reset link was sent to ${email}. Click it to set a new password.`,
    backToSignIn: 'Back to sign in',
    passwordMin: 'Password must be at least 6 characters',
    passwordsNoMatch: 'Passwords do not match',
    failedUpdatePassword: 'Failed to update password',
    failedSignIn: 'Failed to sign in',
    failedCreateAccount: 'Failed to create account',
    failedSendResetLink: 'Failed to send reset link',
  },
};

export default function UserMenu({ onDropdownOpen, onDropdownClose, renderTrigger = null }) {
  const { session, signIn, signInWithGoogle, signOut, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { usage } = useUsage(session);
  const wrapperRef = useRef(null);
  const passwordInputRef = useRef(null);
  const loginEmailRef = useRef(null);
  const signupEmailRef = useRef(null);
  const forgotEmailRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'password' | 'billing' | 'mcp' | 'login' | 'signup' | 'signupDone' | 'forgotPassword' | 'forgotPasswordDone'
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isLoggedIn = !!session;
  const email = session?.user?.email;
  const ui = language === 'es' ? USER_MENU_TEXT.es : USER_MENU_TEXT.en;

  const openDropdown = useCallback(() => {
    setOpen(true);
    onDropdownOpen?.();
  }, [onDropdownOpen]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setView('menu');
    setNewPassword('');
    setConfirmPassword('');
    setLoginEmail('');
    setLoginPassword('');
    setSignupEmail('');
    setSignupPassword('');
    setForgotEmail('');
    setError('');
    setSuccess(false);
    onDropdownClose?.();
  }, [onDropdownClose]);

  const toggleDropdown = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // Close on outside click
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

  // Escape key: back out of sub-views first, then close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (view === 'password' || view === 'billing' || view === 'mcp' || view === 'login' || view === 'signup' || view === 'signupDone' || view === 'forgotPassword' || view === 'forgotPasswordDone') {
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

  // Auto-focus inputs when switching views
  useEffect(() => {
    if (view === 'password' && passwordInputRef.current) passwordInputRef.current.focus();
    if (view === 'login' && loginEmailRef.current) loginEmailRef.current.focus();
    if (view === 'signup' && signupEmailRef.current) signupEmailRef.current.focus();
    if (view === 'forgotPassword' && forgotEmailRef.current) forgotEmailRef.current.focus();
  }, [view]);

  // Auto-close on success
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(closeDropdown, 1500);
    return () => clearTimeout(timer);
  }, [success, closeDropdown]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError(ui.passwordMin);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(ui.passwordsNoMatch);
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message || ui.failedUpdatePassword);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await signIn(loginEmail, loginPassword);
      if (err) {
        setError(err.message);
      } else {
        closeDropdown();
      }
    } catch (err) {
      setError(err.message || ui.failedSignIn);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword });
      if (err) {
        setError(err.message);
      } else {
        setView('signupDone');
      }
    } catch (err) {
      setError(err.message || ui.failedCreateAccount);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail);
      if (err) {
        setError(err.message);
      } else {
        setView('forgotPasswordDone');
      }
    } catch (err) {
      setError(err.message || ui.failedSendResetLink);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    closeDropdown();
    await signOut();
    navigate('/', { replace: true });
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
      {renderTrigger ? renderTrigger({
        open,
        toggleDropdown,
        avatarLabel,
      }) : (
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
      )}

      {open && (
        <div className={styles.menu}>
          {isLoggedIn ? (
            view === 'password' ? (
              <form className={styles.passwordForm} onSubmit={handlePasswordSubmit}>
                  <div className={styles.passwordTitle}>{ui.changePassword}</div>
                <input
                  ref={passwordInputRef}
                  className={styles.passwordInput}
                  type="password"
                  placeholder={ui.newPassword}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <input
                  className={styles.passwordInput}
                  type="password"
                  placeholder={ui.confirmNewPassword}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {error && <div className={styles.passwordError}>{error}</div>}
                {success && <div className={styles.passwordSuccess}>{ui.passwordUpdated}</div>}
                <div className={styles.passwordActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => {
                      setView('menu');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                    }}
                  >
                    {ui.cancel}
                  </button>
                  <button
                    type="submit"
                    className={styles.updateBtn}
                    disabled={submitting}
                  >
                    {submitting ? ui.updating : ui.update}
                  </button>
                </div>
              </form>
            ) : view === 'mcp' ? (
              <McpSettingsView session={session} onBack={() => setView('menu')} />
            ) : view === 'billing' ? (
              <div className={styles.billingView}>
                <div className={styles.billingTitle}>{ui.billing}</div>
                <div className={styles.billingPlan}>
                  {usage?.plan === 'pro' ? ui.patron : usage?.isTrial ? ui.trial : ui.free} {ui.planSuffix}
                  {usage?.isTrial && usage?.trialExpiresAt && (
                    <span className={styles.billingCancelNote}>
                      {' '}{ui.daysRemaining(Math.max(0, Math.ceil((new Date(usage.trialExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24))))}
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
                    onClick={() => setView('password')}
                  >
                    {ui.changePassword}
                  </button>
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
          ) : view === 'login' ? (
            <form className={styles.loginForm} onSubmit={handleLoginSubmit}>
              <div className={styles.loginTitle}>{ui.signIn}</div>
              <input
                ref={loginEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder={ui.email}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
              <input
                className={styles.loginInput}
                type="password"
                placeholder={ui.password}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              <div className={styles.forgotLink}>
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('forgotPassword'); }}>
                  {ui.forgotPasswordQ}
                </button>
              </div>
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? ui.signingIn : ui.logIn}
              </button>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={signInWithGoogle}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <div className={styles.switchLink}>
                {ui.noAccount}{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('signup'); }}>
                  {ui.signUp}
                </button>
              </div>
            </form>
          ) : view === 'signup' ? (
            <form className={styles.loginForm} onSubmit={handleSignupSubmit}>
              <div className={styles.loginTitle}>{ui.signUp}</div>
              <input
                ref={signupEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder={ui.email}
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
              />
              <input
                className={styles.loginInput}
                type="password"
                placeholder={ui.password}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                minLength={6}
                required
              />
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? ui.creatingAccount : ui.signUp}
              </button>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={signInWithGoogle}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <div className={styles.switchLink}>
                {ui.alreadyHaveAccount}{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('login'); }}>
                  {ui.logIn}
                </button>
              </div>
            </form>
          ) : view === 'signupDone' ? (
            <div className={styles.loginForm}>
              <div className={styles.loginTitle}>{ui.checkYourEmail}</div>
              <div className={styles.signupDoneText}>
                {language === 'es' ? (
                  <>Enviamos un link de confirmación a <strong>{signupEmail}</strong>. Haz click para activar tu cuenta.</>
                ) : (
                  <>A confirmation link was sent to <strong>{signupEmail}</strong>. Click it to activate your account.</>
                )}
              </div>
              <button
                type="button"
                className={styles.loginSubmitBtn}
                onClick={() => { setError(''); setView('login'); }}
              >
                {ui.goToLogin}
              </button>
            </div>
          ) : view === 'forgotPassword' ? (
            <form className={styles.loginForm} onSubmit={handleForgotSubmit}>
              <div className={styles.loginTitle}>{ui.resetPassword}</div>
              <input
                ref={forgotEmailRef}
                className={styles.loginInput}
                type="email"
                placeholder={ui.email}
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              {error && <div className={styles.loginError}>{error}</div>}
              <button
                type="submit"
                className={styles.loginSubmitBtn}
                disabled={submitting}
              >
                {submitting ? ui.sending : ui.sendResetLink}
              </button>
              <div className={styles.switchLink}>
                {ui.rememberPassword}{' '}
                <button type="button" className={styles.switchBtn} onClick={() => { setError(''); setView('login'); }}>
                  {ui.logIn}
                </button>
              </div>
            </form>
          ) : view === 'forgotPasswordDone' ? (
            <div className={styles.loginForm}>
              <div className={styles.loginTitle}>{ui.checkYourEmail}</div>
              <div className={styles.signupDoneText}>
                {language === 'es' ? (
                  <>Enviamos un link para restablecer tu contraseña a <strong>{forgotEmail}</strong>. Haz click para definir una nueva.</>
                ) : (
                  <>A password reset link was sent to <strong>{forgotEmail}</strong>. Click it to set a new password.</>
                )}
              </div>
              <button
                type="button"
                className={styles.loginSubmitBtn}
                onClick={() => { setError(''); setView('login'); }}
              >
                {ui.backToSignIn}
              </button>
            </div>
          ) : (
            <div className={styles.menuItems}>
              <button
                className={styles.menuItem}
                onClick={() => { setError(''); setView('login'); }}
              >
                {ui.signIn}
              </button>
              <button
                className={styles.menuItem}
                onClick={() => { setError(''); setView('signup'); }}
              >
                {ui.signUp}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
