package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Metadata-only local totals. No WAV decoding or audio hashing belongs in a UI refresh. */
public final class LocalSummary {
    public static final class Summary {
        /** A value of -1 means unknown because some local metadata could not be inspected. */
        public final long recordingCount, totalDurationMs, totalCapturedDurationMs, sealedFileCount, pendingFileCount, incompleteFileCount;
        public final boolean countsKnown, pendingKnown;
        public final List<String> errors;
        Summary(Totals totals, boolean countsKnown, boolean pendingKnown, List<String> errors) {
            this.countsKnown = countsKnown; this.pendingKnown = countsKnown && pendingKnown;
            recordingCount = countsKnown ? totals.recordings : -1;
            totalDurationMs = countsKnown ? Math.round(totals.durableMs) : -1;
            totalCapturedDurationMs = countsKnown ? Math.round(totals.capturedMs) : -1;
            sealedFileCount = countsKnown ? totals.sealed : -1;
            incompleteFileCount = countsKnown ? totals.incomplete : -1;
            pendingFileCount = this.pendingKnown ? totals.pending : -1;
            this.errors = Collections.unmodifiableList(new ArrayList<>(errors));
        }
    }
    private static final class Totals {
        long recordings, sealed, pending, incomplete;
        double durableMs, capturedMs;
        void add(Totals other) throws IOException {
            if (Long.MAX_VALUE - recordings < other.recordings || Long.MAX_VALUE - sealed < other.sealed
                    || Long.MAX_VALUE - pending < other.pending || Long.MAX_VALUE - incomplete < other.incomplete)
                throw new IOException("Local recording count overflow");
            recordings += other.recordings; sealed += other.sealed; pending += other.pending; incomplete += other.incomplete;
            durableMs += other.durableMs; capturedMs += other.capturedMs;
            if (durableMs >= Long.MAX_VALUE || capturedMs >= Long.MAX_VALUE) throw new IOException("Local recording duration overflow");
        }
    }
    private LocalSummary() {}

    public static Summary read(File sessionsRoot, File receiptsFile) { return read(sessionsRoot, receiptsFile, null); }

    /** The live snapshot replaces the matching manifest's counters, rather than adding a second session. */
    public static Summary read(File sessionsRoot, File receiptsFile, SessionStore.Snapshot ongoing) {
        List<String> errors = new ArrayList<>(); Totals totals = new Totals();
        SyncReceipts.Catalog receipts = null; boolean pendingKnown = true, countsKnown = true;
        try { receipts = SyncReceipts.read(receiptsFile); }
        catch (IOException | RuntimeException error) { pendingKnown = false; errors.add("Sync receipts: " + message(error)); }
        boolean sawLive = false;
        try {
            if (sessionsRoot == null) throw new IOException("Session storage path is missing");
            if (Files.exists(sessionsRoot.toPath(), LinkOption.NOFOLLOW_LINKS)) {
                if (!Files.isDirectory(sessionsRoot.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Session storage is not a regular directory");
                File[] entries = sessionsRoot.listFiles(); if (entries == null) throw new IOException("Cannot list local recording sessions");
                for (File directory : entries) {
                    // Includes staging, empty-session diagnostics and unrelated directories.
                    if (!SyncReceipts.uuid(directory.getName())) continue;
                    try {
                        if (!Files.isDirectory(directory.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Session is not a regular directory");
                        File[] localFiles = directory.listFiles();
                        if (localFiles == null) throw new IOException("Cannot inspect session directory");
                        if (localFiles.length == 0 && (ongoing == null || !directory.getName().equals(ongoing.sessionId))) continue;
                        Map<String, Object> manifest;
                        if (ongoing != null && directory.getName().equals(ongoing.sessionId)) {
                            if (!directory.getCanonicalFile().equals(ongoing.directory.getCanonicalFile())) throw new IOException("Live session storage identity mismatch");
                            manifest = SyncReceipts.object(SessionStore.Json.parse(ongoing.toJson())); sawLive = true;
                        } else manifest = SyncReceipts.object(SyncReceipts.readJson(new File(directory, "manifest.json")));
                        totals.add(inspect(directory, manifest, receipts));
                    } catch (IOException | RuntimeException error) {
                        countsKnown = false; errors.add(directory.getName() + ": " + message(error));
                    }
                }
            }
            if (ongoing != null && !sawLive) {
                if (ongoing.directory == null || !ongoing.directory.getCanonicalFile().getParentFile().equals(sessionsRoot.getCanonicalFile()))
                    throw new IOException("Live recording is outside session storage");
                totals.add(inspect(ongoing.directory, SyncReceipts.object(SessionStore.Json.parse(ongoing.toJson())), receipts));
            }
        } catch (IOException | RuntimeException error) { countsKnown = false; errors.add("Local recordings: " + message(error)); }
        return new Summary(totals, countsKnown, pendingKnown, errors);
    }

    private static Totals inspect(File directory, Map<String, Object> manifest, SyncReceipts.Catalog receipts) throws IOException {
        if (!SessionStore.SCHEMA.equals(SyncReceipts.text(manifest, "schema"))) throw new IOException("Unsupported session schema");
        String session = SyncReceipts.text(manifest, "session_id"), device = SyncReceipts.text(manifest, "device_id");
        if (!SyncReceipts.uuid(session) || !SyncReceipts.uuid(device) || !session.equals(directory.getName())) throw new IOException("Session identity mismatch");
        long rate = SyncReceipts.number(manifest, "sample_rate"), durable = SyncReceipts.number(manifest, "durable_samples");
        long captured = SyncReceipts.number(manifest, "samples_captured");
        if (rate <= 0 || rate > 384000 || durable < 0 || captured < durable) throw new IOException("Invalid recording sample counters/rate");
        String status = SyncReceipts.text(manifest, "status");
        if (!"recording".equals(status) && !"completed".equals(status) && !"interrupted".equals(status) && !"error".equals(status)) throw new IOException("Invalid session status");
        Totals result = new Totals(); long sealedSamples = 0; boolean hasAudio = false;
        Set<String> advertised = new HashSet<>(); List<Object> chunks = SyncReceipts.array(manifest, "chunks");
        if (chunks.size() > 100000) throw new IOException("Too many sealed recording files");
        long previousEnd = 0;
        for (Object value : chunks) {
            Map<String, Object> chunk = SyncReceipts.object(value); long index = SyncReceipts.number(chunk, "index");
            String id = SyncReceipts.text(chunk, "id"), filename = SyncReceipts.text(chunk, "file"), hash = SyncReceipts.text(chunk, "sha256");
            long count = SyncReceipts.number(chunk, "sample_count"), start = SyncReceipts.number(chunk, "sample_start"), bytes = SyncReceipts.number(chunk, "byte_size");
            if (index != result.sealed || index > 999999 || !id.equals(session + "_" + index)
                    || !filename.equals(String.format(Locale.US, "%06d.wav", index)) || !advertised.add(filename)
                    || !"sealed".equals(SyncReceipts.text(chunk, "status")) || !hash.matches("[0-9a-f]{64}")
                    || count <= 0 || count > (Long.MAX_VALUE - 44) / 2 || start < previousEnd
                    || Long.MAX_VALUE - start < count || bytes != 44 + count * 2)
                throw new IOException("Invalid sealed file metadata");
            File audio = new File(directory, filename);
            if (!Files.isRegularFile(audio.toPath(), LinkOption.NOFOLLOW_LINKS) || Files.size(audio.toPath()) != bytes)
                throw new IOException("Sealed recording file missing or length changed: " + filename);
            if (Long.MAX_VALUE - sealedSamples < count) throw new IOException("Sealed sample count overflow");
            sealedSamples += count; previousEnd = start + count; hasAudio = true; result.sealed++;
            if (receipts == null || !receipts.isStored(device, session, id, hash)) result.pending++;
        }
        if (sealedSamples > durable || (manifest.containsKey("sealed_samples") && SyncReceipts.number(manifest, "sealed_samples") != sealedSamples))
            throw new IOException("Sealed/durable recording counters disagree");
        if (("completed".equals(status) || "interrupted".equals(status)) && sealedSamples != durable)
            throw new IOException("Closed session contains unsealed durable samples");
        long physicalSamples = sealedSamples;
        File[] files = directory.listFiles(); if (files == null) throw new IOException("Cannot inspect local recording files");
        for (File file : files) {
            String name = file.getName();
            if (!name.matches("[0-9]{6}\\.wav\\.partial") && !(name.matches("[0-9]{6}\\.wav") && !advertised.contains(name))) continue;
            if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Incomplete recording is not a regular file");
            long bytes = Files.size(file.toPath()); result.incomplete++;
            if (bytes >= 46) {
                hasAudio = true; long frames = (bytes - 44) / 2;
                if (Long.MAX_VALUE - physicalSamples < frames) throw new IOException("Physical sample count overflow");
                physicalSamples += frames;
            }
        }
        if (durable > 0 && !hasAudio) throw new IOException("Durable recording samples have no local audio file");
        if (durable > physicalSamples) throw new IOException("Durable samples exceed available local audio bytes");
        if (hasAudio) {
            result.recordings = 1;
            result.durableMs = durable * (1000.0 / rate);
            result.capturedMs = captured * (1000.0 / rate);
        }
        return result;
    }
    private static String message(Throwable error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
}
