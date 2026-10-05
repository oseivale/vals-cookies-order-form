import OrderForm from "@/components/OrderForm";
import { BRAND } from "@/lib/config";
import { isOrderWindowOpen } from "@/lib/orderWindow";

// Without this, Next.js could statically render this page once at build
// time and bake in whatever open/closed state happened to be true then —
// force-dynamic makes sure the check runs fresh on every request.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const ordersOpen = isOrderWindowOpen();
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

           {ordersOpen ? <OrderForm /> : <OrdersClosed />}
    </main>
  );
}

// function OrdersClosed() {
//   return (
//     <div
//       className="rounded-xl2 border bg-white p-8 text-center shadow-card animate-fade-in"
//       style={{ borderColor: BRAND.colors.light }}
//     >
//       <p className="text-4xl">🍪</p>
//       <h2 className="mt-3 font-display text-2xl font-semibold" style={{ color: BRAND.colors.dark }}>
//         Preorders are closed for now
//       </h2>
//       <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-stone-600">
//         We're baking and handing out this week's orders! New preorders open again{" "}
//         <strong style={{ color: BRAND.colors.dark }}>Sunday at midnight</strong> and close{" "}
//         <strong style={{ color: BRAND.colors.dark }}>Wednesday at 11:59pm</strong>, for pickup that same week.
//       </p>
//       <p className="mt-4 text-sm text-stone-400">Check back soon — we'd love to bake for you!</p>
//     </div>
//   );
// }

function getNextOrderWindow() {
  const today = new Date();

  // Sunday = 0
  const daysUntilSunday = (7 - today.getDay()) % 7;

  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + daysUntilSunday);

  // Wednesday is 3 days after Sunday
  const nextWednesday = new Date(nextSunday);
  nextWednesday.setDate(nextSunday.getDate() + 3);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(date);

  return {
    sunday: formatDate(nextSunday),
    wednesday: formatDate(nextWednesday),
  };
}

function OrdersClosed() {
  const { sunday, wednesday } = getNextOrderWindow();

  return (
    <div
      className="rounded-xl2 border bg-white p-8 text-center shadow-card animate-fade-in"
      style={{ borderColor: BRAND.colors.light }}
    >
      <div className="flex justify-center h-10"><img src="/icons/cookie.svg" /></div>

      <h2
        className="mt-3 font-display text-2xl font-semibold"
        style={{ color: BRAND.colors.dark }}
      >
        Preorders are closed for now
      </h2>

      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-stone-600">
        We're baking and handing out this week's orders! New preorders open again{" "}
        <strong style={{ color: BRAND.colors.dark }}>
          {sunday} at midnight
        </strong>{" "}
        and close{" "}
        <strong style={{ color: BRAND.colors.dark }}>
          {wednesday} at 11:59pm
        </strong>
        , for pickup that same week.
      </p>

      <p className="mt-4 text-sm text-stone-400">
        Check back soon — we'd love to bake for you!
      </p>
    </div>
  );
}
