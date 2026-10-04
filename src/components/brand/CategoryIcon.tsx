import { createElement } from "react";
import {
  Baby,
  BookOpen,
  CircleEllipsis,
  CookingPot,
  Flame,
  Flower2,
  Frame,
  Gem,
  Gift,
  Home,
  Image as ImageIcon,
  Leaf,
  Monitor,
  NotebookPen,
  Palette,
  PawPrint,
  Scissors,
  Shirt,
  ShoppingBag,
  Sofa,
  Sparkles,
  Tag,
  ToyBrick,
  Watch,
  type LucideIcon,
} from "lucide-react";

/**
 * Categories store a lucide icon name in `icon_url` (see backend
 * categories.seed.ts). Only the icons listed here are bundled; unknown names
 * fall back to a keyword match on the slug, then to a tag.
 */
const BY_NAME: Record<string, LucideIcon> = {
  Baby,
  BookOpen,
  CircleEllipsis,
  CookingPot,
  Flame,
  Flower2,
  Frame,
  Gem,
  Gift,
  Home,
  Image: ImageIcon,
  Leaf,
  Monitor,
  NotebookPen,
  Palette,
  PawPrint,
  Scissors,
  Shirt,
  ShoppingBag,
  Sofa,
  Sparkles,
  ToyBrick,
  Watch,
};

const BY_KEYWORD: Array<[RegExp, LucideIcon]> = [
  [/jewel|ring|necklace|earring/, Gem],
  [/wall|art|paint|print/, Frame],
  [/decor|home|living/, Home],
  [/furniture|sofa/, Sofa],
  [/kitchen|cook|dining/, CookingPot],
  [/candle|fragrance/, Flame],
  [/cloth|apparel|wear|fashion/, Shirt],
  [/bag|accessor/, ShoppingBag],
  [/toy|game/, ToyBrick],
  [/craft|diy|sew/, Scissors],
  [/station|paper|journal/, NotebookPen],
  [/book/, BookOpen],
  [/gift/, Gift],
  [/pet/, PawPrint],
  [/electr|gadget|tech/, Monitor],
  [/beauty|care|skin/, Sparkles],
  [/plant|garden/, Leaf],
  [/flower/, Flower2],
  [/baby|kid/, Baby],
  [/watch/, Watch],
  [/other/, CircleEllipsis],
];

export function categoryIcon(category: { iconUrl?: string | null; slug?: string; name?: string }): LucideIcon {
  const named = category.iconUrl ? BY_NAME[category.iconUrl.trim()] : undefined;
  if (named) return named;
  const haystack = `${category.slug ?? ""} ${category.name ?? ""}`.toLowerCase();
  return BY_KEYWORD.find(([pattern]) => pattern.test(haystack))?.[1] ?? Tag;
}

export default function CategoryIcon({
  category,
  size = 20,
  className,
}: {
  category: { iconUrl?: string | null; slug?: string; name?: string };
  size?: number;
  className?: string;
}) {
  // The icon is a stable module-level component picked from a table.
  return createElement(categoryIcon(category), {
    size,
    strokeWidth: 1.75,
    className,
    "aria-hidden": true,
  });
}
