interface LockInfo {
  aiName: string;
  acquiredAt: number;
}

export class RegionLockManager {
  private locks = new Map<string, LockInfo>();

  acquireLock(regionName: string, aiName: string): boolean {
    if (this.locks.has(regionName)) {
      return false;
    }

    this.locks.set(regionName, {
      aiName,
      acquiredAt: Date.now(),
    });
    return true;
  }

  releaseLock(regionName: string): void {
    this.locks.delete(regionName);
  }

  isLocked(regionName: string): boolean {
    return this.locks.has(regionName);
  }

  getLockedRegions(): string[] {
    return [...this.locks.keys()];
  }

  getLockOwner(regionName: string): string | null {
    return this.locks.get(regionName)?.aiName || null;
  }
}
