import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'relativeTime',
  standalone: true,
  pure: false // so the label keeps ticking forward while the panel stays open
})
export class RelativeTimePipe implements PipeTransform {

  transform(value: string | undefined | null): string {

    if (!value) {
      return '';
    }

    const then = new Date(value).getTime();

    if (Number.isNaN(then)) {
      return '';
    }

    const diffMs = Date.now() - then;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) {
      return 'Just now';
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return `${diffHr}h ago`;
    }

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) {
      return `${diffDay}d ago`;
    }

    return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }
}
