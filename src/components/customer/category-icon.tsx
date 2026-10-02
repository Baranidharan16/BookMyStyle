import {
  Baby, Brain, Brush, Crown, Droplets, Flame, Flower2, Footprints, Gem, Hand, Package, Palette, PartyPopper, Scissors, Slice, Sparkles, Spline, SprayCan, Sun, UserRound, Waves, Wind, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  scissors: Scissors, wind: Wind, palette: Palette, droplets: Droplets, "user-round": UserRound, slice: Slice, sparkles: Sparkles, "spray-can": SprayCan,
  hand: Hand, footprints: Footprints, gem: Gem, waves: Waves, brain: Brain, "flower-2": Flower2, crown: Crown, "party-popper": PartyPopper, brush: Brush,
  flame: Flame, spline: Spline, sun: Sun, baby: Baby, package: Package,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? Scissors;
  return <Icon className={className} aria-hidden />;
}
