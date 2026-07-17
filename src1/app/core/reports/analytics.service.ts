import { Injectable } from '@angular/core';
import { CategoryStat, DocumentTypeStat, MemberStat } from './reports.models';

const TYPE_LABELS: { match: (mime: string) => boolean; label: DocumentTypeStat['label'] }[] = [
  { match: m => m.startsWith('image/'), label: 'Images' },
  { match: m => m === 'application/pdf', label: 'PDF' },
  { match: m => m.includes('wordprocessingml'), label: 'Word' },
  { match: m => m.includes('spreadsheetml'), label: 'Excel' },
  { match: m => m.includes('zip'), label: 'ZIP' },
];

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {

  groupByCategory(documents: any[], categories: any[]): CategoryStat[] {

    const total = documents.length;

    const counts = new Map<string, number>();

    for (const doc of documents) {

      const key = doc.category_id || 'uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const stats: CategoryStat[] = [];

    for (const [id, count] of counts.entries()) {

      const category = categories.find(c => c.id === id);

      stats.push({
        id,
        name: category?.name ?? 'Uncategorized',
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  groupByMember(documents: any[], members: any[]): MemberStat[] {

    const total = documents.length;

    const counts = new Map<string, number>();

    for (const doc of documents) {

      const key = doc.member_id || 'unassigned';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const stats: MemberStat[] = [];

    for (const [id, count] of counts.entries()) {

      const member = members.find(m => m.id === id);

      stats.push({
        id,
        name: member?.name ?? 'Unassigned',
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  groupByDocumentType(documents: any[]): DocumentTypeStat[] {

    const total = documents.length;

    const counts = new Map<DocumentTypeStat['label'], number>([
      ['PDF', 0], ['Images', 0], ['Word', 0], ['Excel', 0], ['ZIP', 0], ['Others', 0]
    ]);

    for (const doc of documents) {

      const mime: string = doc.file_type || '';

      const match = TYPE_LABELS.find(t => t.match(mime));

      const label = match?.label ?? 'Others';

      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      }))
      .filter(stat => stat.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  mostAndLeastUsedCategory(stats: CategoryStat[]): { most: CategoryStat | null; least: CategoryStat | null } {

    if (!stats.length) {
      return { most: null, least: null };
    }

    return {
      most: stats[0],
      least: stats[stats.length - 1]
    };
  }

  mostAndLeastActiveMember(stats: MemberStat[]): { most: MemberStat | null; least: MemberStat | null } {

    if (!stats.length) {
      return { most: null, least: null };
    }

    return {
      most: stats[0],
      least: stats[stats.length - 1]
    };
  }

  countUploadedSince(documents: any[], since: Date): number {

    return documents.filter(d => {

      if (!d.created_at) {
        return false;
      }

      return new Date(d.created_at).getTime() >= since.getTime();

    }).length;
  }

}
