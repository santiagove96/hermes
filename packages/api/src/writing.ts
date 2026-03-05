import { getSupabase } from './supabase';
import { getPlatform } from './config';
import { getDataSource } from './dataSource';
import { ESSAY_TITLE, ESSAY_SUBTITLE, ESSAY_PAGES } from './essay-seed';
import {
  HOME_AUTHOR_NAME,
  HOME_PAGES,
  HOME_PUBLISHED_TABS,
  HOME_SHORT_ID,
  HOME_SLUG,
  HOME_SUBTITLE,
  HOME_TITLE,
} from './home-seed';
import { WELCOME_TITLE, WELCOME_PAGES } from './welcome-seed';

// --- In-memory cache ---

const CACHE_TTL = 30_000; // 30 seconds
const MAX_CACHE_ENTRIES = 50;

type CacheEntry<T> = { data: T; timestamp: number };

const projectCache = new Map<string, CacheEntry<WritingProject | null>>();
const conversationCache = new Map<string, CacheEntry<AssistantMessage[]>>();
let projectListCache: CacheEntry<WritingProject[]> | null = null;

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    map.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, data: T): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { data, timestamp: Date.now() });
}

function invalidateProject(projectId: string): void {
  projectCache.delete(projectId);
  projectListCache = null;
}

function invalidateConversation(projectId: string): void {
  conversationCache.delete(projectId);
}

export type WritingStatus =
  | 'interview'
  | 'draft'
  | 'rewriting'
  | 'feedback'
  | 'complete';

export interface WritingProjectRow {
  id: string;
  user_id: string;
  title: string;
  subtitle: string;
  status: WritingStatus;
  content: string;
  pages: Record<string, string>;
  highlights: Highlight[];
  published: boolean;
  short_id: string | null;
  slug: string | null;
  author_name: string;
  owner_username?: string | null;
  owner_full_name?: string | null;
  published_tabs: string[];
  published_pages: Record<string, string>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WritingProject {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  status: WritingStatus;
  content: string;
  pages: Record<string, string>;
  highlights: Highlight[];
  published: boolean;
  shortId: string | null;
  slug: string | null;
  authorName: string;
  ownerUsername: string | null;
  ownerFullName: string | null;
  publishedTabs: string[];
  publishedPages: Record<string, string>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedEssay {
  title: string;
  subtitle: string;
  authorName: string;
  ownerUsername: string | null;
  pages: Record<string, string>;
  publishedTabs: string[];
  publishedAt: string;
  shortId: string | null;
  slug: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  highlights?: Highlight[];
  timestamp: string;
}

export interface Highlight {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck' | 'spoken' | 'intro' | 'outro';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
  dismissed?: boolean;
}

export type AnalyzeLevel = 'curioso' | 'comprometido' | 'exigente';

export interface AnalyzeUsageInfo {
  hasActiveSubscription: boolean;
  remainingFreeAnalyses: number;
  usedFreeAnalyses?: number;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function authHeaders(accessToken?: string): HeadersInit {
  if (!accessToken) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export function toWritingProject(row: WritingProjectRow): WritingProject {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    status: row.status,
    content: row.content || '',
    pages: (row.pages as Record<string, string>) || {},
    highlights: (row.highlights as Highlight[]) || [],
    published: row.published ?? false,
    shortId: row.short_id ?? null,
    slug: row.slug ?? null,
    authorName: row.author_name ?? '',
    ownerUsername: row.owner_username ?? null,
    ownerFullName: row.owner_full_name ?? null,
    publishedTabs: row.published_tabs ?? [],
    publishedPages: (row.published_pages as Record<string, string>) || {},
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWritingProjects(): Promise<WritingProject[]> {
  const ds = getDataSource();
  if (ds) return ds.fetchProjects();

  if (projectListCache && Date.now() - projectListCache.timestamp <= CACHE_TTL) {
    return projectListCache.data;
  }

  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const projects = (data || []).map((row) => toWritingProject(row as WritingProjectRow));
  projectListCache = { data: projects, timestamp: Date.now() };
  return projects;
}

export async function fetchWritingProject(projectId: string): Promise<WritingProject | null> {
  const ds = getDataSource();
  if (ds) return ds.fetchProject(projectId);

  const cached = getCached(projectCache, projectId);
  if (cached !== undefined) return cached;

  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single<WritingProjectRow>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  const project = toWritingProject(data);
  setCache(projectCache, projectId, project);
  return project;
}

export async function createWritingProject(
  title: string,
  userId: string,
  options?: { subtitle?: string; pages?: Record<string, string> },
): Promise<WritingProject> {
  const ds = getDataSource();
  if (ds) return ds.createProject(title, userId);

  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      title,
      user_id: userId,
      status: 'interview',
      ...(options?.subtitle && { subtitle: options.subtitle }),
      ...(options?.pages && { pages: options.pages }),
    })
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  projectListCache = null;
  return toWritingProject(data);
}

export async function updateWritingProject(
  projectId: string,
  updates: Partial<{ title: string; subtitle: string; status: WritingStatus }>,
): Promise<WritingProject> {
  const ds = getDataSource();
  if (ds) return ds.updateProject(projectId, updates);

  const { data, error } = await getSupabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select('*')
    .maybeSingle<WritingProjectRow>();

  if (error) throw error;
  if (!data) throw new Error('Project not found');
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function deleteWritingProject(projectId: string): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.deleteProject(projectId);

  const { error } = await getSupabase()
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
  invalidateConversation(projectId);
}

export async function seedEssayProject(userId: string): Promise<WritingProject> {
  const { data: project, error: projErr } = await getSupabase()
    .from('projects')
    .insert({ title: ESSAY_TITLE, subtitle: ESSAY_SUBTITLE, user_id: userId, status: 'complete', pages: ESSAY_PAGES })
    .select('*')
    .single<WritingProjectRow>();

  if (projErr) throw projErr;

  projectListCache = null;
  return toWritingProject(project);
}

export async function seedWelcomeProject(
  userId: string,
  customPages?: Record<string, string>,
): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      title: WELCOME_TITLE,
      user_id: userId,
      status: 'complete',
      pages: customPages || WELCOME_PAGES,
    })
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  projectListCache = null;
  return toWritingProject(data);
}

// --- Assistant API ---

export async function saveProjectPages(projectId: string, pages: Record<string, string>): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.savePages(projectId, pages);

  const { error } = await getSupabase()
    .from('projects')
    .update({ pages })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function saveProjectPagesWithOptions(
  projectId: string,
  pages: Record<string, string>,
  options?: { syncPublished?: boolean },
): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.savePages(projectId, pages);

  const updates: Record<string, unknown> = { pages };
  if (options?.syncPublished) {
    updates.published = true;
    updates.short_id = HOME_SHORT_ID;
    updates.slug = HOME_SLUG;
    updates.published_tabs = HOME_PUBLISHED_TABS;
    updates.published_pages = pages;
    updates.published_at = new Date().toISOString();
  }

  const { error } = await getSupabase()
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function saveProjectContent(projectId: string, content: string): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveContent(projectId, content);

  const { error } = await getSupabase()
    .from('projects')
    .update({ content })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function saveProjectHighlights(projectId: string, highlights: Highlight[]): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveHighlights(projectId, highlights);

  const { error } = await getSupabase()
    .from('projects')
    .update({ highlights })
    .eq('id', projectId);

  if (error) throw error;
  invalidateProject(projectId);
}

export async function fetchAssistantConversation(projectId: string): Promise<AssistantMessage[]> {
  const ds = getDataSource();
  if (ds) return ds.fetchConversation(projectId);

  const cached = getCached(conversationCache, projectId);
  if (cached !== undefined) return cached;

  const { data, error } = await getSupabase()
    .from('assistant_conversations')
    .select('messages')
    .eq('project_id', projectId)
    .maybeSingle<{ messages: AssistantMessage[] }>();

  if (error) throw error;

  const messages = data?.messages || [];
  setCache(conversationCache, projectId, messages);
  return messages;
}

export async function saveAssistantConversation(projectId: string, messages: AssistantMessage[]): Promise<void> {
  const ds = getDataSource();
  if (ds) return ds.saveConversation(projectId, messages);

  const { error } = await getSupabase()
    .from('assistant_conversations')
    .upsert(
      {
        project_id: projectId,
        messages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    );

  if (error) throw error;
  invalidateConversation(projectId);
}

export async function startAssistantStream(
  projectId: string,
  message: string,
  pages: Record<string, string>,
  activeTab: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ projectId, message, pages, activeTab }),
    signal,
  });

  if (!res.ok) {
    const err: any = new Error('Failed to stream assistant response');
    err.status = res.status;
    try {
      const body = await res.json();
      err.code = body.code;
      err.plan = body.plan;
      err.used = body.used;
      err.limit = body.limit;
      err.isTrial = body.isTrial;
      err.serverMessage = body.message;
    } catch {
      // Response wasn't JSON
    }
    throw err;
  }

  return res;
}

export async function startAnalyzeStream(
  projectId: string,
  pages: Record<string, string>,
  activeTab: string,
  level: AnalyzeLevel,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Response> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ projectId, pages, activeTab, level }),
    signal,
  });

  if (!res.ok) {
    const err: Error & {
      status?: number;
      code?: string;
      remainingFreeAnalyses?: number;
      hasActiveSubscription?: boolean;
      serverMessage?: string;
    } = new Error('Failed to stream analyze response');
    err.status = res.status;
    try {
      const body = await res.json();
      err.code = body.code;
      err.remainingFreeAnalyses = body.remainingFreeAnalyses;
      err.hasActiveSubscription = body.hasActiveSubscription;
      err.serverMessage = body.message;
    } catch {
      // Response wasn't JSON
    }
    throw err;
  }

  return res;
}

export async function fetchAnalyzeUsage(accessToken: string): Promise<AnalyzeUsageInfo> {
  const baseUrl = normalizeBaseUrl(getPlatform().serverBaseUrl);
  const res = await fetch(`${baseUrl}/api/analyze/usage`, {
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch analyze usage');
  }

  return res.json();
}

// --- Publishing ---

export function generateShortId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const values = crypto.getRandomValues(new Uint8Array(7));
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[values[i] % 36];
  }
  return id;
}

export function generateSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'untitled';
}

async function resolveUniqueSlugForUser(userId: string, baseSlug: string, projectId: string): Promise<string> {
  let candidate = baseSlug || 'untitled';
  let suffix = 2;

  for (;;) {
    const { data, error } = await getSupabase()
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .eq('published', true)
      .eq('slug', candidate)
      .neq('id', projectId)
      .limit(1);

    if (error) throw error;
    if (!data?.length) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

type PublishedEssayRow = {
  title: string;
  subtitle: string | null;
  author_name: string | null;
  owner_username: string | null;
  published_pages: Record<string, string> | null;
  published_tabs: string[] | null;
  published_at: string | null;
  short_id: string | null;
  slug: string | null;
};

function toPublishedEssay(row: PublishedEssayRow): PublishedEssay {
  const publishedTabSet = new Set(row.published_tabs || []);
  const filteredPages: Record<string, string> = {};
  for (const tab of publishedTabSet) {
    if ((row.published_pages as Record<string, string>)?.[tab]) {
      filteredPages[tab] = (row.published_pages as Record<string, string>)[tab];
    }
  }

  return {
    title: row.title,
    subtitle: row.subtitle ?? '',
    authorName: row.author_name ?? '',
    ownerUsername: row.owner_username ?? null,
    pages: filteredPages,
    publishedTabs: row.published_tabs || [],
    publishedAt: row.published_at || new Date(0).toISOString(),
    shortId: row.short_id ?? null,
    slug: row.slug ?? 'untitled',
  };
}

async function resolveCanonicalUsername(inputUsername: string): Promise<string | null> {
  const normalized = String(inputUsername || '').trim().toLowerCase();
  if (!normalized) return null;

  const { data: profileData, error: profileError } = await getSupabase()
    .from('user_profiles')
    .select('username')
    .eq('username', normalized)
    .limit(1);

  if (profileError) throw profileError;
  const direct = profileData?.[0] as { username?: string | null } | undefined;
  if (direct?.username) return String(direct.username).toLowerCase();

  const { data: aliasData, error: aliasError } = await getSupabase()
    .from('user_profile_username_aliases')
    .select('user_id')
    .eq('username', normalized)
    .limit(1);
  if (aliasError) throw aliasError;
  const alias = aliasData?.[0] as { user_id?: string } | undefined;
  if (!alias?.user_id) return null;

  const { data: currentProfile, error: currentError } = await getSupabase()
    .from('user_profiles')
    .select('username')
    .eq('id', alias.user_id)
    .limit(1);
  if (currentError) throw currentError;
  const canonical = currentProfile?.[0] as { username?: string | null } | undefined;
  return canonical?.username ? String(canonical.username).toLowerCase() : null;
}

export async function publishProject(
  projectId: string,
  authorName: string,
  publishedTabs: string[],
): Promise<WritingProject> {
  // Fetch current project to check if already published (reuse shortId)
  // and to snapshot current pages content
  const existing = await fetchWritingProject(projectId);
  const { data: { user } } = await getSupabase().auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profileData, error: profileError } = await getSupabase()
    .from('user_profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single();
  if (profileError) throw profileError;

  const ownerUsername = String(profileData?.username || '').trim().toLowerCase();
  if (!ownerUsername) {
    throw new Error('Complete onboarding to publish with a public username.');
  }
  const ownerFullName = String(profileData?.full_name || '').trim() || String(authorName || '').trim();

  const shortId = existing?.shortId || generateShortId();
  const baseSlug = generateSlug(existing?.title || 'untitled');
  const slug = await resolveUniqueSlugForUser(user.id, baseSlug, projectId);

  // Snapshot only the selected tabs' content into published_pages
  const currentPages = existing?.pages || {};
  const publishedPages: Record<string, string> = {};
  for (const tab of publishedTabs) {
    if (currentPages[tab]) {
      publishedPages[tab] = currentPages[tab];
    }
  }

  const { data, error } = await getSupabase()
    .from('projects')
    .update({
      published: true,
      short_id: shortId,
      slug,
      author_name: ownerFullName,
      owner_username: ownerUsername,
      owner_full_name: ownerFullName,
      published_tabs: publishedTabs,
      published_pages: publishedPages,
      published_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function unpublishProject(projectId: string): Promise<WritingProject> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update({ published: false })
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}

export async function fetchPublishedEssay(shortId: string): Promise<PublishedEssay | null> {
  return fetchPublishedEssayByShortId(shortId);
}

export async function fetchPublishedEssayByShortId(shortId: string): Promise<PublishedEssay | null> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('title, subtitle, author_name, owner_username, published_pages, published_tabs, published_at, short_id, slug')
    .eq('short_id', shortId)
    .eq('published', true)
    .single<PublishedEssayRow>();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }

  return toPublishedEssay(data);
}

export function buildCanonicalPublicUrl(input: { username: string; slug: string }): string {
  const username = String(input.username || '').trim().toLowerCase();
  const slug = String(input.slug || '').trim();
  return `${window.location.origin}/${username}/${slug}`;
}

export async function fetchPublishedEssayByPath(input: { username: string; slug?: string }): Promise<PublishedEssay | null> {
  const canonicalUsername = await resolveCanonicalUsername(input.username);
  if (!canonicalUsername) return null;

  const baseQuery = getSupabase()
    .from('projects')
    .select('title, subtitle, author_name, owner_username, published_pages, published_tabs, published_at, short_id, slug')
    .eq('published', true)
    .eq('owner_username', canonicalUsername);

  const query = input.slug
    ? baseQuery.eq('slug', input.slug).limit(1)
    : baseQuery.order('published_at', { ascending: false }).limit(1);

  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return null;
  return toPublishedEssay(data[0] as PublishedEssayRow);
}

export function getFallbackHomeEssay(): PublishedEssay {
  return {
    title: HOME_TITLE,
    subtitle: HOME_SUBTITLE,
    authorName: HOME_AUTHOR_NAME,
    ownerUsername: null,
    pages: HOME_PAGES,
    publishedTabs: HOME_PUBLISHED_TABS,
    publishedAt: new Date(0).toISOString(),
    shortId: HOME_SHORT_ID,
    slug: HOME_SLUG,
  };
}

export async function fetchHomeEssay(): Promise<PublishedEssay> {
  try {
    const essay = await fetchPublishedEssay(HOME_SHORT_ID);
    return essay || getFallbackHomeEssay();
  } catch {
    return getFallbackHomeEssay();
  }
}

export async function updatePublishSettings(
  projectId: string,
  updates: Partial<{ author_name: string; published_tabs: string[]; slug: string; owner_username: string; owner_full_name: string }>,
): Promise<WritingProject> {
  const payload = { ...updates } as Record<string, unknown>;
  if (typeof payload.slug === 'string') {
    const { data: { user } } = await getSupabase().auth.getUser();
    if (user) {
      payload.slug = await resolveUniqueSlugForUser(user.id, generateSlug(payload.slug as string), projectId);
    } else {
      payload.slug = generateSlug(payload.slug as string);
    }
  }

  const { data, error } = await getSupabase()
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select('*')
    .single<WritingProjectRow>();

  if (error) throw error;
  invalidateProject(projectId);
  return toWritingProject(data);
}
