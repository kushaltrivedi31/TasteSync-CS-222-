import type { FoodRecommendation } from "../../../shared/moods";

interface RecommendationListProps {
  items: FoodRecommendation[];
  /** Id of the recommendation whose restaurants are currently shown. */
  activeId?: string;
  restaurantPanelId: string;
  onFindRestaurants: (item: FoodRecommendation) => void;
}

export function RecommendationList({
  items,
  activeId,
  restaurantPanelId,
  onFindRestaurants,
}: RecommendationListProps) {
  return (
    <ol className="recommendation-list">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="recommendation-card"
          data-active={item.id === activeId ? "true" : undefined}
        >
          <span className="recommendation-number" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="recommendation-name">{item.name}</h3>
          <p className="recommendation-explanation">{item.explanation}</p>
          <button
            type="button"
            className="button button-secondary button-small"
            aria-label={`Find restaurants for ${item.name}`}
            aria-controls={restaurantPanelId}
            onClick={() => onFindRestaurants(item)}
          >
            Find restaurants
          </button>
        </li>
      ))}
    </ol>
  );
}
