import { BookshelfCover } from "@/components/customer/BookshelfRow";
import type { BookshelfItem } from "@/hooks/useBookshelf";

/** Compact view of the same restored PDF cover used by the bookshelf. */
export default function CartProductCover({ name, productName, productFamilyId, spec, documents, sections }: {
  name: string;
  productName: string;
  productFamilyId: string;
  spec: BookshelfItem["snapshot"]["spec"];
  documents?: BookshelfItem["snapshot"]["documents"];
  sections?: BookshelfItem["snapshot"]["sections"];
}) {
  if (!documents?.length) return null;
  return <div className="relative h-16 w-16 shrink-0" aria-label={`${name} product preview`}>
    <div className="absolute left-1 top-1 origin-top-left scale-[0.25]">
      <BookshelfCover item={{ name, snapshot: {
        product_name: productName,
        product_family_id: productFamilyId,
        spec,
        documents,
        sections,
      } }} />
    </div>
  </div>;
}