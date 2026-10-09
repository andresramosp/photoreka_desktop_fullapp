// Coalesces single-item calls into one request per `maxSize` items or per
// `delayMs`, whichever comes first. Each caller still gets its own promise.

interface Pending<TIn, TOut> {
  item: TIn;
  resolve: (value: TOut) => void;
  reject: (error: unknown) => void;
}

export function createBatcher<TIn, TOut>(
  run: (items: TIn[]) => Promise<TOut[]>,
  { maxSize, delayMs }: { maxSize: number; delayMs: number },
): (item: TIn) => Promise<TOut> {
  let queue: Pending<TIn, TOut>[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = queue;
    queue = [];
    if (batch.length === 0) return;
    try {
      const results = await run(batch.map((p) => p.item));
      batch.forEach((p, i) => p.resolve(results[i]));
    } catch (error) {
      batch.forEach((p) => p.reject(error));
    }
  };

  return (item: TIn) =>
    new Promise<TOut>((resolve, reject) => {
      queue.push({ item, resolve, reject });
      if (queue.length >= maxSize) void flush();
      else timer ??= setTimeout(flush, delayMs);
    });
}
