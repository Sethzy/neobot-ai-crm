import { Container } from "@/components/landing/Container";

type ConfigNoticeProps = {
  title: string;
  description: string;
};

export function ConfigNotice({ title, description }: ConfigNoticeProps) {
  return (
    <section className="py-24">
      <Container>
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-8">
          <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
          <p className="mt-3 leading-relaxed text-zinc-700">{description}</p>
          <p className="mt-4 text-sm text-zinc-600">
            Configure `NEXT_PUBLIC_PROPERTY_SUPABASE_URL` and
            `NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY` to enable these pages.
          </p>
        </div>
      </Container>
    </section>
  );
}
