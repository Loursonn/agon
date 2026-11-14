import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Generic empty state component.
 * Use when a list/table/section has no data to display.
 */
export function EmptyState({ icon: Icon, title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[6px] border border-dashed border-agon-tx/[0.08] px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-[6px] bg-agon-accent/[0.10]">
        <Icon size={22} strokeWidth={1.5} className="text-agon-accent" />
      </div>

      <div className="mb-1.5 text-[14px] font-semibold text-agon-tx">
        {title}
      </div>

      {description && (
        <div className="max-w-[280px] text-[12px] leading-[1.5] text-agon-tx3">
          {description}
        </div>
      )}

      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 cursor-pointer rounded-[4px] border border-agon-accent/[0.31] bg-agon-accent/[0.12] px-5 py-2 font-[inherit] text-[13px] font-semibold text-agon-accent [transition:background_150ms_ease-out] hover:bg-agon-accent/[0.22]"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
