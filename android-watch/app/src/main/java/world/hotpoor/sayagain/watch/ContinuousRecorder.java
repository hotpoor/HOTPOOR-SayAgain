package world.hotpoor.sayagain.watch;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;

import java.io.File;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/** One AudioRecord acquisition spans all WAV chunks. Disk operations never run on the microphone thread. */
public final class ContinuousRecorder {
    public interface Listener {
        void onSnapshot(SessionStore.Snapshot snapshot);
        void onFinished(SessionStore.Snapshot snapshot);
    }

    private static final int READ_BYTES = 1600; // 50 ms at 16 kHz mono PCM16.
    private static final int QUEUE_PACKETS = 128; // Bounded 6.4 seconds; overflow is fatal and visible.
    private final Context context;
    private final Listener listener;
    private final Object audioLock = new Object();
    private final AtomicBoolean stopRequested = new AtomicBoolean();
    private final AtomicLong samplesCaptured = new AtomicLong();
    private final AtomicReference<String> failure = new AtomicReference<>();
    private volatile SessionStore.Snapshot snapshot;
    private volatile boolean running;
    private AudioRecord audio;
    private boolean audioStopped;
    private CountDownLatch captureReleased;
    private CaptureQueue queue;
    private SessionStore store;

    public ContinuousRecorder(Context context, Listener listener) {
        this.context = context.getApplicationContext(); this.listener = listener;
    }

    public synchronized void start() throws IOException {
        if (running) throw new IllegalStateException("Recorder is already running");
        snapshot = null;
        File files = context.getExternalFilesDir(null);
        if (files == null) throw new IOException("App recording storage is unavailable");
        SharedPreferences preferences = context.getSharedPreferences("watch_recorder", Context.MODE_PRIVATE);
        String deviceId = preferences.getString("device_id", null);
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString();
            if (!preferences.edit().putString("device_id", deviceId).commit()) throw new IOException("Could not save installation device id");
        }
        store = new SessionStore(new File(files, "sessions"), deviceId);
        store.recoverInterruptedSessions();
        int minimum = AudioRecord.getMinBufferSize(SessionStore.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IOException("Microphone does not support 16 kHz mono PCM16 (" + minimum + ")");
        AudioRecord candidate = new AudioRecord(MediaRecorder.AudioSource.MIC, SessionStore.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, READ_BYTES * 8));
        if (candidate.getState() != AudioRecord.STATE_INITIALIZED) {
            candidate.release(); throw new IOException("Microphone could not be initialized");
        }
        try {
            snapshot = store.create(System.currentTimeMillis(), SystemClock.elapsedRealtimeNanos());
            candidate.startRecording();
            if (candidate.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IOException("Microphone did not enter recording state");
        } catch (RuntimeException | IOException e) {
            candidate.release();
            if (snapshot != null) snapshot = store.preserveFailure(0, "Microphone start failed: " + e.getMessage());
            throw new IOException("Microphone start failed: " + e.getMessage(), e);
        }
        synchronized (audioLock) { audio = candidate; audioStopped = false; }
        stopRequested.set(false); samplesCaptured.set(0); failure.set(null);
        queue = new CaptureQueue(QUEUE_PACKETS); captureReleased = new CountDownLatch(1); running = true;
        publish(snapshot, false);
        new Thread(this::writeLoop, "sayagain-watch-writer").start();
        new Thread(this::captureLoop, "sayagain-watch-microphone").start();
    }

    /** Asynchronous: onFinished signals that AudioRecord is released and the final manifest is saved. */
    public void stop() { stopRequested.set(true); stopMicrophone(); }
    public boolean isRunning() { return running; }
    public SessionStore.Snapshot getSnapshot() { return snapshot; }

    private void captureLoop() {
        byte[] buffer = new byte[READ_BYTES];
        try {
            while (!stopRequested.get()) {
                AudioRecord source;
                synchronized (audioLock) { source = audio; }
                int bytes = source.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (bytes < 0) {
                    if (stopRequested.get()) break;
                    if (bytes == AudioRecord.ERROR_DEAD_OBJECT) throw new IOException("Microphone ERROR_DEAD_OBJECT: audio device was disconnected or reset");
                    throw new IOException("Microphone read failed (" + bytes + ")");
                }
                if (bytes == 0) {
                    if (stopRequested.get()) break;
                    throw new IOException("Microphone returned no samples while recording");
                }
                if (bytes % 2 != 0) throw new IOException("Microphone returned an incomplete PCM16 sample");
                long start = samplesCaptured.getAndAdd(bytes / 2);
                queue.offer(buffer, bytes, start);
            }
        } catch (IOException | RuntimeException e) { fail(e); }
        finally {
            stopMicrophone();
            synchronized (audioLock) {
                if (audio != null) { audio.release(); audio = null; }
            }
            queue.complete(); captureReleased.countDown();
        }
    }

    private void writeLoop() {
        long checkpointAt = SystemClock.elapsedRealtime();
        try {
            while (!queue.isDrained()) {
                CaptureQueue.Packet packet = queue.poll(100);
                if (packet != null) {
                    if (packet.sampleStart != store.writtenSamples()) throw new IOException("Capture sample sequence is discontinuous at " + packet.sampleStart);
                    store.writePcm(packet.pcm, packet.pcm.length, samplesCaptured.get());
                }
                long now = SystemClock.elapsedRealtime();
                if (now - checkpointAt >= 1000) {
                    snapshot = store.checkpoint(samplesCaptured.get()); publish(snapshot, false); checkpointAt = now;
                }
            }
            captureReleased.await();
            String error = failure.get();
            snapshot = store.finish(samplesCaptured.get(), error == null ? "completed" : "error", error);
        } catch (IOException | RuntimeException | InterruptedException e) {
            fail(e);
            // stop() unblocks AudioRecord.read. Finish must wait for the last captured count and release.
            boolean interrupted = false;
            while (true) {
                try { captureReleased.await(); break; } catch (InterruptedException again) { interrupted = true; }
            }
            snapshot = store.preserveFailure(samplesCaptured.get(), failure.get());
            if (interrupted || e instanceof InterruptedException) Thread.currentThread().interrupt();
        } finally {
            running = false;
            publish(snapshot, true);
        }
    }

    private void fail(Exception error) {
        String message = error.getMessage();
        failure.compareAndSet(null, message == null ? error.getClass().getSimpleName() : message);
        stopRequested.set(true); stopMicrophone();
    }

    private void stopMicrophone() {
        synchronized (audioLock) {
            if (audio != null && !audioStopped) {
                audioStopped = true;
                try { audio.stop(); } catch (IllegalStateException ignored) { /* The read result/failure records a lost device. */ }
            }
        }
    }

    private void publish(SessionStore.Snapshot value, boolean finished) {
        if (listener == null || value == null) return;
        try { if (finished) listener.onFinished(value); else listener.onSnapshot(value); }
        catch (RuntimeException ignored) { /* UI listeners cannot stop sample acquisition or damage recovery data. */ }
    }
}
