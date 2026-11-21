import { computePricePreview } from "@/src/lib/utils/price-preview";
import { DetailSection, DetailRow } from "@/src/components/inventory/view-car/detail-row";
import { CarPromotionsPanel } from "@/src/components/inventory/car-promotions-panel";
import type { CarPromotionsView } from "@/src/lib/supabase/offer-evaluation";
import type { CarDetail } from "@/src/lib/types/car-detail";

function formatAED(value: number) {
  return `AED ${value.toLocaleString()}`;
}

/*
 * `promotions` is optional and null-safe on purpose: without it this tab
 * renders exactly as it did before Sprint 8. Somebody without offers.view
 * sees the original Pricing tab and nothing is missing from it.
 */
export function PricingTab({
  car,
  promotions = null,
}: {
  car: CarDetail;
  promotions?: CarPromotionsView | null;
}) {
  const preview = computePricePreview(
    car.regular_price,
    car.promotion
      ? {
          id: "",
          name: car.promotion.name,
          discount_type: car.promotion.discount_type,
          discount_value: car.promotion.discount_value,
        }
      : undefined,
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DetailSection title="Pricing">
        <DetailRow
          label="Regular Price"
          value={car.regular_price !== null ? formatAED(car.regular_price) : null}
        />
        <DetailRow label="Promotion" value={car.promotion?.name ?? "No Promotion"} />
        {preview && preview.discountAmount > 0 && (
          <DetailRow
            label="Final Price"
            value={<span className="text-primary-text">{formatAED(preview.final)}</span>}
          />
        )}
        <DetailRow label="Finance Available" value={car.finance_available ? "Yes" : "No"} />
        <DetailRow label="Reservation Available" value={car.reservation_available ? "Yes" : "No"} />
        <DetailRow
          label="Reservation Token Override"
          value={
            car.reservation_token_override !== null
              ? formatAED(car.reservation_token_override)
              : "Uses global default"
          }
        />
        <DetailRow label="Trade-In Available" value={car.trade_in_available ? "Yes" : "No"} />
      </DetailSection>

      {promotions && (
        <CarPromotionsPanel
          listedPriceFils={promotions.listedPriceFils}
          rows={promotions.rows}
          selectedPromotionId={promotions.selectedPromotionId}
        />
      )}
    </div>
  );
}
