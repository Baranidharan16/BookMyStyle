import Link from "next/link";
import { Logo } from "../ui/logo";

export function SiteFooter() {
  const cols = [
    { title: "Discover", links: [["Salons near you", "/search"], ["Offers & deals", "/offers"], ["Haircut", "/search?category=haircut"], ["Bridal makeup", "/search?category=bridal-makeup"], ["Spa & massage", "/search?category=body-spa"]] },
    { title: "For business", links: [["Why BookMyStyle", "/for-salon-owners"], ["Register your salon", "/register?role=OWNER"], ["Business login", "/login?next=/business"]] },
    { title: "Cities", links: [["Chennai", "/search?city=Chennai"], ["Bengaluru", "/search?city=Bengaluru"]] },
    { title: "Account", links: [["My bookings", "/customer/dashboard"], ["Favourites", "/customer/favorites"], ["Notifications", "/notifications"]] },
  ];
  return (
    <footer className="mt-20 border-t border-line bg-surface pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Real-time salon, spa and barber bookings — see live availability, pay securely, skip the wait.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-ink-2 hover:text-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} BookMyStyle. Prices include applicable GST at checkout.</p>
          <p>Made for salons across India 🇮🇳</p>
        </div>
      </div>
    </footer>
  );
}
