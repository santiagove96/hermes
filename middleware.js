// Vercel Edge Middleware — serves OG meta tags for public article URLs.
// Handles canonicalization for:
// - /:username/:slug (new)
// - /:username (latest published)
// - /read/:shortId/:slug (legacy => canonical redirect)

const BROWSER_ENGINES = [
  'chrome/',
  'firefox/',
  'safari/',
  'edg/',
  'opera/',
  'opr/',
  'vivaldi/',
  'brave/',
  'arc/',
];

const RESERVED_PATHS = new Set([
  'api',
  'auth',
  'login',
  'signup',
  'projects',
  'upgrade',
  'read',
  'preview',
  'reset-password',
  'forgot-password',
  'onboarding',
  'assets',
]);

function isRealBrowser(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const ua = userAgent.toLowerCase();

  if (!BROWSER_ENGINES.some((engine) => ua.includes(engine))) return false;

  const isSafariOnly =
    ua.includes('safari/')
    && !ua.includes('chrome/')
    && !ua.includes('firefox/')
    && !ua.includes('edg/');

  if (!isSafariOnly) return true;

  return request.headers.get('sec-fetch-dest') === 'document';
}

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_]{1,3}(.+?)[*_]{1,3}/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/>\s+/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/---+/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchRest(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function resolveCanonicalUsername(username, supabaseUrl, headers) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;

  const profileRows = await fetchRest(
    `${supabaseUrl}/rest/v1/user_profiles?username=eq.${encodeURIComponent(normalized)}&select=username&limit=1`,
    headers,
  );
  if (profileRows?.length) return String(profileRows[0].username || '').toLowerCase();

  const legacyProfileRows = await fetchRest(
    `${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(normalized)}&select=username&limit=1`,
    headers,
  );
  if (legacyProfileRows?.length) return String(legacyProfileRows[0].username || '').toLowerCase();

  const aliasRows = await fetchRest(
    `${supabaseUrl}/rest/v1/user_profile_username_aliases?username=eq.${encodeURIComponent(normalized)}&select=user_id&limit=1`,
    headers,
  );
  if (!aliasRows?.length) return null;

  const currentRows = await fetchRest(
    `${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(aliasRows[0].user_id)}&select=username&limit=1`,
    headers,
  );

  if (currentRows?.length) return String(currentRows[0].username || '').toLowerCase();

  const currentLegacyRows = await fetchRest(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(aliasRows[0].user_id)}&select=username&limit=1`,
    headers,
  );
  if (!currentLegacyRows?.length) return null;
  return String(currentLegacyRows[0].username || '').toLowerCase();
}

async function fetchPublishedProjectByPath({ supabaseUrl, headers, username, slug }) {
  const ownerBase = `${supabaseUrl}/rest/v1/projects?published=eq.true&owner_username=eq.${encodeURIComponent(username)}&select=title,subtitle,author_name,owner_username,author_username,published_pages,published_tabs,short_id,slug,published_at`;
  const ownerQuery = slug
    ? `${ownerBase}&slug=eq.${encodeURIComponent(slug)}&limit=1`
    : `${ownerBase}&order=published_at.desc&limit=1`;

  const ownerRows = await fetchRest(ownerQuery, headers);
  if (ownerRows?.length) return ownerRows[0];

  const authorBase = `${supabaseUrl}/rest/v1/projects?published=eq.true&author_username=eq.${encodeURIComponent(username)}&select=title,subtitle,author_name,owner_username,author_username,published_pages,published_tabs,short_id,slug,published_at`;
  const authorQuery = slug
    ? `${authorBase}&slug=eq.${encodeURIComponent(slug)}&limit=1`
    : `${authorBase}&order=published_at.desc&limit=1`;
  const authorRows = await fetchRest(authorQuery, headers);
  if (!authorRows?.length) return null;
  return authorRows[0];
}

async function fetchPublishedProjectByShortId({ supabaseUrl, headers, shortId }) {
  const ownerRows = await fetchRest(
    `${supabaseUrl}/rest/v1/projects?short_id=eq.${encodeURIComponent(shortId)}&published=eq.true&select=title,subtitle,author_name,owner_username,author_username,published_pages,published_tabs,short_id,slug&limit=1`,
    headers,
  );
  if (!ownerRows?.length) return null;
  return ownerRows[0];
}

function buildOgHtml({ title, description, canonicalUrl, ogImageUrl, author }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}${author ? ` — ${escapeHtml(author)}` : ''}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Diless">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">
</head>
<body></body>
</html>`;
}

export const config = {
  matcher: '/:path*',
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const first = (parts[0] || '').toLowerCase();

  if (!parts.length || RESERVED_PATHS.has(first)) {
    // Keep handling legacy /read below.
  } else {
    // /:username or /:username/:slug
    const username = first;
    const slug = parts[1] || null;

    if (parts.length > 2) return;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    };

    try {
      const canonicalUsername = await resolveCanonicalUsername(username, supabaseUrl, headers);
      if (!canonicalUsername) return;

      const project = await fetchPublishedProjectByPath({
        supabaseUrl,
        headers,
        username: canonicalUsername,
        slug,
      });
      if (!project) return;
      const canonicalProjectUsername = String(project.owner_username || project.author_username || canonicalUsername || '').toLowerCase();
      const canonicalUrl = `${url.origin}/${canonicalProjectUsername}/${project.slug}`;

      if (isRealBrowser(request) && url.pathname !== new URL(canonicalUrl).pathname) {
        return Response.redirect(canonicalUrl, 301);
      }
      if (isRealBrowser(request)) return;

      let description = project.subtitle || '';
      if (!description) {
        const tabs = project.published_tabs || [];
        const pages = project.published_pages || {};
        for (const tab of tabs) {
          if (pages[tab]?.trim()) {
            description = stripMarkdown(pages[tab]).slice(0, 160);
            break;
          }
        }
      }

      const ogImageUrl = `${url.origin}/api/og?title=${encodeURIComponent(project.title || 'Untitled')}&author=${encodeURIComponent(project.author_name || '')}`;
      const html = buildOgHtml({
        title: project.title || 'Untitled',
        description,
        canonicalUrl,
        ogImageUrl,
        author: project.author_name || '',
      });

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch {
      return;
    }
  }

  // Legacy /read/:shortId or /read/:shortId/:slug
  if (first !== 'read') return;

  const shortId = parts[1];
  if (!shortId) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return;

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };

  try {
    const project = await fetchPublishedProjectByShortId({ supabaseUrl, headers, shortId });
    if (!project) return;

    const canonicalProjectUsername = String(project.owner_username || project.author_username || '').toLowerCase();
    const canonicalUrl = canonicalProjectUsername
      ? `${url.origin}/${canonicalProjectUsername}/${project.slug || 'essay'}`
      : `${url.origin}/read/${project.short_id}/${project.slug || 'essay'}`;

    if (isRealBrowser(request)) {
      if (url.pathname !== new URL(canonicalUrl).pathname) {
        return Response.redirect(canonicalUrl, 301);
      }
      return;
    }

    let description = project.subtitle || '';
    if (!description) {
      const tabs = project.published_tabs || [];
      const pages = project.published_pages || {};
      for (const tab of tabs) {
        if (pages[tab]?.trim()) {
          description = stripMarkdown(pages[tab]).slice(0, 160);
          break;
        }
      }
    }

    const ogImageUrl = `${url.origin}/api/og?title=${encodeURIComponent(project.title || 'Untitled')}&author=${encodeURIComponent(project.author_name || '')}`;
    const html = buildOgHtml({
      title: project.title || 'Untitled',
      description,
      canonicalUrl,
      ogImageUrl,
      author: project.author_name || '',
    });

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return;
  }
}
