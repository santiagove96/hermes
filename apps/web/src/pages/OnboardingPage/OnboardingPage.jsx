import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { checkUsernameAvailability, saveMyIdentity } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import OnboardingCheck from '../../components/OnboardingCheck/OnboardingCheck';
import Overlay from '../../components/Overlay/Overlay';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import useFocusMode from '../FocusPage/useFocusMode';
import useHighlights from '../FocusPage/useHighlights';
import useInlineLink from '../FocusPage/useInlineLink';
import focusStyles from '../FocusPage/FocusPage.module.css';
import HighlightPopover from '../FocusPage/HighlightPopover';
import styles from './OnboardingPage.module.css';

const STEP2_CHECKS = [
  { key: 'h1', label: '#', description: 'Creá un título principal' },
  { key: 'quote', label: '>', description: 'Resalta una idea importante' },
  { key: 'bullets', label: '-', description: 'Creá una lista con viñetas' },
  { key: 'divider', label: '---', description: 'Separá secciones con divisor' },
];

const STEP3_ITEMS = [
  {
    key: 'intro',
    label: 'INTRO',
    description: 'Tu apertura no engancha desde el primer momento',
  },
  {
    key: 'spoken',
    label: 'AL HABLAR',
    description: 'Se lee bien pero suena confuso dicho en voz alta',
  },
  {
    key: 'factcheck',
    label: 'VERIFICAR',
    description: 'Un dato que conviene confirmar antes de exponer',
  },
  {
    key: 'outro',
    label: 'CIERRE',
    description: 'Tu cierre no deja una frase memorable',
  },
];

const STEP3_TITLE = 'El miedo a hablar en público no es tu enemigo';
const STEP3_SUBTITLE = 'Es la señal de que algo importante está por suceder';
const STEP3_PARAGRAPH = `El miedo escénico no es una falla del sistema. Es el sistema funcionando exactamente como fue diseñado. Tu cuerpo no distingue entre un depredador en la selva y doscientas personas esperando que digas algo inteligente. Los estudios de Alison Wood Brooks en Harvard demostraron que las personas que reinterpretaban su ansiedad como entusiasmo antes de hablar en público rendían significativamente mejor que las que intentaban calmarse. La calma no es el objetivo. La canalización sí.`;

const ONBOARDING_HIGHLIGHTS = [
  {
    id: 'ob-1',
    type: 'intro',
    startText: 'El miedo escénico no es una falla del sistema. Es el sistema funcionando exactamente como fue diseñado.',
    comment: 'Tu apertura describe el problema pero no engancha desde el primer momento. Considerá abrir con una pregunta o una imagen más vívida.',
  },
  {
    id: 'ob-2',
    type: 'spoken',
    startText: 'Tu cuerpo no distingue entre un depredador en la selva y doscientas personas esperando que digas algo inteligente.',
    comment: "Esta frase se lee bien pero dicha en voz alta puede sonar densa. Probá pausar después de 'selva' para que respire.",
  },
  {
    id: 'ob-3',
    type: 'factcheck',
    startText: 'Los estudios de Alison Wood Brooks en Harvard demostraron que las personas que reinterpretaban su ansiedad como entusiasmo',
    comment: 'Dato específico y verificable. Considerá agregar el año o el nombre del estudio para darle más peso.',
  },
  {
    id: 'ob-4',
    type: 'outro',
    startText: 'La calma no es el objetivo. La canalización sí.',
    comment: 'Buen cierre conceptual, pero dicho en voz alta puede quedarse corto. Una frase más memorable dejaría más impacto.',
  },
];

function getStep2Completion(editor) {
  if (!editor) return {
    h1: false,
    quote: false,
    bullets: false,
    divider: false,
  };

  const checks = {
    h1: false,
    quote: false,
    bullets: false,
    divider: false,
  };

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 1) checks.h1 = true;
    if (node.type.name === 'blockquote') checks.quote = true;
    if (node.type.name === 'bulletList') checks.bullets = true;
    if (node.type.name === 'horizontalRule') checks.divider = true;
  });

  return checks;
}

function usernameReasonText(reason) {
  if (reason === 'taken') return 'Este username ya está en uso.';
  if (reason === 'reserved') return 'Este username está reservado.';
  if (reason === 'length') return 'Debe tener entre 3 y 30 caracteres.';
  if (reason === 'format') return 'Usa solo a-z, 0-9, guion y guion bajo.';
  if (reason === 'server') return 'No pudimos validar disponibilidad. Reintenta en unos segundos.';
  return 'Username inválido.';
}

export default function OnboardingPage({
  blocking = false,
  onDone = null,
  onRequestClose = null,
  lockAtFirstStep = false,
}) {
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
  const [step3Checks, setStep3Checks] = useState({
    intro: false,
    spoken: false,
    factcheck: false,
    outro: false,
  });
  const usernameRequestRef = useRef(0);
  const step3FocusPreviewRef = useRef(null);
  const { focusExtension, syncFocusMode } = useFocusMode();
  const { inlineLinkExtension } = useInlineLink();
  const {
    highlights: step3HighlightsState,
    activeHighlight: step3ActiveHighlight,
    popoverRect: step3PopoverRect,
    highlightExtension: step3HighlightExtension,
    replaceHighlights: replaceStep3Highlights,
    syncHighlights: syncStep3Highlights,
    clearHighlight: clearStep3Highlight,
    dismissHighlight: dismissStep3Highlight,
  } = useHighlights();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown,
      Highlight,
      Placeholder.configure({ placeholder: 'Escribe algo...' }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
      }),
      inlineLinkExtension,
      focusExtension,
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      setStep2Checks(getStep2Completion(ed));
    },
  });

  const step3Editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Markdown,
      Highlight,
      step3HighlightExtension,
    ],
    content: '',
    editable: false,
    immediatelyRender: false,
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
    const requestId = usernameRequestRef.current + 1;
    usernameRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(normalizedInput);
        if (usernameRequestRef.current !== requestId) return;
        const isSameAsCurrent = normalizedInput === String(profile?.username || '').trim().toLowerCase();
        setUsernameStatus({
          checking: false,
          available: result.available || isSameAsCurrent,
          reason: result.reason,
          normalized: result.normalized,
        });
      } catch {
        if (usernameRequestRef.current !== requestId) return;
        setUsernameStatus({ checking: false, available: false, reason: 'server', normalized: normalizedInput });
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

  useEffect(() => {
    if (!editor || step !== 2) return;
    syncFocusMode(editor);
  }, [editor, step, syncFocusMode]);

  const step3Highlights = useMemo(
    () => ONBOARDING_HIGHLIGHTS.map((highlight) => ({
      ...highlight,
      matchText: highlight.startText,
    })),
    [],
  );

  useEffect(() => {
    if (step !== 3) return;
    setStep3Checks({
      intro: false,
      spoken: false,
      factcheck: false,
      outro: false,
    });
    clearStep3Highlight();
    replaceStep3Highlights(step3Highlights);
  }, [step, clearStep3Highlight, replaceStep3Highlights, step3Highlights]);

  useEffect(() => {
    if (!step3Editor || step !== 3) return;
    step3Editor.commands.setContent(`# ${STEP3_TITLE}\n\n${STEP3_SUBTITLE}\n\n${STEP3_PARAGRAPH}`, { contentType: 'markdown' });
  }, [step3Editor, step]);

  useEffect(() => {
    if (!step3Editor || step !== 3) return;
    syncStep3Highlights(step3Editor);
  }, [step3Editor, step, step3HighlightsState, syncStep3Highlights]);

  useEffect(() => {
    if (!step3ActiveHighlight?.type) return;
    const key = step3ActiveHighlight.type;
    setStep3Checks((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key) || prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }, [step3ActiveHighlight]);

  if (!session) {
    if (blocking) return null;
    return <Navigate to="/" replace />;
  }
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
      setStep3Checks({
        intro: false,
        spoken: false,
        factcheck: false,
        outro: false,
      });
      clearStep3Highlight();
      replaceStep3Highlights(step3Highlights);
      if (typeof onDone === 'function') {
        onDone();
      } else {
        navigate('/', { replace: true });
      }
    }
  };

  const handleBack = () => {
    if (step === 1) {
      if (lockAtFirstStep) return;
      if (typeof onRequestClose === 'function') {
        onRequestClose();
      } else {
        navigate('/', { replace: true });
      }
      return;
    }
    setStep((prev) => prev - 1);
  };

  return (
    <div className={styles.page}>
      <Overlay />
      <section className={styles.modal} aria-label="Onboarding Diless">
        {step === 1 ? (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>Tu identidad en Diles</h1>
              <p className={styles.subtitle}>Estos datos aparecerán en tus proyectos y en tu perfil público.</p>
            </header>

            <div className={styles.content}>
              <Input
                id="onboarding-full-name"
                label="Nombre completo"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nombre completo"
                maxLength={80}
                helpText="Con este nombre se firmarán tus artículos cuando los compartas."
              />

              <Input
                id="onboarding-username"
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                placeholder="username"
                maxLength={30}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                helpText={
                  usernameStatus.checking
                    ? 'Validando username...'
                    : `Tu dirección en Diles será ${window.location.host}/${usernameStatus.normalized || username || 'tu-username'}`
                }
                error={String(username || '').trim() && !usernameStatus.checking && !usernameStatus.available
                  ? usernameReasonText(usernameStatus.reason)
                  : ''}
              />

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

              <div className={styles.focusPreviewBox}>
                <div className={styles.step2FocusFrame}>
                  <div className={`${focusStyles.editorWrap} ${styles.stepFocusEditorWrap} ${styles.step2EditorOnly}`}>
                    <EditorContent editor={editor} />
                  </div>
                </div>
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

              <div className={styles.step3Right}>
                <div ref={step3FocusPreviewRef} className={styles.focusPreviewBox}>
                  <div className={styles.step3FocusFrame}>
                    <div className={`${focusStyles.editorWrap} ${styles.stepFocusEditorWrap} ${styles.step3Editor}`}>
                      <EditorContent editor={step3Editor} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <footer className={styles.footer}>
          <span className={styles.stepCounter}>{step} de 3</span>
          <div className={styles.footerActions}>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={handleBack}
              disabled={lockAtFirstStep && step === 1}
            >
              Volver
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handlePrimaryAction}
              disabled={
                identitySaving
                || (step === 1 && !canContinueStep1)
                || (step === 2 && !canContinueStep2)
                || (step === 3 && !canFinishStep3)
              }
            >
              {step === 3 ? 'Entendido' : 'Continuar'}
            </Button>
          </div>
        </footer>
      </section>
      <HighlightPopover
        highlight={step3ActiveHighlight}
        rect={step3PopoverRect}
        boundaryRect={step3FocusPreviewRef.current?.getBoundingClientRect?.() || null}
        zIndex={700}
        onDismiss={(id) => {
          if (id) dismissStep3Highlight(id);
          else clearStep3Highlight();
        }}
        onAcceptEdit={(highlight) => {
          if (highlight?.id) dismissStep3Highlight(highlight.id);
          else clearStep3Highlight();
        }}
      />
    </div>
  );
}
