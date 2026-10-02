import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh] pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileNav />
    </>
  );
}
