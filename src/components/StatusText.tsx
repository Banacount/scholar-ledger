import { CheckCircle2, Clock, Info, XCircle } from 'lucide-react';

interface StatusTextProps {
  status: string;
}

export function StatusText({ status }: StatusTextProps) {
  switch (status) {
    case 'Approved':
    case 'Present':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'Pending':
    case 'Late':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'Rejected':
    case 'Absent':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
  }
}
