"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, getAuthUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

const SECTIONS = [
  { href: "/books", key: "books.nav.trialBalance", label: "Trial Balance" },
  { href: "/books/profit-loss", key: "books.nav.profitLoss", label: "Profit & Loss" },
  { href: "/books/balance-sheet", key: "books.nav.balanceSheet", label: "Balance Sheet" },
  { href: "/books/journal", key: "books.nav.journal", label: "Journal" },
  { href: "/books/ledgers", key: "books.nav.ledgers", label: "Ledgers" },
  { href: "/books/who-owes", key: "books.nav.whoOwes", label: "Who Owes What" },
  { href: "/books/new-entry", key: "books.nav.newEntry", label: "New Entry", ownerOnly: true },
];

export default function BooksLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();
  const isOwner = getAuthUser()?.role === "OWNER";
  const allowed = can("canViewReports");

  const items = SECTIONS.filter((s) => !s.ownerOnly || isOwner);

  if (!allowed) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="font-medium mt-2">
            {t("books.noAccess.title", "You do not have access to the books")}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "books.noAccess.body",
              "Viewing the ledger needs the “View reports” permission. Ask the owner to grant it under Users.",
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("books.title", "Books")}</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t(
            "books.subtitle",
            "The pump's double-entry accounts. Entries are written automatically every time a shift is locked, and reversed if it is unlocked — nothing is ever edited or deleted.",
          )}
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-md bg-muted p-1">
        {items.map((s) => {
          const active =
            s.href === "/books" ? pathname === "/books" : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(s.key, s.label)}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
