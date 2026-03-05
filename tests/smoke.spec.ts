import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const PROJECT_REF = 'hrgdccdunuoapddatlsx';
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const MOCK_USER = {
  id: 'user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'santiventura.96@gmail.com',
  email_confirmed_at: '2026-02-27T12:00:00.000Z',
  app_metadata: { provider: 'google' },
  user_metadata: {},
  identities: [],
  created_at: '2026-02-27T12:00:00.000Z',
  updated_at: '2026-02-27T12:00:00.000Z',
};

const MOCK_SESSION = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: MOCK_USER,
};

function buildProjectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'proj-1',
    user_id: MOCK_USER.id,
    title: 'Proyecto existente',
    subtitle: '',
    status: 'draft',
    content: '',
    pages: {
      coral: 'Contenido de prueba',
    },
    highlights: [],
    published: false,
    short_id: null,
    slug: null,
    author_name: '',
    published_tabs: [],
    published_pages: {},
    published_at: null,
    created_at: '2026-02-27T12:00:00.000Z',
    updated_at: '2026-02-27T12:00:00.000Z',
    ...overrides,
  };
}

async function seedAuthenticatedSession(page: Page) {
  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: AUTH_STORAGE_KEY, session: MOCK_SESSION },
  );
}

test.describe('Public app smoke', () => {
  test('renders the public home article with default reading typography', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Bienvenido a Diles', level: 1 })).toBeVisible();
    await expect(page.getByText('Muchas personas tienen ideas. Pocas las escriben bien.')).toBeVisible();

    const firstListItem = page.locator('article li').first();
    await expect(firstListItem).toHaveText('Apuntes en papel.');

    const styles = await firstListItem.evaluate((node) => {
      const computed = window.getComputedStyle(node);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing,
      };
    });

    expect(styles).toEqual({
      fontSize: '16px',
      lineHeight: '26px',
      letterSpacing: '0.3px',
    });
  });

  test('shows direct auth CTA buttons in the public navbar', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear Cuenta' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toHaveCount(0);
    await expect(page.getByPlaceholder('Contraseña')).toHaveCount(0);
  });

  test('renders Google-only entrypoints for /login and /signup', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByText('Conectando con Google...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toHaveCount(0);
    await expect(page.getByPlaceholder('Contraseña')).toHaveCount(0);

    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
    await expect(page.getByText('Conectando con Google...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toHaveCount(0);
    await expect(page.getByPlaceholder('Contraseña')).toHaveCount(0);
  });

  test('redirects unauthenticated project routes back to the public home', async ({ page }) => {
    await page.goto('/projects/test-project-id');

    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.getByRole('heading', { name: 'Bienvenido a Diles', level: 1 })).toBeVisible();
  });

  test('redirects authenticated users to latest project without creating the legacy home project', async ({ page }) => {
    const project = buildProjectRow();
    let createdUnexpectedProject = false;
    let requestedLegacyHomeSeed = false;

    await seedAuthenticatedSession(page);

    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: MOCK_USER }),
      });
    });

    await page.route('**/api/usage/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plan: 'free',
          used: 0,
          limit: 10,
          remaining: 10,
          resetInfo: 'today',
          subscriptionStatus: 'inactive',
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          hasMcpAccess: false,
          isTrial: false,
          trialExpiresAt: null,
        }),
      });
    });

    await page.route('**/api/flashcards/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cards: [] }),
      });
    });

    await page.route('**/rest/v1/assistant_conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [] }),
      });
    });

    await page.route('**/rest/v1/projects*', async (route: Route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (method === 'POST') {
        createdUnexpectedProject = true;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unexpected project creation in root redirect flow' }),
        });
        return;
      }

      if (method === 'GET') {
        if (url.includes('short_id.eq.diles01') || url.includes('slug.eq.bienvenido-a-diles') || url.includes('title.eq.Bienvenido')) {
          requestedLegacyHomeSeed = true;
        }

        if (url.includes('id=eq.proj-1') && url.includes(`user_id=eq.${MOCK_USER.id}`)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(project),
          });
          return;
        }

        if (url.includes(`user_id=eq.${MOCK_USER.id}`)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([project]),
          });
          return;
        }
      }

      await route.continue();
    });

    await page.goto('/');

    await expect(page).toHaveURL('http://127.0.0.1:4173/projects/proj-1');
    await expect(page.getByRole('button', { name: 'Proyecto existente' })).toBeVisible();
    expect(createdUnexpectedProject).toBeFalsy();
    expect(requestedLegacyHomeSeed).toBeFalsy();
  });
});
