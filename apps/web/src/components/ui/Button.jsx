import { forwardRef } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import styles from './Button.module.css';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const Button = forwardRef(function Button({
  type = 'button',
  variant = 'default',
  size = 'sm',
  state = 'enabled',
  loading = false,
  disabled = false,
  startIcon = null,
  endIcon = null,
  iconOnly = false,
  className = '',
  children = 'Button',
  ...props
}, ref) {
  const isLoading = loading || state === 'loading';
  const isDisabled = disabled || state === 'disabled' || isLoading;
  const isHovered = state === 'hovered';
  const isFocused = state === 'focused';
  const iconSize = size === 'lg' ? 20 : 16;

  const leading = isLoading ? (
    <CircleNotch
      size={iconSize}
      weight="regular"
      className={styles.spinner}
      aria-hidden="true"
    />
  ) : startIcon;

  const trailing = isLoading ? (
    <CircleNotch
      size={iconSize}
      weight="regular"
      className={styles.spinner}
      aria-hidden="true"
    />
  ) : endIcon;

  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        iconOnly && styles.iconOnly,
        isHovered && styles.isHovered,
        isFocused && styles.isFocused,
        isDisabled && styles.isDisabled,
        className,
      )}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {leading ? <span className={styles.icon} aria-hidden="true">{leading}</span> : null}
      {!iconOnly ? <span className={styles.label}>{children}</span> : null}
      {trailing ? <span className={styles.icon} aria-hidden="true">{trailing}</span> : null}
      {iconOnly && !leading && !trailing ? (
        <span className={styles.icon} aria-hidden="true">
          {children}
        </span>
      ) : null}
    </button>
  );
});

export default Button;
