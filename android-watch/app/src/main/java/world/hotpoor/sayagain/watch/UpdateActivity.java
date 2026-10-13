package world.hotpoor.sayagain.watch;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Explicit update workflow. No background installation or changes to recording storage. */
public final class UpdateActivity extends Activity {
    private static final int INSTALL_PERMISSION = 201, INSTALL = 202;
    public static volatile boolean installing;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private volatile boolean destroyed, busy;
    private TextView status, details;
    private Button action;
    private UpdateRelease release;
    private boolean ready;
    private int currentCode;
    private String currentName;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        int background = Color.rgb(13, 24, 29);
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(16), dp(14), dp(16), dp(14));
        content.setBackgroundColor(background);
        try {
            PackageInfo own = getPackageManager().getPackageInfo(getPackageName(), 0);
            currentCode = own.versionCode; currentName = own.versionName;
        } catch (PackageManager.NameNotFoundException impossible) { finish(); return; }
        content.addView(text("应用更新", 22));
        content.addView(text("当前版本 " + currentName, 12));
        status = text("准备检查", 15); status.setPadding(0, dp(14), 0, dp(10)); content.addView(status);
        ScrollView scroll = new ScrollView(this);
        details = text("", 12); scroll.addView(details);
        content.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        action = new Button(this); action.setText("检查更新"); action.setAllCaps(false);
        content.addView(action, new LinearLayout.LayoutParams(-1, dp(48)));
        Button back = new Button(this); back.setText("返回录音"); back.setAllCaps(false);
        content.addView(back, new LinearLayout.LayoutParams(-1, dp(44)));
        back.setOnClickListener(view -> finish());
        action.setOnClickListener(view -> {
            if (busy) return;
            if (release == null) check(); else if (ready) install(); else download();
        });
        setContentView(content); check();
    }

    private void check() {
        busy = true; ready = false; release = null; action.setEnabled(false); status.setText("正在检查更新…");
        network.execute(() -> {
            try {
                UpdateRelease found = new UpdateRelease(readManifest());
                main.post(() -> {
                    if (destroyed) return;
                    busy = false;
                    if (found.versionCode <= currentCode) {
                        status.setText("已是最新版本"); details.setText("当前 " + currentName + "\n" + found.notes);
                        action.setText("重新检查");
                    } else if (found.minSdk > android.os.Build.VERSION.SDK_INT) {
                        status.setText("新版本不支持此系统"); action.setText("重新检查");
                    } else {
                        release = found; status.setText("发现新版本 " + found.versionName);
                        details.setText(found.notes + "\n\n下载大小 " + ((found.size + 1023) / 1024) + " KB\n安装时保留本地录音；请先结束录音。");
                        action.setText("下载更新");
                    }
                    action.setEnabled(true);
                });
            } catch (Exception error) { error("检查失败", error, false); }
        });
    }

    private static HttpURLConnection connect(String address) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
        connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
        connection.setRequestProperty("User-Agent", "SayAgain-Watch-Updater");
        if (connection.getResponseCode() != 200) {
            int code = connection.getResponseCode(); connection.disconnect(); throw new IOException("服务器返回 " + code);
        }
        return connection;
    }

    private String readManifest() throws IOException {
        HttpURLConnection connection = connect(UpdateRelease.MANIFEST);
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048]; int n;
            while ((n = input.read(buffer)) != -1) {
                if (output.size() + n > 16384) throw new IOException("更新清单过大");
                output.write(buffer, 0, n);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } finally { connection.disconnect(); }
    }

    private void download() {
        final UpdateRelease target = release;
        busy = true; action.setEnabled(false); status.setText("正在下载 0%");
        network.execute(() -> {
            File partial = new File(getCacheDir(), "sayagain-update.apk.part");
            HttpURLConnection connection = null;
            try {
                if (getCacheDir().getUsableSpace() < target.size * 2 + 2 * 1024 * 1024)
                    throw new IOException("下载空间不足");
                connection = connect(target.url);
                long length = connection.getContentLengthLong();
                if (length != -1 && length != target.size) throw new IOException("下载大小与清单不一致");
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[8192]; long received = 0; int n, lastPercent = -1;
                    while ((n = input.read(buffer)) != -1) {
                        if (destroyed || Thread.currentThread().isInterrupted()) throw new IOException("下载已取消");
                        received += n;
                        if (received > target.size) throw new IOException("下载超过预期大小");
                        output.write(buffer, 0, n);
                        int percent = (int) (received * 100 / target.size);
                        if (percent != lastPercent) {
                            final int value = percent; main.post(() -> { if (!destroyed) status.setText("正在下载 " + value + "%"); });
                            lastPercent = percent;
                        }
                    }
                    output.getFD().sync();
                }
                validate(partial, target);
                Files.move(partial.toPath(), UpdateApkProvider.apk(this).toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                main.post(() -> {
                    if (destroyed) return;
                    busy = false; ready = true; status.setText("下载完成，校验通过");
                    action.setText("安装更新"); action.setEnabled(true);
                });
            } catch (Exception error) { error("下载失败", error, true); }
            finally { if (connection != null) connection.disconnect(); if (partial.exists()) partial.delete(); }
        });
    }

    @SuppressWarnings("deprecation")
    private void validate(File file, UpdateRelease target) throws Exception {
        if (file.length() != target.size || !WavFile.sha256(file).equals(target.sha256)) throw new IOException("更新文件校验失败");
        PackageInfo archive = getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo own = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
        if (archive == null || !getPackageName().equals(archive.packageName) || archive.versionCode != target.versionCode
                || !target.versionName.equals(archive.versionName) || archive.versionCode <= own.versionCode
                || archive.applicationInfo == null || archive.applicationInfo.minSdkVersion > android.os.Build.VERSION.SDK_INT)
            throw new IOException("APK 包名、版本或系统要求不匹配");
        Set<String> expected = signatures(own.signatures), actual = signatures(archive.signatures);
        if (expected.isEmpty() || !expected.equals(actual)) throw new IOException("APK 签名与已安装版本不同，拒绝安装");
    }

    private static Set<String> signatures(Signature[] signatures) {
        Set<String> result = new HashSet<>();
        if (signatures != null) for (Signature signature : signatures) result.add(signature.toCharsString());
        return result;
    }

    private void install() {
        if (RecorderService.active || RecorderService.stopping) { status.setText("请先结束并保存录音，暂停时也不能安装"); return; }
        try {
            if (!getPackageManager().canRequestPackageInstalls()) {
                status.setText("请允许安装，然后返回点安装更新");
                startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())), INSTALL_PERMISSION); return;
            }
        } catch (RuntimeException unsupported) { error("此手表无法打开安装授权", unsupported, true); return; }
        busy = true; action.setEnabled(false); status.setText("正在确认安装包…");
        network.execute(() -> {
            try {
                validate(UpdateApkProvider.apk(this), release);
                main.post(() -> {
                    if (destroyed) return;
                    busy = false; action.setEnabled(true);
                    if (RecorderService.active || RecorderService.stopping) { status.setText("请先结束并保存录音"); return; }
                    Intent request = new Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(UpdateApkProvider.URI,
                            "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            .putExtra(Intent.EXTRA_RETURN_RESULT, true);
                    try { installing = true; startActivityForResult(request, INSTALL); }
                    catch (RuntimeException unavailable) { installing = false; status.setText("系统安装器不可用：" + RecorderService.safeMessage(unavailable)); }
                });
            } catch (Exception error) { error("安装包检查失败", error, true); }
        });
    }

    private void error(String title, Exception error, boolean retryDownload) {
        main.post(() -> {
            if (destroyed) return;
            busy = false; ready = false;
            status.setText(title); details.setText(RecorderService.safeMessage(error) + "\n已有录音不受影响，可重试。");
            action.setText(retryDownload && release != null ? "重新下载" : "重新检查"); action.setEnabled(true);
        });
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == INSTALL) {
            installing = false;
            status.setText(result == RESULT_OK ? "更新已安装" : "安装未完成，可重试");
        } else if (request == INSTALL_PERMISSION) status.setText("授权页已返回，点击安装更新继续");
    }
    @Override protected void onDestroy() { destroyed = true; network.shutdownNow(); super.onDestroy(); }
    private TextView text(String value, int size) {
        TextView result = new TextView(this); result.setText(value); result.setTextSize(size);
        result.setTextColor(Color.WHITE); result.setGravity(Gravity.START); return result;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
