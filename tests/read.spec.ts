import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const MOCK_PUBLISHED_ESSAY = {
  title: 'Apartados para Dios',
  subtitle: 'Un subtítulo de prueba para validar la lectura pública.',
  author_name: 'Santi Ventura',
  owner_username: 'santi',
  published_pages: {
    main: '# Apartados\n\nEste es un párrafo público para compartir.\n\n- Punto uno\n- Punto dos',
  },
  published_tabs: ['main'],
  published_at: '2026-02-27T12:00:00.000Z',
  short_id: 'abc123',
  slug: 'apartados-para-dios',
};

async function mockPublishedEssay(page: Page) {
  await page.route('**/rest/v1/projects*', async (route) => {
    const url = route.request().url();
    if (url.includes('short_id=eq.abc123') && url.includes('published=eq.true')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PUBLISHED_ESSAY),
      });
      return;
    }

    if (url.includes('owner_username=eq.santi') && url.includes('published=eq.true')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([MOCK_PUBLISHED_ESSAY]),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/rest/v1/user_profiles*', async (route) => {
    const url = route.request().url();
    if (!url.includes('username=eq.santi')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ username: 'santi' }]),
    });
  });

  await page.route('**/rest/v1/user_profile_username_aliases*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('Public read page', () => {
  test('loads a published article and normalizes the canonical slug', async ({ page }) => {
    await mockPublishedEssay(page);

    await page.goto('/read/abc123/slug-incorrecto');

    await expect(page).toHaveURL('http://127.0.0.1:4173/santi/apartados-para-dios');
    await expect(page.getByRole('heading', { name: 'Apartados para Dios', level: 1 })).toBeVisible();
    await expect(page.getByText('Un subtítulo de prueba para validar la lectura pública.')).toBeVisible();
    await expect(page.getByText('Santi Ventura')).toBeVisible();
    await expect(page.getByText('February 27, 2026')).toBeVisible();
  });

  test('loads canonical public route by username and latest by username root', async ({ page }) => {
    await mockPublishedEssay(page);

    await page.goto('/santi/apartados-para-dios');
    await expect(page.getByRole('heading', { name: 'Apartados para Dios', level: 1 })).toBeVisible();

    await page.goto('/santi');
    await expect(page).toHaveURL('http://127.0.0.1:4173/santi/apartados-para-dios');
    await expect(page.getByText('Santi Ventura')).toBeVisible();
  });

  test('shows the selection action menu when text is selected on desktop', async ({ page }) => {
    await mockPublishedEssay(page);

    await page.goto('/read/abc123/apartados-para-dios');
    await expect(page.getByRole('heading', { name: 'Apartados para Dios', level: 1 })).toBeVisible();

    await page.evaluate(() => {
      const paragraph = Array.from(document.querySelectorAll('article p'))
        .find((node) => node.textContent?.includes('Este es un párrafo público para compartir.'));
      if (!paragraph) throw new Error('Paragraph not found');

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await expect(page.getByRole('dialog', { name: 'Acciones de selección' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compartir' })).toBeVisible();
  });
});
