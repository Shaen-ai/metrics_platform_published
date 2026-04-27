"use client";

import Link from "next/link";
import { XCircle } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Payment Cancelled</h1>
        <p className="text-[var(--muted-foreground)] mb-8">
          Your payment was cancelled. No charges have been made. Your cart items are still saved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/checkout"
            className="px-6 py-3 rounded-full bg-[var(--primary)] text-white font-medium hover:brightness-110 transition-all"
          >
            Try Again
          </Link>
          <Link
            href="/catalog"
            className="px-6 py-3 rounded-full bg-white border border-[var(--border)] font-medium hover:bg-[var(--muted)] transition-all"
          >
            Back to Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
