import styles from './AvatarStatus.module.css';

export default function AvatarStatus({ online = true, className = '' }) {
  return (
    <span
      className={[styles.status, !online && styles.offline, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}
