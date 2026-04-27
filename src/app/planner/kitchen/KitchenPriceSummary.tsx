"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useKitchenStore } from "./store";
import { calculatePrice } from "./data";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";

export default function KitchenPriceSummary() {
  const currency = useStore((s) => s.admin?.currency ?? "USD");
  const config = useKitchenStore((s) => s.config);
  const availableMaterials = useKitchenStore((s) => s.availableMaterials);
  const availableDoorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const availableWorktopMaterials = useKitchenStore((s) => s.availableWorktopMaterials);
  const availableHandleMaterials = useKitchenStore((s) => s.availableHandleMaterials);
  const addKitchenToCart = useStore((s) => s.addKitchenToCart);
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);

  const allMaterials = useMemo(() => {
    const map = new Map<string, (typeof availableMaterials)[0]>();
    for (const m of availableMaterials) map.set(m.id, m);
    for (const m of availableDoorMaterials) map.set(m.id, m);
    return [...map.values()];
  }, [availableMaterials, availableDoorMaterials]);

  const price = useMemo(
    () => calculatePrice(config, allMaterials, availableWorktopMaterials, availableHandleMaterials),
    [config, allMaterials, availableWorktopMaterials, availableHandleMaterials],
  );

  const mainW = config.baseModules.reduce((s, m) => s + m.width, 0);
  const islandW = config.island.enabled
    ? config.island.baseModules.reduce((s, m) => s + m.width, 0)
    : 0;

  const hasDetails =
    price.base > 0 ||
    price.wall > 0 ||
    price.countertop > 0 ||
    price.islandBase > 0 ||
    price.islandWall > 0 ||
    price.islandCountertop > 0;

  const handleApply = () => {
    const label =
      config.island.enabled && islandW > 0
        ? `Kitchen — main ${mainW} cm + island ${islandW} cm`
        : `Kitchen — ${mainW} cm run`;
    addKitchenToCart({
      name: label,
      price: price.total,
      config,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <div className="kitchen-price-panel">
      <div className="price-header" onClick={() => hasDetails && setExpanded(!expanded)}>
        <div className="price-total-row">
          <span className="price-total-label">Estimated Total</span>
          <span className="price-total-amount">{formatPrice(price.total, currency)}</span>
        </div>
        {hasDetails && (
          <button type="button" className="price-expand-btn">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="price-breakdown">
          <PriceLine label="Main base units" amount={price.base} currency={currency} />
          {price.wall > 0 && (
            <PriceLine label="Main wall units" amount={price.wall} currency={currency} />
          )}
          {price.countertop > 0 && (
            <PriceLine label="Main worktop" amount={price.countertop} currency={currency} />
          )}
          {price.islandBase > 0 && (
            <PriceLine label="Island base" amount={price.islandBase} currency={currency} />
          )}
          {price.islandWall > 0 && (
            <PriceLine label="Island wall" amount={price.islandWall} currency={currency} />
          )}
          {price.islandCountertop > 0 && (
            <PriceLine label="Island worktop" amount={price.islandCountertop} currency={currency} />
          )}
        </div>
      )}

      <p className="kitchen-price-note">
        Layout helpers (blue blocks) are not included in the estimate.
      </p>

      <button type="button" className="add-to-cart-btn" onClick={handleApply}>
        {applied ? <CheckCircle2 size={17} /> : null}
        <span>
          {applied ? "Added to cart" : `Add to cart — ${formatPrice(price.total, currency)}`}
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
