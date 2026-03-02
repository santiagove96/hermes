import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '@hermes/api';
import OverlayModal from '../OverlayModal/OverlayModal';
import DotGridLoader from '../DotGridLoader/DotGridLoader';
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
  const isLoggedIn = !!session;
  const isComplete = !!sessionState.completed;
  const hasStarted = streaming || messages.length > 0 || sessionState.questionNumber > 0 || sessionState.answers.length > 0;

  const progressLabel = useMemo(() => {
    if (isComplete) return 'Simulación completada';
    if (!hasStarted) return 'Listo para comenzar';
    if (sessionState.questionNumber === 0) return 'Preparando preguntas';
    return `Pregunta ${sessionState.questionNumber} de 5`;
  }, [sessionState.questionNumber, isComplete, hasStarted]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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
    }
  }, [open, resetSession]);

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
    if (!text || streaming || isComplete || !hasStarted) return;
    setInput('');
    await sendTurn({ message: text, nextSessionState: sessionState });
  };

  const handleRestart = async () => {
    resetSession();
    await sendTurn({ message: '', nextSessionState: { ...EMPTY_SESSION } });
  };

  if (!open) return null;

  const showComposer = hasStarted && !isComplete;
  const footer = showComposer ? (
    <>
      {errorText ? <div className={styles.error}>{errorText}</div> : null}
      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!isLoggedIn || isOffline || streaming || isComplete}
          placeholder={
            streaming
              ? 'La simulación está respondiendo...'
              : 'Escribe tu respuesta...'
          }
        />
        <button className={styles.sendBtn} type="submit" disabled={!input.trim() || streaming || isComplete || !isLoggedIn || isOffline}>
          Enviar
        </button>
      </form>
    </>
  ) : null;

  return (
    <OverlayModal
      open={open}
      onClose={onClose}
      title="Q&A Simulation"
      meta={progressLabel}
      bodyClassName={styles.modalBody}
      footer={footer}
      footerClassName={styles.modalFooter}
      closeLabel="Cerrar simulación"
    >
      <div className={styles.messages}>
          {!isLoggedIn ? (
            <div className={styles.systemNote}>Inicia sesión para usar la simulación de preguntas y respuestas.</div>
          ) : isOffline ? (
            <div className={styles.systemNote}>No disponible sin conexión.</div>
          ) : !hasStarted && !streaming ? (
            <div className={styles.centerStage}>
              <button className={styles.restartBtn} onClick={handleRestart} disabled={!isLoggedIn || isOffline}>
                Nueva simulación
              </button>
              {errorText ? <div className={styles.error}>{errorText}</div> : null}
            </div>
          ) : messages.length === 0 && streaming ? (
            <div className={styles.loadingState}>
              <DotGridLoader />
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
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
              ))}
              {isComplete ? (
                <div className={styles.centerStage}>
                  <button className={styles.restartBtn} onClick={handleRestart} disabled={streaming || !isLoggedIn || isOffline}>
                    Nueva simulación
                  </button>
                  {errorText ? <div className={styles.error}>{errorText}</div> : null}
                </div>
              ) : null}
            </>
          )}
          <div ref={endRef} />
      </div>
    </OverlayModal>
  );
}
