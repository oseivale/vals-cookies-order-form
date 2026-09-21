import OrderForm from "@/components/OrderForm";
import { BRAND } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-10 text-center animate-fade-in">
        <div
          className="h-40 w-40 items-center justify-center rounded-full mx-auto mb-5 flex"
        // className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full p-2.5 shadow-card"
        // style={{ background: `linear-gradient(135deg, ${BRAND.colors.accent}, ${BRAND.colors.light})` }}
        >
          {/* Swap /public/logo.svg for your own artwork any time — same path, same spot. */}
          <img src="/vals-cookies-logo-v1.png" alt={`${BRAND.name} logo`} className="h-full w-full" />
        </div>
        <h1 className="font-display text-4xl font-semibold" style={{ color: BRAND.colors.dark }}>
          {BRAND.name}
        </h1>

        <p
          className="mx-auto mt-4 max-w-md font-display text-xl font-semibold"
          style={{ color: BRAND.colors.accent }}
        >
          {BRAND.welcomeHeading}
        </p>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-stone-600">
          {BRAND.welcomeGreeting}
        </p>
        <p className="mx-auto mt-1 max-w-md text-[15px] leading-relaxed text-stone-600">
          {BRAND.welcomeMessage}
        </p>

        <div className="mx-auto mt-8 max-w-xl text-left">
          <p
            className="mb-4 text-center text-xs font-semibold uppercase tracking-wide"
            style={{ color: BRAND.colors.dark }}
          >
            How it works
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {BRAND.howItWorks.map((step) => (
              <div
                key={step.title}
                className="flex items-start gap-3 rounded-xl2 border bg-white p-4 shadow-card"
                style={{ borderColor: BRAND.colors.light }}
              >
                <img src={step.icon} alt="" className="mt-0.5 h-7 w-7 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-stone-800">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p
          className="mx-auto mt-8 max-w-md font-display text-lg font-semibold"
          style={{ color: BRAND.colors.dark }}
        >
          {BRAND.welcomeClosing}
        </p>
      </header>

      <OrderForm />
    </main>
  );
}
