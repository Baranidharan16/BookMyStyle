"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function useFavorites(enabled = true) {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      try {
        return await api.get<string[]>("/api/customer/favorites");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return [];
        throw e;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function FavoriteButton({ salonId, className, signedIn }: { salonId: string; className?: string; signedIn: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: favs = [] } = useFavorites(signedIn);
  const isFav = favs.includes(salonId);
  const m = useMutation({
    mutationFn: () => (isFav ? api.del("/api/customer/favorites", { salonId }) : api.post("/api/customer/favorites", { salonId })),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData<string[]>(["favorites"]) ?? [];
      qc.setQueryData(["favorites"], isFav ? prev.filter((x) => x !== salonId) : [...prev, salonId]);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(["favorites"], ctx?.prev);
      toast.error(e instanceof ApiError ? e.message : "Couldn't update favourites");
    },
    onSuccess: () => toast.success(isFav ? "Removed from favourites" : "Saved to favourites"),
  });
  return (
    <button
      type="button"
      aria-pressed={isFav}
      aria-label={isFav ? "Remove from favourites" : "Save to favourites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!signedIn) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        m.mutate();
      }}
      className={cn("grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition hover:scale-105 dark:bg-black/50 dark:text-white", className)}
    >
      <Heart className={cn("h-[18px] w-[18px]", isFav && "fill-brand text-brand")} />
    </button>
  );
}
