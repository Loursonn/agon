import * as React from "react";
import {
  Select as Root,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fieldStyles } from "./Input";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
}

/** Liste déroulante Agon, sur le Select shadcn (Radix). */
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  invalid,
  id,
  name,
  className,
  ...aria
}: SelectProps) {
  return (
    <Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectTrigger
        id={id}
        aria-label={aria["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn(fieldStyles, "data-[placeholder]:text-agon-tx3", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-md border-agon-brd-l bg-agon-s2 text-agon-tx">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className="font-ui text-agon-base focus:bg-agon-accent-doux focus:text-agon-tx"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Root>
  );
}
