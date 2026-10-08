"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { Drawer } from "vaul"
import { useIsMobile } from "@/hooks/use-media-query"

import { cn } from "@/lib/utils"

const MobileDialogContext = React.createContext(false)

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const mobile = useIsMobile()
  return <MobileDialogContext.Provider value={mobile}>
    {mobile ? <Drawer.Root {...props} shouldScaleBackground={false} noBodyStyles
      repositionInputs closeThreshold={0.18} autoFocus /> : <DialogPrimitive.Root {...props} />}
  </MobileDialogContext.Provider>
}

const DialogTrigger = DialogPrimitive.Trigger

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const mobile = React.useContext(MobileDialogContext)
  return mobile ? <Drawer.Portal {...props} /> : <DialogPrimitive.Portal {...props} />
}

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const mobile = React.useContext(MobileDialogContext)
  const Overlay = mobile ? Drawer.Overlay : DialogPrimitive.Overlay
  return <Overlay
    ref={ref}
    className={cn(
      "dialog-overlay fixed inset-0 z-[80] bg-black/45",
      className
    )}
    {...props}
  />
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const mobile = React.useContext(MobileDialogContext)
  const Content = mobile ? Drawer.Content : DialogPrimitive.Content
  const opener = React.useRef<HTMLElement | null>(null)
  return (
  <DialogPortal>
    <DialogOverlay />
    <Content
      ref={ref}
      data-mobile-sheet={mobile || undefined}
      onOpenAutoFocus={(event) => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        onOpenAutoFocus?.(event)
        // Keep keyboard closed until an input is explicitly tapped.
        if (mobile && !event.defaultPrevented) {
          event.preventDefault()
          const content = event.currentTarget
          if (content instanceof HTMLElement) content.focus()
        }
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event)
        if (!event.defaultPrevented && opener.current?.isConnected) {
          event.preventDefault()
          opener.current.focus({ preventScroll: true })
        }
      }}
      className={cn(
        "dialog-surface fixed z-[81] grid gap-4 border bg-background p-6 shadow-xl outline-none",
        mobile ? "mobile-sheet" : "desktop-dialog left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl max-h-[90dvh] overflow-y-auto",
        className
      )}
      {...props}
    >
      {mobile && <div className="sheet-grip-zone" aria-hidden="true"><Drawer.Handle className="sheet-grip" /></div>}
      {children}
      {/* Close-кнопка должна быть видима И на цветной шапке (TaskViewDialog
          с градиентным header'ом — там фон тёмный) И на белом dialog'е без
          шапки (Edit/Create/Duplicate). Раньше bg-white/20 на белом было
          почти прозрачным. Делаем полу-чёрный fallback + позволяем
          переопределить через data-attribute (см. dialog-close-on-color). */}
      <DialogPrimitive.Close className="dialog-close-button absolute right-3 top-3 p-1.5 rounded-lg bg-black/10 text-foreground hover:bg-black/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 z-10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20" aria-label="Закрыть">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Закрыть</span>
      </DialogPrimitive.Close>
    </Content>
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
