"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Payment Successful!</h1>
        <p className="text-[var(--muted-foreground)] mb-2">
          Thank you for your order. We&apos;ve received your payment and will process your order shortly.
        </p>
        {orderId && (
          <p className="text-sm text-[var(--muted-foreground)] mb-8">
            Order ID: <span className="font-mono font-medium">{orderId.slice(0, 8)}...</span>
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <Link
            href="/catalog"
            className="px-6 py-3 rounded-full bg-[var(--primary)] text-white font-medium hover:brightness-110 transition-all"
          >
            Continue Shopping
          </Link>
          <Link
            href="/"
            className="px-6 py-3 rounded-full bg-white border border-[var(--border)] font-medium hover:bg-[var(--muted)] transition-all"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
