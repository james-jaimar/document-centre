import boundDocumentsImg from "@/assets/products/bound-documents.jpg";
import presentationsImg from "@/assets/products/presentations.jpg";
import ringBindersImg from "@/assets/products/ring-binders.jpg";
import stapledLooseImg from "@/assets/products/stapled-loose.jpg";
import postersImg from "@/assets/products/posters.jpg";
import bookletsImg from "@/assets/products/booklets.jpg";
import flyersImg from "@/assets/products/flyers.jpg";
import brochuresImg from "@/assets/products/brochures.jpg";
import businessCardsImg from "@/assets/product-business-cards.jpg";
import photoPrintsImg from "@/assets/products/photo-prints.jpg";
import pullUpBannersImg from "@/assets/products/pull-up-banners.jpg";

export const SLUG_IMAGE_MAP: Record<string, string> = {
  "bound-documents": boundDocumentsImg,
  presentations: presentationsImg,
  "ring-binders": ringBindersImg,
  "stapled-loose-pages": stapledLooseImg,
  posters: postersImg,
  booklets: bookletsImg,
  flyers: flyersImg,
  brochures: brochuresImg,
  "business-cards": businessCardsImg,
  "photo-prints": photoPrintsImg,
  "pull-up-banners": pullUpBannersImg,
  "pullup-banners": pullUpBannersImg,
  "pull-up-banner": pullUpBannersImg,
};

export function familyImage(family: { slug?: string | null; image_url?: string | null }) {
  return family.image_url || (family.slug ? SLUG_IMAGE_MAP[family.slug] : null) || null;
}
