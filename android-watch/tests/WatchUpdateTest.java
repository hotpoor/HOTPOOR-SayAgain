package world.hotpoor.sayagain.watch;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

public final class WatchUpdateTest {
    private static int checks;
    private static Map<String, Object> fixture() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("schema", "sayagain-watch-update-v1"); m.put("package_name", "world.hotpoor.sayagain.watch");
        m.put("version_code", 6L); m.put("version_name", "0.4.1"); m.put("min_sdk", 26L);
        m.put("size", 60000L); m.put("sha256", new String(new char[64]).replace('\0', 'a'));
        m.put("apk_url", UpdateRelease.BASE + "sayagain-watch-0.4.1.apk"); m.put("notes", "保留本地录音"); return m;
    }
    private static void reject(String key, Object value) throws Exception {
        Map<String, Object> m = fixture(); m.put(key, value);
        try { new UpdateRelease(SessionStore.Json.stringify(m)); throw new AssertionError("Accepted " + key + "=" + value); }
        catch (IOException expected) { checks++; }
    }
    public static void main(String[] args) throws Exception {
        UpdateRelease release = new UpdateRelease(SessionStore.Json.stringify(fixture()));
        if (release.versionCode != 6 || release.size != 60000 || release.minSdk != 26) throw new AssertionError("Round trip");
        checks++;
        reject("schema", "wrong"); reject("package_name", "other.app");
        reject("version_code", 0L); reject("version_code", 2147483648L); reject("version_code", "6"); reject("version_code", 6.5);
        reject("min_sdk", 25L); reject("size", 0L); reject("size", UpdateRelease.MAX_APK_BYTES + 1);
        reject("sha256", "abc"); reject("sha256", new String(new char[64]).replace('\0', 'G'));
        reject("version_name", ""); reject("notes", new String(new char[2001]).replace('\0', 'x'));
        for (String url : new String[]{
                "http://api.xialiwei.com/hotpoor/sayagain/updates/android-watch/test.apk",
                "https://evil.example/test.apk", "https://api.xialiwei.com.evil.example/test.apk",
                "https://evil@api.xialiwei.com/hotpoor/sayagain/updates/android-watch/test.apk",
                UpdateRelease.BASE + "../test.apk", UpdateRelease.BASE + "%2e%2e/test.apk",
                UpdateRelease.BASE + "test.apk?token=secret", UpdateRelease.BASE + "test.apk#fragment",
                "https://api.xialiwei.com:8443/hotpoor/sayagain/updates/android-watch/test.apk",
                UpdateRelease.BASE + "test.zip", "https://api.xialiwei.com/other/test.apk"}) reject("apk_url", url);
        System.out.println("Watch updates: " + checks + " assertions passed");
    }
}
