import styles from './OnboardingCheck.module.css';

export default function OnboardingCheck({ label, description, checked = false }) {
  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <span className={styles.tag}>{label}</span>
        <span className={`${styles.dot} ${checked ? styles.dotChecked : ''}`} aria-hidden="true" />
      </div>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
