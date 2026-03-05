import styles from './Input.module.css';

export default function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  helpText,
  error,
  maxLength,
  type = 'text',
  autoCapitalize,
  autoCorrect,
  autoComplete,
  disabled = false,
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input
        id={id}
        className={`${styles.input} ${error ? styles.inputError : ''}`.trim()}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        type={type}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      {error ? <span className={styles.errorText}>{error}</span> : null}
      {!error && helpText ? <span className={styles.helpText}>{helpText}</span> : null}
    </label>
  );
}
