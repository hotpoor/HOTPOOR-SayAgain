package world.hotpoor.sayagain.watch;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.io.FileInputStream;

/** PCM16 WAV writer. The open file remains .partial until its header and samples are synced. */
public final class WavFile {
    public static final int HEADER_BYTES = 44;
    private final File partial;
    private final File sealed;
    private final RandomAccessFile output;
    private final int sampleRate;
    private final int channels;
    private long dataBytes;
    private boolean closed;

    public WavFile(File directory, String name, int sampleRate, int channels) throws IOException {
        this.partial = new File(directory, name + ".partial");
        this.sealed = new File(directory, name);
        this.sampleRate = sampleRate;
        this.channels = channels;
        if (partial.exists() || sealed.exists()) throw new IOException("Audio file already exists: " + name);
        output = new RandomAccessFile(partial, "rw");
        writeHeader(output, 0, sampleRate, channels);
        output.getFD().sync();
    }

    public void append(byte[] bytes, int offset, int length) throws IOException {
        if (closed) throw new IOException("WAV writer is closed");
        if (offset < 0 || length < 0 || offset + length > bytes.length || length % (channels * 2) != 0)
            throw new IOException("PCM data is not aligned to a complete sample frame");
        if (dataBytes + length > 0xffffffffL - 36) throw new IOException("WAV exceeds RIFF size limit");
        output.seek(HEADER_BYTES + dataBytes);
        output.write(bytes, offset, length);
        dataBytes += length;
    }

    public long sampleCount() { return dataBytes / (channels * 2); }

    public void checkpoint() throws IOException {
        if (closed) throw new IOException("WAV writer is closed");
        writeHeader(output, dataBytes, sampleRate, channels);
        output.getFD().sync();
    }

    public File seal() throws IOException {
        checkpoint();
        output.close();
        closed = true;
        Files.move(partial.toPath(), sealed.toPath(), StandardCopyOption.ATOMIC_MOVE);
        return sealed;
    }

    /** Close without renaming if a writer has failed; recovery retains the partial data. */
    public void closePartial() throws IOException {
        if (!closed) {
            try { checkpoint(); } finally { output.close(); closed = true; }
        }
    }

    public static File recover(File partial, int sampleRate, int channels) throws IOException {
        if (!partial.getName().endsWith(".wav.partial")) throw new IOException("Unexpected partial filename");
        File sealed = new File(partial.getParentFile(), partial.getName().substring(0, partial.getName().length() - 8));
        if (sealed.exists()) throw new IOException("Both partial and sealed audio exist: " + partial.getName());
        try (RandomAccessFile file = new RandomAccessFile(partial, "rw")) {
            validateFormat(file, sampleRate, channels);
            long bytes = file.length() - HEADER_BYTES;
            bytes -= bytes % (channels * 2);
            file.setLength(HEADER_BYTES + bytes);
            writeHeader(file, bytes, sampleRate, channels);
            file.getFD().sync();
        }
        Files.move(partial.toPath(), sealed.toPath(), StandardCopyOption.ATOMIC_MOVE);
        return sealed;
    }

    /** Physical complete sample frames, independent of a stale checkpoint header. */
    public static long partialSampleCount(File partial, int sampleRate, int channels) throws IOException {
        try (RandomAccessFile file = new RandomAccessFile(partial, "r")) {
            validateFormat(file, sampleRate, channels);
            return (file.length() - HEADER_BYTES) / (channels * 2);
        }
    }

    public static long validatedSampleCount(File file, int sampleRate, int channels) throws IOException {
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            validateFormat(input, sampleRate, channels);
            input.seek(40);
            long declaredBytes = readU32(input);
            long physicalBytes = input.length() - HEADER_BYTES;
            input.seek(4);
            long riffBytes = readU32(input);
            if (physicalBytes % (channels * 2) != 0 || declaredBytes != physicalBytes || riffBytes != physicalBytes + 36)
                throw new IOException("WAV header/length mismatch: " + file.getName());
            return physicalBytes / (channels * 2);
        }
    }

    public static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[32768];
                int n;
                while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.US, "%02x", b & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IOException(impossible); }
    }

    private static void validateFormat(RandomAccessFile file, int sampleRate, int channels) throws IOException {
        if (file.length() < HEADER_BYTES) throw new IOException("Truncated WAV header");
        file.seek(0);
        if (!tag(file, "RIFF")) throw new IOException("Missing RIFF header");
        file.seek(8);
        if (!tag(file, "WAVE") || !tag(file, "fmt ") || readU32(file) != 16 || readU16(file) != 1
                || readU16(file) != channels || readU32(file) != sampleRate
                || readU32(file) != sampleRate * channels * 2L || readU16(file) != channels * 2
                || readU16(file) != 16 || !tag(file, "data")) throw new IOException("Unexpected WAV PCM format");
    }

    private static boolean tag(RandomAccessFile file, String expected) throws IOException {
        for (int i = 0; i < expected.length(); i++) if (file.read() != expected.charAt(i)) return false;
        return true;
    }

    private static void writeHeader(RandomAccessFile file, long bytes, int sampleRate, int channels) throws IOException {
        file.seek(0);
        file.writeBytes("RIFF"); writeU32(file, bytes + 36); file.writeBytes("WAVEfmt ");
        writeU32(file, 16); writeU16(file, 1); writeU16(file, channels);
        writeU32(file, sampleRate); writeU32(file, sampleRate * channels * 2L);
        writeU16(file, channels * 2); writeU16(file, 16);
        file.writeBytes("data"); writeU32(file, bytes);
    }

    private static void writeU16(RandomAccessFile file, int value) throws IOException {
        file.write(value & 255); file.write((value >>> 8) & 255);
    }
    private static void writeU32(RandomAccessFile file, long value) throws IOException {
        for (int i = 0; i < 4; i++) file.write((int) (value >>> (i * 8)) & 255);
    }
    private static int readU16(RandomAccessFile file) throws IOException {
        int a = file.read(), b = file.read();
        if (a < 0 || b < 0) throw new IOException("Truncated WAV header");
        return a | (b << 8);
    }
    private static long readU32(RandomAccessFile file) throws IOException {
        long value = 0;
        for (int i = 0; i < 4; i++) { int b = file.read(); if (b < 0) throw new IOException("Truncated WAV header"); value |= (long) b << (i * 8); }
        return value;
    }
}
