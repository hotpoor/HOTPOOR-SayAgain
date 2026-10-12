package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** One writer owns a session. Snapshots are immutable and safe to send to the UI. */
public final class SessionStore {
    public static final int SAMPLE_RATE = 16000, CHANNELS = 1, BITS_PER_SAMPLE = 16, CHUNK_SECONDS = 60;
    public static final long CHUNK_SAMPLES = (long) SAMPLE_RATE * CHUNK_SECONDS;
    public static final String SCHEMA = "sayagain-watch-v1";
    private static final String UUID_NAME = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final long STORAGE_RESERVE = 2 * 1024 * 1024;

    public static final class Chunk {
        public final String id, file, sha256;
        public final int index;
        public final long sampleStart, sampleCount, byteSize;
        public final boolean recovered;
        Chunk(String session, int index, File file, long start, long count, boolean recovered) throws IOException {
            this.id = session + "_" + index; this.index = index; this.file = file.getName();
            this.sampleStart = start; this.sampleCount = count; this.byteSize = file.length();
            this.sha256 = WavFile.sha256(file); this.recovered = recovered;
        }
        Chunk(Map<String, Object> data) throws IOException {
            id = string(data, "id"); file = string(data, "file"); sha256 = string(data, "sha256");
            index = (int) number(data, "index"); sampleStart = number(data, "sample_start");
            sampleCount = number(data, "sample_count"); byteSize = number(data, "byte_size");
            recovered = Boolean.TRUE.equals(data.get("recovered"));
            if (!"sealed".equals(string(data, "status"))) throw new IOException("Unsealed chunk in manifest");
        }
        Map<String, Object> map() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id); m.put("index", index); m.put("file", file); m.put("sample_start", sampleStart);
            m.put("sample_count", sampleCount); m.put("byte_size", byteSize); m.put("sha256", sha256);
            m.put("status", "sealed"); m.put("recovered", recovered); return m;
        }
    }

    public static final class Gap {
        public final long sampleStart, sampleCount;
        public final String reason;
        Gap(long start, long count, String reason) { this.sampleStart = start; this.sampleCount = count; this.reason = reason; }
        Map<String, Object> map() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("sample_start", sampleStart); m.put("sample_count", sampleCount); m.put("reason", reason); return m;
        }
    }

    public static final class Snapshot {
        public final File directory;
        public final String deviceId, sessionId, status, error;
        public final long startedAtMs, startedElapsedNs, samplesCaptured, durableSamples, sealedSamples;
        public final List<Chunk> chunks;
        public final List<Gap> gaps;
        Snapshot(SessionStore s) {
            directory = s.directory; deviceId = s.deviceId; sessionId = s.sessionId; status = s.status; error = s.error;
            startedAtMs = s.startedAtMs; startedElapsedNs = s.startedElapsedNs;
            samplesCaptured = s.samplesCaptured; durableSamples = s.durableSamples;
            long sealed = 0; for (Chunk chunk : s.chunks) sealed += chunk.sampleCount; sealedSamples = sealed;
            chunks = Collections.unmodifiableList(new ArrayList<>(s.chunks));
            gaps = Collections.unmodifiableList(new ArrayList<>(s.gaps));
        }
        public String toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("schema", SCHEMA); m.put("device_id", deviceId); m.put("session_id", sessionId);
            m.put("sample_rate", SAMPLE_RATE); m.put("channels", CHANNELS); m.put("bits_per_sample", BITS_PER_SAMPLE);
            m.put("chunk_seconds", CHUNK_SECONDS); m.put("started_at_ms", startedAtMs);
            // Nanosecond boot timestamps exceed JavaScript's exact integer range. Preserve all digits.
            m.put("started_elapsed_ns", Long.toString(startedElapsedNs));
            m.put("samples_captured", samplesCaptured); m.put("durable_samples", durableSamples); m.put("sealed_samples", sealedSamples);
            m.put("status", status); m.put("error", error);
            List<Object> c = new ArrayList<>(); for (Chunk chunk : chunks) c.add(chunk.map()); m.put("chunks", c);
            List<Object> g = new ArrayList<>(); for (Gap gap : gaps) g.add(gap.map()); m.put("gaps", g);
            return Json.stringify(m) + "\n";
        }
    }

    private final File root;
    private final String deviceId;
    private File directory;
    private String sessionId, status = "recording", error;
    private long startedAtMs, startedElapsedNs, samplesCaptured, durableSamples, writtenSamples;
    private final List<Chunk> chunks = new ArrayList<>();
    private final List<Gap> gaps = new ArrayList<>();
    private WavFile active;

    public SessionStore(File sessionsRoot, String deviceId) throws IOException {
        if (sessionsRoot == null || deviceId == null || deviceId.isEmpty()) throw new IOException("Session storage/device id missing");
        root = sessionsRoot; this.deviceId = deviceId;
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create session storage: " + root);
    }

    public Snapshot create(long wallMs, long elapsedNs) throws IOException {
        if (directory != null) throw new IOException("SessionStore already owns a session");
        checkSpace(0);
        sessionId = UUID.randomUUID().toString();
        // Commit the manifest before exposing the final session directory. A process death
        // during initialization leaves a recognisable staging directory, never a fake session.
        directory = new File(root, ".creating-" + sessionId);
        if (!directory.mkdir()) throw new IOException("Cannot create recording directory");
        startedAtMs = wallMs; startedElapsedNs = elapsedNs;
        persist();
        File committed = new File(root, sessionId);
        Files.move(directory.toPath(), committed.toPath(), StandardCopyOption.ATOMIC_MOVE);
        directory = committed; return snapshot();
    }

    public Snapshot snapshot() { return new Snapshot(this); }
    public long writtenSamples() { return writtenSamples; }

    public void writePcm(byte[] pcm, int length, long captured) throws IOException {
        if (directory == null || !"recording".equals(status)) throw new IOException("No active recording session");
        if (length < 0 || length > pcm.length || length % 2 != 0) throw new IOException("PCM must contain complete 16-bit samples");
        if (captured < writtenSamples + length / 2) throw new IOException("Captured sample counter is behind writer");
        samplesCaptured = Math.max(samplesCaptured, captured);
        int offset = 0;
        while (offset < length) {
            checkSpace(length - offset);
            if (active == null) active = new WavFile(directory, chunkName(chunks.size()), SAMPLE_RATE, CHANNELS);
            int n = (int) Math.min(length - offset, (CHUNK_SAMPLES - active.sampleCount()) * 2);
            active.append(pcm, offset, n); offset += n; writtenSamples += n / 2;
            if (active.sampleCount() == CHUNK_SAMPLES) sealActive(false);
        }
    }

    public Snapshot checkpoint(long captured) throws IOException {
        samplesCaptured = Math.max(samplesCaptured, captured);
        checkSpace(0);
        if (active != null) active.checkpoint();
        durableSamples = writtenSamples;
        persist(); return snapshot();
    }

    public Snapshot finish(long captured, String finalStatus, String message) throws IOException {
        if (!"completed".equals(finalStatus) && !"error".equals(finalStatus)) throw new IOException("Invalid final recording status");
        samplesCaptured = Math.max(samplesCaptured, captured);
        if (active != null) sealActive(false);
        durableSamples = writtenSamples;
        if (samplesCaptured > durableSamples) {
            gaps.add(new Gap(durableSamples, samplesCaptured - durableSamples,
                    message == null ? "captured_samples_not_saved" : message));
            finalStatus = "error";
            if (message == null) message = "Captured samples were not saved";
        }
        if ("error".equals(finalStatus) && samplesCaptured == durableSamples)
            gaps.add(new Gap(durableSamples, 0, message == null ? "recording_error_unmeasured_tail" : message));
        status = finalStatus; error = message;
        persist(); return snapshot();
    }

    /** Called after storage failure. Keep the .partial and the last known durable prefix. */
    public Snapshot preserveFailure(long captured, String message) {
        samplesCaptured = Math.max(samplesCaptured, captured); status = "error"; error = message;
        if (active != null) {
            try { active.closePartial(); durableSamples = writtenSamples; } catch (IOException ignored) { /* retained for recovery */ }
            active = null;
        }
        gaps.clear();
        if (samplesCaptured > durableSamples) gaps.add(new Gap(durableSamples, samplesCaptured - durableSamples, message));
        else gaps.add(new Gap(durableSamples, 0, message));
        try { persist(); } catch (IOException ignored) { /* Existing checkpoint and partial remain. UI still receives error. */ }
        return snapshot();
    }

    private void sealActive(boolean recovered) throws IOException {
        long count = active.sampleCount(); File file = active.seal(); active = null;
        Chunk chunk = new Chunk(sessionId, chunks.size(), file, writtenSamples - count, count, recovered);
        chunks.add(chunk); durableSamples = writtenSamples;
        persist();
    }

    private void checkSpace(long nextBytes) throws IOException {
        if (root.getUsableSpace() < STORAGE_RESERVE + nextBytes) throw new IOException("Storage insufficient: less than 2 MiB recording reserve");
    }

    private void persist() throws IOException {
        File destination = new File(directory, "manifest.json");
        File temporary = new File(directory, "manifest.json.tmp");
        byte[] bytes = snapshot().toJson().getBytes(StandardCharsets.UTF_8);
        try (FileOutputStream output = new FileOutputStream(temporary)) { output.write(bytes); output.getFD().sync(); }
        Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    /** Validate every saved session before starting; corrupted manifests/files remain untouched and block recording. */
    public List<Snapshot> recoverInterruptedSessions() throws IOException {
        File[] dirs = root.listFiles(File::isDirectory);
        if (dirs == null) throw new IOException("Cannot list session storage");
        List<Snapshot> recovered = new ArrayList<>();
        for (File dir : dirs) {
            if (dir.getName().matches("\\.creating-" + UUID_NAME) || dir.getName().matches("\\.empty-session-" + UUID_NAME)) continue;
            File[] entries = dir.listFiles();
            if (entries == null) throw new IOException("Cannot inspect session directory: " + dir.getName());
            if (entries.length == 0 && dir.getName().matches(UUID_NAME)) {
                // Compatibility with a previous build killed between mkdir and first manifest.
                // Only an actually empty UUID directory is quarantined; never delete audio.
                Files.move(dir.toPath(), new File(root, ".empty-session-" + dir.getName()).toPath(), StandardCopyOption.ATOMIC_MOVE);
                continue;
            }
            SessionStore s = new SessionStore(root, deviceId);
            try { s.load(dir); if (s.recoverFiles()) recovered.add(s.snapshot()); }
            catch (IOException e) { throw new IOException("Session " + dir.getName() + " needs repair; files preserved: " + e.getMessage(), e); }
        }
        return Collections.unmodifiableList(recovered);
    }

    public Snapshot readSession(File dir) throws IOException {
        SessionStore s = new SessionStore(root, deviceId); s.load(dir); return s.snapshot();
    }

    private void load(File dir) throws IOException {
        File manifest = new File(dir, "manifest.json");
        if (!manifest.isFile()) throw new IOException("Missing manifest.json");
        if (manifest.length() > 16 * 1024 * 1024) throw new IOException("Manifest too large");
        Map<String, Object> m = object(Json.parse(new String(Files.readAllBytes(manifest.toPath()), StandardCharsets.UTF_8)));
        if (!SCHEMA.equals(string(m, "schema")) || number(m, "sample_rate") != SAMPLE_RATE
                || number(m, "channels") != CHANNELS || number(m, "bits_per_sample") != BITS_PER_SAMPLE
                || number(m, "chunk_seconds") != CHUNK_SECONDS) throw new IOException("Unsupported manifest format");
        directory = dir; sessionId = string(m, "session_id");
        if (!sessionId.equals(dir.getName()) || !deviceId.equals(string(m, "device_id"))) throw new IOException("Session/device identity mismatch");
        startedAtMs = number(m, "started_at_ms"); startedElapsedNs = exactLong(m, "started_elapsed_ns");
        samplesCaptured = number(m, "samples_captured"); durableSamples = number(m, "durable_samples");
        if (samplesCaptured < 0 || durableSamples < 0 || durableSamples > samplesCaptured) throw new IOException("Invalid sample counters");
        status = string(m, "status");
        if (!"recording".equals(status) && !"completed".equals(status) && !"interrupted".equals(status) && !"error".equals(status)) throw new IOException("Invalid session status");
        Object failure = m.get("error"); if (failure != null && !(failure instanceof String)) throw new IOException("Invalid error value"); error = (String) failure;
        long next = 0;
        for (Object entry : array(m, "chunks")) {
            Chunk c = new Chunk(object(entry));
            if (c.index != chunks.size() || !c.id.equals(sessionId + "_" + c.index) || !c.file.equals(chunkName(c.index))
                    || c.sampleStart != next || c.sampleCount < 0 || c.sampleCount > CHUNK_SAMPLES
                    || c.byteSize != WavFile.HEADER_BYTES + c.sampleCount * 2 || !c.sha256.matches("[0-9a-f]{64}")) throw new IOException("Invalid chunk metadata");
            File file = new File(dir, c.file);
            if (!file.isFile() || file.length() != c.byteSize || WavFile.validatedSampleCount(file, SAMPLE_RATE, CHANNELS) != c.sampleCount
                    || !c.sha256.equals(WavFile.sha256(file))) throw new IOException("Sealed chunk failed validation: " + c.file);
            chunks.add(c); next += c.sampleCount;
        }
        if (next > durableSamples) throw new IOException("Manifest durable count is behind sealed chunks");
        if (m.containsKey("sealed_samples") && number(m, "sealed_samples") != next) throw new IOException("Manifest sealed count differs from chunk total");
        writtenSamples = next;
        for (Object entry : array(m, "gaps")) {
            Map<String, Object> g = object(entry); long start = number(g, "sample_start"), count = number(g, "sample_count");
            if (start < 0 || count < 0) throw new IOException("Invalid gap sample range");
            gaps.add(new Gap(start, count, string(g, "reason")));
        }
    }

    private boolean recoverFiles() throws IOException {
        File[] audio = directory.listFiles(f -> f.getName().endsWith(".wav") || f.getName().endsWith(".wav.partial"));
        if (audio == null) throw new IOException("Cannot list audio files");
        java.util.Arrays.sort(audio, Comparator.comparing(File::getName));
        boolean changed = false;
        for (File file : audio) {
            String name = file.getName(); boolean partial = name.endsWith(".partial");
            String wavName = partial ? name.substring(0, name.length() - 8) : name;
            if (!wavName.matches("[0-9]{6}\\.wav")) throw new IOException("Unexpected audio filename: " + name);
            int index = Integer.parseInt(wavName.substring(0, 6));
            if (index < chunks.size()) { if (partial) throw new IOException("Duplicate partial chunk: " + name); continue; }
            if (index != chunks.size()) throw new IOException("Audio chunk sequence has a gap");
            if (!"recording".equals(status) && !"error".equals(status)) throw new IOException("Unexpected extra audio in closed session");
            long count = partial ? WavFile.partialSampleCount(file, SAMPLE_RATE, CHANNELS)
                    : WavFile.validatedSampleCount(file, SAMPLE_RATE, CHANNELS);
            if (count > CHUNK_SAMPLES) throw new IOException("Recovered chunk exceeds configured duration");
            if (count == 0) {
                // Retain diagnostics from a crash immediately after the WAV header, without
                // advertising an empty audio file to clients or consuming a chunk index.
                Files.move(file.toPath(), new File(directory, name + ".empty").toPath(), StandardCopyOption.ATOMIC_MOVE);
                changed = true; continue;
            }
            File sealed = partial ? WavFile.recover(file, SAMPLE_RATE, CHANNELS) : file;
            chunks.add(new Chunk(sessionId, index, sealed, writtenSamples, count, true));
            writtenSamples += count; changed = true;
        }
        if (!changed && !"recording".equals(status)) {
            if (durableSamples != writtenSamples) throw new IOException("Durable samples missing from disk");
            return false;
        }
        if (durableSamples > writtenSamples) throw new IOException("Checkpoint refers to missing audio samples");
        durableSamples = writtenSamples; samplesCaptured = Math.max(samplesCaptured, durableSamples);
        gaps.clear();
        if (samplesCaptured > durableSamples) gaps.add(new Gap(durableSamples, samplesCaptured - durableSamples, "process_interrupted_after_capture"));
        // Count zero means an interruption event with an unknown physical tail, not an invented amount of silence.
        gaps.add(new Gap(samplesCaptured, 0, "process_interrupted_unmeasured_tail"));
        if (!"error".equals(status)) { status = "interrupted"; error = "Previous process ended before recording was sealed"; }
        persist(); return true;
    }

    private static String chunkName(int index) { return String.format(Locale.US, "%06d.wav", index); }
    private static String string(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof String)) throw new IOException("Missing/invalid string: " + key); return (String) value;
    }
    private static long number(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof Long) && !(value instanceof Integer)) throw new IOException("Missing/invalid integer: " + key); return ((Number) value).longValue();
    }
    private static long exactLong(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key);
        if (value instanceof String) {
            if (!((String) value).matches("[0-9]+")) throw new IOException("Invalid decimal integer: " + key);
            try { return Long.parseLong((String) value); } catch (NumberFormatException e) { throw new IOException("Integer overflow: " + key, e); }
        }
        return number(m, key);
    }
    @SuppressWarnings("unchecked") private static Map<String, Object> object(Object value) throws IOException {
        if (!(value instanceof Map)) throw new IOException("Expected JSON object"); return (Map<String, Object>) value;
    }
    @SuppressWarnings("unchecked") private static List<Object> array(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof List)) throw new IOException("Missing/invalid array: " + key); return (List<Object>) value;
    }

    /** Small strict JSON codec keeps the storage/recovery layer testable on a plain JVM. */
    static final class Json {
        private final String source; private int position;
        Json(String source) { this.source = source; }
        static Object parse(String source) throws IOException {
            Json p = new Json(source); Object result = p.value(); p.space();
            if (p.position != source.length()) throw p.invalid(); return result;
        }
        private IOException invalid() { return new IOException("Malformed JSON at character " + position); }
        private void space() { while (position < source.length() && " \r\n\t".indexOf(source.charAt(position)) >= 0) position++; }
        private boolean take(char ch) { space(); if (position < source.length() && source.charAt(position) == ch) { position++; return true; } return false; }
        private Object value() throws IOException {
            space(); if (position == source.length()) throw invalid(); char c = source.charAt(position);
            if (c == '"') return text();
            if (take('{')) {
                Map<String, Object> m = new LinkedHashMap<>(); if (take('}')) return m;
                do { space(); if (position == source.length() || source.charAt(position) != '"') throw invalid();
                    String key = text(); if (m.containsKey(key) || !take(':')) throw invalid(); m.put(key, value());
                } while (take(',')); if (!take('}')) throw invalid(); return m;
            }
            if (take('[')) { List<Object> a = new ArrayList<>(); if (take(']')) return a; do { a.add(value()); } while (take(',')); if (!take(']')) throw invalid(); return a; }
            for (String word : new String[] {"true", "false", "null"}) {
                if (source.startsWith(word, position)) { position += word.length(); return "null".equals(word) ? null : Boolean.valueOf(word); }
            }
            int start = position; if (source.charAt(position) == '-') position++;
            if (position == source.length() || !Character.isDigit(source.charAt(position))) throw invalid();
            if (source.charAt(position) == '0') position++; else while (position < source.length() && Character.isDigit(source.charAt(position))) position++;
            try { return Long.parseLong(source.substring(start, position)); } catch (NumberFormatException e) { throw invalid(); }
        }
        private String text() throws IOException {
            if (!take('"')) throw invalid(); StringBuilder s = new StringBuilder();
            while (position < source.length()) {
                char c = source.charAt(position++); if (c == '"') return s.toString(); if (c < 32) throw invalid();
                if (c != '\\') { s.append(c); continue; } if (position == source.length()) throw invalid();
                char e = source.charAt(position++);
                switch (e) {
                    case '"': case '\\': case '/': s.append(e); break;
                    case 'b': s.append('\b'); break; case 'f': s.append('\f'); break; case 'n': s.append('\n'); break;
                    case 'r': s.append('\r'); break; case 't': s.append('\t'); break;
                    case 'u': if (position + 4 > source.length()) throw invalid();
                        try { s.append((char) Integer.parseInt(source.substring(position, position + 4), 16)); } catch (NumberFormatException ex) { throw invalid(); }
                        position += 4; break; default: throw invalid();
                }
            } throw invalid();
        }
        static String stringify(Object value) {
            if (value == null) return "null";
            if (value instanceof String) {
                StringBuilder s = new StringBuilder("\"");
                for (char c : ((String) value).toCharArray()) {
                    if (c == '"' || c == '\\') s.append('\\').append(c);
                    else if (c < 32) s.append(String.format(Locale.US, "\\u%04x", (int) c)); else s.append(c);
                } return s.append('"').toString();
            }
            if (value instanceof Map) {
                StringBuilder s = new StringBuilder("{"); boolean first = true;
                for (Map.Entry<?, ?> e : ((Map<?, ?>) value).entrySet()) { if (!first) s.append(','); first = false; s.append(stringify(e.getKey())).append(':').append(stringify(e.getValue())); }
                return s.append('}').toString();
            }
            if (value instanceof List) { StringBuilder s = new StringBuilder("["); boolean first = true; for (Object e : (List<?>) value) { if (!first) s.append(','); first = false; s.append(stringify(e)); } return s.append(']').toString(); }
            return value.toString();
        }
    }
}
