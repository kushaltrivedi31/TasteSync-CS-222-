import { expect, test } from "@playwright/test";

test("pick a mood, get recommendations from the real API, then change the mood", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("how you feel");

  // Asking without a mood shows a validation message.
  await page.getByRole("button", { name: "Get recommendations" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose a mood first");

  await page.getByRole("radio", { name: "Calm" }).check();
  await page.getByRole("button", { name: "Get recommendations" }).click();

  await expect(
    page.getByRole("heading", { name: "Ideas for when you're feeling calm" }),
  ).toBeVisible();
  await expect(page.getByText("Mood chosen manually")).toBeVisible();
  const cards = page.getByRole("listitem");
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
