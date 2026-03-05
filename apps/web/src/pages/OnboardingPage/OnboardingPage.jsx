import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { checkUsernameAvailability, saveMyIdentity } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import OnboardingCheck from '../../components/OnboardingCheck/OnboardingCheck';
import styles from './OnboardingPage.module.css';

const STEP2_CHECKS = [
  { key: 'h1', label: '#', description: 'Creá un título principal' },
  { key: 'h2', label: '##', description: 'Creá un título secundario' },
  { key: 'quote', label: '>', description: 'Resalta una idea importante' },
  { key: 'bullets', label: '-', description: 'Creá una lista con viñetas' },
  { key: 'ordered', label: '1.', description: 'Creá una lista numerada' },
  { key: 'divider', label: '---', description: 'Separá secciones con divisor' },
];

const STEP3_ITEMS = [
  {
    key: 'question',
    label: 'Pregunta',
    description: 'Una afirmación que tu audiencia podría cuestionarte',
  },
  {
    key: 'suggestion',
    label: 'Sugerencia',
    description: 'Una idea que podría mejorar este fragmento',
  },
  {
    key: 'edit',
    label: 'Edición',
    description: 'Algo que se puede decir de forma más clara',
  },
];

function getStep2Completion(editor) {
  if (!editor) return {
    h1: false,
    h2: false,
    quote: false,
    bullets: false,
    ordered: false,
    divider: false,
  };

  const checks = {
    h1: false,
    h2: false,
    quote: false,
    bullets: false,
    ordered: false,
    divider: false,
  };

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 1) checks.h1 = true;
    if (node.type.name === 'heading' && node.attrs.level === 2) checks.h2 = true;
    if (node.type.name === 'blockquote') checks.quote = true;
    if (node.type.name === 'bulletList') checks.bullets = true;
    if (node.type.name === 'orderedList') checks.ordered = true;
    if (node.type.name === 'horizontalRule') checks.divider = true;
  });

  return checks;
}

function usernameReasonText(reason) {
  if (reason === 'taken') return 'Este username ya está en uso.';
  if (reason === 'reserved') return 'Este username está reservado.';
  if (reason === 'length') return 'Debe tener entre 3 y 30 caracteres.';
  if (reason === 'format') return 'Usa solo a-z, 0-9, guion y guion bajo.';
  return 'Username inválido.';
}

export default function OnboardingPage() {
  const { session, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState({
    checking: false,
    available: false,
    reason: '',
    normalized: '',
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState('');
  const [step2Checks, setStep2Checks] = useState(getStep2Completion(null));
  const [step3Checks, setStep3Checks] = useState({ question: false, suggestion: false, edit: false });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder: 'Probá escribir # seguido de espacio' }),
    ],
    content: '# Nuevo Proyecto\n\nCon comandos podrás escribir más rápido.\n\nProbá escribir # seguido de espacio',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      setStep2Checks(getStep2Completion(ed));
    },
  });

  useEffect(() => {
    if (!profileLoading) {
      setFullName(profile?.fullName || '');
      setUsername(profile?.username || '');
    }
  }, [profileLoading, profile?.fullName, profile?.username]);

  useEffect(() => {
    if (step !== 1) return undefined;

    const normalizedInput = String(username || '').trim().toLowerCase();
    if (!normalizedInput) {
      setUsernameStatus({ checking: false, available: false, reason: 'empty', normalized: '' });
      return undefined;
    }

    setUsernameStatus((prev) => ({ ...prev, checking: true }));
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(normalizedInput);
        const isSameAsCurrent = normalizedInput === String(profile?.username || '').trim().toLowerCase();
        setUsernameStatus({
          checking: false,
          available: result.available || isSameAsCurrent,
          reason: result.reason,
          normalized: result.normalized,
        });
      } catch {
        setUsernameStatus({ checking: false, available: false, reason: 'format', normalized: normalizedInput });
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [username, step, profile?.username]);

  const canContinueStep1 = useMemo(() => {
    const trimmedName = String(fullName || '').trim();
    const normalizedInput = String(username || '').trim().toLowerCase();
    if (trimmedName.length < 2 || trimmedName.length > 80) return false;
    if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalizedInput)) return false;
    if (usernameStatus.checking) return false;
    return usernameStatus.available;
  }, [fullName, username, usernameStatus.available, usernameStatus.checking]);

  const canContinueStep2 = useMemo(
    () => Object.values(step2Checks).every(Boolean),
    [step2Checks],
  );

  const canFinishStep3 = useMemo(
    () => Object.values(step3Checks).every(Boolean),
    [step3Checks],
  );

  if (!session) return <Navigate to="/" replace />;
  if (profileLoading) return null;

  const handleSaveIdentity = async (markCompleted = false) => {
    setIdentityError('');
    setIdentitySaving(true);
    try {
      await saveMyIdentity({
        fullName: String(fullName || '').trim(),
        username: String(username || '').trim().toLowerCase(),
        markCompleted,
      });
      await refreshProfile?.();
      return true;
    } catch (err) {
      setIdentityError(err?.message || 'No se pudo guardar tu identidad.');
      return false;
    } finally {
      setIdentitySaving(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (step === 1) {
      if (!canContinueStep1 || identitySaving) return;
      const ok = await handleSaveIdentity(false);
      if (ok) setStep(2);
      return;
    }

    if (step === 2) {
      if (!canContinueStep2) return;
      setStep(3);
      return;
    }

    if (!canFinishStep3 || identitySaving) return;
    const ok = await handleSaveIdentity(true);
    if (ok) {
      navigate('/', { replace: true });
    }
  };

  const handleBack = () => {
    if (step === 1) {
      navigate('/', { replace: true });
      return;
    }
    setStep((prev) => prev - 1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.overlay} />
      <section className={styles.modal} aria-label="Onboarding Diless">
        {step === 1 ? (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>Tu identidad en Diles</h1>
              <p className={styles.subtitle}>Estos datos aparecerán en tus proyectos y en tu perfil público.</p>
            </header>

            <div className={styles.content}>
              <label className={styles.field}>
                <span className={styles.label}>Nombre completo</span>
                <input
                  className={styles.input}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nombre completo"
                  maxLength={80}
                />
                <span className={styles.helpText}>Con este nombre se firmarán tus artículos cuando los compartas.</span>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Username</span>
                <input
                  className={styles.input}
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  placeholder="username"
                  maxLength={30}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <span className={styles.helpText}>
                  Tu dirección en Diles será {window.location.host}/{usernameStatus.normalized || username || 'tu-username'}
                </span>
                {String(username || '').trim() && !usernameStatus.checking && !usernameStatus.available ? (
                  <span className={styles.errorText}>{usernameReasonText(usernameStatus.reason)}</span>
                ) : null}
                {usernameStatus.checking ? <span className={styles.helpText}>Validando username...</span> : null}
              </label>

              {identityError ? <p className={styles.errorText}>{identityError}</p> : null}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>El editor</h1>
              <p className={styles.subtitle}>Probá los comandos para conocer el editor.</p>
            </header>

            <div className={`${styles.content} ${styles.contentSplit}`}>
              <aside className={styles.checklist}>
                {STEP2_CHECKS.map((check) => (
                  <OnboardingCheck
                    key={check.key}
                    label={check.label}
                    description={check.description}
                    checked={!!step2Checks[check.key]}
                  />
                ))}
              </aside>

              <div className={styles.editorBox}>
                <EditorContent editor={editor} className={styles.editor} />
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>Analizá tu escritura</h1>
              <p className={styles.subtitle}>Diles puede analizar tu artículo y marcarlo con sugerencias. Cada color tiene un significado.</p>
            </header>

            <div className={`${styles.content} ${styles.contentSplit}`}>
              <aside className={styles.checklist}>
                {STEP3_ITEMS.map((item) => (
                  <OnboardingCheck
                    key={item.key}
                    label={item.label}
                    description={item.description}
                    checked={!!step3Checks[item.key]}
                  />
                ))}
              </aside>

              <div className={styles.sampleBox}>
                <h2 className={styles.sampleTitle}>Title</h2>
                <p className={styles.sampleSubtitle}>Description</p>
                <p className={styles.sampleText}>
                  <button
                    type="button"
                    className={`${styles.highlightTag} ${styles.highlightQuestion}`}
                    onClick={() => setStep3Checks((prev) => ({ ...prev, question: true }))}
                  >
                    Afirmar que este enfoque aplica a todos los lectores
                  </button>
                  <button
                    type="button"
                    className={`${styles.highlightTag} ${styles.highlightSuggestion}`}
                    onClick={() => setStep3Checks((prev) => ({ ...prev, suggestion: true }))}
                  >
                    podría reforzarse con un ejemplo concreto
                  </button>
                  <button
                    type="button"
                    className={`${styles.highlightTag} ${styles.highlightEdit}`}
                    onClick={() => setStep3Checks((prev) => ({ ...prev, edit: true }))}
                  >
                    y una frase más directa para cerrar la idea.
                  </button>
                </p>
              </div>
            </div>
          </>
        ) : null}

        <footer className={styles.footer}>
          <span className={styles.stepCounter}>{step} de 3</span>
          <div className={styles.footerActions}>
            <button type="button" className={styles.backBtn} onClick={handleBack}>Volver</button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handlePrimaryAction}
              disabled={
                identitySaving
                || (step === 1 && !canContinueStep1)
                || (step === 2 && !canContinueStep2)
                || (step === 3 && !canFinishStep3)
              }
            >
              {step === 3 ? 'Entendido' : 'Continuar'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
