package world.hotpoor.sayagain.watch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

/** A small status window owned exclusively by RecorderService, with no screen-waking flags. */
public final class RecordingOverlay {
    public static final int REQUEST_OVERLAY_PERMISSION = 121;
    private final Context context;
    private final WindowManager windows;
    private TextView pill;
    private WindowManager.LayoutParams layout;
    private boolean defaultPosition;

    RecordingOverlay(Context context) {
        this.context = context;
        windows = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("watch_recorder", Context.MODE_PRIVATE);
    }

    public static boolean isEnabled(Context context) {
        return preferences(context).getBoolean("overlay_enabled", false);
    }

    public static boolean hasPermission(Context context) {
        try { return Settings.canDrawOverlays(context); }
        catch (RuntimeException unavailable) { return false; }
    }

    public static void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean("overlay_enabled", enabled).apply();
        RecorderService.refreshOverlayIfRunning(context);
    }

    public static void requestPermission(Activity activity) {
        if (hasPermission(activity)) { setEnabled(activity, true); return; }
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity).setTitle("显示录音状态浮窗")
                .setMessage("在其他应用上显示录音状态和计时。可拖动，点一下返回录音页。\n需要允许“显示在其他应用上层”。")
                .setNegativeButton("暂不开启", null)
                .setPositiveButton("打开设置", (dialog, which) -> {
                    Intent request = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + activity.getPackageName()));
                    try { activity.startActivityForResult(request, REQUEST_OVERLAY_PERMISSION); }
                    catch (RuntimeException unavailable) {
                        setEnabled(activity, false);
                        Toast.makeText(activity, "这台手表无法打开浮窗授权设置", Toast.LENGTH_LONG).show();
                    }
                }).show();
    }

    /** The settings screen does not return a reliable resultCode; re-read its actual permission. */
    public static boolean handleResult(Activity activity, int requestCode) {
        if (requestCode != REQUEST_OVERLAY_PERMISSION) return false;
        setEnabled(activity, hasPermission(activity));
        return true;
    }

    void update(String text) {
        if (!isEnabled(context) || !hasPermission(context) || windows == null) { close(); return; }
        try {
            if (pill == null) create();
            pill.setText(text);
            pill.setContentDescription(text + "，点击返回录音页面，拖动调整位置");
            DisplayMetrics metrics = context.getResources().getDisplayMetrics();
            pill.measure(android.view.View.MeasureSpec.makeMeasureSpec(Math.max(1, metrics.widthPixels - dp(20)), android.view.View.MeasureSpec.AT_MOST),
                    android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED));
            if (defaultPosition) layout.x = Math.max(dp(4), metrics.widthPixels - pill.getMeasuredWidth() - dp(10));
            clampPosition();
            windows.updateViewLayout(pill, layout);
        } catch (RuntimeException denied) { close(); } // Optional display never interrupts microphone capture.
    }

    private void create() {
        pill = new TextView(context);
        pill.setTextSize(12);
        pill.setTextColor(Color.WHITE);
        pill.setGravity(Gravity.CENTER);
        pill.setSingleLine(true);
        pill.setPadding(dp(11), dp(8), dp(11), dp(8));
        pill.setMaxWidth(Math.max(dp(80), context.getResources().getDisplayMetrics().widthPixels - dp(20)));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.argb(232, 28, 60, 55));
        background.setCornerRadius(dp(22));
        background.setStroke(dp(1), Color.argb(170, 147, 203, 187));
        pill.setBackground(background);
        layout = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        layout.gravity = Gravity.TOP | Gravity.LEFT;
        layout.setTitle("SayAgain recording status");
        defaultPosition = !preferences(context).contains("overlay_x");
        layout.x = preferences(context).getInt("overlay_x", Math.max(dp(4), context.getResources().getDisplayMetrics().widthPixels - dp(160)));
        layout.y = preferences(context).getInt("overlay_y", dp(56));
        pill.setOnClickListener(view -> {
            try {
                context.startActivity(new Intent(context, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            } catch (RuntimeException unavailable) { /* Keep recording if a vendor blocks the activity launch. */ }
        });
        final int slop = ViewConfiguration.get(context).getScaledTouchSlop();
        pill.setOnTouchListener(new android.view.View.OnTouchListener() {
            private float downX, downY;
            private int originalX, originalY;
            private boolean moved;
            @Override public boolean onTouch(android.view.View view, MotionEvent event) {
                if (layout == null || pill == null) return false;
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        defaultPosition = false; // Snapshot updates must not move a pill the user is dragging.
                        downX = event.getRawX(); downY = event.getRawY();
                        originalX = layout.x; originalY = layout.y; moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                        if (dx * dx + dy * dy > slop * slop) moved = true;
                        if (moved) {
                            layout.x = originalX + Math.round(dx); layout.y = originalY + Math.round(dy);
                            clampPosition();
                            try { windows.updateViewLayout(pill, layout); } catch (RuntimeException denied) { close(); }
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moved) preferences(context).edit().putInt("overlay_x", layout.x).putInt("overlay_y", layout.y).apply();
                        else view.performClick();
                        return true;
                    case MotionEvent.ACTION_CANCEL: return true;
                    default: return false;
                }
            }
        });
        windows.addView(pill, layout);
    }

    private void clampPosition() {
        if (pill == null || layout == null) return;
        DisplayMetrics metrics = context.getResources().getDisplayMetrics();
        int width = pill.getMeasuredWidth() > 0 ? pill.getMeasuredWidth() : pill.getWidth() > 0 ? pill.getWidth() : dp(150);
        int height = pill.getHeight() > 0 ? pill.getHeight() : dp(34);
        layout.x = Math.max(dp(4), Math.min(layout.x, Math.max(dp(4), metrics.widthPixels - width - dp(4))));
        layout.y = Math.max(dp(4), Math.min(layout.y, Math.max(dp(4), metrics.heightPixels - height - dp(20))));
    }

    void close() {
        TextView previous = pill;
        pill = null; layout = null;
        if (previous != null && windows != null) {
            try { windows.removeViewImmediate(previous); } catch (RuntimeException alreadyRemoved) { /* Permission may remove it first. */ }
        }
    }

    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
