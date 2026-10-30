import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PATHS = ["/", "/cards", "/offers", "/banking", "/planner"];

for (const path of PATHS) {
  test(`axe: no serious or critical violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    ).toEqual([]);
  });
}

for (const path of PATHS) {
  test(`keyboard: tabbing through ${path} only lands on real controls`, async ({ page }) => {
    await page.goto(path);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const tag = el.tagName.toLowerCase();
        if (tag === "nextjs-portal") return null; // Next dev-mode overlay, not app UI
        const role = el.getAttribute("role");
        const ok = ["a", "button", "input", "select", "textarea", "summary"].includes(tag) || !!role;
        return {
          ok,
          label: `${tag}${role ? `[${role}]` : ""}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}`,
        };
      });
      if (info) {
        expect(info.ok, `focus landed on non-control ${info.label}`).toBe(true);
        seen.add(info.label);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });
}

test("keyboard: sortable table headers on /banking toggle with Enter", async ({ page }) => {
  await page.goto("/banking");
  // th[aria-sort] rather than getByRole("columnheader"): TableHead has no scope="col" (see quality report).
  const header = page.locator("th[aria-sort]", { hasText: /^APY/ });
  const btn = header.getByRole("button");
  await btn.focus();
  const before = await header.getAttribute("aria-sort");
  await page.keyboard.press("Enter");
  await expect(header).not.toHaveAttribute("aria-sort", before ?? "none");
  // After a sort, exactly one column is marked sorted, and the state is also in the text, not only a style.
  await expect(page.locator("th[aria-sort='ascending'], th[aria-sort='descending']")).toHaveCount(1);
});

test("keyboard: tab lists on /offers move with arrow keys", async ({ page }) => {
  await page.goto("/offers");
  const cards = page.getByRole("tab", { name: "Credit cards" });
  await cards.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Bank accounts" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Bank accounts" })).toHaveAttribute("aria-selected", "true");
});

test("every form control on every page has an accessible name", async ({ page }) => {
  const missing: string[] = [];
  for (const path of PATHS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")]
        .filter((el) => (el as HTMLInputElement).type !== "hidden")
        .filter((el) => {
          const i = el as HTMLInputElement;
          return (
            !(i.labels && i.labels.length) &&
            !el.getAttribute("aria-label") &&
            !el.getAttribute("aria-labelledby")
          );
        })
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}[name=${el.getAttribute("name")}]`),
    );
    missing.push(...bad.map((b) => `${path} ${b}`));
  }
  expect(missing).toEqual([]);
});

test.describe("mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const path of PATHS) {
    test(`${path}: no horizontal page scroll`, async ({ page }, info) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: info.outputPath(`mobile-${path.replace(/\W/g, "_") || "home"}.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("compliance", () => {
  test("seed records past their threshold show Stale badges", async ({ page }) => {
    await page.goto("/offers");
    await expect(page.getByText(/^Stale: verified \d+d ago/).first()).toBeVisible();
    await page.goto("/cards?c=discover-it-cash-back,delta-skymiles-gold-amex");
    await expect(page.getByText(/^Stale: verified \d+d ago/).first()).toBeVisible();
    await page.goto("/banking");
    await expect(page.getByText(/^Stale: verified \d+d ago/).first()).toBeVisible();
  });

  test("offers link their source", async ({ page }) => {
    await page.goto("/offers");
    await expect(page.getByRole("link", { name: /source/i }).first()).toBeVisible();
  });

  test("using the app sends nothing to the server except page loads", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" && r.method() !== "HEAD") posts.push(`${r.method()} ${r.url()}`);
    });
    await page.goto("/planner");
    await page.getByLabel("Monthly spend").fill("1234");
    await page.goto("/offers");
    await page.getByRole("tab", { name: "Bank accounts" }).click();
    await page.goto("/banking");
    await page.getByLabel("Amount to park ($)").fill("5000");
    expect(posts).toEqual([]);
  });

  test("no page asks for credentials", async ({ page }) => {
    for (const path of PATHS) {
      await page.goto(path);
      await expect(page.locator("input[type=password]")).toHaveCount(0);
    }
  });
});
