"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useWardrobeStore } from "./store";
import { calculatePrice } from "./data";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { formatPrice } from "@/lib/utils";

export default function PriceSummary() {
  const admin = useResolvedAdmin();
  const currency = admin?.currency ?? "USD";
  const config = useWardrobeStore((s) => s.config);
  const availableMaterials = useWardrobeStore((s) => s.availableMaterials);
  const availableDoorMaterials = useWardrobeStore((s) => s.availableDoorMaterials);
  const availableSlidingMechanisms = useWardrobeStore((s) => s.availableSlidingMechanisms);
  const availableHandleMaterials = useWardrobeStore((s) => s.availableHandleMaterials);
  const addWardrobeToCart = useStore((s) => s.addWardrobeToCart);
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);

  const allMaterials = useMemo(
    () => [...availableMaterials, ...availableDoorMaterials],
    [availableMaterials, availableDoorMaterials]
  );
  const price = useMemo(
    () => calculatePrice(config, allMaterials, availableSlidingMechanisms, availableHandleMaterials),
    [config, allMaterials, availableSlidingMechanisms, availableHandleMaterials],
  );

  const hasDetails =
    price.sections > 0 ||
    price.components > 0 ||
    price.doors > 0 ||
    price.handles > 0 ||
    price.slidingMechanism > 0 ||
    price.baseOption > 0 ||
    price.materialSurcharge > 0;

  const handleApply = () => {
    const { width, height, depth } = config.frame;
    addWardrobeToCart({
      name: `Custom wardrobe ${width}×${height}×${depth} cm`,
      price: price.total,
      config,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <div className="wardrobe-price-panel">
      <div className="price-header" onClick={() => hasDetails && setExpanded(!expanded)}>
        <div className="price-total-row">
          <span className="price-total-label">Estimated Total</span>
          <span className="price-total-amount">{formatPrice(price.total, currency)}</span>
        </div>
        {hasDetails && (
          <button className="price-expand-btn">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="price-breakdown">
          <PriceLine label="Frame" amount={price.frame} currency={currency} />
          {price.sections > 0 && (
            <PriceLine label="Extra sections" amount={price.sections} currency={currency} />
          )}
          {price.components > 0 && (
            <PriceLine
              label={`Interior (${config.sections.reduce((s, sec) => s + sec.components.length, 0)})`}
              amount={price.components}
              currency={currency}
            />
          )}
          {price.doors > 0 && (
            <PriceLine label="Doors" amount={price.doors} currency={currency} />
          )}
          {price.handles > 0 && (
            <PriceLine label="Handles" amount={price.handles} currency={currency} />
          )}
          {price.slidingMechanism > 0 && (
            <PriceLine label="Sliding track" amount={price.slidingMechanism} currency={currency} />
          )}
          {price.baseOption > 0 && (
            <PriceLine label="Base (legs / plinth)" amount={price.baseOption} currency={currency} />
          )}
          {price.materialSurcharge > 0 && (
            <PriceLine label="Materials" amount={price.materialSurcharge} currency={currency} />
          )}
        </div>
      )}

      <button type="button" className="add-to-cart-btn" onClick={handleApply}>
        {applied ? <CheckCircle2 size={17} /> : null}
        <span>
          {applied ? "Added to cart" : `Apply — ${formatPrice(price.total, currency)}`}
        </span>
      </button>
    </div>
  );
}

function PriceLine({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: string;
}) {
  return (
    <div className="price-line">
      <span>{label}</span>
      <span>{formatPrice(amount, currency)}</span>
    </div>
  );
}
