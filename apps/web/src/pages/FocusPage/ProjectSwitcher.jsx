import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { fetchWritingProjects, fetchWritingProject, createWritingProject, updateWritingProject, deleteWritingProject } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import useLanguage from '../../hooks/useLanguage';
import DotGridLoader from '../../components/DotGridLoader/DotGridLoader';
import styles from './ProjectSwitcher.module.css';

const INITIAL_VISIBLE = 3;

function formatRelativeTimeLocalized(isoDate, language) {
  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target)) return '';

  const diffSeconds = Math.round((target - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const isEs = language === 'es';

  const formatAbbrev = (value, esUnit, enUnit) => {
    const abs = Math.abs(value);
    if (isEs) return `hace ${abs} ${esUnit}`;
    return `${abs}${enUnit} ago`;
  };

  if (absSeconds < 60) return formatAbbrev(diffSeconds, 'seg', 's');
  if (absSeconds < 3600) return formatAbbrev(Math.round(diffSeconds / 60), 'min', 'm');
  if (absSeconds < 86400) return formatAbbrev(Math.round(diffSeconds / 3600), 'h', 'h');
  if (absSeconds < 604800) return formatAbbrev(Math.round(diffSeconds / 86400), 'd', 'd');
  if (absSeconds < 2629800) return formatAbbrev(Math.round(diffSeconds / 604800), 'sem', 'w');
  if (absSeconds < 31557600) return formatAbbrev(Math.round(diffSeconds / 2629800), 'mes', 'mo');
  return formatAbbrev(Math.round(diffSeconds / 31557600), 'año', 'y');
}

export default function ProjectSwitcher({
  projectId,
  projectTitle,
  onDropdownOpen,
  onDropdownClose,
  onProjectRenamed,
  renderTrigger = null,
}) {
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const renameInputRef = useRef(null);
  const committingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);

  // Inline action states
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  // Lazy-fetch projects on first open
  const openDropdown = useCallback(() => {
    setOpen(true);
    onDropdownOpen?.();
    if (projects === null) {
      fetchWritingProjects()
        .then(setProjects)
        .catch(() => setProjects([]));
    }
  }, [projects, onDropdownOpen]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    setRenaming(null);
    setConfirmingDelete(null);
    onDropdownClose?.();
  }, [onDropdownClose]);

  const toggleDropdown = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closeDropdown]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (renaming) { setRenaming(null); return; }
        if (confirmingDelete) { setConfirmingDelete(null); return; }
        closeDropdown();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, closeDropdown, renaming, confirmingDelete]);

  // Auto-focus rename input
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // Create new project
  const handleCreate = async () => {
    if (creating || !session?.user?.id) return;
    setCreating(true);
    try {
      const project = await createWritingProject('', session.user.id);
      posthog.capture('project_created');
      closeDropdown();
      navigate(`/projects/${project.id}`);
    } catch {
      // Fail silently
    } finally {
      setCreating(false);
    }
  };

  // Navigate to a project (close-only if already on it)
  const handleSelect = (id) => {
    closeDropdown();
    if (id !== projectId) navigate(`/projects/${id}`);
  };

  // Rename
  const startRename = (e, project) => {
    e.stopPropagation();
    setRenameValue(project.title || '');
    setRenaming(project.id);
  };

  const commitRename = async (id) => {
    if (committingRef.current) return;
    const trimmed = renameValue.trim();
    if (!trimmed || !projects) { setRenaming(null); return; }

    committingRef.current = true;
    try {
      await updateWritingProject(id, { title: trimmed });
      setProjects(projects.map((p) => p.id === id ? { ...p, title: trimmed } : p));
      onProjectRenamed?.(id, trimmed);
    } catch {
      // Fail silently
    }
    setRenaming(null);
    committingRef.current = false;
  };

  const handleRenameKeyDown = (e, id) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitRename(id); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenaming(null); }
  };

  // Delete
  const startDelete = (e, id) => {
    e.stopPropagation();
    setConfirmingDelete(id);
  };

  const commitDelete = async (id) => {
    try {
      await deleteWritingProject(id);
      const updated = projects.filter((p) => p.id !== id);
      setProjects(updated);
      setConfirmingDelete(null);

      // If deleting the current project, navigate to first available or dashboard
      if (id === projectId) {
        const next = updated.find((p) => p.id !== id);
        closeDropdown();
        navigate(next ? `/projects/${next.id}` : '/');
      }
    } catch {
      setConfirmingDelete(null);
    }
  };

  // Sort current project to the top
  const sortedProjects = projects
    ? [...projects].sort((a, b) => (a.id === projectId ? -1 : b.id === projectId ? 1 : 0))
    : [];
  const visibleProjects = expanded ? sortedProjects : sortedProjects.slice(0, INITIAL_VISIBLE);
  const hasMore = sortedProjects.length > INITIAL_VISIBLE;

  const renderProjectItem = (p) => {
    const isCurrent = p.id === projectId;

    // Delete confirmation mode
    if (confirmingDelete === p.id) {
      return (
        <div key={p.id} className={styles.confirmRow}>
          <div className={styles.confirmLabel}>{t('projectSwitcher.deleteProjectQuestion')}</div>
          <div className={styles.confirmActions}>
            <button
              className={styles.confirmCancel}
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(null); }}
            >
              {t('projectSwitcher.cancel')}
            </button>
            <button
              className={styles.confirmDelete}
              onClick={(e) => { e.stopPropagation(); commitDelete(p.id); }}
            >
              {t('projectSwitcher.delete')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={p.id}
        className={`${styles.projectItem}${isCurrent ? ` ${styles.projectItemCurrent}` : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleSelect(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(p.id); }}
        onMouseEnter={() => { if (!isCurrent) fetchWritingProject(p.id).catch(() => {}); }}
      >
        <div className={styles.projectItemContent}>
          {renaming === p.id ? (
            <input
              ref={renameInputRef}
              className={styles.renameInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, p.id)}
              onBlur={() => commitRename(p.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className={styles.projectItemTitle}>{p.title || 'Di algo...'}</div>
              <div className={styles.projectItemTime}>{t('projectSwitcher.updatedAgo', { time: formatRelativeTimeLocalized(p.updatedAt, language) })}</div>
            </>
          )}
        </div>

        <div className={styles.itemActions}>
          <button
            className={styles.actionIconBtn}
            onClick={(e) => startRename(e, p)}
            title={t('projectSwitcher.rename')}
          >
            <PencilSimple size={14} weight="regular" />
          </button>
          <button
            className={`${styles.actionIconBtn} ${styles.actionIconDanger}`}
            onClick={(e) => startDelete(e, p.id)}
            title={t('projectSwitcher.delete')}
          >
            <Trash size={14} weight="regular" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {renderTrigger ? renderTrigger({
        open,
        toggleDropdown,
        projectTitle: projectTitle || 'Di algo...',
      }) : (
        <div className={styles.trigger}>
          <button className={styles.triggerBtn} onClick={toggleDropdown}>
            <span className={styles.labelDefault}>Diless</span>
            <span className={styles.labelHover}>{t('projectSwitcher.projects')}</span>
          </button>
          <span className={styles.sep}>/</span>
          <span className={styles.titleWrap}>
            <span className={styles.projectTitle}>
              {projectTitle || 'Di algo...'}
            </span>
          </span>
        </div>
      )}

      {open && (
        <div className={styles.menu}>
          <div className={styles.menuHeader}>
            <span className={styles.menuHeaderLabel}>{t('projectSwitcher.projects')}</span>
            <button
            className={styles.createBtn}
            onClick={handleCreate}
            disabled={creating}
            title={t('projectSwitcher.createNewProject')}
          >
              <Plus size={14} weight="regular" />
            </button>
          </div>

          {projects === null ? (
            <div className={styles.menuLoading}>
              <DotGridLoader />
            </div>
          ) : sortedProjects.length === 0 ? (
            <div className={styles.menuEmpty}>{t('projectSwitcher.noProjects')}</div>
          ) : (
            <div className={`${styles.projectList} ${expanded ? styles.projectListScrollable : ''}`}>
              {visibleProjects.map(renderProjectItem)}
            </div>
          )}

          {hasMore && !expanded && (
            <button className={styles.viewMore} onClick={() => setExpanded(true)}>
              {t('projectSwitcher.viewMoreProjects')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
