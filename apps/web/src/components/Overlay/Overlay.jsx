import styles from './Overlay.module.css';

export default function Overlay({ className = '' }) {
  const classes = [styles.overlay, className].filter(Boolean).join(' ');
  return <div className={classes} aria-hidden="true" />;
}
