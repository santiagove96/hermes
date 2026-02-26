import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '@hermes/api';
import styles from './QASimulatorModal.module.css';

const MarkdownText = lazy(() => import('../MarkdownText/MarkdownText'));

function normalizeBaseUrl(url) {
  return (url || '').replace(/\/$/, '');
}

async function readQaStream(response, { onText, onState, onDone, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'text';

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
        try {
          const parsed = JSON.parse(line.slice(6));
          if (currentEvent === 'text') onText?.(parsed.chunk || '');
          else if (currentEvent === 'state') onState?.(parsed);
          else if (currentEvent === 'done') onDone?.(parsed);
          else if (currentEvent === 'error') onError?.(parsed);
        } catch {
          // Ignore malformed line
        }
      }
    }
  }
}

const EMPTY_SESSION = Object.freeze({
  questionNumber: 0,
  questions: [],
  answers: [],
  scores: [],
  completed: false,
});

export default function QASimulatorModal({ open, onClose, projectId, session, isOffline }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionState, setSessionState] = useState(EMPTY_SESSION);
  const [errorText, setErrorText] = useState('');
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const initializedRef = useRef(false);

  const isLoggedIn = !!session;
  const isComplete = !!sessionState.completed;

  const progressLabel = useMemo(() => {
    if (sessionState.questionNumber === 0) return 'Preparando preguntas';
    if (isComplete) return 'Simulación completada';
    return `Pregunta ${sessionState.questionNumber} de 5`;
  }, [sessionState.questionNumber, isComplete]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    initializedRef.current = false;
    setMessages([]);
    setInput('');
    setStreaming(false);
    setSessionState({ ...EMPTY_SESSION });
    setErrorText('');
  }, []);

  const sendTurn = useCallback(async ({ message, nextSessionState }) => {
    if (!session?.access_token || !projectId || streaming || isOffline) return;

    setErrorText('');
    setStreaming(true);

    const isBootstrap = (nextSessionState?.questionNumber ?? 0) === 0;

    if (!isBootstrap && message?.trim()) {
      setMessages((prev) => [...prev, { role: 'user', content: message.trim() }]);
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
      const res = await fetch(`${baseUrl}/api/qa-simulator/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          projectId,
          message: message || '',
          sessionState: nextSessionState,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let messageText = 'No se pudo iniciar la simulación.';
        try {
          const body = await res.json();
          messageText = body?.message || body?.error || messageText;
        } catch {
          // Ignore parse errors
        }
        throw new Error(messageText);
      }

      let textBuffer = '';
      let rafId = null;

      const flush = () => {
        if (!textBuffer) return;
        const chunk = textBuffer;
        textBuffer = '';
        setMessages((prev) => {
          if (!prev.length) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: (last.content || '') + chunk };
          }
          return updated;
        });
      };

      await readQaStream(res, {
        onText(chunk) {
          textBuffer += chunk;
          if (rafId == null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flush();
            });
          }
        },
        onState(nextState) {
          setSessionState(nextState);
        },
        onDone() {
          if (rafId != null) cancelAnimationFrame(rafId);
          rafId = null;
          flush();
        },
        onError(payload) {
          if (rafId != null) cancelAnimationFrame(rafId);
          rafId = null;
          flush();
          setErrorText(payload?.error || 'La simulación falló.');
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setErrorText(err?.message || 'La simulación falló.');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.content) copy.pop();
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [isOffline, projectId, session, streaming]);

  useEffect(() => {
    if (!open) {
      resetSession();
      return;
    }
    if (!isLoggedIn || !projectId || isOffline) return;
    if (initializedRef.current) return;

    initializedRef.current = true;
    void sendTurn({ message: '', nextSessionState: { ...EMPTY_SESSION } });
  }, [open, isLoggedIn, projectId, isOffline, sendTurn, resetSession]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || streaming || isComplete) return;
    setInput('');
    await sendTurn({ message: text, nextSessionState: sessionState });
  };

  const handleRestart = async () => {
    resetSession();
    initializedRef.current = true;
    await sendTurn({ message: '', nextSessionState: { ...EMPTY_SESSION } });
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Q&A Simulation">
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTitle}>
              Q&amp;A Simulation
              <span className={styles.headerMeta}> · {progressLabel}</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {isComplete && (
              <button className={styles.restartBtn} onClick={handleRestart} disabled={streaming}>
                Nueva simulación
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar simulación">
              ×
            </button>
          </div>
        </div>

        <div className={styles.messages}>
          {!isLoggedIn ? (
            <div className={styles.systemNote}>Inicia sesión para usar la simulación de preguntas y respuestas.</div>
          ) : isOffline ? (
            <div className={styles.systemNote}>No disponible sin conexión.</div>
          ) : messages.length === 0 && streaming ? (
            <div className={styles.systemNote}>Generando preguntas de simulación...</div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`${styles.msgRow} ${msg.role === 'assistant' ? styles.msgAssistant : styles.msgUser}`}>
                <div className={styles.bubble}>
                  {msg.role === 'assistant' ? (
                    <Suspense fallback={<span>{msg.content}</span>}>
                      <MarkdownText value={msg.content} />
                    </Suspense>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className={styles.footer}>
          {errorText ? <div className={styles.error}>{errorText}</div> : null}
          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isLoggedIn || isOffline || streaming || isComplete}
              placeholder={
                isComplete
                  ? 'La simulación terminó. Puedes iniciar una nueva.'
                  : streaming
                    ? 'La simulación está respondiendo...'
                    : 'Escribe tu respuesta...'
              }
            />
            <button className={styles.sendBtn} type="submit" disabled={!input.trim() || streaming || isComplete || !isLoggedIn || isOffline}>
              Enviar
            </button>
          </form>
          <div className={styles.footerActions}>
            <div className={styles.status}>
              {sessionState.answers.length} respuestas enviadas
            </div>
            {!isComplete && (
              <button className={styles.ghostBtn} onClick={handleRestart} disabled={streaming || !isLoggedIn || isOffline}>
                Nueva simulación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
