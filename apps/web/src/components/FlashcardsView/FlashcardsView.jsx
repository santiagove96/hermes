import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, Sparkle, X } from '@phosphor-icons/react';
import { getPlatform } from '@hermes/api';
import DotGridLoader from '../DotGridLoader/DotGridLoader';
import styles from './FlashcardsView.module.css';

const COLOR_PALETTES = {
  blue: { bg: 'rgba(66, 133, 244, 0.12)', border: 'rgba(66, 133, 244, 0.35)', text: 'rgb(36, 87, 168)' },
  yellow: { bg: 'rgba(251, 188, 4, 0.14)', border: 'rgba(251, 188, 4, 0.35)', text: 'rgb(150, 108, 0)' },
  green: { bg: 'rgba(52, 168, 83, 0.12)', border: 'rgba(52, 168, 83, 0.32)', text: 'rgb(39, 117, 62)' },
  purple: { bg: 'rgba(156, 39, 176, 0.12)', border: 'rgba(156, 39, 176, 0.3)', text: 'rgb(110, 39, 124)' },
  red: { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.28)', text: 'rgb(169, 47, 37)' },
  teal: { bg: 'rgba(0, 150, 136, 0.12)', border: 'rgba(0, 150, 136, 0.28)', text: 'rgb(0, 103, 94)' },
  orange: { bg: 'rgba(255, 152, 0, 0.13)', border: 'rgba(255, 152, 0, 0.3)', text: 'rgb(163, 96, 0)' },
  pink: { bg: 'rgba(233, 30, 99, 0.11)', border: 'rgba(233, 30, 99, 0.28)', text: 'rgb(162, 28, 74)' },
};

function normalizeBaseUrl(url) {
  return (url || '').replace(/\/$/, '');
}

function getAuthHeaders(session) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

function paletteFor(color) {
  return COLOR_PALETTES[color] || COLOR_PALETTES.blue;
}

export default function FlashcardsView({
  open,
  onClose,
  projectId,
  session,
  isOffline,
  getPages,
}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [flippedId, setFlippedId] = useState(null);
  const [visitedIds, setVisitedIds] = useState(() => new Set());
  const loadedForProjectRef = useRef(null);

  const isLoggedIn = !!session;
  const total = cards.filter((c) => c.type !== 'empty').length;
  const progress = useMemo(() => {
    if (total === 0) return { current: 0, total: cards.length ? 1 : 0 };
    let count = 0;
    for (const id of visitedIds) {
      if (cards.some((c) => c.id === id && c.type !== 'empty')) count += 1;
    }
    return { current: Math.min(count, total), total };
  }, [visitedIds, total, cards]);

  const loadSaved = useCallback(async () => {
    if (!session?.access_token || !projectId) return;
    setLoading(true);
    setErrorText('');
    try {
      const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
      const res = await fetch(`${baseUrl}/api/flashcards/${projectId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar las tarjetas.');
      const body = await res.json();
      setCards(Array.isArray(body.cards) ? body.cards : []);
      setFlippedId(null);
      setVisitedIds(new Set());
      loadedForProjectRef.current = projectId;
    } catch (err) {
      setErrorText(err?.message || 'No se pudieron cargar las tarjetas.');
    } finally {
      setLoading(false);
    }
  }, [projectId, session]);

  useEffect(() => {
    if (!open) {
      setFlippedId(null);
      setVisitedIds(new Set());
      return;
    }
    if (!isLoggedIn || !projectId || isOffline) return;
    if (loadedForProjectRef.current === projectId) return;
    void loadSaved();
  }, [open, isLoggedIn, projectId, isOffline, loadSaved]);

  const generate = useCallback(async (mode = 'generate') => {
    if (!session?.access_token || !projectId || isOffline) return;
    setGenerating(true);
    setErrorText('');
    try {
      const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
      const res = await fetch(`${baseUrl}/api/flashcards/${mode}`, {
        method: 'POST',
        headers: getAuthHeaders(session),
        body: JSON.stringify({ projectId, pages: typeof getPages === 'function' ? getPages() : {} }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'No se pudieron generar las tarjetas.');
      setCards(Array.isArray(body.cards) ? body.cards : []);
      setFlippedId(null);
      setVisitedIds(new Set());
      loadedForProjectRef.current = projectId;
    } catch (err) {
      setErrorText(err?.message || 'No se pudieron generar las tarjetas.');
    } finally {
      setGenerating(false);
    }
  }, [getPages, isOffline, projectId, session]);

  const handleFlip = useCallback((card) => {
    if (!card || card.type === 'empty') return;
    setFlippedId((prev) => (prev === card.id ? null : card.id));
    setVisitedIds((prev) => {
      const next = new Set(prev);
      next.add(card.id);
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="region" aria-label="Flashcards">
      <div className={styles.inner}>
        <div className={styles.topBar}>
          <div className={styles.leftGroup}>
            <button
              className={styles.actionBtn}
              onClick={() => generate(cards.length ? 'regenerate' : 'generate')}
              disabled={!isLoggedIn || isOffline || generating || !projectId}
              title={cards.length ? 'Regenerar tarjetas' : 'Generar tarjetas'}
            >
              {cards.length ? <ArrowsClockwise size={16} weight="regular" /> : <Sparkle size={16} weight="regular" />}
              <span>{cards.length ? 'Regenerar tarjetas' : 'Generar tarjetas'}</span>
            </button>
            {!generating && progress.total > 0 ? <span className={styles.meta}>{progress.current} / {progress.total}</span> : null}
          </div>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Cerrar tarjetas" title="Cerrar tarjetas">
            <X size={20} weight="regular" />
          </button>
        </div>

        <div className={styles.stack}>
          {!isLoggedIn ? (
            <div className={styles.centerState}>Inicia sesión para generar tarjetas.</div>
          ) : isOffline ? (
            <div className={styles.centerState}>No disponible sin conexión.</div>
          ) : loading ? (
            <div className={styles.centerState}>
              <DotGridLoader />
            </div>
          ) : cards.length === 0 ? (
            <div className={styles.centerStateCard}>
              <div className={styles.centerTitle}>Generar tarjetas</div>
              <p className={styles.centerBody}>Crea tarjetas de estudio desde tu apunte actual. Las tarjetas respetarán el orden del contenido y se podrán voltear para repasar definiciones y conceptos.</p>
              <button className={styles.primaryBtn} onClick={() => generate('generate')} disabled={generating || !projectId}>Generar tarjetas</button>
              {errorText ? <div className={styles.error}>{errorText}</div> : null}
            </div>
          ) : (
            <>
              {cards.map((card, idx) => {
                const pal = paletteFor(card.color);
                const isFlipped = flippedId === card.id;
                const isEmpty = card.type === 'empty';
                return (
                  <div
                    key={card.id || idx}
                    className={`${styles.cardWrap} ${isEmpty ? styles.cardWrapEmpty : ''}`}
                    style={{ '--fc-bg': pal.bg, '--fc-border': pal.border, '--fc-text': pal.text }}
                  >
                    <button
                      className={`${styles.cardButton} ${isFlipped ? styles.cardButtonFlipped : ''} ${isEmpty ? styles.cardButtonEmpty : ''}`}
                      onClick={() => handleFlip(card)}
                      disabled={isEmpty}
                      aria-label={isEmpty ? 'Tarjeta informativa' : `Voltear tarjeta ${idx + 1}`}
                    >
                      <div className={styles.cardInner}>
                        <div className={`${styles.cardFace} ${styles.cardFront}`}>
                          {!isEmpty ? <span className={styles.cardIndex}>{idx + 1}</span> : null}
                          <div className={styles.cardLabel}>Frente</div>
                          <div className={styles.cardFrontText}>{card.front}</div>
                        </div>
                        <div className={`${styles.cardFace} ${styles.cardBack}`}>
                          {!isEmpty ? <span className={styles.cardIndex}>{idx + 1}</span> : null}
                          <div className={styles.cardLabel}>{isEmpty ? 'Sugerencia' : 'Reverso'}</div>
                          <div className={styles.cardBackText}>{card.back}</div>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
              {errorText ? <div className={styles.errorInline}>{errorText}</div> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
