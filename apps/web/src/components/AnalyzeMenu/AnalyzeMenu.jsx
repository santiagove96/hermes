import { useEffect, useRef, useState } from 'react';
import { Brain } from '@phosphor-icons/react';
import { fetchAnalyzeUsage, startAnalyzeStream } from '@hermes/api';
import Button from '../ui/Button';
import styles from './AnalyzeMenu.module.css';

const OPTIONS = [
  {
    level: 'curioso',
    label: 'Curioso',
    meta: 'Lo evidente',
  },
  {
    level: 'comprometido',
    label: 'Comprometido',
    meta: 'Estructura y oratoria',
  },
  {
    level: 'exigente',
    label: 'Exigente',
    meta: 'Análisis completo',
  },
];

async function readAnalyzeStream(response, { onUsage, onHighlight, onDone }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (currentEvent === 'usage') {
          onUsage?.(data);
        } else if (currentEvent === 'highlight') {
          onHighlight?.(data);
        } else if (currentEvent === 'done') {
          onDone?.(data);
        } else if (currentEvent === 'error') {
          throw new Error(data.error || 'Analyze failed');
        }
      }
    }
  }
}

export default function AnalyzeMenu({
  projectId,
  session,
  getPages,
  activeTab,
  onStart,
  onHighlight,
  onDone,
  onError,
  onUsage,
  iconOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open || !session?.access_token || usage) return;
    let cancelled = false;

    fetchAnalyzeUsage(session.access_token)
      .then((nextUsage) => {
        if (cancelled) return;
        setUsage(nextUsage);
        onUsage?.(nextUsage);
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, onUsage, session?.access_token, usage]);

  async function handleAnalyze(level) {
    if (!session?.access_token || !projectId || loading) return;

    setOpen(false);
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await startAnalyzeStream(
        projectId,
        getPages() || {},
        activeTab || 'coral',
        level,
        session.access_token,
        controller.signal,
      );
      onStart?.(level);

      await readAnalyzeStream(response, {
        onUsage(nextUsage) {
          setUsage(nextUsage);
          onUsage?.(nextUsage);
        },
        onHighlight(highlight) {
          onHighlight?.(highlight);
        },
        onDone(payload) {
          onDone?.(payload);
        },
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        onError?.(error);
      }
    } finally {
      setLoading(false);
    }
  }

  const usageLabel = usage && !usage.hasActiveSubscription
    ? `Te quedan ${usage.remainingFreeAnalyses} análisis gratuitos`
    : '';

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <Button
        variant="default"
        size="sm"
        startIcon={<Brain size={16} weight="regular" />}
        iconOnly={iconOnly}
        onClick={() => setOpen((current) => !current)}
        loading={loading}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Analizar"
      >
        {iconOnly ? null : 'Analizar'}
      </Button>

      {open ? (
        <div className={styles.menu}>
          <div className={styles.options}>
            {OPTIONS.map((option) => (
              <button
                key={option.level}
                type="button"
                className={styles.option}
                onClick={() => handleAnalyze(option.level)}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionMeta}>{option.meta}</span>
              </button>
            ))}
          </div>
          {usageLabel ? <div className={styles.usage}>{usageLabel}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
