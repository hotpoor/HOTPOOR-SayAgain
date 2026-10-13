package world.hotpoor.sayagain.watch;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Grants the system installer read access to one cached APK, never to recordings or other files. */
public final class UpdateApkProvider extends ContentProvider {
    public static final Uri URI = Uri.parse("content://world.hotpoor.sayagain.watch.updates/sayagain-update.apk");
    static File apk(android.content.Context context) { return new File(context.getCacheDir(), "sayagain-update.apk"); }
    @Override public boolean onCreate() { return true; }
    private void check(Uri uri) { if (!URI.equals(uri)) throw new SecurityException("Unsupported update URI"); }
    @Override public String getType(Uri uri) { check(uri); return "application/vnd.android.package-archive"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        check(uri);
        if (!"r".equals(mode)) throw new SecurityException("Update APK is read-only");
        return ParcelFileDescriptor.open(apk(getContext()), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        check(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor result = new MatrixCursor(columns);
        Object[] values = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = "sayagain-update.apk";
            if (OpenableColumns.SIZE.equals(columns[i])) values[i] = apk(getContext()).length();
        }
        result.addRow(values); return result;
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new SecurityException("Read-only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new SecurityException("Read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new SecurityException("Read-only"); }
}
