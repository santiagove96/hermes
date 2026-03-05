import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Book,
  Brain,
  GlobeSimple,
  List,
  TextAlignLeft,
} from '@phosphor-icons/react';
import Button from './Button';
import ThemeToggle from './ThemeToggle';
import styles from './Navbar.module.css';

function CurrentProject({ title }) {
  return (
    <>
      <span className={styles.separator}>/</span>
      <span className={styles.currentProject}>
        <TextAlignLeft size={16} weight="regular" />
        <span className={styles.currentProjectTitle}>{title}</span>
      </span>
    </>
  );
}

export default function Navbar({
  variant = 'homepage',
  title = 'Title',
  wordCount = 0,
  wordLabel = 'Palabras',
  showOnlyBrand = false,
  onNewProject,
  onSignIn,
  onSignUp,
  onAnalyze,
  analyzeControl = null,
  trainItems = [],
  accountControl = null,
  mobileMenuControl = null,
  mobileAccountControl = null,
  mobilePublishControl = null,
  mobileAnalyzeControl = null,
  publishControl = null,
  themeControl = null,
  startSlot = null,
  logoTo = '',
}) {
  const [trainOpen, setTrainOpen] = useState(false);
  const trainRef = useRef(null);
  const trainButtonRef = useRef(null);
  const trainItemsRef = useRef([]);
  const isHomepage = variant === 'homepage';
  const isNotLogged = variant === 'notLogged';
  const isProject = variant === 'project';
  const resolvedThemeControl = themeControl || <ThemeToggle />;

  useEffect(() => {
    trainItemsRef.current = trainItemsRef.current.slice(0, trainItems.length);
  }, [trainItems.length]);

  useEffect(() => {
    if (!trainOpen) return undefined;

    const focusFirstItem = () => {
      trainItemsRef.current[0]?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirstItem);

    const handlePointerDown = (event) => {
      if (trainRef.current && !trainRef.current.contains(event.target)) {
        setTrainOpen(false);
        trainButtonRef.current?.focus();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTrainOpen(false);
        trainButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const items = trainItemsRef.current.filter(Boolean);
      if (!items.length) return;

      const activeIndex = items.findIndex((item) => item === document.activeElement);
      const fallbackIndex = event.key === 'ArrowDown' ? -1 : 0;
      const currentIndex = activeIndex === -1 ? fallbackIndex : activeIndex;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;

      event.preventDefault();
      items[nextIndex]?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [trainOpen]);

  const desktopRight = (
    <div className={styles.endDesktop}>
      {!showOnlyBrand && isProject ? (
        <span className={styles.wordCountDesktop}>
          {wordCount} {wordLabel}
        </span>
      ) : null}

      {!showOnlyBrand && isHomepage ? (
        <>
          <Button
            variant="outline"
            size="sm"
            startIcon={<Book size={16} weight="regular" />}
            onClick={onNewProject}
          >
            Nuevo Proyecto
          </Button>
          {resolvedThemeControl}
          {accountControl}
        </>
      ) : null}

      {!showOnlyBrand && isNotLogged ? (
        <>
          <Button variant="default" size="sm" onClick={onSignIn}>
            Iniciar Sesión
          </Button>
          <Button variant="outline" size="sm" onClick={onSignUp}>
            Crear Cuenta
          </Button>
          {resolvedThemeControl}
        </>
      ) : null}

      {!showOnlyBrand && isProject ? (
        <>
          {analyzeControl || (
            <Button
              variant="default"
              size="sm"
              startIcon={<Brain size={16} weight="regular" />}
              onClick={onAnalyze}
            >
              Analizar
            </Button>
          )}

          <div className={styles.menuWrap} ref={trainRef}>
            <Button
              ref={trainButtonRef}
              variant="outline"
              size="sm"
              startIcon={<Book size={16} weight="regular" />}
              onClick={() => setTrainOpen((open) => !open)}
              aria-expanded={trainOpen}
              aria-haspopup="true"
              aria-controls={trainOpen ? 'navbar-train-popover' : undefined}
            >
              Entrenar
            </Button>

            {trainOpen && trainItems.length > 0 ? (
              <div
                id="navbar-train-popover"
                className={styles.menu}
                aria-label="Entrenar"
              >
                {trainItems.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    className={styles.menuItem}
                    ref={(node) => {
                      trainItemsRef.current[index] = node;
                    }}
                    onClick={() => {
                      setTrainOpen(false);
                      trainButtonRef.current?.focus();
                      item.onSelect?.();
                    }}
                  >
                    {item.icon ? <span className={styles.menuItemIcon}>{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {publishControl || (
            <Button
              variant="outline"
              size="sm"
              iconOnly
              aria-label="Publicar"
            >
              <GlobeSimple size={16} weight="regular" />
            </Button>
          )}
          {resolvedThemeControl}
          {accountControl}
        </>
      ) : null}

      {showOnlyBrand ? resolvedThemeControl : null}
    </div>
  );

  const mobileRight = (
    <div className={styles.endMobile}>
      {!showOnlyBrand && isHomepage ? (
        <>
          <Button
            variant="outline"
            size="sm"
            startIcon={<Book size={16} weight="regular" />}
            onClick={onNewProject}
          >
            Nuevo Proyecto
          </Button>
          {mobileMenuControl || (
            <Button variant="outline" size="sm" iconOnly aria-label="Menú">
              <List size={16} weight="regular" />
            </Button>
          )}
          {resolvedThemeControl}
        </>
      ) : null}

      {!showOnlyBrand && isNotLogged ? (
        <>
          <Button variant="default" size="sm" onClick={onSignIn}>
            Iniciar Sesión
          </Button>
          <Button variant="outline" size="sm" onClick={onSignUp}>
            Crear Cuenta
          </Button>
          {resolvedThemeControl}
        </>
      ) : null}

      {!showOnlyBrand && isProject ? (
        <>
          {mobileAccountControl || accountControl}
          {mobilePublishControl || publishControl}
          {mobileAnalyzeControl || analyzeControl}
          <span className={styles.wordCountMobile}>{wordCount}</span>
        </>
      ) : null}
      {showOnlyBrand ? resolvedThemeControl : null}
    </div>
  );

  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <div className={styles.start}>
          {startSlot || (
            <>
              {logoTo ? (
                <Link to={logoTo} className={styles.logoLink} aria-label="Ir a Diles">
                  <span className={styles.logo}>Diles</span>
                </Link>
              ) : (
                <span className={styles.logo}>Diles</span>
              )}
              {!showOnlyBrand && (isNotLogged || isProject) ? <CurrentProject title={title} /> : null}
            </>
          )}
        </div>

        <div className={styles.desktopOnly}>{desktopRight}</div>
        <div className={styles.mobileOnly}>{mobileRight}</div>
      </div>
    </header>
  );
}
