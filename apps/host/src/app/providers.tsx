"use client";

import { TrackerProvider } from 'page-sense-library';

export function Providers({ children }: { children: any }) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || "sk-ps-8ci5a1ghguda5uko66lrv9ox";
    return <TrackerProvider apiUrl={apiUrl} apiKey={apiKey}>{children}</TrackerProvider>;
}
