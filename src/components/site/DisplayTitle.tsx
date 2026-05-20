import { splitByTamilScript } from "@/lib/typography/tamil";
import { cn } from "@/lib/utils";

type DisplayTitleProps = {
  children: string;
  className?: string;
  tamilClassName?: string;
};

/**
 * Renders titles with Cormorant for Latin and thin Anek Tamil for Tamil script runs.
 */
export function DisplayTitle({
  children,
  className,
  tamilClassName,
}: DisplayTitleProps) {
  const text = String(children);
  const segments = splitByTamilScript(text);

  if (segments.length === 1 && !segments[0].tamil) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span
          key={`${index}-${segment.text.slice(0, 8)}`}
          className={segment.tamil ? cn("font-anek-tamil-thin", tamilClassName) : undefined}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}
