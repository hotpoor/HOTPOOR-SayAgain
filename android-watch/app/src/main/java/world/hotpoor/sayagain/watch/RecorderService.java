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
    private static final String CHANNEL = "recording";
    private static final int NOTIFICATION_ID = 1;
    public static volatile SessionStore.Snapshot latest;
    public static volatile boolean active;
    public static volatile boolean stopping;
    public static volatile String message = "准备录音";
    private static volatile RecorderService owner;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ContinuousRecorder recorder;
    private PowerManager.WakeLock wakeLock;
    private long lastNotificationMs;

    @Override public void onCreate() {
        super.onCreate();
        owner = this;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "持续录音", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
        recorder = new ContinuousRecorder(this, this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            if (active) { stopping = true; message = "正在保存最后一段"; recorder.stop(); }
            else stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null || !START.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (active) return START_NOT_STICKY;
        latest = null;
        active = true;
        stopping = false;
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
            // Recovery and hash verification can read many files; never do that on the service main thread.
            new Thread(() -> {
                try {
                    if (owner != this) return;
                    recorder.start();
                    if (stopping || owner != this) recorder.stop();
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
            message = stopping ? "正在保存最后一段" : "录音中 · " + duration(snapshot.samplesCaptured, 16000);
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
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(world.hotpoor.sayagain.watch.R.drawable.ic_recorder)
            .setContentTitle("SayAgain 正在录音")
            .setContentText(text).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(null, "停止并保存", stop).build()).build();
    }

    private void finish(String text) {
        if (owner != this) return;
        active = false;
        stopping = false;
        message = text;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        // A normal stop reaches here only after the writer seals the last file.
        if (recorder != null && recorder.isRunning()) recorder.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (owner == this) { active = false; owner = null; }
        super.onDestroy();
    }

    static String safeMessage(Throwable error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
    static String duration(long samples, int rate) {
        long seconds = samples / rate;
        return String.format(java.util.Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
