import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
export default function OverviewPage() { return <><section className="loop-page-heading"><p className="text-sm font-semibold text-blue-600">OVERVIEW</p><h1>Good morning, welcome to LOOP.</h1><p>Monitor customer feedback, understand sentiment, and find what needs your attention.</p></section><OnboardingChecklist /><AnalyticsDashboard /></>; }
