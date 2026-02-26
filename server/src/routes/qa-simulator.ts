import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { checkMessageLimit } from '../middleware/usageGate.js';
import logger from '../lib/logger.js';

const router = Router();

const AI_ENABLED = process.env.AI_ENABLED !== 'false';
const anthro = AI_ENABLED && process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TEMPERATURE = Number.isFinite(Number(process.env.ANTHROPIC_TEMPERATURE))
  ? Math.min(1, Math.max(0, Number(process.env.ANTHROPIC_TEMPERATURE)))
  : 0.7;

function requireAiEnabled(_req: Request, res: Response, next: () => void) {
  if (!AI_ENABLED || !anthro) {
    res.status(503).json({
      error: 'AI assistant is disabled',
      code: 'AI_DISABLED',
      message: 'AI features are turned off for this deployment.',
    });
    return;
  }
  next();
}

type QaAnswer = {
  questionNumber: number;
  question: string;
  answer: string;
};

type QaSessionState = {
  questionNumber: number; // 0 = not started, 1-5 = current/last asked, 5 + completed for final state
  questions: string[];
  answers: QaAnswer[];
  scores: string[]; // qualitative feedback snapshots, no numeric score
  completed?: boolean;
};

const QaAnswerSchema = z.object({
  questionNumber: z.number().int().min(1).max(5),
  question: z.string(),
  answer: z.string(),
});

const QaSessionStateSchema = z.object({
  questionNumber: z.number().int().min(0).max(5),
  questions: z.array(z.string()).max(5).default([]),
  answers: z.array(QaAnswerSchema).max(5).default([]),
  scores: z.array(z.string()).max(5).default([]),
  completed: z.boolean().optional(),
});

const QaChatSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().max(6000).default(''),
  sessionState: QaSessionStateSchema,
});

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/&nbsp;/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function buildDocumentContext(project: { title: string; subtitle?: string | null; pages?: Record<string, string> | null }) {
  const pages = (project.pages || {}) as Record<string, string>;
  const tabOrder = ['coral', 'amber', 'sage', 'sky', 'lavender'];
  const orderedKeys = [...tabOrder, ...Object.keys(pages).filter((k) => !tabOrder.includes(k))];
  const seen = new Set<string>();
  const parts: string[] = [];

  if (project.title?.trim()) parts.push(`# ${project.title.trim()}`);
  if (project.subtitle?.trim()) parts.push(`## Subtítulo\n${project.subtitle.trim()}`);

  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = (pages[key] || '').trim();
    if (!raw) continue;
    const content = stripMarkdown(raw).trim();
    if (!content) continue;
    parts.push(`## ${key}\n${content}`);
  }

  return parts.join('\n\n').trim();
}

async function getOwnedProjectWithPages(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, title, subtitle, pages')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as { id: string; user_id: string; title: string; subtitle: string | null; pages: Record<string, string> | null };
}

function sendSseHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function createSafeSseWriter(req: Request, res: Response) {
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  const write = (data: string) => {
    if (clientDisconnected) return false;
    try {
      res.write(data);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  };

  return {
    write,
    isDisconnected: () => clientDisconnected,
  };
}

function writeEvent(write: (data: string) => boolean, event: string, payload: unknown) {
  return write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function streamText(write: (data: string) => boolean, text: string) {
  const normalized = text || '';
  const chunkSize = 80;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    if (!writeEvent(write, 'text', { chunk })) return false;
  }
  return true;
}

function extractTextFromAnthropic(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function safeParseJsonBlock<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

const QA_SYSTEM_PROMPT = `Eres un miembro real del público en una sesión de preguntas y respuestas después de una exposición. Tu trabajo es hacer preguntas difíciles pero justas, con curiosidad genuina, basadas estrictamente en el contenido del apunte del expositor.

Reglas:
- No inventes contenido que no esté en el apunte.
- Haz preguntas exigentes, específicas y realistas.
- Evita preguntas triviales o genéricas.
- Mantén un tono humano, directo y respetuoso.
- Cuando evalúes respuestas, da feedback cualitativo (qué estuvo bien, qué faltó, cómo mejorar) sin puntajes numéricos.
- Si el contenido del apunte no cubre algo, puedes señalarlo explícitamente.`;

async function generateQuestions(anthropicClient: Anthropic, documentContext: string): Promise<string[]> {
  const res = await anthropicClient.messages.create({
    model: MODEL,
    max_tokens: 1400,
    temperature: Math.min(TEMPERATURE, 0.7),
    system: QA_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content:
        `A partir del siguiente apunte, genera EXACTAMENTE 5 preguntas de público para una simulación de Q&A.\n` +
        `Devuelve SOLO JSON con este formato exacto: {"questions":["...","...","...","...","..."]}\n\n` +
        `APUNTE:\n${documentContext || '(vacío)'}`,
    }],
  });

  const text = extractTextFromAnthropic(res);
  const parsed = safeParseJsonBlock<{ questions?: string[] }>(text);
  const questions = (parsed?.questions || [])
    .map((q) => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);

  if (questions.length === 5) return questions;

  return [
    '¿Cuál dirías que es la idea central de tu exposición en una sola frase?',
    '¿Qué objeción real podría hacer alguien del público a tu punto principal?',
    '¿Qué parte de tu argumento depende más de una afirmación que todavía no desarrollaste del todo?',
    'Si alguien te pidiera una aplicación concreta para esta semana, ¿qué responderías?',
    '¿Qué pregunta difícil esperas que te hagan y cómo la responderías con claridad?',
  ];
}

async function generateTurnFeedback(
  anthropicClient: Anthropic,
  args: {
    documentContext: string;
    questions: string[];
    answers: QaAnswer[];
    currentQuestionNumber: number;
    currentQuestion: string;
    currentAnswer: string;
    isFinalQuestion: boolean;
  },
): Promise<{ feedback: string; nextQuestion?: string; finalSummary?: string }> {
  const priorAnswers = args.answers
    .map((a) => `P${a.questionNumber}: ${a.question}\nRespuesta: ${a.answer}`)
    .join('\n\n');

  const format = args.isFinalQuestion
    ? '{"feedback":"...","finalSummary":"..."}'
    : '{"feedback":"...","nextQuestion":"..."}';

  const prompt =
    `Estamos en una simulación de Q&A de 5 preguntas.\n` +
    `Pregunta actual (${args.currentQuestionNumber}/5): ${args.currentQuestion}\n` +
    `Respuesta del usuario: ${args.currentAnswer}\n\n` +
    `Preguntas planificadas:\n${args.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` +
    `${priorAnswers ? `Historial de respuestas anteriores:\n${priorAnswers}\n\n` : ''}` +
    `Evalúa cualitativamente la respuesta actual (qué estuvo bien, qué faltó, cómo mejorar). ` +
    (args.isFinalQuestion
      ? `Además, genera un resumen final de toda la simulación basado en las 5 respuestas. `
      : `Luego formula la siguiente pregunta exactamente como aparece en la lista de preguntas planificadas. `) +
    `Devuelve SOLO JSON con este formato exacto: ${format}\n\n` +
    `APUNTE BASE:\n${args.documentContext || '(vacío)'}`;

  const res = await anthropicClient.messages.create({
    model: MODEL,
    max_tokens: 1800,
    temperature: Math.min(TEMPERATURE, 0.8),
    system: QA_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractTextFromAnthropic(res);
  const parsed = safeParseJsonBlock<{ feedback?: string; nextQuestion?: string; finalSummary?: string }>(text);

  return {
    feedback: parsed?.feedback?.trim() || 'Buena respuesta. Puedes hacerla más precisa conectando mejor tu argumento con un ejemplo concreto de tu apunte.',
    nextQuestion: parsed?.nextQuestion?.trim(),
    finalSummary: parsed?.finalSummary?.trim(),
  };
}

router.post('/chat', requireAuth, requireAiEnabled, checkMessageLimit, async (req: Request, res: Response) => {
  const anthropicClient = anthro;
  if (!anthropicClient) {
    res.status(503).json({
      error: 'AI assistant is disabled',
      code: 'AI_DISABLED',
      message: 'AI features are turned off for this deployment.',
    });
    return;
  }

  const parsed = QaChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }),
    });
    return;
  }

  const { projectId, message } = parsed.data;
  const sessionState = parsed.data.sessionState as QaSessionState;
  const userId = req.user!.id;

  const project = await getOwnedProjectWithPages(projectId, userId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const documentContext = buildDocumentContext(project);

  sendSseHeaders(res);
  const { write, isDisconnected } = createSafeSseWriter(req, res);

  try {
    let responseText = '';
    let nextState: QaSessionState = { ...sessionState };

    // Start a new simulation
    if (sessionState.questionNumber === 0) {
      const questions = await generateQuestions(anthropicClient, documentContext);
      nextState = {
        questionNumber: 1,
        questions,
        answers: [],
        scores: [],
        completed: false,
      };

      responseText = `Pregunta 1 de 5\n\n${questions[0]}`;
    } else {
      const currentQuestionNumber = sessionState.questionNumber;
      if (sessionState.completed || currentQuestionNumber < 1 || currentQuestionNumber > 5) {
        res.statusCode = 400;
        writeEvent(write, 'error', { error: 'Estado de sesión inválido. Inicia una nueva simulación.' });
        res.end();
        return;
      }

      const answerText = message.trim();
      if (!answerText) {
        res.statusCode = 400;
        writeEvent(write, 'error', { error: 'La respuesta no puede estar vacía.' });
        res.end();
        return;
      }

      const currentQuestion = sessionState.questions[currentQuestionNumber - 1];
      if (!currentQuestion) {
        res.statusCode = 400;
        writeEvent(write, 'error', { error: 'Faltan preguntas en el estado de sesión. Inicia una nueva simulación.' });
        res.end();
        return;
      }

      const updatedAnswers: QaAnswer[] = [
        ...sessionState.answers,
        {
          questionNumber: currentQuestionNumber,
          question: currentQuestion,
          answer: answerText,
        },
      ];

      const turn = await generateTurnFeedback(anthropicClient, {
        documentContext,
        questions: sessionState.questions,
        answers: sessionState.answers,
        currentQuestionNumber,
        currentQuestion,
        currentAnswer: answerText,
        isFinalQuestion: currentQuestionNumber === 5,
      });

      const updatedScores = [...sessionState.scores, turn.feedback];

      if (currentQuestionNumber < 5) {
        const nextQuestionNumber = currentQuestionNumber + 1;
        const plannedNext = sessionState.questions[nextQuestionNumber - 1] || '';
        const nextQuestion = turn.nextQuestion || plannedNext;
        nextState = {
          questionNumber: nextQuestionNumber,
          questions: sessionState.questions,
          answers: updatedAnswers,
          scores: updatedScores,
          completed: false,
        };

        responseText =
          `Feedback sobre tu respuesta ${currentQuestionNumber}/5\n\n${turn.feedback}\n\n` +
          `Pregunta ${nextQuestionNumber} de 5\n\n${nextQuestion}`;
      } else {
        nextState = {
          questionNumber: 5,
          questions: sessionState.questions,
          answers: updatedAnswers,
          scores: updatedScores,
          completed: true,
        };

        responseText =
          `Feedback sobre tu respuesta 5/5\n\n${turn.feedback}\n\n` +
          `Resumen final de la simulación\n\n${turn.finalSummary || 'Buen trabajo. Tu exposición tiene una base sólida, pero puedes mejorar la precisión de tus respuestas, anticipar objeciones y apoyarte más en ejemplos concretos del apunte.'}`;
      }
    }

    if (!isDisconnected()) {
      streamText(write, responseText);
      writeEvent(write, 'state', nextState);
    }

    await supabase.from('message_usage').insert({ user_id: userId, project_id: projectId });

    if (!isDisconnected()) {
      writeEvent(write, 'done', { ok: true });
      res.end();
    }
  } catch (error: any) {
    logger.error({ error: error?.message, projectId }, 'Q&A simulator stream failed');
    if (!isDisconnected()) {
      writeEvent(write, 'error', { error: 'Stream failed' });
      res.end();
    }
  }
});

export default router;
