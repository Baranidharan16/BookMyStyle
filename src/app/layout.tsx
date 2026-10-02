import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { themeScript } from "@/components/theme";
import { PwaRegister } from "@/components/pwa-register";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap", axes: ["opsz", "SOFT"] });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "BookMyStyle — Book salons, spas & barbers near you", template: "%s · BookMyStyle" },
  description:
    "Discover top-rated salons, barbershops, beauty parlours and spas near you. See real-time availability, pick your stylist, pay securely and skip the wait.",
  applicationName: "BookMyStyle",
  keywords: ["salon booking", "haircut near me", "spa booking", "barber", "beauty parlour", "bridal makeup", "Chennai salons", "Bengaluru salons"],
  openGraph: { type: "website", siteName: "BookMyStyle", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "BookMyStyle", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#120f15" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
