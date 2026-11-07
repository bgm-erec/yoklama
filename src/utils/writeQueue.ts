export type SaveStatusPhase =
  | 'hidden'
  | 'saving'
  | 'saved'
  | 'error'
  | 'offline'
  | 'syncing_startup';

export interface QueuedWriteTask {
  key: string;
  label: string;
  execute: () => Promise<void>;
  rollback?: () => void;
}

export interface WriteQueueSnapshot {
  phase: SaveStatusPhase;
  hasInteracted: boolean;
  pendingCount: number;
  inFlightCount: number;
  failedCount: number;
  lastErrorMessage: string | null;
  isOnline: boolean;
  hasUnsavedWork: boolean;
}

export interface WriteQueueOptions {
  debounceMs?: number;
  savedHideMs?: number;
  waitForServerSync?: () => Promise<void>;
  getIsOnline?: () => boolean;
}

/**
 * Centralized write queue and status coordinator for all attendance & student mutations.
 * - Coalesces rapid consecutive clicks via per-key debounce (default 650ms).
 * - Only transitions to 'saved' ("kaydedildi") after server confirmation (waitForPendingWrites + online + no pending snapshot writes).
 * - Exposes flushAll(), retryFailed(), discardFailed(), and subscribe() for UI & navigation guards.
 */
export class WriteQueueController {
  private debounceMs: number;
  private savedHideMs: number;
  private waitForServerSync: () => Promise<void>;
  private getIsOnline: () => boolean;

  private debouncedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debouncedTasks = new Map<string, QueuedWriteTask>();
  private inFlightTasks = new Map<string, Promise<void>>();
  private failedTasks = new Map<string, QueuedWriteTask>();

  private phase: SaveStatusPhase = 'hidden';
  private hasInteracted = false;
  private lastErrorMessage: string | null = null;
  private savedHideTimer: ReturnType<typeof setTimeout> | null = null;
  private hasSnapshotPendingWrites = false;
  private listeners = new Set<(snap: WriteQueueSnapshot) => void>();
  private idleResolvers: Array<() => void> = [];

  constructor(options: WriteQueueOptions = {}) {
    this.debounceMs = options.debounceMs ?? 650;
    this.savedHideMs = options.savedHideMs ?? 3000;
    this.waitForServerSync =
      options.waitForServerSync ?? (() => Promise.resolve());
    this.getIsOnline =
      options.getIsOnline ??
      (() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  }

  public getSnapshot(): WriteQueueSnapshot {
    const isOnline = this.getIsOnline();
    const pendingCount = this.debouncedTasks.size;
    const inFlightCount = this.inFlightTasks.size;
    const failedCount = this.failedTasks.size;
    const hasUnsavedWork =
      pendingCount > 0 ||
      inFlightCount > 0 ||
      failedCount > 0 ||
      this.hasSnapshotPendingWrites ||
      this.phase === 'saving' ||
      this.phase === 'offline' ||
      this.phase === 'syncing_startup';

    return {
      phase: this.phase,
      hasInteracted: this.hasInteracted,
      pendingCount,
      inFlightCount,
      failedCount,
      lastErrorMessage: this.lastErrorMessage,
      isOnline,
      hasUnsavedWork,
    };
  }

  public subscribe(listener: (snap: WriteQueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
    if (
      snap.pendingCount === 0 &&
      snap.inFlightCount === 0 &&
      snap.failedCount === 0 &&
      snap.phase !== 'saving'
    ) {
      const resolvers = this.idleResolvers.splice(0, this.idleResolvers.length);
      for (const r of resolvers) r();
    }
  }

  private clearSavedHideTimer(): void {
    if (this.savedHideTimer !== null) {
      clearTimeout(this.savedHideTimer);
      this.savedHideTimer = null;
    }
  }

  private scheduleSavedAutoHide(): void {
    this.clearSavedHideTimer();
    if (this.savedHideMs <= 0) return;
    this.savedHideTimer = setTimeout(() => {
      this.savedHideTimer = null;
      if (
        this.phase === 'saved' &&
        this.debouncedTasks.size === 0 &&
        this.inFlightTasks.size === 0 &&
        this.failedTasks.size === 0
      ) {
        this.phase = 'hidden';
        this.emit();
      }
    }, this.savedHideMs);
  }

  /**
   * Enqueues a debounced write task by key. Rapid consecutive calls with the same key
   * cancel the previous timer and replace the task so only the final state is written.
   */
  public enqueueDebounced(task: QueuedWriteTask, customDelayMs?: number): void {
    this.hasInteracted = true;
    this.clearSavedHideTimer();
    this.failedTasks.delete(task.key);
    this.lastErrorMessage = null;

    const existingTimer = this.debouncedTimers.get(task.key);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    this.debouncedTasks.set(task.key, task);
    this.phase = this.getIsOnline() ? 'saving' : 'offline';
    this.emit();

    const delay = customDelayMs ?? this.debounceMs;
    const timer = setTimeout(() => {
      this.debouncedTimers.delete(task.key);
      const latestTask = this.debouncedTasks.get(task.key);
      if (latestTask) {
        this.debouncedTasks.delete(task.key);
        void this.runTask(latestTask);
      }
    }, delay);

    this.debouncedTimers.set(task.key, timer);
  }

  /**
   * Enqueues an immediate write task (no debounce delay), routed through the same status indicator.
   */
  public enqueueImmediate(task: QueuedWriteTask): Promise<void> {
    this.hasInteracted = true;
    this.clearSavedHideTimer();
    const existingTimer = this.debouncedTimers.get(task.key);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      this.debouncedTimers.delete(task.key);
    }
    this.debouncedTasks.delete(task.key);
    this.failedTasks.delete(task.key);
    this.lastErrorMessage = null;

    this.phase = this.getIsOnline() ? 'saving' : 'offline';
    this.emit();
    return this.runTask(task);
  }

  /**
   * Immediately flushes all pending debounced writes without waiting for their timers.
   * Called on visibilitychange, pagehide, beforeunload, and in-app navigation.
   */
  public flushAll(): Promise<void> {
    for (const [key, timer] of this.debouncedTimers.entries()) {
      clearTimeout(timer);
      this.debouncedTimers.delete(key);
    }
    const tasksToRun = Array.from(this.debouncedTasks.values());
    this.debouncedTasks.clear();

    const promises: Promise<void>[] = tasksToRun.map(t => this.runTask(t));
    for (const inFlight of this.inFlightTasks.values()) {
      promises.push(inFlight);
    }

    if (promises.length === 0) {
      return Promise.resolve();
    }
    return Promise.allSettled(promises).then(() => undefined);
  }

  private async runTask(task: QueuedWriteTask): Promise<void> {
    const isOnlineAtStart = this.getIsOnline();
    if (!isOnlineAtStart) {
      this.phase = 'offline';
      this.emit();
    } else if (this.phase !== 'syncing_startup') {
      this.phase = 'saving';
      this.emit();
    }

    const runPromise = (async () => {
      try {
        await task.execute();
        if (!this.getIsOnline()) {
          // Written to local offline cache only; wait until online to confirm on server
          this.hasSnapshotPendingWrites = true;
          this.phase = 'offline';
          this.emit();
          return;
        }
        await this.waitForServerSync();
        if (!this.getIsOnline()) {
          this.hasSnapshotPendingWrites = true;
          this.phase = 'offline';
          this.emit();
          return;
        }
        this.failedTasks.delete(task.key);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[WriteQueue] Yazma hatası (${task.key}):`, error);
        if (!this.getIsOnline()) {
          this.phase = 'offline';
        } else {
          this.failedTasks.set(task.key, task);
          this.lastErrorMessage = msg;
          this.phase = 'error';
        }
      } finally {
        this.inFlightTasks.delete(task.key);
        this.recomputePostTaskPhase();
        this.emit();
      }
    })();

    this.inFlightTasks.set(task.key, runPromise);
    this.emit();
    return runPromise;
  }

  private recomputePostTaskPhase(): void {
    if (this.failedTasks.size > 0) {
      this.phase = 'error';
      return;
    }
    if (!this.getIsOnline()) {
      if (
        this.debouncedTasks.size > 0 ||
        this.inFlightTasks.size > 0 ||
        this.hasSnapshotPendingWrites ||
        this.phase === 'offline' ||
        this.phase === 'saving'
      ) {
        this.phase = 'offline';
      }
      return;
    }
    if (this.debouncedTasks.size > 0 || this.inFlightTasks.size > 0) {
      if (this.phase !== 'syncing_startup') {
        this.phase = 'saving';
      }
      return;
    }
    if (this.hasSnapshotPendingWrites) {
      this.phase = this.hasInteracted ? 'saving' : 'syncing_startup';
      return;
    }
    if (this.hasInteracted || this.phase === 'syncing_startup') {
      this.phase = 'saved';
      this.scheduleSavedAutoHide();
    }
  }

  /**
   * Called by Firestore snapshot metadata listeners (`snapshot.metadata.hasPendingWrites`).
   * Ensures "kaydedildi" is ONLY shown once `hasPendingWrites === false` on the server.
   */
  public notifySnapshotPendingState(
    hasPendingWrites: boolean,
    isInitialStartupCheck = false
  ): void {
    this.hasSnapshotPendingWrites = hasPendingWrites;
    if (hasPendingWrites) {
      this.clearSavedHideTimer();
      if (!this.getIsOnline()) {
        this.phase = 'offline';
      } else if (isInitialStartupCheck && !this.hasInteracted) {
        this.phase = 'syncing_startup';
      } else if (this.hasInteracted) {
        this.phase = 'saving';
      }
      this.emit();
      return;
    }

    // hasPendingWrites became false!
    if (
      this.phase === 'syncing_startup' ||
      (this.phase === 'offline' && this.getIsOnline()) ||
      (this.phase === 'saving' &&
        this.debouncedTasks.size === 0 &&
        this.inFlightTasks.size === 0 &&
        this.failedTasks.size === 0)
    ) {
      if (this.getIsOnline()) {
        this.phase = 'saved';
        this.scheduleSavedAutoHide();
      }
      this.emit();
    }
  }

  /**
   * Called when browser online/offline status changes.
   */
  public handleConnectivityChange(isOnline: boolean): void {
    if (!isOnline) {
      if (
        this.debouncedTasks.size > 0 ||
        this.inFlightTasks.size > 0 ||
        this.hasSnapshotPendingWrites ||
        this.phase === 'saving' ||
        this.phase === 'syncing_startup'
      ) {
        this.clearSavedHideTimer();
        this.phase = 'offline';
        this.emit();
      }
      return;
    }

    // Reconnected to the internet!
    if (
      this.phase === 'offline' ||
      this.hasSnapshotPendingWrites ||
      this.debouncedTasks.size > 0 ||
      this.inFlightTasks.size > 0
    ) {
      this.phase = this.hasInteracted ? 'saving' : 'syncing_startup';
      this.emit();
      void this.flushAll().then(async () => {
        try {
          await this.waitForServerSync();
          if (
            this.getIsOnline() &&
            this.failedTasks.size === 0 &&
            this.debouncedTasks.size === 0 &&
            this.inFlightTasks.size === 0
          ) {
            this.hasSnapshotPendingWrites = false;
            this.phase = 'saved';
            this.scheduleSavedAutoHide();
            this.emit();
          }
        } catch (err) {
          console.error('[WriteQueue] Bağlantı sonrası eşzamanlama hatası:', err);
          this.phase = 'error';
          this.emit();
        }
      });
    }
  }

  /**
   * Retries all failed write tasks.
   */
  public async retryFailed(): Promise<void> {
    const failedList = Array.from(this.failedTasks.values());
    if (failedList.length === 0) {
      await this.flushAll();
      return;
    }
    this.failedTasks.clear();
    this.lastErrorMessage = null;
    this.phase = this.getIsOnline() ? 'saving' : 'offline';
    this.emit();
    await Promise.allSettled(failedList.map(task => this.runTask(task)));
  }

  /**
   * Discards failed write tasks and invokes their rollback callbacks to restore optimistic state.
   */
  public discardFailedAndRollback(): void {
    for (const task of this.failedTasks.values()) {
      if (task.rollback) {
        try {
          task.rollback();
        } catch (err) {
          console.error('[WriteQueue] Rollback hatası:', err);
        }
      }
    }
    this.failedTasks.clear();
    this.lastErrorMessage = null;
    this.phase = 'hidden';
    this.emit();
  }
}
