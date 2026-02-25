import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'diless-language';
const DEFAULT_LANGUAGE = 'es';
const SUPPORTED_LANGUAGES = ['es', 'en'];

const MESSAGES = {
  es: {
    focusPage: {
      showSettings: 'Mostrar ajustes',
      hideSettings: 'Ocultar ajustes',
      offline: 'Sin conexión',
      startWriting: 'Empieza a escribir...',
      word: 'palabra',
      words: 'palabras',
      focusOff: 'Focus: Off',
      focusOn: 'Focus: On',
      languageSwitchTitle: 'Cambiar idioma',
      shortcutsAndFormatting: 'Atajos y formato',
      shortcuts: 'Atajos',
      markdown: 'Markdown',
      insertLink: 'Insertar enlace',
      bold: 'Negrita',
      italic: 'Cursiva',
      undo: 'Deshacer',
      redo: 'Rehacer',
      heading: 'Encabezado',
      strikethrough: 'Tachado',
      inlineCode: 'Código inline',
      blockquote: 'Cita',
      bulletList: 'Lista con viñetas',
      numberedList: 'Lista numerada',
      divider: 'Separador',
      link: 'Enlace',
      actions: 'Acciones',
      sharePost: 'Publicar',
      copyPost: 'Copiar texto',
      copied: 'Copiado',
      untitled: 'Sin título',
      addSubtitle: 'Agregar subtítulo...',
      addSubtitlePlaceholder: 'Agregar un subtítulo...',
      chatUnavailable: 'Chat no disponible',
      languageMenuItem: 'Idioma: {next}',
      english: 'Inglés',
      spanish: 'Español',
    },
    projectSwitcher: {
      projects: 'Proyectos',
      newProject: 'Nuevo proyecto',
      updatedAgo: 'Actualizado {time}',
      rename: 'Renombrar',
      delete: 'Eliminar',
      deleteProjectQuestion: '¿Eliminar este proyecto?',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      noProjects: 'Sin proyectos',
      viewMoreProjects: 'Ver más proyectos',
      createNewProject: 'Nuevo proyecto',
    },
    shareButton: {
      managePublishedPost: 'Gestionar publicación',
      sharePost: 'Publicar',
      published: 'Publicado',
      copy: 'Copiar',
      copied: 'Copiado',
      openInNewTab: 'Abrir en una nueva pestaña',
      authorName: 'Nombre del autor',
      yourName: 'Tu nombre',
      publishedTabs: 'Pestañas publicadas',
      tabsToPublish: 'Pestañas a publicar',
      updating: 'Actualizando...',
      updated: 'Actualizado',
      updatePublishedContent: 'Actualizar contenido publicado',
      readersWillSeeLatestChanges: 'Los lectores verán tus últimos cambios.',
      confirmUnpublish: 'Confirmar despublicación',
      unpublish: 'Despublicar',
      linkWillStopWorkingImmediately: 'El enlace dejará de funcionar inmediatamente.',
      publishing: 'Publicando...',
      publish: 'Publicar',
      anyoneWithLinkCanRead: 'Cualquiera con el enlace puede leerlo',
    },
  },
  en: {
    focusPage: {
      showSettings: 'Show settings',
      hideSettings: 'Hide settings',
      offline: 'Offline',
      startWriting: 'Start writing...',
      word: 'word',
      words: 'words',
      focusOff: 'Focus: Off',
      focusOn: 'Focus: On',
      languageSwitchTitle: 'Switch language',
      shortcutsAndFormatting: 'Shortcuts & formatting',
      shortcuts: 'Shortcuts',
      markdown: 'Markdown',
      insertLink: 'Insert link',
      bold: 'Bold',
      italic: 'Italic',
      undo: 'Undo',
      redo: 'Redo',
      heading: 'Heading',
      strikethrough: 'Strikethrough',
      inlineCode: 'Inline code',
      blockquote: 'Blockquote',
      bulletList: 'Bullet list',
      numberedList: 'Numbered list',
      divider: 'Divider',
      link: 'Link',
      actions: 'Actions',
      sharePost: 'Share post',
      copyPost: 'Copy post',
      copied: 'Copied!',
      untitled: 'Untitled',
      addSubtitle: 'Add subtitle...',
      addSubtitlePlaceholder: 'Add a subtitle...',
      chatUnavailable: 'Chat unavailable',
      languageMenuItem: 'Language: {next}',
      english: 'English',
      spanish: 'Spanish',
    },
    projectSwitcher: {
      projects: 'Projects',
      newProject: 'New Project',
      updatedAgo: 'Updated {time}',
      rename: 'Rename',
      delete: 'Delete',
      deleteProjectQuestion: 'Delete this project?',
      cancel: 'Cancel',
      loading: 'Loading...',
      noProjects: 'No projects',
      viewMoreProjects: 'View More Projects',
      createNewProject: 'New project',
    },
    shareButton: {
      managePublishedPost: 'Manage published post',
      sharePost: 'Share post',
      published: 'Published',
      copy: 'Copy',
      copied: 'Copied',
      openInNewTab: 'Open in new tab',
      authorName: 'Author name',
      yourName: 'Your name',
      publishedTabs: 'Published tabs',
      tabsToPublish: 'Tabs to publish',
      updating: 'Updating...',
      updated: 'Updated',
      updatePublishedContent: 'Update published content',
      readersWillSeeLatestChanges: 'Readers will see your latest changes.',
      confirmUnpublish: 'Confirm unpublish',
      unpublish: 'Unpublish',
      linkWillStopWorkingImmediately: 'The link will stop working immediately.',
      publishing: 'Publishing...',
      publish: 'Publish',
      anyoneWithLinkCanRead: 'Anyone with the link can read',
    },
  },
};

function getInitialLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function getMessage(messages, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), messages);
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? `{${key}}`));
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage failures
    }
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'es' ? 'en' : 'es'));
  }, []);

  const t = useCallback((key, vars) => {
    const raw = getMessage(MESSAGES[language], key) ?? getMessage(MESSAGES.en, key) ?? key;
    return typeof raw === 'string' ? interpolate(raw, vars) : key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language, toggleLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguageContext must be used within a LanguageProvider');
  return context;
}
