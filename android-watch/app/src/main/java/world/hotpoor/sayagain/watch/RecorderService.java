package world.hotpoor.sayagain.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/** Owns recording independently of the activity and never restarts the microphone on rotation. */
public final class RecorderService extends Service implements ContinuousRecorder.Listener {
    public static final String START = "world.hotpoor.sayagain.watch.START";
    public static final String STOP = "world.hotpoor.sayagain.watch.STOP";
    public static final String TOGGLE_PAUSE = "world.hotpoor.sayagain.watch.TOGGLE_PAUSE";
    private static final String CHANNEL = "recording";
    private static final int NOTIFICATION_ID = 1;
    public static volatile SessionStore.Snapshot latest;
    public static volatile boolean active;
    public static volatile boolean captureReady;
    public static volatile boolean stopping;
    public static volatile boolean paused;
    public static volatile String message = "准备录音";
    private static volatile RecorderService owner;
    private static volatile boolean dashboardVisible;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ContinuousRecorder recorder;
    private PowerManager.WakeLock wakeLock;
    private long lastNotificationMs;
    private RecordingOverlay overlay;

    @Override public void onCreate() {
        super.onCreate();
        owner = this;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "持续录音", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
        recorder = new ContinuousRecorder(this, this);
        overlay = new RecordingOverlay(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && TOGGLE_PAUSE.equals(intent.getAction())) {
            if (active) togglePauseIfRunning(); else stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && STOP.equals(intent.getAction())) {
            if (active) { stopping = true; message = "正在保存最后一段"; recorder.stop(); refreshRecordingOverlay(); }
            else stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null || !START.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (active) return START_NOT_STICKY;
        latest = null;
        active = true;
        captureReady = false;
        stopping = false;
        paused = false;
        message = "正在启动录音";
        try {
            Notification notification = notification(message);
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTIFICATION_ID, notification);
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SayAgain:continuous-recording");
            wakeLock.setReferenceCounted(false);
            // Lifetime is tied to the explicit recording session, including its final save.
            wakeLock.acquire();
            refreshRecordingOverlay();
            // Recovery and hash verification can read many files; never do that on the service main thread.
            new Thread(() -> {
                try {
                    if (owner != this) return;
                    recorder.start();
                    if (stopping || owner != this) recorder.stop();
                    main.post(() -> {
                        if (owner != this || !active) return;
                        captureReady = recorder.isRunning();
                        message = stopping ? "正在保存最后一段" : captureReady ? "录音中 · 00:00:00" : "正在启动录音";
                        refreshRecordingOverlay();
                    });
                } catch (Exception error) { main.post(() -> finish("无法开始录音：" + safeMessage(error))); }
            }, "sayagain-start").start();
        } catch (Exception error) {
            finish("无法开始录音：" + safeMessage(error));
        }
        return START_NOT_STICKY;
    }

    @Override public void onSnapshot(SessionStore.Snapshot snapshot) {
        if (owner != this) return;
        latest = snapshot;
        main.post(() -> {
            if (!active || owner != this) return;
            if (snapshot.samplesCaptured > 0 && recorder.isRunning()) captureReady = true;
            message = stopping ? "正在保存最后一段" : paused ? "已暂停 · " + duration(snapshot.samplesCaptured, 16000) : captureReady ? "录音中 · " + duration(snapshot.samplesCaptured, 16000) : "正在启动录音";
            refreshRecordingOverlay();
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastNotificationMs >= 5000) {
                ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, notification(message));
                lastNotificationMs = now;
            }
        });
    }

    @Override public void onFinished(SessionStore.Snapshot snapshot) {
        if (owner != this) return;
        latest = snapshot;
        main.post(() -> finish("completed".equals(snapshot.status) ? "录音已保存" : "录音中断：" + snapshot.error));
    }

    private Notification notification(String text) {
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | immutable);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, RecorderService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | immutable);
        PendingIntent pause = PendingIntent.getService(this, 2, new Intent(this, RecorderService.class).setAction(TOGGLE_PAUSE), PendingIntent.FLAG_UPDATE_CURRENT | immutable);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(world.hotpoor.sayagain.watch.R.drawable.ic_recorder)
            .setContentTitle(stopping ? "SayAgain 正在保存" : paused ? "SayAgain 已暂停" : captureReady ? "SayAgain 正在录音" : "SayAgain 正在启动录音")
            .setContentText(text).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(null, paused ? "继续录音" : "暂停", pause).build())
            .addAction(new Notification.Action.Builder(null, "停止并保存", stop).build()).build();
    }

    private void finish(String text) {
        if (owner != this) return;
        active = false;
        captureReady = false;
        stopping = false;
        paused = false;
        message = text;
        if (overlay != null) overlay.close();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        // A normal stop reaches here only after the writer seals the last file.
        if (recorder != null && recorder.isRunning()) recorder.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (overlay != null) overlay.close();
        if (owner == this) { active = false; captureReady = false; paused = false; owner = null; }
        super.onDestroy();
    }

    static String safeMessage(Throwable error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
    /** Activity callbacks only update an already running owner; no Intent or service creation is involved. */
    public static void refreshOverlayIfRunning(android.content.Context context) {
        RecorderService current = owner;
        if (current == null || !active) return;
        current.main.post(() -> { if (owner == current && active) current.refreshRecordingOverlay(); });
    }
    /** Hides duplicate status while the dashboard is visible, without changing capture or starting a service. */
    public static void setDashboardVisible(boolean visible) {
        dashboardVisible = visible;
        RecorderService current = owner;
        if (current == null) return;
        current.main.post(() -> { if (owner == current) current.refreshRecordingOverlay(); });
    }
    private void refreshRecordingOverlay() {
        if (overlay == null) return;
        if (owner != this || !active || dashboardVisible) { overlay.close(); return; }
        String elapsed = duration(latest == null ? 0 : latest.samplesCaptured, 16000);
        overlay.update(stopping ? "保存中 " + elapsed : paused ? "已暂停 " + elapsed : captureReady ? "录音中 " + elapsed : "启动中…", captureReady && !paused && !stopping, paused, captureReady && !stopping);
    }
    public static void togglePauseIfRunning() {
        RecorderService current = owner;
        if (current == null || !active || !captureReady || stopping) return;
        current.recorder.setPaused(!current.recorder.isPaused());
        paused = current.recorder.isPaused();
        message = (paused ? "已暂停 · " : "录音中 · ") + duration(latest == null ? 0 : latest.samplesCaptured, 16000);
        current.refreshRecordingOverlay();
        ((NotificationManager) current.getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, current.notification(message));
    }
    public static void stopIfRunning() {
        RecorderService current = owner;
        if (current == null || !active || stopping) return;
        stopping = true; message = "正在保存最后一段";
        current.recorder.stop(); current.refreshRecordingOverlay();
    }
    static String duration(long samples, int rate) {
        long seconds = samples / rate;
        return String.format(java.util.Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
