import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Clock, AlertTriangle, XCircle, FileText, Wrench, Eye } from 'lucide-react';
import type { BookingStatus } from '../types';

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display font-bold tracking-tight whitespace-nowrap shrink-0 ${dark ? 'text-white' : 'text-slate-900'}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
        <Sparkles className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <span className="text-lg">LuminaCraft</span>
    </span>
  );
}

export function StatusText({ status }: { status: BookingStatus | string }) {
  const map: Record<string, { color: string; Icon: React.ComponentType<any> }> = {
    Pending: { color: 'text-amber-700', Icon: Clock },
    'Request Received': { color: 'text-sky-700', Icon: FileText },
    'Site Visit Required': { color: 'text-amber-700', Icon: Eye },
    'Quotation Sent': { color: 'text-indigo-700', Icon: FileText },
    Approved: { color: 'text-emerald-700', Icon: CheckCircle2 },
    'Work in Progress': { color: 'text-amber-700', Icon: Wrench },
    Completed: { color: 'text-emerald-700', Icon: CheckCircle2 },
    Cancelled: { color: 'text-rose-700', Icon: XCircle },
    Sent: { color: 'text-indigo-700', Icon: FileText },
    Accepted: { color: 'text-emerald-700', Icon: CheckCircle2 },
    Rejected: { color: 'text-rose-700', Icon: XCircle },
    Available: { color: 'text-emerald-700', Icon: CheckCircle2 },
    Assigned: { color: 'text-amber-700', Icon: Wrench },
    'Off Duty': { color: 'text-slate-500', Icon: AlertTriangle },
  };
  const cfg = map[status] || { color: 'text-slate-700', Icon: Clock };
  const Icon = cfg.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
}

export function ImageWithFallback({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/60 p-4 text-center ${className}`}
      >
        <Sparkles className="h-7 w-7 text-amber-400 mb-2" />
        <span className="text-xs font-medium text-slate-300 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4 animate-pulse">
          <div className="space-y-2 flex-1">
            <div className="h-4 w-44 rounded bg-slate-200" />
            <div className="h-3 w-72 rounded bg-slate-100" />
          </div>
          <div className="h-4 w-20 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
