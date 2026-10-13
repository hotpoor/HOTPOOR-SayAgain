package world.hotpoor.sayagain.watch;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.File;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One-screen watch dashboard. Storage work never runs on the UI thread. */
public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(13, 24, 29);
    private static final int MUTED = Color.rgb(151, 174, 177);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService storage = Executors.newSingleThreadExecutor();
    private TextView status, time, timeLabel, accumulated, count, pending, hint;
    private Button record, pause, lock, overlay;
    private volatile LocalSummary.Summary summary;
    private volatile String recoveryError;
    private volatile boolean recovering = true, scanning, destroyed;
    private long nextScan;
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (destroyed) return;
            render();
            if (!recovering && !scanning && SystemClock.elapsedRealtime() >= nextScan) scanSummary();
            main.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        LinearLayout column = new LinearLayout(this);
        column.setId(R.id.dashboard);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_VERTICAL);
        column.setPadding(dp(20), dp(15), dp(20), dp(15));
        column.setBackgroundColor(BACKGROUND);

        LinearLayout heading = row();
        TextView brand = text("SayAgain", 21, true, Gravity.START);
        brand.setAutoSizeTextTypeUniformWithConfiguration(14, 21, 1, TypedValue.COMPLEX_UNIT_SP);
        heading.addView(brand, new LinearLayout.LayoutParams(0, dp(33), 1));
        status = text("检查中", 12, false, Gravity.END | Gravity.CENTER_VERTICAL);
        status.setId(R.id.recording_status);
        heading.addView(status, new LinearLayout.LayoutParams(dp(108), dp(33)));
        column.addView(heading);

        timeLabel = text("累计录音", 12, false, Gravity.CENTER);
        timeLabel.setTextColor(MUTED);
        timeLabel.setPadding(0, dp(12), 0, 0);
        column.addView(timeLabel, new LinearLayout.LayoutParams(-1, dp(32)));
        time = text("—", 37, true, Gravity.CENTER);
        time.setId(R.id.recording_duration);
        time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        time.setAutoSizeTextTypeUniformWithConfiguration(23, 37, 1, TypedValue.COMPLEX_UNIT_SP);
        column.addView(time, new LinearLayout.LayoutParams(-1, dp(50)));
        accumulated = text("正在读取本地录音", 11, false, Gravity.CENTER);
        accumulated.setTextColor(MUTED);
        column.addView(accumulated, new LinearLayout.LayoutParams(-1, dp(25)));

        LinearLayout metrics = row();
        metrics.setPadding(0, dp(10), 0, dp(12));
        count = metric(metrics, "本地录音", R.id.recording_count);
        TextView separator = text("", 10, false, Gravity.CENTER);
        separator.setBackgroundColor(Color.rgb(39, 57, 62));
        metrics.addView(separator, new LinearLayout.LayoutParams(dp(1), dp(45)));
        pending = metric(metrics, "文件待上传", R.id.pending_uploads);
        column.addView(metrics, new LinearLayout.LayoutParams(-1, dp(84)));

        record = button("开始录音", 17, Color.rgb(51, 119, 108));
        record.setId(R.id.recording_button);
        LinearLayout controls = row();
        pause = button("暂停", 15, Color.rgb(51, 119, 108));
        pause.setId(R.id.pause_button);
        LinearLayout.LayoutParams pauseLayout = new LinearLayout.LayoutParams(0, dp(57), 1);
        pauseLayout.setMargins(0, 0, dp(9), 0);
        controls.addView(pause, pauseLayout);
        controls.addView(record, new LinearLayout.LayoutParams(0, dp(57), 1));
        column.addView(controls);
        pause.setOnClickListener(view -> RecorderService.togglePauseIfRunning());
        record.setOnClickListener(view -> {
            if (RecorderService.active) {
                record.setEnabled(false);
                startService(new Intent(this, RecorderService.class).setAction(RecorderService.STOP));
            } else requestStart();
        });

        LinearLayout shortcuts = row();
        shortcuts.setPadding(0, dp(11), 0, 0);
        lock = button("锁屏", 13, Color.rgb(29, 45, 52));
        lock.setId(R.id.screen_lock_button);
        overlay = button("浮窗", 13, Color.rgb(29, 45, 52));
        overlay.setId(R.id.overlay_button);
        LinearLayout.LayoutParams shortcut = new LinearLayout.LayoutParams(0, dp(48), 1);
        shortcut.setMargins(0, 0, dp(9), 0);
        shortcuts.addView(lock, shortcut);
        shortcuts.addView(overlay, new LinearLayout.LayoutParams(0, dp(48), 1));
        column.addView(shortcuts, new LinearLayout.LayoutParams(-1, dp(59)));
        lock.setOnClickListener(view -> ScreenLockController.requestLock(this));
        lock.setOnLongClickListener(view -> {
            if (!ScreenLockController.isAdminActive(this)) return false;
            new AlertDialog.Builder(this).setTitle("锁屏快捷授权")
                .setMessage("此授权只用于快捷锁屏。关闭后仍可正常录音。")
                .setNegativeButton("保留", null)
                .setPositiveButton("关闭授权", (dialog, which) -> ScreenLockController.revokeLockPermission(this)).show();
            return true;
        });
        overlay.setOnClickListener(view -> {
            if (!RecordingOverlay.hasPermission(this)) RecordingOverlay.requestPermission(this);
            else { RecordingOverlay.setEnabled(this, !RecordingOverlay.isEnabled(this)); render(); }
        });
        hint = text("本地保存 · 熄屏继续", 10, false, Gravity.CENTER);
        hint.setTextColor(MUTED);
        column.addView(hint, new LinearLayout.LayoutParams(-1, dp(24)));
        setContentView(column);

        storage.execute(() -> {
            try {
                File root = sessionsRoot();
                if (root == null) throw new java.io.IOException("本地存储不可用");
                if (!RecorderService.active) {
                    SharedPreferences preferences = getSharedPreferences("watch_recorder", MODE_PRIVATE);
                    String deviceId = preferences.getString("device_id", null);
                    if (deviceId == null) {
                        deviceId = UUID.randomUUID().toString();
                        if (!preferences.edit().putString("device_id", deviceId).commit()) throw new java.io.IOException("无法保存设备标识");
                    }
                    new SessionStore(root, deviceId).recoverInterruptedSessions();
                }
                summary = LocalSummary.read(root, receiptsFile(), RecorderService.active ? RecorderService.latest : null);
            } catch (Exception error) { recoveryError = RecorderService.safeMessage(error); }
            finally { recovering = false; if (!destroyed) main.post(this::render); }
        });
    }

    private void scanSummary() {
        scanning = true;
        nextScan = SystemClock.elapsedRealtime() + 3000;
        storage.execute(() -> {
            try { summary = LocalSummary.read(sessionsRoot(), receiptsFile(), RecorderService.active ? RecorderService.latest : null); }
            catch (Exception error) { recoveryError = RecorderService.safeMessage(error); }
            finally { scanning = false; if (!destroyed) main.post(this::render); }
        });
    }

    private void render() {
        if (status == null || destroyed) return;
        LocalSummary.Summary local = summary;
        SessionStore.Snapshot current = RecorderService.latest;
        boolean recording = RecorderService.active && RecorderService.captureReady && !RecorderService.stopping && !RecorderService.paused;
        String state = recovering ? "检查中" : RecorderService.stopping ? "保存中" : RecorderService.paused ? "已暂停" : RecorderService.active && !RecorderService.captureReady ? "启动中" : recording ? "● 录音中" : recoveryError != null ? "需检查存储" : "未录音";
        setText(status, state);
        status.setTextColor(recording ? Color.rgb(246, 123, 114) : MUTED);
        setText(timeLabel, RecorderService.active ? "本次录音" : "累计录音");
        setText(time, RecorderService.active && current != null ? duration(current.samplesCaptured * 1000 / 16000) : local != null && local.countsKnown ? duration(local.totalDurationMs) : "—");
        setText(accumulated, RecorderService.active ? "累计 " + (local != null && local.countsKnown ? duration(local.totalDurationMs) : "—") : local != null && local.countsKnown ? "音频保存在这块手表" : "正在读取本地录音");
        setText(count, local != null && local.countsKnown ? String.valueOf(local.recordingCount) + " 次" : "—");
        setText(pending, local != null && local.pendingKnown ? String.valueOf(local.pendingFileCount) + " 个" : "—");
        setText(record, RecorderService.stopping ? "保存中…" : RecorderService.active ? "结束保存" : "开始录音");
        pause.setVisibility(RecorderService.active ? android.view.View.VISIBLE : android.view.View.GONE);
        setText(pause, RecorderService.paused ? "继续录音" : "暂停");
        pause.setEnabled(RecorderService.captureReady && !RecorderService.stopping);
        record.setEnabled(!recovering && recoveryError == null && !RecorderService.stopping);
        setText(overlay, RecordingOverlay.hasPermission(this) && RecordingOverlay.isEnabled(this) ? "浮窗 · 开" : "浮窗");
        setText(hint, recoveryError != null ? "存储异常，录音资料已保留" : local != null && !local.pendingKnown ? "待上传状态无法读取" : "本地保存 · 熄屏继续");
    }

    private void requestStart() {
        if (recovering || recoveryError != null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 10); return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getPreferences(MODE_PRIVATE).getBoolean("notification_requested", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notification_requested", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 11); return;
        }
        startForegroundService(new Intent(this, RecorderService.class).setAction(RecorderService.START));
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 10) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) requestStart();
            else hint.setText("需要麦克风权限才能录音");
        } else if (request == 11) requestStart();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (!ScreenLockController.handleResult(this, request, result)) RecordingOverlay.handleResult(this, request);
    }
    @Override protected void onResume() {
        super.onResume();
        RecorderService.setDashboardVisible(true);
        RecorderService.refreshOverlayIfRunning(this);
        nextScan = 0;
        main.removeCallbacks(refresh); refresh.run();
    }
    @Override protected void onPause() { main.removeCallbacks(refresh); RecorderService.setDashboardVisible(false); super.onPause(); }
    @Override protected void onDestroy() { destroyed = true; main.removeCallbacks(refresh); storage.shutdownNow(); super.onDestroy(); }

    private TextView metric(LinearLayout parent, String label, int id) {
        LinearLayout cell = new LinearLayout(this); cell.setOrientation(LinearLayout.VERTICAL); cell.setGravity(Gravity.CENTER);
        TextView value = text("—", 25, true, Gravity.CENTER); value.setId(id);
        value.setAutoSizeTextTypeUniformWithConfiguration(14, 25, 1, TypedValue.COMPLEX_UNIT_SP);
        cell.addView(value, new LinearLayout.LayoutParams(-1, dp(37)));
        TextView caption = text(label, 11, false, Gravity.CENTER); caption.setTextColor(MUTED);
        cell.addView(caption, new LinearLayout.LayoutParams(-1, dp(23)));
        parent.addView(cell, new LinearLayout.LayoutParams(0, -1, 1)); return value;
    }
    private LinearLayout row() { LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); return row; }
    private TextView text(String value, int size, boolean bold, int gravity) {
        TextView result = new TextView(this); result.setText(value); result.setTextSize(size); result.setTextColor(Color.WHITE);
        result.setGravity(gravity); result.setMaxLines(1); result.setEllipsize(TextUtils.TruncateAt.END);
        if (bold) result.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return result;
    }
    private static void setText(TextView view, String value) { if (!TextUtils.equals(view.getText(), value)) view.setText(value); }
    private Button button(String label, int size, int color) {
        Button result = new Button(this); result.setText(label); result.setTextSize(size); result.setTextColor(Color.WHITE); result.setAllCaps(false);
        result.setMinHeight(0); result.setMinimumHeight(0);
        GradientDrawable background = new GradientDrawable(); background.setColor(color); background.setCornerRadius(dp(17)); result.setBackground(background);
        return result;
    }
    private File sessionsRoot() { File files = getExternalFilesDir(null); return files == null ? null : new File(files, "sessions"); }
    private File receiptsFile() { File files = getExternalFilesDir(null); return files == null ? null : new File(files, "sync-receipts.json"); }
    private static String duration(long ms) { long seconds = Math.max(0, ms) / 1000; return String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
