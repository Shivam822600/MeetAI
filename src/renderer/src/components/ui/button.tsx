import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../utils/cn'
const variants = cva('button', {
  variants: {
    variant: { default: 'primary', secondary: 'secondary', ghost: 'ghost', destructive: 'danger' },
    size: { default: '', sm: 'small', icon: 'icon-button' }
  },
  defaultVariants: { variant: 'default', size: 'default' }
})
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(variants({ variant, size, className }))} {...props} />
}
