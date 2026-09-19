import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className = "", priority = false }: BrandLogoProps) {
  return (
    <Image
      alt="깨딱"
      className={`h-auto w-full object-contain ${className}`}
      height={923}
      priority={priority}
      src="/brand/kkaeddak-logo.png"
      width={1704}
    />
  );
}
