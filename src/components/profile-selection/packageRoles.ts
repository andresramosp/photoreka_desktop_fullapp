import type { Component } from "vue";
import {
  FlashOutline,
  GiftOutline,
  LayersOutline,
  StarOutline,
  TrendingDownOutline,
} from "@vicons/ionicons5";

export type PackageRole = "free" | "starter" | "popular" | "value" | null;

// The badge is the card's name, so every role has one.
interface RoleStyle {
  accent: string;
  badge: { label: string; icon: Component };
}

const ROLE_STYLE: Record<NonNullable<PackageRole> | "default", RoleStyle> = {
  free: {
    accent: "#94a3b8",
    badge: { label: "Welcome pack", icon: GiftOutline },
  },
  starter: {
    accent: "#22c55e",
    badge: { label: "Best to start", icon: FlashOutline },
  },
  popular: {
    accent: "var(--accent-color)",
    badge: { label: "Most popular", icon: StarOutline },
  },
  value: {
    accent: "#a855f7",
    badge: { label: "Best value", icon: TrendingDownOutline },
  },
  default: {
    accent: "#2563eb",
    badge: { label: "Bigger batch", icon: LayersOutline },
  },
};

export const roleStyle = (role: PackageRole): RoleStyle =>
  ROLE_STYLE[role ?? "default"];

export interface PackageNote {
  lead: string;
  text: string;
}

/**
 * The line under the carousel, about the selected pack. Kept to one line on
 * desktop. With the free pack selected it points at the smallest paid one, to
 * nudge a first purchase.
 */
export function packageNote(
  role: PackageRole,
  starter: { photos: number; finalPrice: number } | null,
): PackageNote {
  switch (role) {
    case "free":
      return {
        lead: "Try Photoreka on us.",
        text: starter
          ? `No card needed, or start with ${starter.photos.toLocaleString()} photos for €${starter.finalPrice.toFixed(2)}.`
          : "No card needed.",
      };
    case "starter":
      return {
        lead: "The easy way to start.",
        text: "Enough photos to see how Photoreka reads and ranks your own work.",
      };
    case "popular":
      return {
        lead: "The most chosen pack.",
        text: "Room for a solid first batch of your library.",
      };
    case "value":
      return {
        lead: "The best price per photo.",
        text: "Made for bringing in whole archives.",
      };
    default:
      return {
        lead: "More room to explore.",
        text: "Bring in a bigger part of your library from day one.",
      };
  }
}
