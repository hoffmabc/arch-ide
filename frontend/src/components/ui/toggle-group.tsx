import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import React from 'react';

export const ToggleGroup = ToggleGroupPrimitive.Root;
export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>>(
  ({ className = '', ...props }, ref) => (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={`inline-flex items-center justify-center rounded-full h-7 px-3 text-xs transition-colors data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900 data-[state=off]:text-gray-300 hover:data-[state=off]:text-white ${className}`}
      {...props}
    />
  )
);
ToggleGroupItem.displayName = 'ToggleGroupItem';
