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
import android.widget.LinearLayout;
import android.view.View;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

/** A small status window owned exclusively by RecorderService, with no screen-waking flags. */
public final class RecordingOverlay {
    public static final int REQUEST_OVERLAY_PERMISSION = 121;
    private final Context context;
    private final WindowManager windows;
    private LinearLayout pill;
    private TextView dot, label, control, finish;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean blinking;
    private final Runnable blink = new Runnable() {
        @Override public void run() {
            if (!blinking || dot == null) return;
            dot.setAlpha(dot.getAlpha() > 0.5f ? 0.2f : 1f);
            main.postDelayed(this, 500);
        }
    };
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

    void update(String text, boolean recording, boolean paused, boolean actionable) {
        if (!isEnabled(context) || !hasPermission(context) || windows == null) { close(); return; }
        try {
            if (pill == null) create();
            if (!android.text.TextUtils.equals(label.getText(), text)) label.setText(text);
            String action = paused ? "继续" : "暂停";
            if (!android.text.TextUtils.equals(control.getText(), action)) control.setText(action);
            control.setEnabled(actionable); finish.setEnabled(actionable);
            control.setAlpha(actionable ? 1f : 0.4f); finish.setAlpha(actionable ? 1f : 0.4f);
            dot.setTextColor(recording ? Color.rgb(255, 80, 80) : Color.rgb(162, 175, 180));
            if (blinking != recording) {
                blinking = recording; main.removeCallbacks(blink); dot.setAlpha(1f);
                if (blinking) main.postDelayed(blink, 500);
            }
            DisplayMetrics metrics = screenMetrics();
            pill.measure(View.MeasureSpec.makeMeasureSpec(metrics.widthPixels, View.MeasureSpec.AT_MOST),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            if (defaultPosition) layout.x = Math.max(0, metrics.widthPixels - pill.getMeasuredWidth() - dp(8));
            clampPosition();
            windows.updateViewLayout(pill, layout);
        } catch (RuntimeException denied) { close(); }
    }

    private TextView item(String text, int size, int horizontalPadding) {
        TextView view = new TextView(context);
        view.setText(text); view.setTextSize(size); view.setTextColor(Color.WHITE);
        view.setGravity(Gravity.CENTER); view.setSingleLine(true);
        view.setPadding(dp(horizontalPadding), dp(12), dp(horizontalPadding), dp(12));
        return view;
    }

    private void create() {
        pill = new LinearLayout(context);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(3), 0, dp(3), 0);
        dot = item("●", 15, 5);
        label = item("启动中…", 11, 3);
        control = item("暂停", 13, 10);
        finish = item("■", 17, 10);
        dot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        control.setContentDescription("暂停或继续录音"); finish.setContentDescription("结束并保存录音");
        label.setContentDescription("录音状态和时长，点击返回录音首页");
        pill.addView(dot); pill.addView(label); pill.addView(control); pill.addView(finish);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.argb(240, 28, 48, 52)); background.setCornerRadius(dp(24));
        background.setStroke(dp(1), Color.argb(170, 147, 203, 187)); pill.setBackground(background);
        layout = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        layout.gravity = Gravity.TOP | Gravity.LEFT;
        layout.setTitle("SayAgain recording status");
        defaultPosition = !preferences(context).contains("overlay_x");
        layout.x = preferences(context).getInt("overlay_x", 0);
        layout.y = preferences(context).getInt("overlay_y", dp(56));
        View.OnClickListener open = view -> {
            try {
                context.startActivity(new Intent(context, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            } catch (RuntimeException unavailable) { /* Recording is independent of activity launch. */ }
        };
        pill.setOnClickListener(open); label.setOnClickListener(open); dot.setOnClickListener(open);
        control.setOnClickListener(view -> RecorderService.togglePauseIfRunning());
        finish.setOnClickListener(view -> {
            open.onClick(view);
            RecorderService.stopIfRunning();
        });
        // Every visible part can be dragged; movement suppresses its click action.
        pill.setOnTouchListener(dragListener()); label.setOnTouchListener(dragListener());
        dot.setOnTouchListener(dragListener()); control.setOnTouchListener(dragListener());
        finish.setOnTouchListener(dragListener());
        windows.addView(pill, layout);
    }

    private View.OnTouchListener dragListener() {
        final int slop = ViewConfiguration.get(context).getScaledTouchSlop();
        return new View.OnTouchListener() {
            private float downX, downY;
            private int originalX, originalY;
            private boolean moved;
            @Override public boolean onTouch(View view, MotionEvent event) {
                if (layout == null || pill == null) return true;
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        defaultPosition = false;
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
                        else if (view.isEnabled()) view.performClick();
                        return true;
                    case MotionEvent.ACTION_CANCEL: return true;
                    default: return false;
                }
            }
        };
    }

    private DisplayMetrics screenMetrics() {
        DisplayMetrics metrics = new DisplayMetrics();
        windows.getDefaultDisplay().getRealMetrics(metrics);
        return metrics;
    }

    private void clampPosition() {
        if (pill == null || layout == null) return;
        DisplayMetrics metrics = screenMetrics();
        int width = Math.max(pill.getMeasuredWidth(), pill.getWidth());
        int height = Math.max(pill.getMeasuredHeight(), pill.getHeight());
        layout.x = Math.max(0, Math.min(layout.x, Math.max(0, metrics.widthPixels - width)));
        layout.y = Math.max(0, Math.min(layout.y, Math.max(0, metrics.heightPixels - height)));
    }

    void close() {
        blinking = false; main.removeCallbacks(blink);
        LinearLayout previous = pill;
        pill = null; dot = null; label = null; control = null; finish = null; layout = null;
        if (previous != null && windows != null) {
            try { windows.removeViewImmediate(previous); } catch (RuntimeException alreadyRemoved) { /* Permission may remove it first. */ }
        }
    }

    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
