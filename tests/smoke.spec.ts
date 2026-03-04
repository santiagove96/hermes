import { expect, test } from '@playwright/test';

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
});
