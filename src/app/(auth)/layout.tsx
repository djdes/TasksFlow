export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pages below render their own full-screen layouts (split panels, etc) —
  // keep this wrapper as a transparent pass-through so they get the whole
  // viewport instead of being boxed into a 28rem card.
  return <div className="min-h-screen bg-[#f7f7fb]">{children}</div>;
}
