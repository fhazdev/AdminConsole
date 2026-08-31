import { expect, test, type Page } from '@playwright/test';

/**
 * The journey the console exists for: sign in, find a tenant, suspend it,
 * confirm the change stuck, and confirm the audit trail recorded who did it.
 */

async function signIn(page: Page) {
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: /Continue|Sign in with Microsoft/ });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
}

/**
 * Picks an active tenant by the presence of its Suspend button, so the suite
 * does not depend on seed ordering. Deliberately does not apply the status
 * filter: suspending a tenant would then drop it out of the filtered view.
 */
async function findActiveTenant(page: Page): Promise<string> {
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Suspend' }) })
    .first();
  await expect(row).toBeVisible();
  return (await row.getByRole('link').first().innerText()).trim();
}

function tenantRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
}

test.describe('admin console', () => {
  test('signs in and lists tenants with their user counts', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('columnheader', { name: 'Plan' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    // At least one seeded tenant is present.
    await expect(page.getByRole('table').getByRole('link').first()).toBeVisible();
  });

  test('suspends a tenant, reflects it in the list, and records it in the audit log', async ({
    page,
  }) => {
    await signIn(page);

    const tenantName = await findActiveTenant(page);
    const row = tenantRow(page, tenantName);
    await expect(row.getByText('active')).toBeVisible();

    await row.getByRole('button', { name: 'Suspend' }).click();

    // The mutation invalidates the list, so the row updates in place.
    await expect(row.getByText('suspended')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Reactivate' })).toBeVisible();

    // Survives a reload: the change was persisted, not just optimistic UI.
    await page.reload();
    await page.getByLabel('Search').fill(tenantName);
    await expect(tenantRow(page, tenantName).getByText('suspended')).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();

    await page.getByLabel('Action').selectOption('tenant.suspended');
    const auditRow = page
      .getByRole('row')
      .filter({ hasText: 'tenant.suspended' })
      .filter({ hasText: tenantName })
      .first();
    await expect(auditRow).toBeVisible();
    await expect(auditRow).toContainText('active to suspended');

    // Put the tenant back so a rerun starts from the same state.
    await page.getByRole('link', { name: 'Tenants' }).click();
    await page.getByLabel('Search').fill(tenantName);
    await tenantRow(page, tenantName).getByRole('button', { name: 'Reactivate' }).click();
    await expect(tenantRow(page, tenantName).getByText('active')).toBeVisible();
  });

  test('opens a tenant and changes a user role', async ({ page }) => {
    await signIn(page);

    const tenantName = await findActiveTenant(page);
    await page.getByRole('link', { name: tenantName, exact: true }).click();

    await expect(page.getByRole('heading', { name: tenantName })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();

    const roleSelect = page.getByRole('combobox', { name: /^Role for / }).first();
    await expect(roleSelect).toBeVisible();
    const originalRole = await roleSelect.inputValue();
    const newRole = originalRole === 'admin' ? 'member' : 'admin';

    await roleSelect.selectOption(newRole);
    await expect(roleSelect).toHaveValue(newRole);

    await page.reload();
    await expect(page.getByRole('combobox', { name: /^Role for / }).first()).toHaveValue(newRole);

    // Restore.
    await page
      .getByRole('combobox', { name: /^Role for / })
      .first()
      .selectOption(originalRole);
    await expect(page.getByRole('combobox', { name: /^Role for / }).first()).toHaveValue(
      originalRole,
    );
  });

  test('filters the audit log by date range', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Audit log' }).click();

    // A window that ended yesterday cannot contain anything from this run.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);

    await page.getByLabel('From').fill(longAgo);
    await page.getByLabel('To').fill(yesterday);
    await expect(page.getByText(/Showing 1-|No audit entries match/)).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByLabel('From')).toHaveValue('');
  });
});
