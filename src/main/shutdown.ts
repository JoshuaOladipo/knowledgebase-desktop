interface WatcherShutdown {
  shutdown(): Promise<void>
}

interface CloseableService {
  close(): Promise<void>
}

export interface ApplicationServices {
  watcher?: WatcherShutdown
  ingestion?: CloseableService
  database?: CloseableService
}

/** Closes every main-process service in dependency order, even if an earlier close step fails. */
export async function shutdownApplicationServices(services: ApplicationServices): Promise<void> {
  const failures: unknown[] = []
  const close = async (operation: (() => Promise<void>) | undefined): Promise<void> => {
    if (!operation) return
    try {
      await operation()
    } catch (error) {
      failures.push(error)
    }
  }

  await close(services.watcher && (() => services.watcher!.shutdown()))
  await close(services.ingestion && (() => services.ingestion!.close()))
  await close(services.database && (() => services.database!.close()))

  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more application services could not close cleanly.')
  }
}
