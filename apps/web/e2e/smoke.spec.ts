import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "Decisions that show their math." },
  { path: "/cards", heading: "Compare credit cards" },
  { path: "/offers", heading: "Bonus offers" },
  { path: "/banking", heading: "Banking" },
  { path: "/planner", heading: "Churn planner" },
];

/** Collects console errors and uncaught page errors for the rest of the test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe("site chrome", () => {
  for (const { path, heading } of PAGES) {
    test(`${path}: heading, sample banner, footer disclosures, no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Sample data." }).first()).toBeVisible();
      const footer = page.getByRole("contentinfo");
      await expect(footer).toContainText("Advertiser disclosure");
      await expect(footer).toContainText("Not financial advice");
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }
});

test.describe("/cards", () => {
  test("comparison end to end updates results and URL", async ({ page }) => {
    await page.goto("/cards");
    const winner = page.getByRole("heading", { name: /^Winner:/ });
    await expect(winner).toBeVisible();
    const before = await winner.innerText();

    await page.getByRole("button", { name: /First year/ }).click();
    await expect(page.getByRole("button", { name: /First year/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/view=first/);

    await page.getByLabel("Groceries", { exact: false }).first().fill("2000");
    await expect(page).toHaveURL(/s=.*groceries%3A2000|s=.*groceries:2000/);
    await expect(winner).toBeVisible();
    expect(before).toContain("Winner:");
  });

  test("shared URL restores state", async ({ page }) => {
    await page.goto("/cards?c=citi-double-cash,chase-sapphire-preferred&view=first&s=groceries:777");
    await expect(page.getByRole("button", { name: /First year/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#spend-groceries")).toHaveValue("777");
    await expect(page.getByRole("heading", { name: /^Winner:/ })).toBeVisible();
  });

  test("highlights the winning card first and updates it as cards change", async ({ page }) => {
    await page.goto("/cards?c=chase-sapphire-preferred,citi-double-cash");
    const winner = page.getByRole("heading", { name: /^Winner:/ });
    const pickName = async () => {
      const first = page.locator(".ring-2").first();
      await expect(first.getByText("Our pick for your spending")).toBeVisible();
      return first.innerText();
    };
    const name = (t: string) => (t.match(/Winner: (.+?)\s*Best of/)?.[1] ?? "").trim();
    expect(await pickName()).toContain(name(await winner.innerText()));
    await page.getByRole("list", { name: "Cards" }).getByText("Chase Freedom Unlimited").click();
    await expect(winner).toContainText("Chase Freedom Unlimited");
    expect(await pickName()).toContain("Chase Freedom Unlimited");
  });

  test("picker filters and sorts", async ({ page }) => {
    await page.goto("/cards");
    const items = page.getByRole("list", { name: "Cards" }).getByRole("listitem");
    const all = await items.count();
    await page.getByLabel("Annual fee").selectOption({ label: "No annual fee" });
    await expect(items).not.toHaveCount(all);
    for (const text of await items.allInnerTexts()) expect(text).toContain("No fee");
    await page.getByLabel("Sort by").selectOption({ label: "Name (A-Z)" });
    const names = (await items.allInnerTexts()).map((t) => t.split("\n")[0]!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(items).toHaveCount(all);
  });
});

test("/offers: switching tab changes the list and URL", async ({ page }) => {
  await page.goto("/offers");
  const count = page.getByText(/offers? shown/);
  await expect(count).toBeVisible();
  const before = await count.innerText();
  await page.getByRole("tab", { name: "Bank accounts" }).click();
  await expect(page).toHaveURL(/tab=bank/);
  await expect(page.getByLabel("Direct deposit")).toBeVisible();
  await expect(count).not.toHaveText(before);
});

test("/banking: entering an amount renders a ranked list", async ({ page }) => {
  await page.goto("/banking");
  await page.getByLabel("Amount to park ($)").fill("25000");
  const ranked = page.getByRole("list", { name: "Ranked cash options" }).getByRole("listitem");
  await expect(ranked.first()).toBeVisible();
  expect(await ranked.count()).toBeGreaterThan(1);
  await expect(page).toHaveURL(/25000/);
});

test("/planner: changing capacity re-plans and a step renders", async ({ page }) => {
  await page.goto("/planner");
  const total = page.getByText(/total, counted in the month/);
  await expect(total).toBeVisible();
  const before = await total.innerText();
  await page.getByLabel("Monthly spend").fill("100");
  await expect(total).not.toHaveText(before);
  await page.getByLabel("Monthly spend").fill("6000");
  await expect(page.getByRole("button", { name: /^Exclude .* from the plan$/ }).first()).toBeVisible();
});

test("/admin shows the no-database warning with credentials", async ({ browser }) => {
  const ctx = await browser.newContext({ httpCredentials: { username: "admin", password: "test" } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3105/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(page.getByText(/No database is configured/)).toBeVisible();
  await ctx.close();
});

test("/admin without credentials is rejected", async ({ request }) => {
  expect((await request.get("/admin")).status()).toBe(401);
});
