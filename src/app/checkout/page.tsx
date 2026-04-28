"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { CartLine } from "@/lib/types";
import { buildKitchenOrderBreakdown, buildWardrobeOrderBreakdown } from "@/lib/orderBreakdown";
import {
  materialsFromStore,
  worktopMaterialsFromStore,
  handleMaterialsFromStore as kitchenHandleMaterialsFromStore,
  NEUTRAL_KITCHEN_MATERIAL,
} from "@/app/planner/kitchen/data";
import {
  materialsFromStore as wardrobeMaterialsFromStore,
  doorFrontMaterialsFromStore,
  slidingMechanismsFromStore,
  handleMaterialsFromStore as wardrobeHandleMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
} from "@/app/planner/wardrobe/data";
import { formatPrice } from "@/lib/utils";
import { api } from "@/lib/api";
import { filterMaterialsForPlanner } from "@/lib/plannerMaterials";
import {
  ArrowLeft,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Package,
} from "lucide-react";
import { publicApiUrl, publishedSiteUrl } from "@/lib/publicEnv";

function describeCartForPaypal(cart: CartLine[]): string {
  if (cart.length === 0) return "Order";
  const first = cart[0];
  const firstName = first.kind === "catalog" ? first.item.name : first.name;
  if (cart.length === 1) return firstName;
  return `${firstName} + ${cart.length - 1} more`;
}

function buildOrderPayload(cart: CartLine[]) {
  const { materials, admin } = useStore.getState();
  const plannerMaterials = filterMaterialsForPlanner(materials, admin?.plannerMaterialIds);
  const cabinetMats = materialsFromStore(plannerMaterials, admin?.companyName);
  const worktops = worktopMaterialsFromStore(plannerMaterials, admin?.companyName);
  const kitchenHandles = kitchenHandleMaterialsFromStore(plannerMaterials, admin?.companyName);
  const palette = cabinetMats.length > 0 ? cabinetMats : [NEUTRAL_KITCHEN_MATERIAL];
  const wardrobeFrames = wardrobeMaterialsFromStore(plannerMaterials, admin?.companyName);
  const wardrobeDoorFronts = withDefaultWardrobeDoorFinishes(
    doorFrontMaterialsFromStore(plannerMaterials, admin?.companyName),
  );
  const wardrobeSlides = slidingMechanismsFromStore(plannerMaterials, admin?.companyName);
  const wardrobeHandles = wardrobeHandleMaterialsFromStore(plannerMaterials, admin?.companyName);

  const hasCustom = cart.some(
    (c) =>
      c.kind === "wardrobe" ||
      c.kind === "kitchen-furniture" ||
      c.kind === "module-planner",
  );
  const orderType = hasCustom ? "custom" : "catalog";
  const items = cart.map((c) => {
    if (c.kind === "catalog") {
      return {
        item_type: "catalog" as const,
        item_id: c.item.id,
        name: c.item.name,
        quantity: c.quantity,
        price: c.item.price,
      };
    }
    if (c.kind === "kitchen-furniture") {
      const breakdown = buildKitchenOrderBreakdown(c.config, palette, worktops, kitchenHandles);
      return {
        item_type: "custom" as const,
        name: c.name,
        quantity: c.quantity,
        price: c.price,
        custom_data: {
          kind: "kitchen-furniture",
          version: 1,
          config: c.config,
          breakdown,
        },
      };
    }
    if (c.kind === "module-planner") {
      return {
        item_type: "custom" as const,
        name: c.name,
        quantity: c.quantity,
        price: c.price,
        custom_data: {
          kind: "module-planner",
          version: 2,
          module: c.module,
          selection: c.selection,
          breakdown: c.breakdown,
        },
      };
    }
    const wardrobeAllMats = [...wardrobeFrames, ...wardrobeDoorFronts];
    const wardrobeBreakdown = buildWardrobeOrderBreakdown(
      c.config,
      wardrobeAllMats.length > 0 ? wardrobeAllMats : undefined,
      wardrobeSlides.length > 0 ? wardrobeSlides : undefined,
      wardrobeHandles.length > 0 ? wardrobeHandles : undefined,
    );
    return {
      item_type: "custom" as const,
      name: c.name,
      quantity: c.quantity,
      price: c.price,
      custom_data: {
        kind: "wardrobe",
        version: 1,
        config: c.config,
        breakdown: wardrobeBreakdown,
      },
    };
  });
  return { type: orderType, items };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, admin, removeFromCart, updateCartQuantity, clearCart, getCartTotal, initializeStore } = useStore();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const total = getCartTotal();
  const currency = admin?.currency || "USD";

  const handlePayWithPaypal = async () => {
    if (!customerName.trim() || !customerEmail.trim()) {
      setError("Please fill in your name and email.");
      return;
    }
    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { type, items } = buildOrderPayload(cart);
      const orderData = {
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || undefined,
        type,
        total_price: total,
        notes: notes.trim() || undefined,
        items,
      };

      const res = await api.submitOrder(admin?.slug || "demo", orderData);
      const order = (res.data as any);

      if (!admin?.paypalEmail) {
        clearCart();
        router.push(`/checkout/success?order_id=${order.id}`);
        return;
      }

      const itemName = describeCartForPaypal(cart);

      const paypalParams = new URLSearchParams({
        cmd: "_xclick",
        business: admin.paypalEmail,
        item_name: itemName,
        amount: total.toFixed(2),
        currency_code: currency,
        return: `${publishedSiteUrl}/checkout/success?order_id=${order.id}`,
        cancel_return: `${publishedSiteUrl}/checkout/cancel`,
        notify_url: `${publicApiUrl}/paypal/ipn`,
        custom: order.id,
        no_shipping: "1",
        no_note: "1",
      });

      clearCart();
      window.location.href = `https://www.sandbox.paypal.com/cgi-bin/webscr?${paypalParams.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-full bg-[var(--secondary)] flex items-center justify-center mb-6">
          <ShoppingCart className="w-10 h-10 text-[var(--primary)]" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
        <p className="text-[var(--muted-foreground)] mb-6">Browse our collection and add items to your cart.</p>
        <Link
          href="/catalog"
          className="px-6 py-3 rounded-full bg-[var(--primary)] text-white font-medium hover:brightness-110 transition-all"
        >
          Browse Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/catalog" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-lg font-semibold">Checkout</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Your Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm
                               focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm
                               focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm
                               focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
                    placeholder="+1 234 567 8900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-sm
                               focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent resize-none"
                    placeholder="Any special requests..."
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Cart Items</h2>
              <div className="space-y-4">
                {cart.map((line) => {
                  if (line.kind === "catalog") {
                    const { item, quantity, lineId } = line;
                    return (
                      <div key={lineId} className="flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-xl bg-[var(--muted)] overflow-hidden relative shrink-0">
                          {item.images[0] ? (
                            <Image src={item.images[0]} alt={item.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-6 h-6 text-[var(--muted-foreground)] opacity-40" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm line-clamp-1">{item.name}</h3>
                          <p className="text-sm text-[var(--primary)] font-semibold">
                            {formatPrice(item.price, item.currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(lineId)}
                            className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (line.kind === "kitchen-furniture") {
                    const { name, price, quantity, lineId, config } = line;
                    const mainW = config.baseModules.reduce((s, m) => s + m.width, 0);
                    const dims =
                      config.island.enabled && config.island.baseModules.length > 0
                        ? `Main ${mainW} cm · island`
                        : `${mainW} cm base run`;
                    return (
                      <div key={lineId} className="flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-xl bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <Package className="w-8 h-8 text-[var(--primary)] opacity-80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm line-clamp-2">{name}</h3>
                          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{dims}</p>
                          <p className="text-sm text-[var(--primary)] font-semibold mt-0.5">
                            {formatPrice(price, currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(lineId)}
                            className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (line.kind === "module-planner") {
                    const { name, price, quantity, lineId, module, selection, breakdown } = line;
                    const dims = `${module.dimensions.width}×${module.dimensions.height}×${module.dimensions.depth} ${module.dimensions.unit}`;
                    const templateNote =
                      module.isConfigurableTemplate && selection
                        ? " · Configured template"
                        : "";
                    return (
                      <div key={lineId} className="flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-xl bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <Package className="w-8 h-8 text-teal-600 opacity-80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm line-clamp-2">{name}</h3>
                          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                            {module.isConfigurableTemplate ? "Template" : "Custom module"} · {dims}
                            {templateNote}
                          </p>
                          {breakdown && (
                            <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 font-mono">
                              Base {formatPrice(breakdown.basePrice, currency)}
                              {breakdown.bodyDelta !== 0 && (
                                <> · body {breakdown.bodyDelta >= 0 ? "+" : ""}
                                {formatPrice(breakdown.bodyDelta, currency)}</>
                              )}
                              {breakdown.doorDelta !== 0 && (
                                <> · door {breakdown.doorDelta >= 0 ? "+" : ""}
                                {formatPrice(breakdown.doorDelta, currency)}</>
                              )}
                              {breakdown.handleDelta !== 0 && (
                                <> · handle {breakdown.handleDelta >= 0 ? "+" : ""}
                                {formatPrice(breakdown.handleDelta, currency)}</>
                              )}
                              {breakdown.extrasTotal !== 0 && (
                                <> · extras {breakdown.extrasTotal >= 0 ? "+" : ""}
                                {formatPrice(breakdown.extrasTotal, currency)}</>
                              )}
                            </p>
                          )}
                          <p className="text-sm text-[var(--primary)] font-semibold mt-0.5">
                            {formatPrice(price, currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(lineId, quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(lineId)}
                            className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  }
                  const { name, price, quantity, lineId, config } = line;
                  const dims = `${config.frame.width}×${config.frame.height}×${config.frame.depth} cm`;
                  return (
                    <div key={lineId} className="flex gap-4 items-center">
                      <div className="w-16 h-16 rounded-xl bg-[var(--muted)] flex items-center justify-center shrink-0">
                        <Package className="w-8 h-8 text-[var(--primary)] opacity-80" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm line-clamp-2">{name}</h3>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{dims}</p>
                        <p className="text-sm text-[var(--primary)] font-semibold mt-0.5">
                          {formatPrice(price, currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(lineId, quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(lineId, quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-[var(--muted)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(lineId)}
                          className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-[var(--border)] p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
              <div className="space-y-3 mb-6">
                {cart.map((line) => {
                  if (line.kind === "catalog") {
                    return (
                      <div key={line.lineId} className="flex justify-between text-sm">
                        <span className="text-[var(--muted-foreground)] line-clamp-1 flex-1 mr-3">
                          {line.item.name} x{line.quantity}
                        </span>
                        <span className="font-medium shrink-0">
                          {formatPrice(line.item.price * line.quantity, currency)}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={line.lineId} className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)] line-clamp-2 flex-1 mr-3">
                        {line.name} x{line.quantity}
                      </span>
                      <span className="font-medium shrink-0">
                        {formatPrice(line.price * line.quantity, currency)}
                      </span>
                    </div>
                  );
                })}
                <div className="border-t border-[var(--border)] pt-3 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold text-[var(--primary)]">{formatPrice(total, currency)}</span>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
              )}

              <button
                type="button"
                onClick={handlePayWithPaypal}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold
                           flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Pay with PayPal
                  </>
                )}
              </button>
              <p className="text-xs text-center text-[var(--muted-foreground)] mt-3">
                You will be redirected to PayPal to complete your payment.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
