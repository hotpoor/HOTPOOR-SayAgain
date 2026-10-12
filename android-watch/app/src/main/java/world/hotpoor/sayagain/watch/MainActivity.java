package world.hotpoor.sayagain.watch;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONObject;

/** Small screen UI; capture remains in the foreground service when this activity disappears. */
public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextView status, timer, saved, history;
    private Button record;
    private volatile String recoveryError;
    private volatile boolean recovering = true;
    private int lastHistoryCount = -1;
    private final Runnable refresh = new Runnable() {
        @Override public void run() { render(); main.postDelayed(this, 1000); }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(18, 29, 34));
        getWindow().setNavigationBarColor(Color.rgb(18, 29, 34));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(18, 29, 34));
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(dp(22), dp(18), dp(22), dp(24));
        scroll.addView(column);
        column.addView(text("SayAgain", 23, true));
        TextView subtitle = text("熄屏后继续录音", 13, false);
        subtitle.setTextColor(Color.rgb(159, 190, 184));
        column.addView(subtitle);
        timer = text("00:00:00", 31, true);
        timer.setPadding(0, dp(17), 0, dp(5));
        column.addView(timer);
        status = text("检查已保存的录音…", 14, false);
        column.addView(status);
        saved = text("每分钟自动保存", 12, false);
        saved.setTextColor(Color.LTGRAY);
        saved.setPadding(0, dp(6), 0, dp(13));
        column.addView(saved);
        record = new Button(this);
        record.setText("开始录音");
        record.setTextColor(Color.WHITE);
        record.setTextSize(17);
        record.setAllCaps(false);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(49, 118, 107));
        background.setCornerRadius(dp(26));
        record.setBackground(background);
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(-1, dp(53));
        buttonParams.setMargins(0, 0, 0, dp(19));
        column.addView(record, buttonParams);
        record.setOnClickListener(view -> {
            if (RecorderService.active) {
                record.setEnabled(false);
                startService(new Intent(this, RecorderService.class).setAction(RecorderService.STOP));
            } else requestStart();
        });
        TextView title = text("最近录音", 14, true);
        column.addView(title);
        history = text("暂无录音", 12, false);
        history.setTextColor(Color.LTGRAY);
        history.setPadding(0, dp(7), 0, 0);
        column.addView(history);
        setContentView(scroll);
        new Thread(() -> {
            try {
                if (!RecorderService.active) {
                    File root = sessionsRoot();
                    if (root != null) {
                        android.content.SharedPreferences preferences = getSharedPreferences("watch_recorder", MODE_PRIVATE);
                        String deviceId = preferences.getString("device_id", null);
                        if (deviceId == null) {
                            deviceId = UUID.randomUUID().toString();
                            if (!preferences.edit().putString("device_id", deviceId).commit()) throw new java.io.IOException("无法保存设备标识");
                        }
                        new SessionStore(root, deviceId).recoverInterruptedSessions();
                    }
                }
            } catch (Exception error) { recoveryError = "恢复失败：" + RecorderService.safeMessage(error); }
            finally { recovering = false; main.post(this::render); }
        }, "sayagain-recovery").start();
    }

    private void requestStart() {
        if (recovering || recoveryError != null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 10);
            return;
        }
        // Notification permission is requested separately; the recording still has a foreground notice.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getPreferences(MODE_PRIVATE).getBoolean("notification_requested", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notification_requested", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 11);
            return;
        }
        startForegroundService(new Intent(this, RecorderService.class).setAction(RecorderService.START));
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 10) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) requestStart();
            else { RecorderService.message = "需要麦克风权限才能录音"; render(); }
        } else if (request == 11) requestStart();
    }

    @Override protected void onResume() { super.onResume(); main.removeCallbacks(refresh); refresh.run(); }
    @Override protected void onPause() { main.removeCallbacks(refresh); super.onPause(); }

    private void render() {
        if (status == null) return;
        SessionStore.Snapshot snapshot = RecorderService.latest;
        if (snapshot != null) {
            timer.setText(RecorderService.duration(snapshot.samplesCaptured, 16000));
            saved.setText("已保存 " + RecorderService.duration(snapshot.durableSamples, 16000));
        }
        status.setText(recovering ? "检查已保存的录音…" : recoveryError != null ? recoveryError : RecorderService.message);
        record.setText(RecorderService.stopping ? "保存中…" : RecorderService.active ? "停止并保存" : "开始录音");
        record.setEnabled(!recovering && recoveryError == null && !RecorderService.stopping);
        File root = sessionsRoot();
        File[] directories = root == null ? null : root.listFiles(file -> file.isDirectory() && !file.getName().startsWith("."));
        int count = directories == null ? 0 : directories.length;
        // Refresh after a seal as well as when a session begins or finishes.
        if (count == lastHistoryCount && RecorderService.active) return;
        lastHistoryCount = count;
        if (count == 0) { history.setText("暂无录音"); return; }
        Arrays.sort(directories, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        StringBuilder lines = new StringBuilder();
        int limit = Math.min(4, directories.length);
        SimpleDateFormat date = new SimpleDateFormat("MM-dd HH:mm", Locale.CHINA);
        for (int i = 0; i < limit; i++) {
            File manifest = new File(directories[i], "manifest.json");
            try {
                JSONObject data = new JSONObject(new String(Files.readAllBytes(manifest.toPath()), StandardCharsets.UTF_8));
                String state = data.optString("status");
                String label = "completed".equals(state) ? "已保存" : "recording".equals(state) ? "录音中" : "中断已恢复";
                if ("error".equals(state)) label = "录音异常";
                lines.append(date.format(new Date(data.optLong("started_at_ms")))).append("  ")
                    .append(RecorderService.duration(data.optLong("durable_samples"), 16000)).append("\n")
                    .append(label).append(" · ").append(data.optJSONArray("chunks") == null ? 0 : data.optJSONArray("chunks").length()).append(" 段");
            } catch (Exception error) { lines.append("录音资料需要恢复"); }
            if (i < limit - 1) lines.append("\n\n");
        }
        history.setText(lines.toString());
    }

    private File sessionsRoot() { File parent = getExternalFilesDir(null); return parent == null ? null : new File(parent, "sessions"); }
    private TextView text(String value, int size, boolean bold) {
        TextView result = new TextView(this);
        result.setText(value); result.setTextSize(size); result.setTextColor(Color.WHITE);
        result.setGravity(Gravity.CENTER);
        if (bold) result.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return result;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
