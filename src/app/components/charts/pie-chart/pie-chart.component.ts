import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration } from 'chart.js/auto';

const PALETTE = ['#5b8cff', '#8b5cff', '#5be8b5', '#ffb15b', '#ff5b8c', '#5bd1ff', '#c39bff', '#7db8ff'];

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-wrap" [class.empty]="!labels?.length">
      <canvas #canvasRef *ngIf="labels?.length"></canvas>
      <div class="empty-state" *ngIf="!labels?.length">
        <span>{{ emptyMessage }}</span>
      </div>
    </div>
  `,
  styles: [`
    .chart-wrap { position: relative; width: 100%; height: 220px; }
    .empty-state {
      height: 100%; display: flex; align-items: center; justify-content: center;
      color: #6b7fa8; font-size: 13px; text-align: center;
    }
  `]
})
export class PieChartComponent implements AfterViewInit, OnChanges, OnDestroy {

  @ViewChild('canvasRef') canvasRef?: ElementRef<HTMLCanvasElement>;

  @Input() labels: string[] = [];
  @Input() data: number[] = [];
  @Input() emptyMessage = 'No data yet';

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['data']?.firstChange && !changes['labels']?.firstChange) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {

    if (!this.canvasRef || !this.labels?.length) {
      return;
    }

    this.chart?.destroy();

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: this.labels,
        datasets: [{
          data: this.data,
          backgroundColor: this.labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: '#0a0e27',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#cfd6f0', font: { size: 11 }, boxWidth: 10, padding: 10 }
          }
        }
      }
    };

    this.chart = new Chart(this.canvasRef.nativeElement, config);
  }

}
