import { FeedbackInbox } from '@/components/feedback-inbox';
import { Suspense } from 'react';
export default function FeedbackPage() { return <><section className="loop-page-heading"><p className="text-sm font-semibold text-blue-600">FEEDBACK</p><h1>Customer feedback inbox</h1><p>Search, filter, and inspect feedback from every connected source.</p></section><Suspense fallback={<div className="loop-loading">Loading feedback inbox...</div>}><FeedbackInbox /></Suspense></>; }
