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

  test('opens the account menu and allows switching between login and signup views', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[title="Cuenta"]').click();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrarse' })).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible();

    await page.getByRole('button', { name: 'Registrarse' }).click();
    await expect(page.getByRole('button', { name: 'Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('redirects unauthenticated project routes back to the public home', async ({ page }) => {
    await page.goto('/projects/test-project-id');

    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.getByRole('heading', { name: 'Bienvenido a Diles', level: 1 })).toBeVisible();
  });
});
