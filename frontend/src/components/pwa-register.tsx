"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;
    const promptRefresh = (worker: ServiceWorker) => {
      toast("A new version is ready", {
        description: "Refresh when you have finished what you are typing.",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => {
            try {
              worker.postMessage({ type: "SKIP_WAITING" });
            } catch {
              window.location.reload();
            }
          },
        },
      });
    };

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        if (registration.waiting && navigator.serviceWorker.controller) {
          promptRefresh(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // Only prompt for an *update*; a first install has no controller yet.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptRefresh(installing);
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch {
        // A failed registration must never break the app.
      }
    };

    const onLoad = () => {
      void register();
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
      try {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return;
    } catch {
      // matchMedia unavailable — fall through, beforeinstallprompt just may never fire.
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent) return null;

  return (
    <div className="fixed bottom-3 left-3 z-50">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await installEvent.prompt();
          } catch {
            // ignore
          } finally {
            setInstallEvent(null);
          }
        }}
      >
        Install app
      </Button>
    </div>
  );
}
