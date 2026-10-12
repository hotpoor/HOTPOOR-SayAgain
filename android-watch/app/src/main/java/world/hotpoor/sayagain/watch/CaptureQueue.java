package world.hotpoor.sayagain.watch;

import java.io.IOException;
import java.util.Arrays;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/** A full queue is an explicit fatal recording error, never a drop-oldest policy. */
public final class CaptureQueue {
    public static final class Packet {
        public final byte[] pcm;
        public final long sampleStart;
        Packet(byte[] pcm, long sampleStart) { this.pcm = pcm; this.sampleStart = sampleStart; }
    }
    private final ArrayBlockingQueue<Packet> queue;
    private volatile boolean captureComplete;
    private volatile IOException failure;
    public CaptureQueue(int capacity) { queue = new ArrayBlockingQueue<>(capacity); }
    public void offer(byte[] pcm, int bytes, long sampleStart) throws IOException {
        if (captureComplete || failure != null) throw new IOException("Capture queue is closed", failure);
        if (bytes <= 0 || bytes > pcm.length || bytes % 2 != 0 || sampleStart < 0) throw new IOException("Invalid PCM packet");
        if (!queue.offer(new Packet(Arrays.copyOf(pcm, bytes), sampleStart))) {
            failure = new IOException("Capture queue overflow at sample " + sampleStart + ": " + (bytes / 2) + " samples not queued");
            throw failure;
        }
    }
    public Packet poll(long timeoutMs) throws InterruptedException { return queue.poll(timeoutMs, TimeUnit.MILLISECONDS); }
    public void complete() { captureComplete = true; }
    public boolean isDrained() { return captureComplete && queue.isEmpty(); }
    public IOException getFailure() { return failure; }
}
