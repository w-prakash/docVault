import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration } from 'chart.js/auto';

@Component({
  selector: 'app-bar-chart',
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
export class BarChartComponent implements AfterViewInit, OnChanges, OnDestroy {

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

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: [{
          data: this.data,
          backgroundColor: '#5b8cff',
          borderRadius: 6,
          maxBarThickness: 28
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#8a92b8', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            ticks: { color: '#cfd6f0', font: { size: 12 } },
            grid: { display: false }
          }
        }
      }
    };

    this.chart = new Chart(this.canvasRef.nativeElement, config);
  }

}
