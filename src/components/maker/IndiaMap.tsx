import { INDIA_OUTLINE_PATH, MAP_HEIGHT, MAP_WIDTH, hometownPoint } from "@/utils/indiaGeo";
import styles from "./Maker.module.css";

/**
 * A hometown pin on a simple map of India. Pure SVG, so it renders on the
 * server, costs no network requests and follows the brand colours.
 */
export default function IndiaMap({
  city,
  state,
  className,
}: {
  city?: string | null;
  state?: string | null;
  className?: string;
}) {
  const point = hometownPoint(city, state);
  const place = [city, state].filter(Boolean).join(", ");
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className={`${styles.map} ${className ?? ""}`}
      role="img"
      aria-label={place ? `Map of India with a pin at ${place}` : "Map of India"}
    >
      <path d={INDIA_OUTLINE_PATH} className={styles.mapLand} />
      {point ? (
        <g transform={`translate(${point.x} ${point.y})`}>
          {/* Dashed ring when only the state is known: the pin is approximate. */}
          <circle r="22" className={point.precise ? styles.mapPulse : styles.mapArea} />
          <circle r="7" className={styles.mapDot} />
          <circle r="2.6" className={styles.mapDotCore} />
        </g>
      ) : null}
    </svg>
  );
}
