import { expect, test } from "@playwright/test";

test("pick a mood, get recommendations from the real API, then change the mood", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("how you feel");

  // Spotify-based mood suggestions are not implemented; the page says so and offers no connect button.
  const spotifyNote = page.getByRole("complementary", { name: "Music-based mood suggestions" });
  await expect(spotifyNote).toContainText("Not available");
  await expect(spotifyNote.getByRole("button")).toHaveCount(0);

  // Asking without a mood shows a validation message.
  await page.getByRole("button", { name: "Get recommendations" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose a mood first");

  await page.getByRole("radio", { name: "Calm" }).check();
  await page.getByRole("button", { name: "Get recommendations" }).click();

  await expect(
    page.getByRole("heading", { name: "Ideas for when you're feeling calm" }),
  ).toBeVisible();
  await expect(page.getByText("Mood chosen manually")).toBeVisible();
  const cards = page.locator(".recommendation-list").getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Ramen");

  await page.getByRole("button", { name: "Choose a different mood" }).click();
  await page.getByRole("radio", { name: "Adventurous" }).check();
  await page.getByRole("button", { name: "Get recommendations" }).click();

  await expect(
    page.getByRole("heading", { name: "Ideas for when you're feeling adventurous" }),
  ).toBeVisible();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Ethiopian");
});

test("find demo restaurants for a recommendation, including an unsupported city", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Calm" }).check();
  await page.getByRole("button", { name: "Get recommendations" }).click();

  // This test covers the curated demo list; Google search is the default source.
  await page.getByRole("radio", { name: "Champaign-Urbana, IL demo list" }).check();
  const city = page.getByRole("textbox", { name: "City for restaurant ideas" });
  await expect(city).toHaveValue("Champaign-Urbana");

  await page.getByRole("button", { name: "Find restaurants for Ramen" }).click();

  const panel = page.getByRole("region", { name: "Places for ramen" });
  await expect(panel.getByText("Demo data · Champaign-Urbana, IL only")).toBeVisible();
  const places = panel.getByRole("listitem");
  await expect(places).toHaveCount(2);
  await expect(places.first()).toContainText("Oozu Ramen Bar");
  await expect(places.first()).toContainText("601 S 6th St, Ste 102, Champaign, IL 61820");
  await expect(places.first().getByRole("link").first()).toHaveAttribute("href", /^https:\/\//);

  // A food type with no verified places shows an honest empty state.
  await page.getByRole("button", { name: "Find restaurants for Café soup and sandwich" }).click();
  await expect(
    page.getByRole("region", { name: "Places for café soup and sandwich" }),
  ).toContainText("No café soup and sandwich spots are in our Champaign-Urbana, IL demo list yet.");

  // Other cities get an explanation instead of results.
  await city.fill("Chicago");
  await page.getByRole("button", { name: "Find restaurants for Ramen" }).click();
  await expect(panel.getByRole("alert")).toContainText("“Chicago” isn't covered yet.");
  await expect(panel.getByRole("listitem")).toHaveCount(0);

  // Recovering returns to the demo area; Urbana is also accepted.
  await panel.getByRole("button", { name: "Search Champaign-Urbana, IL instead" }).click();
  await expect(city).toHaveValue("Champaign-Urbana");
  await expect(places).toHaveCount(2);

  await city.fill("Urbana");
  await city.press("Enter");
  await expect(panel).toContainText("for “Urbana”");
  await expect(places).toHaveCount(2);

  // Food recommendations are still shown throughout.
  await expect(page.locator(".recommendation-list").getByRole("listitem")).toHaveCount(3);
});
