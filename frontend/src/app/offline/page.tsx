import type { Metadata } from "next";
import { OfflineContent } from "./OfflineContent";

export const metadata: Metadata = {
  title: "Offline — FuelBook",
};

export default function OfflinePage() {
  return <OfflineContent />;
}
