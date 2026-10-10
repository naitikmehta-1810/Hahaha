import Link from "next/link";
import { MapPin, PlayCircle } from "lucide-react";
import { shopHref } from "@/utils/catalog";
import styles from "./Maker.module.css";

type MakerSummary = {
  isProfile: boolean;
  name: string;
  hometownCity: string | null;
  hometownState: string | null;
  yearsOfPractice: number | null;
  hasIntro: boolean;
  studioPhotoCount: number;
};

function practiceLabel(years: number | null) {
  if (years == null) return null;
  if (years < 1) return "Started this year";
  return `${years} ${years === 1 ? "year" : "years"} of practice`;
}

/**
 * "Made by Meera in Jaipur": the maker line shown on every product page. When
 * the seller has filled in their maker profile it links to the full story on
 * the shop page; otherwise it names the shop and the city they sell from.
 */
export default function MadeBy({ maker, shopSlug }: { maker: MakerSummary; shopSlug: string }) {
  const place = maker.hometownCity ?? maker.hometownState;
  const practice = practiceLabel(maker.yearsOfPractice);
  const hasStory = maker.isProfile && (maker.hasIntro || maker.studioPhotoCount > 0 || practice);
  const href = `${shopHref(shopSlug)}${hasStory ? "?tab=maker" : ""}`;

  return (
    <Link href={href} className={styles.madeBy} aria-label={`Made by ${maker.name}${place ? ` in ${place}` : ""}`}>
      <span className={styles.madeByPin} aria-hidden="true">
        <MapPin size={16} />
      </span>
      <span className={styles.madeByText}>
        <span className={styles.madeByLine}>
          Made by <strong>{maker.name}</strong>
          {place ? <> in <strong>{place}</strong></> : null}
        </span>
        {practice || maker.hasIntro ? (
          <span className={styles.madeByMeta}>
            {practice}
            {practice && maker.hasIntro ? " · " : ""}
            {maker.hasIntro ? (
              <span className={styles.madeByIntro}>
                <PlayCircle size={12} aria-hidden="true" /> Hear their story
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
