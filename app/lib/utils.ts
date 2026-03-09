import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function formatTimeAgo(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return 'n/a';

  const seconds = Math.floor((Date.now() - ms) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'done':
    case 'healthy':
      return 'text-accent-green';
    case 'idle':
    case 'inbox':
    case 'info':
      return 'text-accent-cyan';
    case 'blocked':
    case 'failed':
    case 'error':
    case 'overdue':
      return 'text-accent-red';
    case 'warning':
    case 'review':
      return 'text-accent-yellow';
    default:
      return 'text-text-secondary';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'text-accent-red';
    case 'medium':
      return 'text-accent-yellow';
    case 'low':
      return 'text-accent-green';
    default:
      return 'text-text-secondary';
  }
}
