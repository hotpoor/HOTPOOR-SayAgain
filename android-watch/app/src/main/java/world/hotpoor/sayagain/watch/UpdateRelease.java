package world.hotpoor.sayagain.watch;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** Release metadata is untrusted. Signing identity is checked separately against the installed app. */
public final class UpdateRelease {
    public static final String BASE = "https://api.xialiwei.com/hotpoor/sayagain/updates/android-watch/";
    public static final String MANIFEST = BASE + "stable.json";
    public static final long MAX_APK_BYTES = 32L * 1024 * 1024;
    public final int versionCode, minSdk;
    public final String versionName, url, sha256, notes;
    public final long size;

    @SuppressWarnings("unchecked")
    public UpdateRelease(String json) throws IOException {
        Object parsed = SessionStore.Json.parse(json);
        if (!(parsed instanceof Map)) throw new IOException("更新清单格式错误");
        Map<String, Object> data = (Map<String, Object>) parsed;
        if (!"sayagain-watch-update-v1".equals(data.get("schema"))
                || !"world.hotpoor.sayagain.watch".equals(data.get("package_name")))
            throw new IOException("更新清单不属于此 App");
        long code = integer(data, "version_code"), sdk = integer(data, "min_sdk");
        size = integer(data, "size");
        if (code < 1 || code > Integer.MAX_VALUE || sdk < 26 || sdk > Integer.MAX_VALUE
                || size < 1 || size > MAX_APK_BYTES) throw new IOException("更新参数超出范围");
        versionCode = (int) code; minSdk = (int) sdk;
        versionName = string(data, "version_name", 40);
        sha256 = string(data, "sha256", 64);
        if (!sha256.matches("[0-9a-f]{64}")) throw new IOException("更新校验值无效");
        url = string(data, "apk_url", 400);
        try {
            URI uri = new URI(url);
            if (!"https".equals(uri.getScheme()) || !"api.xialiwei.com".equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null || !url.startsWith(BASE)
                    || !uri.getRawPath().matches("/hotpoor/sayagain/updates/android-watch/[A-Za-z0-9._-]+\\.apk"))
                throw new IOException("APK 地址不在官方更新目录");
        } catch (java.net.URISyntaxException invalid) { throw new IOException("APK 地址无效", invalid); }
        Object description = data.get("notes");
        notes = description instanceof String ? (String) description : "";
        if (notes.length() > 2000) throw new IOException("更新说明过长");
    }

    private static long integer(Map<String, Object> data, String key) throws IOException {
        Object value = data.get(key);
        if (!(value instanceof Long) && !(value instanceof Integer)) throw new IOException("更新整数缺失：" + key);
        return ((Number) value).longValue();
    }
    private static String string(Map<String, Object> data, String key, int limit) throws IOException {
        Object value = data.get(key);
        if (!(value instanceof String) || ((String) value).isEmpty() || ((String) value).length() > limit)
            throw new IOException("更新字段缺失：" + key);
        return (String) value;
    }
}
