import crypto from 'node:crypto';
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
const MODEL = 'claude-haiku-4-5-20251001';
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

type FlashcardColor = 'blue' | 'yellow' | 'green' | 'purple' | 'red' | 'teal' | 'orange' | 'pink';

type Flashcard = {
  id: string;
  front: string;
  back: string;
  color: FlashcardColor;
  order: number;
  type?: 'card';
};

type EmptyFlashcard = {
  id: string;
  type: 'empty';
  front: string;
  back: string;
  color?: FlashcardColor;
  order?: number;
};

type StoredFlashcard = Flashcard | EmptyFlashcard;
type HttpError = Error & { status?: number };

const COLOR_VALUES: FlashcardColor[] = ['blue', 'yellow', 'green', 'purple', 'red', 'teal', 'orange', 'pink'];

const GenerateSchema = z.object({
  projectId: z.string().uuid(),
  pages: z.record(z.string(), z.string()).optional().default({}),
});

const GetSchema = z.object({
  projectId: z.string().uuid(),
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

function buildDocumentContext(project: { title: string; subtitle?: string | null; pages?: Record<string, string> | null }, incomingPages?: Record<string, string>) {
  const pages = (incomingPages && Object.keys(incomingPages).length > 0 ? incomingPages : (project.pages || {})) as Record<string, string>;
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
    parts.push(content);
  }

  return parts.join('\n\n').trim();
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
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

function normalizeColor(value: unknown, fallbackIndex: number): FlashcardColor {
  const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (COLOR_VALUES.includes(str as FlashcardColor)) return str as FlashcardColor;
  return COLOR_VALUES[fallbackIndex % COLOR_VALUES.length];
}

function makeEmptyCard(message?: string): EmptyFlashcard[] {
  return [{
    id: crypto.randomUUID(),
    type: 'empty',
    front: 'Aún no hay suficiente contenido',
    back: message || 'Agrega un poco más de contenido en tu apunte y luego vuelve a generar tarjetas. Intenta incluir ideas clave, conceptos o secciones con algo de desarrollo.',
    color: 'blue',
    order: 1,
  }];
}

const FLASHCARDS_SYSTEM_PROMPT = `Eres un asistente que crea flashcards de estudio a partir de apuntes. Debes basarte estrictamente en el contenido provisto, respetar el orden natural del apunte y generar tarjetas claras y útiles para repasar.

Reglas:
- No inventes contenido fuera del apunte.
- Mantén el mismo idioma del apunte; si es ambiguo, usa español.
- Decide cuántas tarjetas generar según la longitud y densidad del apunte (pocas si es corto, más si es largo).
- Mantén las tarjetas en el orden natural del apunte.
- Usa colores variados para dar ritmo visual. Solo puedes usar estos valores de color: blue, yellow, green, purple, red, teal, orange, pink.
- Cada tarjeta debe tener: front (concepto o término) y back (definición/explicación concreta).
- Evita tarjetas redundantes.`;

async function generateCardsFromAi(anthropicClient: Anthropic, documentContext: string): Promise<StoredFlashcard[]> {
  const res = await anthropicClient.messages.create({
    model: MODEL,
    max_tokens: 2400,
    temperature: Math.min(TEMPERATURE, 0.7),
    system: FLASHCARDS_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content:
        `Genera flashcards desde este apunte. Devuelve SOLO JSON con este formato exacto:\n` +
        `{"cards":[{"front":"...","back":"...","color":"blue","order":1}]}\n\n` +
        `APUNTE:\n${documentContext}`,
    }],
  });

  const text = extractTextFromAnthropic(res);
  const parsed = safeParseJsonBlock<{ cards?: Array<{ front?: string; back?: string; color?: string; order?: number }> }>(text);
  const rawCards = Array.isArray(parsed?.cards) ? parsed!.cards : [];

  const cards = rawCards
    .map((c, index) => ({
      id: crypto.randomUUID(),
      type: 'card' as const,
      front: (c.front || '').trim(),
      back: (c.back || '').trim(),
      color: normalizeColor(c.color, index),
      order: Number.isFinite(Number(c.order)) ? Number(c.order) : index + 1,
    }))
    .filter((c) => c.front && c.back)
    .sort((a, b) => a.order - b.order)
    .map((c, idx) => ({ ...c, order: idx + 1 }));

  if (!cards.length) {
    return makeEmptyCard('No pude extraer tarjetas útiles de este apunte todavía. Prueba agregando más contenido o conceptos más desarrollados.');
  }

  return cards;
}

async function saveFlashcards(projectId: string, cards: StoredFlashcard[]) {
  const { error } = await supabase
    .from('flashcards')
    .upsert({ project_id: projectId, cards }, { onConflict: 'project_id' });
  if (error) throw error;
}

async function loadFlashcards(projectId: string): Promise<{ cards: StoredFlashcard[]; updatedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('flashcards')
    .select('cards, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    cards: Array.isArray(data.cards) ? (data.cards as StoredFlashcard[]) : [],
    updatedAt: data.updated_at || null,
  };
}

async function buildAndPersistFlashcards(params: {
  anthropicClient: Anthropic;
  projectId: string;
  userId: string;
  incomingPages?: Record<string, string>;
  mode: 'generate' | 'regenerate';
}): Promise<{ cards: StoredFlashcard[]; wordCount: number; empty: boolean }> {
  const project = await getOwnedProjectWithPages(params.projectId, params.userId);
  if (!project) {
    const err: HttpError = new Error('PROJECT_NOT_FOUND');
    err.status = 404;
    throw err;
  }

  const documentContext = buildDocumentContext(project, params.incomingPages);
  const wc = wordCount(documentContext);

  let cards: StoredFlashcard[];
  if (wc < 30) {
    cards = makeEmptyCard();
  } else {
    cards = await generateCardsFromAi(params.anthropicClient, documentContext);
  }

  if (params.mode === 'regenerate') {
    // Explicit replace flow for clarity (single HTTP op, replaces prior cards)
    await supabase.from('flashcards').delete().eq('project_id', params.projectId);
  }
  await saveFlashcards(params.projectId, cards);

  return { cards, wordCount: wc, empty: cards[0]?.type === 'empty' };
}

router.get('/:projectId', requireAuth, async (req: Request, res: Response) => {
  const parsed = GetSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project id' });
    return;
  }

  const userId = req.user!.id;
  const project = await getOwnedProjectWithPages(parsed.data.projectId, userId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const stored = await loadFlashcards(parsed.data.projectId);
    res.json({ cards: stored?.cards || [], updatedAt: stored?.updatedAt || null });
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : String(error), projectId: parsed.data.projectId }, 'Failed to load flashcards');
    res.status(500).json({ error: 'Failed to load flashcards' });
  }
});

router.post('/generate', requireAuth, requireAiEnabled, checkMessageLimit, async (req: Request, res: Response) => {
  const anthropicClient = anthro;
  if (!anthropicClient) {
    res.status(503).json({ error: 'AI disabled', code: 'AI_DISABLED' });
    return;
  }

  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }) });
    return;
  }

  const userId = req.user!.id;
  try {
    const result = await buildAndPersistFlashcards({
      anthropicClient,
      projectId: parsed.data.projectId,
      userId,
      incomingPages: parsed.data.pages,
      mode: 'generate',
    });

    await supabase.from('message_usage').insert({ user_id: userId, project_id: parsed.data.projectId });

    res.json({ cards: result.cards, meta: { wordCount: result.wordCount, empty: result.empty } });
  } catch (error: unknown) {
    const status = (error as HttpError).status || 500;
    if (status === 404) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    logger.error({ error: error instanceof Error ? error.message : String(error), projectId: parsed.data.projectId }, 'Failed to generate flashcards');
    res.status(500).json({ error: 'Failed to generate flashcards' });
  }
});

router.post('/regenerate', requireAuth, requireAiEnabled, checkMessageLimit, async (req: Request, res: Response) => {
  const anthropicClient = anthro;
  if (!anthropicClient) {
    res.status(503).json({ error: 'AI disabled', code: 'AI_DISABLED' });
    return;
  }

  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }) });
    return;
  }

  const userId = req.user!.id;
  try {
    const result = await buildAndPersistFlashcards({
      anthropicClient,
      projectId: parsed.data.projectId,
      userId,
      incomingPages: parsed.data.pages,
      mode: 'regenerate',
    });

    await supabase.from('message_usage').insert({ user_id: userId, project_id: parsed.data.projectId });

    res.json({ cards: result.cards, meta: { wordCount: result.wordCount, empty: result.empty, regenerated: true } });
  } catch (error: unknown) {
    const status = (error as HttpError).status || 500;
    if (status === 404) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    logger.error({ error: error instanceof Error ? error.message : String(error), projectId: parsed.data.projectId }, 'Failed to regenerate flashcards');
    res.status(500).json({ error: 'Failed to regenerate flashcards' });
  }
});

export default router;
