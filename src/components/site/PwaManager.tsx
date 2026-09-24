import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });

    const onPrompt = (event: Event) => {
      event.preventDefault();
      const dismissedAt = Number(localStorage.getItem("drop-pwa-dismissed") ?? 0);
      setInstallPrompt(event as InstallPromptEvent);
      if (Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1_000) setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
      localStorage.removeItem("drop-pwa-dismissed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !installPrompt) return null;
  return (
    <aside className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-primary/40 bg-background/95 p-4 shadow-2xl backdrop-blur-xl lg:bottom-5">
      <button
        type="button"
        aria-label="Fechar convite de instalação"
        className="absolute right-2 top-2 p-1 text-muted-foreground hover:text-foreground"
        onClick={() => {
          localStorage.setItem("drop-pwa-dismissed", String(Date.now()));
          setVisible(false);
        }}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <img src="/pwa-192.png" alt="" className="h-12 w-12 rounded-xl" />
        <div>
          <p className="font-display text-sm uppercase">Instale a DROP</p>
          <p className="text-xs text-muted-foreground">
            Acesse a loja mais rápido pela tela inicial.
          </p>
        </div>
      </div>
      <Button
        variant="hero"
        size="sm"
        className="mt-3 w-full"
        onClick={async () => {
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice.outcome === "dismissed") {
            localStorage.setItem("drop-pwa-dismissed", String(Date.now()));
          }
          setVisible(false);
          setInstallPrompt(null);
        }}
      >
        <Download className="h-4 w-4" /> Instalar aplicativo
      </Button>
    </aside>
  );
}
