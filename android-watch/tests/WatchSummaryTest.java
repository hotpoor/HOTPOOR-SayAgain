package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Real metadata/file tests for totals and durable STORED acknowledgement matching. */
public final class WatchSummaryTest {
    private static final String DEVICE = UUID.randomUUID().toString();
    private static int checks;
    public static void main(String[] args) throws Exception {
        allLocalSessionsAndReceipts(); mixedRatesAndEmptySessions(); liveSnapshotReplacement(); receiptIdentityMatching();
        corruptReceiptsAreUnknown(); corruptSessionsAreUnknown(); atomicReceiptsAndReadFailure(); incompleteFilesAreNotUploadable();
        System.out.println("Watch local summary: " + checks + " assertions passed");
    }
    private static final class Fixture implements AutoCloseable {
        final File root = Files.createTempDirectory("sayagain-summary-").toFile();
        final File sessions = new File(root, "sessions"), receipts = new File(root, "sync-receipts.json");
        Fixture() throws IOException { if (!sessions.mkdir()) throw new IOException("Cannot create test storage"); }
        @Override public void close() throws IOException { delete(root); }
    }
    private static final class Saved {
        final File directory; final Map<String, Object> manifest; final List<SyncReceipts.Receipt> acknowledgements;
        Saved(File directory, Map<String, Object> manifest, List<SyncReceipts.Receipt> acknowledgements) {
            this.directory = directory; this.manifest = manifest; this.acknowledgements = acknowledgements;
        }
        void save() throws IOException { writeJson(new File(directory, "manifest.json"), manifest); }
    }
    private static Saved saveSession(Fixture f, int rate, int... samples) throws Exception {
        String session = UUID.randomUUID().toString(); File directory = new File(f.sessions, session);
        if (!directory.mkdir()) throw new IOException("Cannot create test session");
        Map<String, Object> manifest = new LinkedHashMap<>(); manifest.put("schema", SessionStore.SCHEMA);
        manifest.put("device_id", DEVICE); manifest.put("session_id", session); manifest.put("sample_rate", rate);
        manifest.put("channels", 1); manifest.put("bits_per_sample", 16); manifest.put("status", "completed");
        List<Object> chunks = new ArrayList<>(); List<SyncReceipts.Receipt> receipts = new ArrayList<>(); long position = 0;
        for (int index = 0; index < samples.length; index++) {
            String filename = String.format(java.util.Locale.US, "%06d.wav", index);
            WavFile wav = new WavFile(directory, filename, rate, 1); byte[] pcm = new byte[samples[index] * 2];
            wav.append(pcm, 0, pcm.length); File audio = wav.seal(); String hash = WavFile.sha256(audio), id = session + "_" + index;
            Map<String, Object> chunk = new LinkedHashMap<>(); chunk.put("id", id); chunk.put("index", index);
            chunk.put("file", filename); chunk.put("sample_start", position); chunk.put("sample_count", samples[index]);
            chunk.put("byte_size", audio.length()); chunk.put("sha256", hash); chunk.put("status", "sealed"); chunk.put("recovered", false);
            chunks.add(chunk); receipts.add(new SyncReceipts.Receipt(DEVICE, session, id, hash, 123456789L, "desktop-client")); position += samples[index];
        }
        manifest.put("chunks", chunks); manifest.put("durable_samples", position); manifest.put("sealed_samples", position);
        manifest.put("samples_captured", position); manifest.put("gaps", Collections.emptyList());
        Saved saved = new Saved(directory, manifest, receipts); saved.save(); return saved;
    }

    private static void allLocalSessionsAndReceipts() throws Exception {
        try (Fixture f = new Fixture()) {
            List<SyncReceipts.Receipt> receipts = new ArrayList<>();
            for (int i = 0; i < 12; i++) receipts.addAll(saveSession(f, 16000, 16000, 16000).acknowledgements);
            LocalSummary.Summary before = LocalSummary.read(f.sessions, f.receipts);
            check(before.countsKnown && before.pendingKnown, "missing receipt file is known no acknowledgements");
            check(before.recordingCount == 12 && before.sealedFileCount == 24, "counts every session, beyond a four-item history");
            check(before.totalDurationMs == 24000 && before.totalCapturedDurationMs == 24000, "all original full audio durations counted");
            check(before.pendingFileCount == 24, "ADB-exported local files remain pending without a STORED receipt");
            SyncReceipts.Catalog marked = SyncReceipts.markStored(f.receipts, receipts);
            check(marked.receipts.size() == 24 && f.receipts.isFile(), "persist 24 verified original-file receipts");
            LocalSummary.Summary after = LocalSummary.read(f.sessions, f.receipts);
            check(after.pendingFileCount == 0 && after.recordingCount == 12 && after.totalDurationMs == 24000, "stored acknowledgements change pending only");
            check(SyncReceipts.read(f.receipts).receipts.size() == 24, "receipts survive rereading storage");
        }
    }

    private static void mixedRatesAndEmptySessions() throws Exception {
        try (Fixture f = new Fixture()) {
            saveSession(f, 16000, 16000); saveSession(f, 8000, 12000); Saved empty = saveSession(f, 16000);
            WavFile header = new WavFile(empty.directory, "000000.wav", 16000, 1); header.closePartial();
            check(new File(f.sessions, ".creating-" + UUID.randomUUID()).mkdir(), "staging directory fixture");
            File hidden = new File(f.sessions, ".empty-session-" + UUID.randomUUID()); check(hidden.mkdir(), "diagnostic directory fixture");
            Files.write(new File(hidden, "manifest.json").toPath(), new byte[] {1, 2, 3});
            check(new File(f.sessions, UUID.randomUUID().toString()).mkdir(), "legacy empty UUID fixture");
            LocalSummary.Summary summary = LocalSummary.read(f.sessions, f.receipts);
            check(summary.countsKnown && summary.recordingCount == 2, "empty audio sessions and diagnostic directories excluded");
            check(summary.totalDurationMs == 2500, "durations use each session sample rate");
            check(summary.sealedFileCount == 2 && summary.pendingFileCount == 2 && summary.incompleteFileCount == 1, "header-only partial is incomplete, never uploadable");
        }
    }

    private static void liveSnapshotReplacement() throws Exception {
        try (Fixture f = new Fixture()) {
            saveSession(f, 16000, 16000); SessionStore store = new SessionStore(f.sessions, DEVICE);
            SessionStore.Snapshot initial = store.create(1, 2); byte[] pcm = new byte[8000 * 2];
            store.writePcm(pcm, pcm.length, 9000); SessionStore.Snapshot current = store.checkpoint(9000);
            try {
                // Simulate the UI holding a newer in-process snapshot than its last disk read.
                Files.write(new File(initial.directory, "manifest.json").toPath(), initial.toJson().getBytes(StandardCharsets.UTF_8));
                LocalSummary.Summary summary = LocalSummary.read(f.sessions, f.receipts, current);
                check(summary.countsKnown && summary.recordingCount == 2, "live snapshot replaces its same UUID session without duplicate count");
                check(summary.totalDurationMs == 1500 && summary.totalCapturedDurationMs == 1563, "live durable and captured durations are distinct and merged once");
                check(summary.sealedFileCount == 1 && summary.pendingFileCount == 1 && summary.incompleteFileCount == 1, "active partial cannot become pending upload");
                LocalSummary.Summary again = LocalSummary.read(f.sessions, f.receipts, current);
                check(again.recordingCount == 2 && again.totalDurationMs == 1500, "repeated snapshot refresh is idempotent");
            } finally { store.finish(9000, "error", "test discarded capture tail"); }
            LocalSummary.Summary finished = LocalSummary.read(f.sessions, f.receipts);
            check(finished.recordingCount == 2 && finished.sealedFileCount == 2 && finished.pendingFileCount == 2 && finished.incompleteFileCount == 0, "final closed file becomes pending once sealed");
            check(finished.totalDurationMs == 1500, "gap events and lost tail do not inflate saved audio duration");
        }
    }

    private static void receiptIdentityMatching() throws Exception {
        try (Fixture f = new Fixture()) {
            Saved saved = saveSession(f, 16000, 16000, 8000); SyncReceipts.Receipt first = saved.acknowledgements.get(0);
            Map<String, Object> root = new LinkedHashMap<>(); root.put("schema", SyncReceipts.SCHEMA); List<Object> items = new ArrayList<>();
            items.add(first.map()); items.add(first.map());
            SyncReceipts.Receipt second = saved.acknowledgements.get(1);
            items.add(new SyncReceipts.Receipt(second.deviceId, second.sessionId, second.chunkId, repeat('a'), 4, null).map());
            items.add(new SyncReceipts.Receipt(UUID.randomUUID().toString(), first.sessionId, first.chunkId, first.sha256, 4, null).map());
            String other = UUID.randomUUID().toString(); items.add(new SyncReceipts.Receipt(DEVICE, other, other + "_0", first.sha256, 4, null).map());
            items.add(new SyncReceipts.Receipt(DEVICE, first.sessionId, first.sessionId + "_19", first.sha256, 4, null).map());
            Map<String, Object> unconfirmed = second.map(); unconfirmed.put("status", "RECEIVED"); items.add(unconfirmed);
            root.put("receipts", items); writeJson(f.receipts, root);
            LocalSummary.Summary summary = LocalSummary.read(f.sessions, f.receipts);
            check(summary.pendingKnown && summary.pendingFileCount == 1, "duplicate, stale hash, foreign identity and RECEIVED cannot falsely decrement pending");
            check(SyncReceipts.read(f.receipts).receipts.size() == 5, "exact duplicate STORED receipts deduplicate");
            SyncReceipts.markStored(f.receipts, second);
            check(LocalSummary.read(f.sessions, f.receipts).pendingFileCount == 0, "matching second-file STORED receipt completes upload status");
        }
    }

    private static void corruptReceiptsAreUnknown() throws Exception {
        try (Fixture f = new Fixture()) {
            saveSession(f, 16000, 16000); Files.write(f.receipts.toPath(), "{broken".getBytes(StandardCharsets.UTF_8));
            LocalSummary.Summary summary = LocalSummary.read(f.sessions, f.receipts);
            check(summary.countsKnown && summary.recordingCount == 1 && summary.totalDurationMs == 1000, "receipt corruption does not lose local audio totals");
            check(!summary.pendingKnown && summary.pendingFileCount == -1 && !summary.errors.isEmpty(), "receipt read failure reports unknown, never zero pending");
            byte[] before = Files.readAllBytes(f.receipts.toPath());
            expectFailure(() -> SyncReceipts.markStored(f.receipts, new SyncReceipts.Receipt(DEVICE, UUID.randomUUID().toString(), "invalid", repeat('a'), 1, null)), "invalid receipt rejected");
            check(Arrays.equals(before, Files.readAllBytes(f.receipts.toPath())), "invalid mark never overwrites receipt diagnostics");
        }
    }

    @SuppressWarnings("unchecked") private static void corruptSessionsAreUnknown() throws Exception {
        try (Fixture f = new Fixture()) {
            Saved saved = saveSession(f, 16000, 16000);
            Files.delete(new File(saved.directory, "000000.wav").toPath());
            LocalSummary.Summary missing = LocalSummary.read(f.sessions, f.receipts);
            check(!missing.countsKnown && !missing.pendingKnown && missing.pendingFileCount == -1 && missing.recordingCount == -1, "missing sealed audio yields unknown totals");
            check(!missing.errors.isEmpty(), "missing audio error is actionable");
        }
        try (Fixture f = new Fixture()) {
            Saved saved = saveSession(f, 16000, 16000); Map<String, Object> chunk = (Map<String, Object>) ((List<?>) saved.manifest.get("chunks")).get(0);
            chunk.put("sample_count", 16001); saved.manifest.put("durable_samples", 16001); saved.manifest.put("samples_captured", 16001); saved.manifest.put("sealed_samples", 16001); saved.save();
            check(!LocalSummary.read(f.sessions, f.receipts).countsKnown, "sample count and byte length mismatch is not accepted as a total");
        }
        try (Fixture f = new Fixture()) {
            Saved saved = saveSession(f, 16000, 16000); Files.write(new File(saved.directory, "manifest.json").toPath(), new byte[] {1, 2, 3});
            LocalSummary.Summary corrupt = LocalSummary.read(f.sessions, f.receipts);
            check(corrupt.totalDurationMs == -1 && corrupt.sealedFileCount == -1 && corrupt.incompleteFileCount == -1, "malformed session cannot be reported as zero");
        }
    }

    private static void atomicReceiptsAndReadFailure() throws Exception {
        try (Fixture f = new Fixture()) {
            SyncReceipts.Receipt receipt = saveSession(f, 16000, 100).acknowledgements.get(0);
            SyncReceipts.markStored(f.receipts, receipt); byte[] before = Files.readAllBytes(f.receipts.toPath());
            check(!new File(f.root, "sync-receipts.json.tmp").exists(), "receipt write commits through atomic rename");
            SyncReceipts.markStored(f.receipts, receipt);
            check(Arrays.equals(before, Files.readAllBytes(f.receipts.toPath())), "duplicate mark leaves persisted receipt bytes unchanged");
            Files.write(f.receipts.toPath(), "{broken".getBytes(StandardCharsets.UTF_8)); byte[] corrupt = Files.readAllBytes(f.receipts.toPath());
            expectFailure(() -> SyncReceipts.markStored(f.receipts, receipt), "mark refuses to replace unreadable acknowledgement history");
            check(Arrays.equals(corrupt, Files.readAllBytes(f.receipts.toPath())), "corrupt receipt file retained for repair");
            File fileRoot = new File(f.root, "not-a-directory"); Files.write(fileRoot.toPath(), new byte[] {1});
            check(LocalSummary.read(fileRoot, f.receipts).recordingCount == -1, "unreadable session root is unknown");
            LocalSummary.Summary none = LocalSummary.read(new File(f.root, "new-install-sessions"), new File(f.root, "new-install-receipts.json"));
            check(none.countsKnown && none.pendingKnown && none.recordingCount == 0 && none.pendingFileCount == 0, "new installation with no storage is known empty");
        }
    }

    private static void incompleteFilesAreNotUploadable() throws Exception {
        try (Fixture f = new Fixture()) {
            Saved saved = saveSession(f, 16000); saved.manifest.put("status", "recording"); saved.manifest.put("durable_samples", 8000); saved.manifest.put("samples_captured", 8500); saved.save();
            WavFile partial = new WavFile(saved.directory, "000000.wav", 16000, 1); partial.append(new byte[16000], 0, 16000); partial.closePartial();
            LocalSummary.Summary summary = LocalSummary.read(f.sessions, f.receipts);
            check(summary.recordingCount == 1 && summary.totalDurationMs == 500 && summary.totalCapturedDurationMs == 531, "audio-bearing partial contributes a session and durable duration");
            check(summary.sealedFileCount == 0 && summary.pendingFileCount == 0 && summary.incompleteFileCount == 1, "durable partial does not count as uploadable");
            Files.move(new File(saved.directory, "000000.wav.partial").toPath(), new File(saved.directory, "000000.wav").toPath());
            LocalSummary.Summary orphan = LocalSummary.read(f.sessions, f.receipts);
            check(orphan.pendingFileCount == 0 && orphan.incompleteFileCount == 1, "sealed-before-manifest crash file waits for recovery before upload count");
            saved.manifest.put("durable_samples", 8001); saved.manifest.put("samples_captured", 8501); saved.save();
            check(!LocalSummary.read(f.sessions, f.receipts).countsKnown, "truncated physical partial cannot inflate durable duration");
        }
    }

    private interface Checked { void run() throws Exception; }
    private static void expectFailure(Checked task, String name) throws Exception {
        try { task.run(); } catch (IOException expected) { check(true, name); return; } throw new AssertionError(name);
    }
    private static void check(boolean condition, String name) { if (!condition) throw new AssertionError(name); checks++; }
    private static String repeat(char c) { char[] chars = new char[64]; Arrays.fill(chars, c); return new String(chars); }
    private static void writeJson(File file, Object value) throws IOException { Files.write(file.toPath(), SessionStore.Json.stringify(value).getBytes(StandardCharsets.UTF_8)); }
    private static void delete(File root) throws IOException {
        File temp = new File(System.getProperty("java.io.tmpdir")).getCanonicalFile();
        if (!root.getCanonicalPath().startsWith(temp.getPath() + File.separator)) throw new IOException("Test cleanup escaped temporary storage");
        File[] files = root.listFiles(); if (files != null) for (File child : files) { if (child.isDirectory()) delete(child); else Files.delete(child.toPath()); }
        Files.delete(root.toPath());
    }
}
