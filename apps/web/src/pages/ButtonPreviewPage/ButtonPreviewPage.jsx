import { AsteriskSimple, ArrowRight, Plus } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import styles from './ButtonPreviewPage.module.css';

const variants = ['default', 'outline', 'ghost'];
const states = ['enabled', 'hovered', 'focused', 'loading', 'disabled'];

function labelFor(variant, state) {
  return `${variant} / ${state}`;
}

export default function ButtonPreviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <p className={styles.eyebrow}>UI Preview</p>
        <h1 className={styles.title}>Button</h1>
        <p className={styles.subtitle}>
          Preview visual de las variantes `default`, `outline` y `ghost` en tamaño `sm`.
          Los estados `hovered` y `focused` están forzados para QA visual.
        </p>
      </section>

      {variants.map((variant) => (
        <section key={variant} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{variant}</h2>
          </div>

          <div className={styles.grid}>
            {states.map((state) => (
              <div key={`${variant}-${state}`} className={styles.card}>
                <div className={styles.label}>{labelFor(variant, state)}</div>
                <div className={styles.row}>
                  <Button
                    variant={variant}
                    size="sm"
                    state={state}
                    startIcon={<AsteriskSimple size={16} weight="regular" />}
                    endIcon={<ArrowRight size={16} weight="regular" />}
                  >
                    Button
                  </Button>
                  <Button
                    variant={variant}
                    size="sm"
                    state={state}
                    iconOnly
                    startIcon={<Plus size={16} weight="regular" />}
                    aria-label={`${variant} icon-only ${state}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
