import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/98! group-[.toaster]:backdrop-blur-2xl! group-[.toaster]:text-foreground! group-[.toaster]:shadow-[0_12px_48px_rgba(0,0,0,0.7)] group-[.toaster]:rounded-2xl font-poppins px-6 py-4 flex gap-4 items-center border-white/5! ring-1 ring-white/[0.03]!",
          description: "group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
