import type { FoodRecommendation } from "../../../shared/moods";

export function RecommendationList({ items }: { items: FoodRecommendation[] }) {
  return (
    <ol className="recommendation-list">
      {items.map((item, index) => (
        <li key={item.id} className="recommendation-card">
          <span className="recommendation-number" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="recommendation-name">{item.name}</h3>
          <p className="recommendation-explanation">{item.explanation}</p>
        </li>
      ))}
    </ol>
  );
}
