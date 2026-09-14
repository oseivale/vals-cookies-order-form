import OrderForm from "@/components/OrderForm";
import { BRAND } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-10 text-center animate-fade-in">
        <div
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-md p-2.5 shadow-card"
          // style={{ background: `linear-gradient(135deg, ${BRAND.colors.accent}, ${BRAND.colors.light})` }}
        >
          {/* Swap /public/logo.svg for your own artwork any time — same path, same spot. */}
          <img src="/vals-cookies-logo-v1.png" alt={`${BRAND.name} logo`} className="h-full w-full" />
        </div>
        <h1 className="font-display text-4xl font-semibold" style={{ color: BRAND.colors.dark }}>
          {BRAND.name}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-stone-600">
          {BRAND.welcomeMessage}
        </p>
      </header>

      <OrderForm />
    </main>
  );
}
