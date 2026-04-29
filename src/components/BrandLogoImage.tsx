"use client";

import Image from "next/image";
import type { Admin } from "@/lib/types";
import { getStorefrontLogoSrc } from "@/lib/brandLogo";

type BrandLogoImageProps = {
  admin: Admin | null | undefined;
  brandName: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogoImage({
  admin,
  brandName,
  width,
  height,
  className,
  priority,
}: BrandLogoImageProps) {
  const src = getStorefrontLogoSrc(admin);
  return (
    <Image
      src={src}
      alt={`${brandName} logo`}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
