import styles from './DotGridLoader.module.css';

export default function DotGridLoader({ className = '' }) {
  return (
    <div className={`${styles.loaderWrap} ${className}`.trim()}>
      <div className={styles.loader} aria-label="Cargando" role="status">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
