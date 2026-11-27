import { expect, test } from "@playwright/test";

const CALM_ANSWERS = [
  "Lo-fi, acoustic, or ambient",
  "Low: slow and soft",
  "A mix of both",
  "Winding down at home",
  "Something cozy to slow down with",
];

test("quiz → confirmed vibe → recommendations → Google restaurant results (mocked Google)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Find your food vibe/ }).click();

  for (const [index, answer] of CALM_ANSWERS.entries()) {
    await expect(page.getByText(`Question ${index + 1} of 5`)).toBeVisible();
    await page.getByText(answer, { exact: true }).click();
    await page
      .getByRole("button", {
        name: index === CALM_ANSWERS.length - 1 ? "See my food vibe" : "Next",
      })
      .click();
  }

  await expect(page.getByRole("heading", { name: "Your food vibe: Calm" })).toBeVisible();
  await expect(page.getByText(/We matched you to Calm because you/)).toBeVisible();
  await page.getByRole("button", { name: "Get Calm food ideas" }).click();

  await expect(
    page.getByRole("heading", { name: "Ideas for when you're feeling calm" }),
  ).toBeVisible();
  await expect(page.getByText("Mood from the food vibe quiz")).toBeVisible();

  // Google search is the default source; the city defaults to Champaign-Urbana.
  await expect(page.getByRole("radio", { name: "Google Maps search" })).toBeChecked();
  await page.getByRole("button", { name: "Find restaurants for Ramen" }).click();

  const panel = page.getByRole("region", { name: "Places for ramen" });
  await expect(panel.getByText("Google Maps search", { exact: true })).toBeVisible();
  const places = panel.locator(".place-list > li");
  await expect(places).toHaveCount(3);
  await expect(places.first()).toContainText("Champaign Mock Spot 1");
  await expect(places.first()).toContainText("100 Main St, Champaign, IL, USA");
  await expect(places.first().getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute(
    "href",
    /^https:\/\/maps\.google\.com\//,
  );
  await expect(panel.getByText(/doesn't guarantee they serve ramen/)).toBeVisible();
  await expect(panel.getByLabel("Google Maps")).toBeVisible();
  // No browser key in this run: the map says so and the list still works.
  await expect(panel.getByText(/map preview isn't set up/)).toBeVisible();
  await panel.getByRole("button", { name: "Show Champaign Mock Spot 2 on the map" }).click();
  await expect(places.nth(1)).toHaveAttribute("aria-current", "true");

  // Another city, re-searched with Enter.
  const city = page.getByRole("textbox", { name: "City for restaurant ideas" });
  await city.fill("Chicago, IL");
  await city.press("Enter");
  await expect(places.first()).toContainText("Chicago Mock Spot 1");
  await expect(panel.getByText(/near “Chicago, IL”/)).toBeVisible();

  // Food recommendations are still shown.
  await expect(page.locator(".recommendation-list > li")).toHaveCount(3);
});

test("Use my location searches near the browser's position", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.1106, longitude: -88.2073 });

  await page.goto("/");
  await page.getByRole("radio", { name: "Calm" }).check();
  await page.getByRole("button", { name: "Get recommendations" }).click();
  await page.getByRole("button", { name: "Find restaurants for Ramen" }).click();
  const panel = page.getByRole("region", { name: "Places for ramen" });
  await expect(panel.locator(".place-list > li").first()).toContainText("Champaign Mock Spot 1");

  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(panel.getByText(/near your current location/)).toBeVisible();
  await expect(panel.locator(".place-list > li").first()).toContainText("Nearby Mock Spot 1");
});
