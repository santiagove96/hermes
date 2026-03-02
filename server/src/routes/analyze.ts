import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { hasUnlimitedUsageEmail } from '../middleware/usageGate.js';
import logger from '../lib/logger.js';
import { createHighlightTool, type HighlightData, type HighlightType } from '../lib/highlights.js';

const router = Router();

const AI_ENABLED = process.env.AI_ENABLED !== 'false';
const anthro = AI_ENABLED && process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';
const FREE_ANALYZE_LIMIT = 10;
const MAX_TOOL_ROUNDS = 10;
const ANTHROPIC_TIMEOUT_MS = 120_000;

type AnalyzeLevel = 'curioso' | 'comprometido' | 'exigente';

type AnalyzeAccess = {
  hasActiveSubscription: boolean;
  remainingFreeAnalyses: number;
  usedFreeAnalyses: number;
};

type HighlightStreamConfig = {
  model: string;
  allowedTypes: HighlightType[];
  focus: string;
};

const LEVEL_CONFIG: Record<AnalyzeLevel, HighlightStreamConfig[]> = {
  curioso: [
    {
      model: HAIKU_MODEL,
      allowedTypes: ['wordiness', 'edit', 'factcheck'],
      focus: 'Marca solo lo obvio: exceso de palabras, ediciones claras y afirmaciones que necesitan revisar datos.',
    },
  ],
  comprometido: [
    {
      model: HAIKU_MODEL,
      allowedTypes: ['wordiness', 'edit', 'factcheck'],
      focus: 'Concéntrate en claridad base: recortes, ediciones puntuales y afirmaciones que necesitan verificación.',
    },
    {
      model: SONNET_MODEL,
      allowedTypes: ['question', 'suggestion', 'spoken', 'intro', 'outro'],
      focus: 'Concéntrate en estructura y oratoria: preguntas que obliguen a aclarar, sugerencias de orden, frases difíciles de decir en voz alta, aperturas débiles y cierres sin impacto.',
    },
  ],
  exigente: [
    {
      model: HAIKU_MODEL,
      allowedTypes: ['wordiness', 'edit', 'factcheck'],
      focus: 'Concéntrate en claridad base: recortes, ediciones puntuales y afirmaciones que necesitan verificación.',
    },
    {
      model: SONNET_MODEL,
      allowedTypes: ['question', 'suggestion', 'spoken', 'intro', 'outro', 'weakness', 'evidence'],
      focus: 'Haz el análisis más exigente: incluye puntos débiles, falta de evidencia, problemas de estructura, de oralidad, de apertura y de cierre.',
    },
  ],
};

const AnalyzeSchema = z.object({
  projectId: z.string().uuid(),
  pages: z.record(z.string(), z.string()).default({}),
  activeTab: z.string().default('coral'),
  level: z.enum(['curioso', 'comprometido', 'exigente']),
});

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

function getMaxTokens(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 3000) return 3072;
  if (wordCount > 1500) return 2400;
  return 1600;
}

function buildSystemPrompt(allowedTypes: HighlightType[], focus: string): string {
  const labels = allowedTypes.join(', ');

  return [
    'Eres el analizador de Diles. Evalúas un borrador para ayudar a alguien a decir mejor sus ideas, ya sea hablando o escribiendo.',
    'No converses. No expliques de más. Solo marca problemas reales con highlights.',
    `Usa únicamente estos tipos: ${labels}.`,
    focus,
    'matchText debe ser una subcadena exacta del texto.',
    'Para edit y wordiness, incluye suggestedEdit.',
    'Si el texto es muy corto, devuelve pocos highlights o ninguno.',
  ].join(' ');
}

function buildUserPrompt(documentContent: string): string {
  return `Analiza este borrador y devuelve solo highlights útiles sobre el contenido provisto.\n\nBORRADOR:\n${documentContent}`;
}

async function getOwnedProject(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function getAnalyzeAccess(userId: string, email?: string): Promise<AnalyzeAccess> {
  if (hasUnlimitedUsageEmail(email)) {
    return {
      hasActiveSubscription: true,
      remainingFreeAnalyses: FREE_ANALYZE_LIMIT,
      usedFreeAnalyses: 0,
    };
  }

  let { data: profile } = await supabase
    .from('user_profiles')
    .select('plan, subscription_status')
    .eq('id', userId)
    .single();

  if (!profile) {
    await supabase.from('user_profiles').insert({ id: userId });
    profile = { plan: 'free' as const, subscription_status: 'none' };
  }

  const hasActiveSubscription = profile.plan === 'pro'
    && ['active', 'trialing', 'past_due'].includes(profile.subscription_status);

  if (hasActiveSubscription) {
    return {
      hasActiveSubscription: true,
      remainingFreeAnalyses: FREE_ANALYZE_LIMIT,
      usedFreeAnalyses: 0,
    };
  }

  const { count, error } = await supabase
    .from('analyze_usage')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;

  const usedFreeAnalyses = count ?? 0;
  return {
    hasActiveSubscription: false,
    usedFreeAnalyses,
    remainingFreeAnalyses: Math.max(0, FREE_ANALYZE_LIMIT - usedFreeAnalyses),
  };
}

async function persistAnalyzeHighlights(projectId: string, userId: string, highlights: HighlightData[]) {
  const { error: clearError } = await supabase
    .from('projects')
    .update({ highlights: [] })
    .eq('id', projectId)
    .eq('user_id', userId);

  if (clearError) throw clearError;

  if (!highlights.length) return;

  const { error: appendError } = await supabase.rpc('append_highlights', {
    p_project_id: projectId,
    p_user_id: userId,
    p_new_highlights: highlights,
  });

  if (appendError) throw appendError;
}

async function recordAnalyzeUsage(userId: string, projectId: string, level: AnalyzeLevel) {
  const { error } = await supabase
    .from('analyze_usage')
    .insert({ user_id: userId, project_id: projectId, level });

  if (error) throw error;
}

async function streamHighlightBatch({
  anthropicClient,
  model,
  allowedTypes,
  system,
  prompt,
  onHighlight,
}: {
  anthropicClient: Anthropic;
  model: string;
  allowedTypes: HighlightType[];
  system: string;
  prompt: string;
  onHighlight: (highlight: Omit<HighlightData, 'id'>) => void;
}) {
  const tool = createHighlightTool(allowedTypes);
  let messages: Anthropic.Messages.MessageParam[] = [{
    role: 'user',
    content: prompt,
  }];

  let toolRound = 0;
  let continueLoop = true;

  while (continueLoop) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), ANTHROPIC_TIMEOUT_MS);

    let response;
    try {
      response = await anthropicClient.messages.create({
        model,
        max_tokens: getMaxTokens(prompt),
        temperature: 0.2,
        system,
        tools: [tool],
        messages,
        stream: true,
      }, { signal: timeoutController.signal });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      throw error;
    }

    let currentToolName = '';
    let currentToolInput = '';
    let currentToolId = '';
    const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
    let stopReason: string | null = null;

    for await (const event of response) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        currentToolName = event.content_block.name;
        currentToolId = event.content_block.id;
        currentToolInput = '';
      } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        currentToolInput += event.delta.partial_json;
      } else if (event.type === 'content_block_stop') {
        if (currentToolName === 'add_highlight' && currentToolInput) {
          try {
            const parsedInput = JSON.parse(currentToolInput) as Omit<HighlightData, 'id'>;
            if (allowedTypes.includes(parsedInput.type)) {
              onHighlight({
                type: parsedInput.type,
                matchText: parsedInput.matchText,
                comment: parsedInput.comment,
                suggestedEdit: parsedInput.suggestedEdit || undefined,
              });
            }
            contentBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
            } as Anthropic.Messages.ToolUseBlock);
          } catch {
            logger.warn({ model }, 'Failed to parse analyze highlight tool input');
          }

          currentToolName = '';
          currentToolInput = '';
          currentToolId = '';
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    clearTimeout(timeoutId);

    if (stopReason === 'tool_use') {
      toolRound += 1;
      if (toolRound >= MAX_TOOL_ROUNDS) {
        logger.warn({ model, toolRound }, 'Analyze stream hit max tool rounds');
        break;
      }

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = contentBlocks
        .filter((block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: 'Highlight added successfully.',
        }));

      messages = [
        ...messages,
        { role: 'assistant', content: contentBlocks },
        { role: 'user', content: toolResults },
      ];
    } else {
      continueLoop = false;
    }
  }
}

router.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const access = await getAnalyzeAccess(userId, req.user?.email);
    res.json(access);
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Analyze usage fetch failed');
    res.status(503).json({ error: 'Unable to fetch analyze usage.' });
  }
});

router.post('/', requireAuth, requireAiEnabled, async (req: Request, res: Response) => {
  const anthropicClient = anthro;
  if (!anthropicClient) {
    res.status(503).json({
      error: 'AI assistant is disabled',
      code: 'AI_DISABLED',
      message: 'AI features are turned off for this deployment.',
    });
    return;
  }

  const parsed = AnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }),
    });
    return;
  }

  const { projectId, activeTab, level } = parsed.data;
  const pages = parsed.data.pages as Record<string, string>;
  const userId = req.user!.id;

  const project = await getOwnedProject(projectId, userId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const access = await getAnalyzeAccess(userId, req.user?.email);
  if (!access.hasActiveSubscription && access.remainingFreeAnalyses <= 0) {
    res.status(429).json({
      error: 'Analyze limit reached',
      code: 'ANALYZE_LIMIT_EXCEEDED',
      message: 'Ya usaste tus 10 análisis gratuitos. Suscríbete para análisis ilimitados.',
      remainingFreeAnalyses: 0,
      hasActiveSubscription: false,
    });
    return;
  }

  const activeContent = stripMarkdown((pages[activeTab] || '').trim());
  if (!activeContent) {
    res.status(400).json({
      error: 'No content to analyze',
      code: 'EMPTY_DOCUMENT',
      message: 'No hay contenido suficiente para analizar en este lienzo.',
    });
    return;
  }

  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  function safeSseWrite(data: string): boolean {
    if (clientDisconnected) return false;
    try {
      res.write(data);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  safeSseWrite(`event: usage\ndata: ${JSON.stringify({
    remainingFreeAnalyses: access.remainingFreeAnalyses,
    hasActiveSubscription: access.hasActiveSubscription,
  })}\n\n`);

  const emittedHighlightKeys = new Set<string>();
  const collectedHighlights: HighlightData[] = [];

  const emitHighlight = (incoming: Omit<HighlightData, 'id'>) => {
    const matchText = String(incoming.matchText || '').trim();
    const comment = String(incoming.comment || '').trim();
    if (!matchText || !comment) return;

    const dedupeKey = [incoming.type, matchText, comment, incoming.suggestedEdit || ''].join('::');
    if (emittedHighlightKeys.has(dedupeKey)) return;
    emittedHighlightKeys.add(dedupeKey);

    const highlight: HighlightData = {
      id: `an-${Date.now()}-${randomUUID()}`,
      type: incoming.type,
      matchText,
      comment,
      suggestedEdit: incoming.suggestedEdit || undefined,
    };

    collectedHighlights.push(highlight);
    safeSseWrite(`event: highlight\ndata: ${JSON.stringify(highlight)}\n\n`);
  };

  try {
    const prompt = buildUserPrompt(activeContent);
    const jobs = LEVEL_CONFIG[level].map((config) => streamHighlightBatch({
      anthropicClient,
      model: config.model,
      allowedTypes: config.allowedTypes,
      system: buildSystemPrompt(config.allowedTypes, config.focus),
      prompt,
      onHighlight: emitHighlight,
    }));

    await Promise.all(jobs);

    await persistAnalyzeHighlights(projectId, userId, collectedHighlights);

    if (!access.hasActiveSubscription) {
      await recordAnalyzeUsage(userId, projectId, level);
    }

    const nextRemaining = access.hasActiveSubscription
      ? access.remainingFreeAnalyses
      : Math.max(0, access.remainingFreeAnalyses - 1);

    if (!clientDisconnected) {
      safeSseWrite(`event: usage\ndata: ${JSON.stringify({
        remainingFreeAnalyses: nextRemaining,
        hasActiveSubscription: access.hasActiveSubscription,
      })}\n\n`);
      safeSseWrite(`event: done\ndata: ${JSON.stringify({
        highlightsInserted: collectedHighlights.length,
        remainingFreeAnalyses: nextRemaining,
        hasActiveSubscription: access.hasActiveSubscription,
      })}\n\n`);
      res.end();
    }
  } catch (error: unknown) {
    logger.error({ error: error instanceof Error ? error.message : String(error), projectId, level }, 'Analyze stream failed');
    if (!clientDisconnected) {
      safeSseWrite(`event: error\ndata: ${JSON.stringify({ error: 'Analyze failed' })}\n\n`);
      res.end();
    }
  }
});

export default router;
