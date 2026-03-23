/**
 * Agent contact card for the property showcase template.
 */
import { Mail, Phone } from "lucide-react";

import type { AgentData } from "../types";

interface AgentContactProps {
  agent: AgentData;
}

export function AgentContact({ agent }: AgentContactProps) {
  return (
    <section className="rounded-[2rem] border border-amber-200/15 bg-amber-200/8 p-6 shadow-xl shadow-black/10">
      <p className="text-sm uppercase tracking-[0.2em] text-amber-100/70">Presented By</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{agent.name}</h2>
      <p className="mt-1 text-sm text-stone-300">{agent.license}</p>
      <p className="mt-4 text-sm leading-7 text-stone-200">{agent.bio}</p>
      <div className="mt-6 space-y-3">
        <a
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-stone-950/40 px-4 py-3 text-sm text-stone-100"
          href={`tel:${agent.phone}`}
        >
          <Phone className="h-4 w-4 text-amber-200" />
          {agent.phone}
        </a>
        <a
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-stone-950/40 px-4 py-3 text-sm text-stone-100"
          href={`mailto:${agent.email}`}
        >
          <Mail className="h-4 w-4 text-amber-200" />
          {agent.email}
        </a>
      </div>
    </section>
  );
}
