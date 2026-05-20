import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

const markHeights = {
  sm: 28,
  md: 36,
  lg: 52,
} as const;

export function BrandLogo({
  href = "/",
  showWordmark = true,
  size = "md",
  className,
  wordmarkClassName,
  priority = false,
}: BrandLogoProps) {
  const height = markHeights[size];
  const width = Math.round(height * 1.15);

  const content = (
    <>
      <Image
        src={BRAND.mark}
        alt=""
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto shrink-0 object-contain"
        style={{ height, width: "auto", maxWidth: width * 1.4 }}
      />
      {showWordmark && (
        <span
          className={cn(
            "font-display tracking-[0.12em] uppercase",
            size === "sm" && "text-sm",
            size === "md" && "text-lg",
            size === "lg" && "text-2xl",
            wordmarkClassName,
          )}
        >
          {BRAND.name}
        </span>
      )}
    </>
  );

  const wrapperClass = cn(
    "inline-flex items-center gap-2.5 transition-opacity hover:opacity-85",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={wrapperClass} aria-label={`${BRAND.name} home`}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
