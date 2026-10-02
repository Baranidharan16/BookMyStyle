import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BookMyStyle — Salon & Spa Booking",
    short_name: "BookMyStyle",
    description: "Book salons, barbers and spas near you with real-time availability.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f4",
    theme_color: "#a3214f",
    orientation: "portrait",
    categories: ["lifestyle", "beauty", "shopping"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "My bookings", url: "/customer/dashboard" },
      { name: "Find a salon", url: "/search" },
    ],
  };
}
