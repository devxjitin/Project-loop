import Link from 'next/link';
import { BarChart3, CheckCircle2, Link2, UploadCloud } from 'lucide-react';

const steps = [
  { title: 'Connect a feedback source', description: 'Bring in Zendesk, Typeform, or a signed webhook.', href: '/connectors', label: 'Connect source', icon: Link2 },
  { title: 'Or upload a CSV', description: 'Import feedback you already have in a spreadsheet.', href: '/upload', label: 'Upload CSV', icon: UploadCloud },
  { title: 'Review your insights', description: 'LOOP classifies sentiment and recurring themes automatically.', href: '/insights', label: 'View insights', icon: BarChart3 },
];

export function OnboardingChecklist() { return <section className="rounded-panel border border-surface-border bg-white p-6 shadow-panel"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-5" /></span><div><h2 className="font-semibold text-slate-900">Get value from your first feedback cycle</h2><p className="mt-1 text-sm text-slate-600">Start with one source. LOOP handles the classification and gives you a dashboard once feedback arrives.</p></div></div><ol className="mt-5 grid gap-3 md:grid-cols-3">{steps.map(({ title, description, href, label, icon: Icon }, index) => <li key={title} className="rounded-xl border border-surface-border p-4"><span className="text-xs font-bold text-brand-600">STEP {index + 1}</span><Icon className="mt-3 size-5 text-slate-500" /><h3 className="mt-3 font-medium text-slate-900">{title}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">{description}</p><Link href={href} className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800">{label} →</Link></li>)}</ol></section>; }
