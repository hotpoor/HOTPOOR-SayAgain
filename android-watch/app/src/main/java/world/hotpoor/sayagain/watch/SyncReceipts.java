package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Durable acknowledgements from a client that has saved and verified the original audio. */
public final class SyncReceipts {
    public static final String SCHEMA = "sayagain-watch-sync-v1";
    static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final long MAX_JSON_BYTES = 16 * 1024 * 1024;

    public static final class Receipt {
        public final String deviceId, sessionId, chunkId, sha256, clientId;
        public final long storedAtMs;
        public Receipt(String deviceId, String sessionId, String chunkId, String sha256, long storedAtMs, String clientId) throws IOException {
            if (!uuid(deviceId) || !uuid(sessionId) || chunkId == null || !chunkId.matches(sessionId + "_(0|[1-9][0-9]{0,8})")
                    || sha256 == null || !sha256.matches("[0-9a-f]{64}") || storedAtMs < 0
                    || (clientId != null && (clientId.trim().isEmpty() || clientId.length() > 256)))
                throw new IOException("Invalid STORED acknowledgement identity, hash, or timestamp");
            this.deviceId = deviceId; this.sessionId = sessionId; this.chunkId = chunkId;
            this.sha256 = sha256; this.storedAtMs = storedAtMs; this.clientId = clientId;
        }
        String key() { return deviceId + "/" + sessionId + "/" + chunkId + "/" + sha256; }
        Map<String, Object> map() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("device_id", deviceId); m.put("session_id", sessionId); m.put("chunk_id", chunkId);
            m.put("sha256", sha256); m.put("status", "STORED"); m.put("stored_at_ms", storedAtMs);
            if (clientId != null) m.put("client_id", clientId); return m;
        }
    }

    public static final class Catalog {
        public final List<Receipt> receipts;
        private final Map<String, Receipt> byIdentity;
        Catalog(Map<String, Receipt> receipts) {
            this.byIdentity = Collections.unmodifiableMap(new LinkedHashMap<>(receipts));
            this.receipts = Collections.unmodifiableList(new ArrayList<>(receipts.values()));
        }
        public boolean isStored(String deviceId, String sessionId, String chunkId, String sha256) {
            return byIdentity.containsKey(deviceId + "/" + sessionId + "/" + chunkId + "/" + sha256);
        }
        public String toJson() {
            Map<String, Object> m = new LinkedHashMap<>(); m.put("schema", SCHEMA);
            List<Object> items = new ArrayList<>(); for (Receipt r : receipts) items.add(r.map()); m.put("receipts", items);
            return SessionStore.Json.stringify(m) + "\n";
        }
    }

    private SyncReceipts() {}
    static boolean uuid(String value) { return value != null && value.matches(UUID_PATTERN); }

    /** Missing file means no client acknowledgement; corrupt/unreadable files are explicit errors. */
    public static Catalog read(File file) throws IOException {
        if (file == null) throw new IOException("Acknowledgement file path is missing");
        if (!Files.exists(file.toPath(), LinkOption.NOFOLLOW_LINKS)) return new Catalog(Collections.emptyMap());
        Map<String, Object> root = object(readJson(file));
        if (!SCHEMA.equals(text(root, "schema"))) throw new IOException("Unsupported sync acknowledgement schema");
        List<Object> items = array(root, "receipts");
        if (items.size() > 100000) throw new IOException("Too many sync acknowledgements");
        Map<String, Receipt> accepted = new LinkedHashMap<>();
        for (Object value : items) {
            Map<String, Object> m = object(value);
            String status = text(m, "status");
            // Other statuses are not proof that a client durably saved the audio.
            if (!"STORED".equals(status)) continue;
            Object client = m.get("client_id");
            if (client != null && !(client instanceof String)) throw new IOException("Invalid acknowledgement client id");
            Receipt receipt = new Receipt(text(m, "device_id"), text(m, "session_id"), text(m, "chunk_id"),
                    text(m, "sha256"), number(m, "stored_at_ms"), (String) client);
            Receipt previous = accepted.get(receipt.key());
            if (previous == null || receipt.storedAtMs >= previous.storedAtMs) accepted.put(receipt.key(), receipt);
        }
        return new Catalog(accepted);
    }

    public static Catalog markStored(File file, Receipt receipt) throws IOException {
        return markStored(file, Collections.singletonList(receipt));
    }

    /** Call only after the destination confirms persisted original bytes and their SHA-256. */
    public static synchronized Catalog markStored(File file, List<Receipt> incoming) throws IOException {
        if (incoming == null) throw new IOException("Missing STORED acknowledgements");
        Catalog current = read(file);
        Map<String, Receipt> combined = new LinkedHashMap<>(current.byIdentity);
        boolean changed = false;
        for (Receipt receipt : incoming) {
            if (receipt == null) throw new IOException("Null STORED acknowledgement");
            Receipt previous = combined.get(receipt.key());
            if (previous == null || receipt.storedAtMs > previous.storedAtMs
                    || (receipt.storedAtMs == previous.storedAtMs && !java.util.Objects.equals(receipt.clientId, previous.clientId))) {
                combined.put(receipt.key(), receipt); changed = true;
            }
        }
        Catalog result = new Catalog(combined);
        if (!changed) return result;
        File parent = file.getAbsoluteFile().getParentFile();
        if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) throw new IOException("Cannot create acknowledgement directory");
        byte[] bytes = result.toJson().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_JSON_BYTES) throw new IOException("Acknowledgement file too large");
        File temporary = new File(parent, file.getName() + ".tmp");
        if (Files.isSymbolicLink(temporary.toPath())) throw new IOException("Acknowledgement temporary file is a symbolic link");
        try (FileOutputStream output = new FileOutputStream(temporary)) { output.write(bytes); output.getFD().sync(); }
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        return result;
    }

    static Object readJson(File file) throws IOException {
        if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Not a regular metadata file: " + file.getName());
        long length = Files.size(file.toPath());
        if (length > MAX_JSON_BYTES) throw new IOException("Metadata file too large: " + file.getName());
        return SessionStore.Json.parse(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
    }
    @SuppressWarnings("unchecked") static Map<String, Object> object(Object value) throws IOException {
        if (!(value instanceof Map)) throw new IOException("Expected a metadata JSON object"); return (Map<String, Object>) value;
    }
    @SuppressWarnings("unchecked") static List<Object> array(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof List)) throw new IOException("Missing metadata array: " + key); return (List<Object>) value;
    }
    static String text(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof String)) throw new IOException("Missing metadata string: " + key); return (String) value;
    }
    static long number(Map<String, Object> m, String key) throws IOException {
        Object value = m.get(key); if (!(value instanceof Long) && !(value instanceof Integer)) throw new IOException("Missing metadata integer: " + key);
        return ((Number) value).longValue();
    }
}
