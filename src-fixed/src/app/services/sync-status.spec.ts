import { TestBed } from '@angular/core/testing';

import { SyncStatus } from './sync-status';

describe('SyncStatus', () => {
  let service: SyncStatus;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncStatus);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
