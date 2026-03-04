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
  app_metadata: { provider: 'email' },
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
    title: 'Apartados para Dios',
    subtitle: 'Un subtítulo de trabajo',
    status: 'draft',
    content: '',
    pages: {
      coral: '# Apartados para Dios\n\nEste es el cuerpo inicial del artículo.',
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

async function mockFocusProject(page: Page, initialProject: ReturnType<typeof buildProjectRow>) {
  let project = { ...initialProject };

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

    if (method === 'GET') {
      if (url.includes('id=eq.') && url.includes(`user_id=eq.${MOCK_USER.id}`)) {
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

    if (method === 'PATCH') {
      const rawBody = request.postData() || '{}';
      const updates = JSON.parse(rawBody);
      project = {
        ...project,
        ...updates,
        updated_at: '2026-02-27T12:05:00.000Z',
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(project),
      });
      return;
    }

    await route.continue();
  });
}

test.describe('Authenticated focus page', () => {
  test('loads an existing project with editing controls', async ({ page }) => {
    await mockFocusProject(page, buildProjectRow());

    await page.goto('/projects/proj-1');

    await expect(page.getByRole('button', { name: 'Apartados para Dios' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrenar' })).toBeVisible();
    await page.getByRole('button', { name: 'Entrenar' }).click();
    await expect(page.getByRole('button', { name: 'Tarjetas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Q&A' })).toBeVisible();
    await expect(page.locator('.ProseMirror')).toContainText('Este es el cuerpo inicial del artículo.');
  });

  test('moves focus from title to subtitle to editor on Enter for a blank project', async ({ page }) => {
    await mockFocusProject(page, buildProjectRow({
      id: 'proj-empty',
      title: '',
      subtitle: '',
      pages: { coral: '' },
    }));

    await page.goto('/projects/proj-empty');

    const titleTrigger = page.getByRole('button', { name: 'Di algo...' });
    await expect(titleTrigger).toBeVisible();
    await titleTrigger.click();

    const titleInput = page.getByPlaceholder('Di algo...');
    await expect(titleInput).toBeFocused();
    await titleInput.fill('Mi título');
    await titleInput.press('Enter');

    const subtitleInput = page.getByPlaceholder('Agregar un subtítulo...');
    await expect(subtitleInput).toBeFocused();
    await subtitleInput.fill('Mi subtítulo');
    await subtitleInput.press('Enter');

    await expect(page.locator('.ProseMirror')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Mi título' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mi subtítulo' })).toBeVisible();
  });
});
