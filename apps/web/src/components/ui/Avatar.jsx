import AvatarStatus from './AvatarStatus';
import styles from './Avatar.module.css';

const SIZE_CLASS = {
  large: 'large',
  medium: 'medium',
  small: 'small',
  xsmall: 'xsmall',
};

const LABEL_CLASS = {
  large: 'labelLarge',
  medium: 'labelMedium',
  small: 'labelSmall',
  xsmall: 'labelXsmall',
};

export default function Avatar({
  label = 'SV',
  size = 'large',
  variant = 'text',
  badge = true,
  online = true,
  src = '',
  alt = '',
  className = '',
}) {
  const sizeKey = SIZE_CLASS[size] || SIZE_CLASS.large;
  const labelKey = LABEL_CLASS[size] || LABEL_CLASS.large;
  const showBadge = badge && size !== 'xsmall';

  return (
    <span
      className={[
        styles.avatar,
        styles[sizeKey],
        variant === 'pic' ? styles.pic : styles.text,
        className,
      ].filter(Boolean).join(' ')}
    >
      {variant === 'pic' && src ? (
        <img src={src} alt={alt} className={styles.image} />
      ) : (
        <span className={[styles.label, styles[labelKey]].join(' ')}>
          {label}
        </span>
      )}

      {showBadge ? (
        <span className={[styles.badge, styles[`badge${sizeKey[0].toUpperCase()}${sizeKey.slice(1)}`]].join(' ')}>
          <AvatarStatus online={online} />
        </span>
      ) : null}
    </span>
  );
}
