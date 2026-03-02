import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import useTheme from '../../hooks/useTheme';
import Button from './Button';
import styles from './ThemeToggle.module.css';

const ICON_BY_THEME = {
  system: Desktop,
  light: Sun,
  dark: Moon,
};

const LABEL_BY_THEME = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro',
};

export default function ThemeToggle() {
  const { themePreference, cycleTheme } = useTheme();
  const Icon = ICON_BY_THEME[themePreference] || Desktop;
  const label = LABEL_BY_THEME[themePreference] || LABEL_BY_THEME.system;

  return (
    <Button
      variant="outline"
      size="sm"
      iconOnly
      className={styles.button}
      onClick={cycleTheme}
      aria-label={`Tema actual: ${label}. Cambiar tema.`}
      title={`Tema: ${label}`}
    >
      <Icon size={16} weight="regular" />
    </Button>
  );
}
