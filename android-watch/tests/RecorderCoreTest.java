package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

/** Run with javac/java; tests real files, fsync, atomic rename, corruption and sample continuity. */
public final class RecorderCoreTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        continuousChunks(); crashRecovery(); sealBeforeManifestRecovery(); knownLostCapture();
        corruptManifestPreserved(); corruptChunkDetected(); invalidPartialPreserved(); storageReserve(); queueOverflow();
        nanosecondPrecisionAndSealedPrefix(); emptyHeaderRecovery(); interruptedInitialization();
        System.out.println("Recorder core: " + checks + " assertions passed");
    }

    private static void continuousChunks() throws Exception {
        File root = Files.createTempDirectory("sayagain-continuity-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); store.create(123456, 987654);
            long total = SessionStore.CHUNK_SAMPLES * 2 + 1277, position = 0;
            int[] packetSizes = {800, 17, 4096, 391, 1600}; int packet = 0;
            while (position < total) {
                int count = (int) Math.min(packetSizes[packet++ % packetSizes.length], total - position);
                byte[] pcm = samples(position, count); position += count; store.writePcm(pcm, pcm.length, position);
                if (packet % 40 == 0) store.checkpoint(position);
            }
            SessionStore.Snapshot result = store.finish(total, "completed", null);
            check(result.chunks.size() == 3, "three exact chunks"); check(result.durableSamples == total, "all samples durable");
            check(result.samplesCaptured == total && result.gaps.isEmpty(), "no lost samples");
            long read = 0;
            for (SessionStore.Chunk chunk : result.chunks) {
                check(chunk.sampleStart == read, "chunk sample start is contiguous");
                check(chunk.byteSize == chunk.sampleCount * 2 + 44, "WAV byte length matches samples");
                File file = new File(result.directory, chunk.file);
                check(WavFile.sha256(file).equals(chunk.sha256), "sealed hash matches disk");
                byte[] wav = Files.readAllBytes(file.toPath());
                for (int offset = 44; offset < wav.length; offset += 2) {
                    int low = wav[offset] & 255, high = wav[offset + 1] & 255;
                    if ((low | high << 8) != sampleValue(read++)) throw new AssertionError("Missing/duplicated PCM sample at " + (read - 1));
                }
            }
            check(read == total, "decoded bytes cover every original sample exactly once");
            SessionStore.Snapshot reopened = new SessionStore(root, "test-device").readSession(result.directory);
            check(reopened.durableSamples == total && reopened.chunks.size() == 3, "manifest round trip");
            check(new SessionStore(root, "test-device").recoverInterruptedSessions().isEmpty(), "completed sessions require no repair");
        } finally { delete(root); }
    }

    private static void crashRecovery() throws Exception {
        File root = Files.createTempDirectory("sayagain-recovery-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); SessionStore.Snapshot created = store.create(12, 34);
            // Reproduce process death after the last manifest checkpoint: header has 300 samples,
            // file physically has 700 complete samples and one torn byte from the next write.
            WavFile wav = new WavFile(created.directory, "000000.wav", 16000, 1);
            wav.append(samples(0, 300), 0, 600); wav.checkpoint(); wav.append(samples(300, 400), 0, 800); wav.closePartial();
            File partial = new File(created.directory, "000000.wav.partial");
            try (RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
                output.seek(4); output.write(new byte[] {(byte) 0x7c, 2, 0, 0}); // stale RIFF size: 636
                output.seek(40); output.write(new byte[] {(byte) 0x58, 2, 0, 0}); // stale data size: 600
                output.seek(output.length()); output.write(0x44); output.getFD().sync();
            }
            List<SessionStore.Snapshot> list = new SessionStore(root, "test-device").recoverInterruptedSessions();
            check(list.size() == 1, "one interrupted session recovered"); SessionStore.Snapshot result = list.get(0);
            check("interrupted".equals(result.status), "recovery records interrupted status");
            check(result.chunks.size() == 1 && result.chunks.get(0).recovered, "recovered chunk labelled");
            check(result.durableSamples == 700 && result.samplesCaptured == 700, "complete samples retained, torn byte removed");
            check(!partial.exists() && new File(created.directory, "000000.wav").length() == 1444, "partial sealed with repaired header");
            check(result.gaps.size() == 1 && result.gaps.get(0).sampleCount == 0, "unmeasured interruption explicitly reported");
            check(new SessionStore(root, "test-device").recoverInterruptedSessions().isEmpty(), "recovery is idempotent");
        } finally { delete(root); }
    }

    private static void sealBeforeManifestRecovery() throws Exception {
        File root = Files.createTempDirectory("sayagain-seal-race-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); SessionStore.Snapshot created = store.create(1, 2);
            WavFile wav = new WavFile(created.directory, "000000.wav", 16000, 1);
            wav.append(samples(0, 1000), 0, 2000); wav.seal();
            SessionStore.Snapshot result = new SessionStore(root, "test-device").recoverInterruptedSessions().get(0);
            check(result.chunks.size() == 1 && result.chunks.get(0).sampleCount == 1000 && result.chunks.get(0).recovered, "sealed-before-manifest crash recovered");
        } finally { delete(root); }
    }

    private static void knownLostCapture() throws Exception {
        File root = Files.createTempDirectory("sayagain-lost-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); store.create(1, 2);
            byte[] bytes = samples(0, 800); store.writePcm(bytes, bytes.length, 1600);
            SessionStore.Snapshot result = store.finish(1600, "error", "Capture queue overflow");
            check(result.durableSamples == 800 && result.samplesCaptured == 1600, "captured versus durable distinguished");
            check(result.gaps.size() == 1 && result.gaps.get(0).sampleStart == 800 && result.gaps.get(0).sampleCount == 800, "explicit dropped tail range");
            check("error".equals(result.status), "lost samples cannot report successful completion");
        } finally { delete(root); }
    }

    private static void corruptManifestPreserved() throws Exception {
        File root = Files.createTempDirectory("sayagain-bad-json-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); SessionStore.Snapshot created = store.create(1, 2);
            File manifest = new File(created.directory, "manifest.json"); byte[] invalid = "{broken manifest".getBytes(StandardCharsets.UTF_8);
            Files.write(manifest.toPath(), invalid);
            expectFailure(() -> new SessionStore(root, "test-device").recoverInterruptedSessions(), "corrupt manifest blocks recording");
            check(java.util.Arrays.equals(invalid, Files.readAllBytes(manifest.toPath())), "corrupt manifest never overwritten");
        } finally { delete(root); }
    }

    private static void corruptChunkDetected() throws Exception {
        File root = Files.createTempDirectory("sayagain-bad-hash-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); store.create(1, 2);
            byte[] bytes = samples(0, 100); store.writePcm(bytes, bytes.length, 100);
            SessionStore.Snapshot result = store.finish(100, "completed", null);
            File audio = new File(result.directory, "000000.wav");
            try (RandomAccessFile input = new RandomAccessFile(audio, "rw")) { input.seek(50); input.write(123); }
            expectFailure(() -> new SessionStore(root, "test-device").recoverInterruptedSessions(), "sealed audio tampering detected");
            check(audio.exists(), "corrupt audio kept for repair");
        } finally { delete(root); }
    }

    private static void invalidPartialPreserved() throws Exception {
        File root = Files.createTempDirectory("sayagain-bad-partial-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); SessionStore.Snapshot created = store.create(1, 2);
            File partial = new File(created.directory, "000000.wav.partial"); Files.write(partial.toPath(), new byte[] {1, 2, 3});
            expectFailure(() -> new SessionStore(root, "test-device").recoverInterruptedSessions(), "truncated header rejected");
            check(partial.exists() && partial.length() == 3, "invalid partial left untouched");
        } finally { delete(root); }
    }

    private static void queueOverflow() throws Exception {
        CaptureQueue queue = new CaptureQueue(1); byte[] pcm = samples(0, 10); queue.offer(pcm, pcm.length, 0); pcm[0] = 99;
        expectFailure(() -> queue.offer(samples(10, 10), 20, 10), "full queue is a failure");
        check(queue.getFailure() != null && queue.getFailure().getMessage().contains("sample 10"), "overflow identifies lost sample position");
        CaptureQueue.Packet first = queue.poll(1); check(first.sampleStart == 0 && first.pcm[0] == 0, "accepted packet retained independently of read buffer");
        expectFailure(() -> queue.offer(samples(20, 10), 20, 20), "overflow permanently stops accepting packets");
        queue.complete(); check(queue.isDrained(), "accepted packets can drain after fatal overflow");
    }

    private static void storageReserve() throws Exception {
        File root = Files.createTempDirectory("sayagain-low-space-").toFile();
        try {
            File constrained = new File(root.getAbsolutePath()) {
                @Override public long getUsableSpace() { return 1024; }
            };
            SessionStore store = new SessionStore(constrained, "test-device");
            expectFailure(() -> store.create(1, 2), "low space blocks recording before opening an audio file");
            check(root.listFiles().length == 0, "reserve failure leaves no fake session");
        } finally { delete(root); }
    }

    private static void nanosecondPrecisionAndSealedPrefix() throws Exception {
        File root = Files.createTempDirectory("sayagain-nanoseconds-").toFile();
        try {
            long ns = 1234567890123456789L;
            SessionStore store = new SessionStore(root, "test-device"); store.create(1, ns);
            byte[] bytes = samples(0, 1000); store.writePcm(bytes, bytes.length, 1000);
            SessionStore.Snapshot checkpoint = store.checkpoint(1000);
            check(checkpoint.durableSamples == 1000 && checkpoint.sealedSamples == 0 && checkpoint.chunks.isEmpty(), "checkpoint distinguishes synced partial from transferable sealed prefix");
            check(checkpoint.toJson().contains("\"started_elapsed_ns\":\"1234567890123456789\""), "nanosecond timestamp serialized as exact decimal string");
            check(new SessionStore(root, "test-device").readSession(checkpoint.directory).startedElapsedNs == ns, "decimal timestamp round trips exactly");
            File manifest = new File(checkpoint.directory, "manifest.json");
            String legacy = checkpoint.toJson().replace("\"started_elapsed_ns\":\"1234567890123456789\"", "\"started_elapsed_ns\":1234567890123456789");
            Files.write(manifest.toPath(), legacy.getBytes(StandardCharsets.UTF_8));
            check(new SessionStore(root, "test-device").readSession(checkpoint.directory).startedElapsedNs == ns, "legacy integer nanoseconds remain readable");
            SessionStore.Snapshot finished = store.finish(1000, "completed", null);
            check(finished.sealedSamples == finished.durableSamples && finished.sealedSamples == 1000, "completed session has all durable samples sealed");
        } finally { delete(root); }
    }

    private static void emptyHeaderRecovery() throws Exception {
        File root = Files.createTempDirectory("sayagain-empty-header-").toFile();
        try {
            SessionStore store = new SessionStore(root, "test-device"); SessionStore.Snapshot created = store.create(1, 2);
            WavFile wav = new WavFile(created.directory, "000000.wav", 16000, 1); wav.closePartial();
            SessionStore.Snapshot recovered = new SessionStore(root, "test-device").recoverInterruptedSessions().get(0);
            check(recovered.chunks.isEmpty() && recovered.sealedSamples == 0 && recovered.durableSamples == 0, "header-only crash has no advertised zero-length audio chunk");
            File diagnostic = new File(created.directory, "000000.wav.partial.empty");
            check(diagnostic.exists() && diagnostic.length() == 44, "empty partial retained as diagnostic");
            check("interrupted".equals(recovered.status) && recovered.gaps.get(0).sampleCount == 0, "empty recording still marks unmeasured interruption");
            check(new SessionStore(root, "test-device").recoverInterruptedSessions().isEmpty(), "empty header recovery is idempotent");
            check(new SessionStore(root, "test-device").create(3, 4).directory.isDirectory(), "empty recovered session does not block future recording");
        } finally { delete(root); }
    }

    private static void interruptedInitialization() throws Exception {
        File root = Files.createTempDirectory("sayagain-create-crash-").toFile();
        try {
            String abandonedId = "00000000-0000-0000-0000-000000000001";
            File staging = new File(root, ".creating-" + abandonedId); check(staging.mkdir(), "create staging fixture");
            File diagnostic = new File(staging, "manifest.json.tmp"); Files.write(diagnostic.toPath(), new byte[] {1, 2, 3});
            String legacyId = "00000000-0000-0000-0000-000000000002";
            File legacy = new File(root, legacyId); check(legacy.mkdir(), "create legacy empty fixture");
            SessionStore store = new SessionStore(root, "test-device");
            check(store.recoverInterruptedSessions().isEmpty(), "interrupted initialization does not block recovery");
            check(diagnostic.exists() && diagnostic.length() == 3, "staging diagnostic preserved");
            check(!legacy.exists() && new File(root, ".empty-session-" + legacyId).isDirectory(), "legacy empty UUID directory quarantined without deletion");
            SessionStore.Snapshot created = store.create(1, 2);
            check(created.directory.getName().equals(created.sessionId) && new File(created.directory, "manifest.json").isFile(), "committed session always has its manifest");
            check(!new File(root, ".creating-" + created.sessionId).exists(), "successful initialization has no leftover staging directory");
            store.finish(0, "completed", null);
            check(new SessionStore(root, "test-device").recoverInterruptedSessions().isEmpty(), "initialization recovery remains idempotent");
            File withoutManifest = new File(root, "00000000-0000-0000-0000-000000000003"); check(withoutManifest.mkdir(), "create missing-manifest audio fixture");
            Files.write(new File(withoutManifest, "000000.wav.partial").toPath(), new byte[] {1, 2});
            expectFailure(() -> new SessionStore(root, "test-device").recoverInterruptedSessions(), "missing manifest with audio still blocks recording for repair");
            check(new File(withoutManifest, "000000.wav.partial").length() == 2, "missing-manifest audio never deleted or hidden");
        } finally { delete(root); }
    }

    private static int sampleValue(long index) { return (int) ((index * 31 + index / 65536) & 65535); }
    private static byte[] samples(long start, int count) {
        byte[] bytes = new byte[count * 2];
        for (int i = 0; i < count; i++) { int v = sampleValue(start + i); bytes[i * 2] = (byte) v; bytes[i * 2 + 1] = (byte) (v >>> 8); }
        return bytes;
    }
    private interface Checked { void run() throws Exception; }
    private static void expectFailure(Checked task, String name) throws Exception {
        try { task.run(); } catch (IOException expected) { check(true, name); return; } throw new AssertionError(name);
    }
    private static void check(boolean condition, String name) { if (!condition) throw new AssertionError(name); checks++; }
    private static void delete(File root) throws IOException {
        File temporaryRoot = new File(System.getProperty("java.io.tmpdir")).getCanonicalFile();
        if (!root.getCanonicalPath().startsWith(temporaryRoot.getPath() + File.separator))
            throw new IOException("Test cleanup outside its temporary root");
        File[] files = root.listFiles(); if (files != null) for (File child : files) { if (child.isDirectory()) delete(child); else Files.delete(child.toPath()); }
        Files.delete(root.toPath());
    }
}
