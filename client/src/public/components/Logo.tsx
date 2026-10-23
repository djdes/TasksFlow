import { BrandMark } from "../../components/BrandMark";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground ${className}`}>
      <BrandMark />
      <span>Tasks<span className="text-primary">Flow</span></span>
    </span>
  );
}
