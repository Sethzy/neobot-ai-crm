import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";

export default function AgenciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page min-h-screen bg-[#F5EEE1] selection:bg-indigo-100 selection:text-indigo-900">
      <Header />
      <main className="pt-24 sm:pt-28">{children}</main>
      <Footer />
    </div>
  );
}
