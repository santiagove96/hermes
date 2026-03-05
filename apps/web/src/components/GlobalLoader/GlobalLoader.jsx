import DotGridLoader from '../DotGridLoader/DotGridLoader';
import styles from './GlobalLoader.module.css';

export default function GlobalLoader({ label = 'Cargando...' }) {
  return (
    <main className={styles.wrap} aria-live="polite" aria-busy="true">
      <div className={styles.content}>
        <DotGridLoader />
        <p className={styles.label}>{label}</p>
      </div>
    </main>
  );
}
