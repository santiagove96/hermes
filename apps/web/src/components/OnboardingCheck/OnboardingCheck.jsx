import { CheckCircle } from '@phosphor-icons/react';
import styles from './OnboardingCheck.module.css';

export default function OnboardingCheck({ label, description, checked = false }) {
  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <span className={styles.tag}>{label}</span>
        <CheckCircle
          size={20}
          weight="fill"
          aria-hidden="true"
          className={`${styles.checkIcon} ${checked ? styles.checkIconChecked : ''}`}
        />
      </div>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
