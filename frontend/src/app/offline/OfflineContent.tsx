"use client";
import { useT } from "@/lib/i18n";

export function OfflineContent() {
  const { t } = useT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-xl font-semibold">{t("auth.offlineTitle", "You are offline")}</h1>
      <p className="text-sm text-muted-foreground">
        {t(
          "auth.offlineNeedsNetwork",
          "FuelBook needs a connection to load pump data — readings, cash, stock and credit all live on the server, so there is nothing to show until the network is back."
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(
          "auth.offlineKeepTyping",
          "If you were part-way through entering something, it is still on that screen. Go back to it instead of refreshing: refreshing or closing the tab will lose what you typed."
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("auth.offlineReload", "Once you have signal again, reload the page and carry on.")}
      </p>
    </main>
  );
}
